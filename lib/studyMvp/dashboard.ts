import {
  DEFAULT_PLANNER_SETTINGS,
  generateDailyPlan,
  type DailyPlan,
  type ExplicitPlanningDecision,
  type ForcedPlanningDecision,
  type PlanningTask,
  type PlannerSettings,
} from "./dailyPlanner";
import { deriveLatestGateResult } from "./reviewEngine";
import type {
  EntityId,
  ISODate,
  RetrievalTask,
  StudyMvpState,
  TaskPriority,
  Topic,
  TopicImportance,
} from "./types";

export interface DailyPlannerTaskBuild {
  tasks: PlanningTask[];
  omittedReviewIds: EntityId[];
  omittedGateTopicIds: EntityId[];
}

export interface StudyDailyPlanBuild extends DailyPlannerTaskBuild {
  plan: DailyPlan;
}

function priorityForImportance(importance: TopicImportance): TaskPriority {
  const priorities: Record<TopicImportance, TaskPriority> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  };
  return priorities[importance];
}

function topicPriority(topic: Topic): TaskPriority {
  const priority = priorityForImportance(topic.topic_importance);
  return topic.weakness_flag
    ? (Math.max(1, priority - 1) as TaskPriority)
    : priority;
}

function plannerSettings(state: StudyMvpState): PlannerSettings {
  return {
    daily_budget_min: state.settings.daily_budget_min,
    review_reserve_min: state.settings.review_reserve_min,
    min_mixed_practice_min: state.settings.min_mixed_practice_min,
    mixed_practice_target_mon_wed:
      state.settings.mixed_practice_target_mon_wed,
    mixed_practice_target_thu_fri:
      state.settings.mixed_practice_target_thu_fri,
    repair_recovery_cap_min: state.settings.repair_recovery_cap_min,
    recovery_block_min: state.settings.recovery_block_min,
    default_assignment_session_target_min:
      state.settings.default_assignment_session_target_min,
    defer_limit: state.settings.defer_limit,
    saturday_sampler_duration_min:
      DEFAULT_PLANNER_SETTINGS.saturday_sampler_duration_min,
    saturday_sampler_analysis_max_min:
      DEFAULT_PLANNER_SETTINGS.saturday_sampler_analysis_max_min,
  };
}

function weekday(date: ISODate): number {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

/**
 * Choose the same initial gate questions for the UI and daily planner.
 * Explicit gate-purpose questions take precedence when at least three are
 * active; otherwise use the first three active questions for the topic.
 */
export function getDefaultGateTaskIds(
  activeTopicTasks: readonly RetrievalTask[],
): EntityId[] {
  const explicitlyPreparedGateTasks = activeTopicTasks.filter(
    (task) => task.purpose === "gate",
  );

  const selectedTasks =
    explicitlyPreparedGateTasks.length >= 3
      ? explicitlyPreparedGateTasks
      : activeTopicTasks.slice(0, 3);

  return selectedTasks.map((task) => task.id);
}

/**
 * Adapt the canonical state to planner input without replacing persisted
 * review task selections. Only due work and unfinished work are considered.
 */
export function buildDailyPlannerTasks(
  state: StudyMvpState,
  date: ISODate,
  includeAdditionalInitialLearning = false,
): DailyPlannerTaskBuild {
  const tasks: PlanningTask[] = [];
  const omittedReviewIds: EntityId[] = [];
  const omittedGateTopicIds: EntityId[] = [];
  const tasksById = new Map(
    state.retrieval_tasks.map((task) => [task.id, task]),
  );
  const topicsById = new Map(
    state.topics.map((topic) => [topic.id, topic]),
  );

  const dueReviews = state.review_events.filter((review) =>
    ["pending", "in_progress", "deferred", "missed"].includes(review.status) &&
    review.current_due_date <= date,
  );

  for (const review of dueReviews) {
    const selected = review.selected_task_ids.map((id) => tasksById.get(id));

    if (
      review.selected_task_ids.length < 2 ||
      review.selected_task_ids.length > 3 ||
      selected.some((task) => !task || task.topic_id !== review.topic_id)
    ) {
      omittedReviewIds.push(review.id);
      continue;
    }

    const topic = topicsById.get(review.topic_id);
    const selectedTasks = selected.filter(
      (task) => task !== undefined,
    );
    const attempted = new Set(
      state.task_events
        .filter((event) =>
          event.event_type === "attempt" &&
          event.review_event_id === review.id,
        )
        .map((event) => event.retrieval_task_id)
        .filter((id): id is string => id !== null),
    );

    tasks.push({
      id: `review:${review.id}`,
      subjectId: review.id,
      priority: review.current_priority,
      importance: topic?.topic_importance,
      weaknessFlag: topic?.weakness_flag,
      considered: true,
      kind: "review",
      reviewEventId: review.id,
      topicId: review.topic_id,
      stage: review.stage,
      eventKind: review.event_kind,
      status: review.status,
      intendedDueDate: review.intended_due_date,
      currentDueDate: review.current_due_date,
      deferCount: review.defer_count,
      selectedQuestions: selectedTasks.map((task) => ({
        id: task.id,
        estimatedDurationMin: task.estimated_duration_min,
        taskType: task.task_type,
      })),
      remainingQuestionIds: review.selected_task_ids.filter(
        (id) => !attempted.has(id),
      ),
    });
  }
      // Offer one eligible new topic by default. When requested, allow
  // additional eligible topics; the planner still enforces the daily budget.
  if (weekday(date) >= 1 && weekday(date) <= 5) {
    const eligibleTopics = state.topics
      .filter((topic) => {
        if (
          topic.status !== "not_started" ||
          topic.gate_passed ||
          topic.gate_result === "passed" ||
          topic.gate_result === "skill_based_passed"
        ) {
          return false;
        }

        return topic.prerequisite_topic_ids.every((prerequisiteId) => {
          const prerequisite = topicsById.get(prerequisiteId);

          return Boolean(
            prerequisite &&
              (
                prerequisite.gate_passed ||
                prerequisite.gate_result === "passed" ||
                prerequisite.gate_result === "skill_based_passed"
              ),
          );
        });
      })
      .sort(
        (a, b) =>
          topicPriority(a) - topicPriority(b) ||
          a.order_index - b.order_index ||
          a.topic_number - b.topic_number ||
          a.id.localeCompare(b.id),
      );

    const topicsToAdd = includeAdditionalInitialLearning
      ? eligibleTopics
      : eligibleTopics.slice(0, 1);

    for (const topic of topicsToAdd) {
      tasks.push({
        id: `initial-learning:${topic.id}`,
        subjectId: topic.id,
        priority: topicPriority(topic),
        importance: topic.topic_importance,
        weaknessFlag: topic.weakness_flag,
        considered: true,
        kind: "initial_learning",
        topicId: topic.id,
        plannedDate: date,
        estimatedDurationMin: 45,
      });
    }
  }
  // New-topic gates enter the shared daily plan only when the topic is
  // in learning and its gate date has arrived. An interrupted gate keeps
  // the exact task IDs captured by its immutable attempt evidence.
  for (const topic of state.topics) {
    if (
      topic.status !== "in_learning" ||
      topic.gate_passed ||
      topic.gate_result === "passed" ||
      topic.gate_result === "skill_based_passed"
    ) {
      continue;
    }

    const dueDate =
      topic.planned_consolidation_date ??
      topic.initial_study_date ??
      date;

    if (dueDate > date) {
      continue;
    }

    const latestSession = getLatestGateSession(state, topic.id);
    const unfinishedSession =
      latestSession && !latestSession.complete
        ? latestSession
        : null;

    const activeTopicTasks = state.retrieval_tasks.filter(
      (task) => task.topic_id === topic.id && task.active,
    );
    const selectedIds = unfinishedSession
      ? unfinishedSession.selectedTaskIds
      : getDefaultGateTaskIds(activeTopicTasks);

    const selectedTasks = selectedIds.map((id) => tasksById.get(id));

    // Never silently replace a previously selected question set, or make
    // a gate appear valid when the topic lacks three available questions.
    if (
      selectedIds.length < 3 ||
      new Set(selectedIds).size !== selectedIds.length ||
      selectedTasks.some(
        (task) =>
          !task ||
          task.topic_id !== topic.id ||
          !task.active,
      )
    ) {
      omittedGateTopicIds.push(topic.id);
      continue;
    }

    const questions = selectedTasks.map((task) => ({
      id: task!.id,
      estimatedDurationMin: task!.estimated_duration_min,
      taskType: task!.task_type,
    }));

    const attemptedIds = new Set(
      unfinishedSession?.attemptedTaskIds ?? [],
    );

    tasks.push({
      id: `gate:${topic.id}`,
      subjectId: topic.id,
      priority: topicPriority(topic),
      importance: topic.topic_importance,
      weaknessFlag: topic.weakness_flag,
      considered: true,
      kind: "gate",
      topicId: topic.id,
      dueDate,
      selectedQuestions: questions,
      remainingQuestionIds: selectedIds.filter(
        (id) => !attemptedIds.has(id),
      ),
    });
  }

  for (const topic of state.topics) {
    if (
      topic.status !== "in_learning" ||
      topic.planned_consolidation_date === null ||
      topic.planned_consolidation_date > date
    ) {
      continue;
    }

    // Gate attempts and corrective work do not count as consolidation.
    const loggedConsolidationMinutes = state.work_sessions
      .filter((session) =>
        session.subject_type === "topic_consolidation" &&
        session.subject_id === topic.id,
      )
      .reduce((total, session) => total + session.actual_duration_min, 0);

    if (
      loggedConsolidationMinutes >=
      topic.consolidation_estimated_duration_min
    ) {
      continue;
    }

    tasks.push({
      id: `consolidation:${topic.id}`,
      subjectId: topic.id,
      priority: topicPriority(topic),
      importance: topic.topic_importance,
      weaknessFlag: topic.weakness_flag,
      considered: true,
      kind: "topic_consolidation",
      topicId: topic.id,
      plannedDate: topic.planned_consolidation_date,
      inLearning: true,
      consolidationEstimatedDurationMin:
        topic.consolidation_estimated_duration_min,
      loggedConsolidationMinutes,
    });
  }

  for (const assignment of state.assignments) {
    if (
      assignment.status === "completed" ||
      assignment.status === "cancelled" ||
      (
        assignment.due_date > date &&
        assignment.status !== "in_progress"
      )
    ) {
      continue;
    }

    tasks.push({
      id: `assignment:${assignment.id}`,
      subjectId: assignment.id,
      priority: priorityForImportance(assignment.importance),
      importance: assignment.importance,
      considered: true,
      kind: "assignment",
      dueDate: assignment.due_date,
      remainingMin: assignment.remaining_min,
      maxSessionMin: assignment.max_session_min,
      status: assignment.status,
    });
  }

  const day = weekday(date);

  // Mixed practice is scheduled Monday-Friday. Sunday is a rest day,
  // while Saturday is reserved for the sampler.
  if (day >= 1 && day <= 5) {
    const mixedTarget =
      day <= 3
        ? state.settings.mixed_practice_target_mon_wed
        : state.settings.mixed_practice_target_thu_fri;

    tasks.push({
      id: `mixed-practice:${date}`,
      priority: 4,
      considered: true,
      kind: "mixed_practice",
      due: true,
      targetDurationMin: Math.max(
        state.settings.min_mixed_practice_min,
        mixedTarget,
      ),
    });
  }

  if (day === 6) {
    tasks.push({
      id: `sampler:${date}`,
      priority: 4,
      considered: true,
      kind: "sampler",
      due: true,
      targetDurationMin:
        DEFAULT_PLANNER_SETTINGS.saturday_sampler_duration_min,
      analysisMaxMin:
        DEFAULT_PLANNER_SETTINGS.saturday_sampler_analysis_max_min,
    });
  }

  return { tasks, omittedReviewIds, omittedGateTopicIds };
}

export interface DailyPlanOverrides {
  explicitDecisions?: Readonly<
    Record<string, ExplicitPlanningDecision | undefined>
  >;
  forcedDecisions?: Readonly<
    Record<string, ForcedPlanningDecision | undefined>
  >;
  includeAdditionalInitialLearning?: boolean;
}

export function buildStudyDailyPlan(
  state: StudyMvpState,
  date: ISODate,
  overrides: DailyPlanOverrides = {},
): StudyDailyPlanBuild {
    const built = buildDailyPlannerTasks(
    state,
    date,
    overrides.includeAdditionalInitialLearning ?? false,
  );

  return {
    ...built,
    plan: generateDailyPlan({
      date,
      settings: plannerSettings(state),
      tasks: built.tasks,
      ...overrides,
    }),
  };
}

export interface LatestGateSession {
  id: EntityId;
  selectedTaskIds: EntityId[];
  attemptedTaskIds: EntityId[];
  complete: boolean;
  passed: boolean;
}

/** Find the latest gate session so an interrupted session can be resumed. */
export function getLatestGateSession(
  state: StudyMvpState,
  topicId: EntityId,
): LatestGateSession | null {
  const topicTaskIds = new Set(
    state.retrieval_tasks
      .filter((task) => task.topic_id === topicId)
      .map((task) => task.id),
  );

  const evidence = state.task_events.filter((event) =>
    event.event_type === "gate_attempt" &&
    event.gate_session_id !== null &&
    (
      event.subject_id === topicId ||
      (
        event.retrieval_task_id !== null &&
        topicTaskIds.has(event.retrieval_task_id)
      ) ||
      (
        event.gate_selected_task_ids_snapshot?.some(
          (id) => topicTaskIds.has(id),
        ) ?? false
      )
    ),
  );

  if (evidence.length === 0) return null;

  const groups = new Map<
    EntityId,
    { events: typeof evidence; lastIndex: number; latestAt: number }
  >();

  evidence.forEach((event, index) => {
    const id = event.gate_session_id!;
    const existing = groups.get(id);
    const loggedAt = Date.parse(event.logged_at);

    if (!existing) {
      groups.set(id, {
        events: [event],
        lastIndex: index,
        latestAt: loggedAt,
      });
    } else {
      existing.events.push(event);
      existing.lastIndex = index;
      existing.latestAt = Math.max(existing.latestAt, loggedAt);
    }
  });

  const latest = [...groups.entries()].sort(
    (a, b) =>
      b[1].latestAt - a[1].latestAt ||
      b[1].lastIndex - a[1].lastIndex,
  )[0];

  if (!latest) return null;

  const [id, group] = latest;
  const selectedTaskIds =
    group.events.find(
      (event) => event.gate_selected_task_ids_snapshot !== null,
    )?.gate_selected_task_ids_snapshot ?? [];

  const derived = deriveLatestGateResult(
    topicId,
    state.retrieval_tasks,
    evidence,
    state.settings.gate_threshold_pct,
  );

  return {
    id,
    selectedTaskIds: [...selectedTaskIds],
    attemptedTaskIds: [
      ...new Set(
        group.events
          .map((event) => event.retrieval_task_id)
          .filter((taskId): taskId is string => taskId !== null),
      ),
    ],
    complete: derived.passed_session_id === id && derived.complete,
    passed: derived.passed_session_id === id && derived.gate_passed,
  };
}
