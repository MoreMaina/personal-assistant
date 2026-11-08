import { assertStudyStateIntegrity } from "./storage";
import { localDateOfTimestamp } from "./reviewEngine";
import type { DailyPlan } from "./dailyPlanner";
import type { StudyMvpState, TaskEvent } from "./types";

function sharedPracticeSessionKey(
  subjectType: string,
  subjectId: string,
  loggedAt: string,
  timezone: string,
): string {
  return `${subjectType}:${subjectId}:${localDateOfTimestamp(loggedAt, timezone)}`;
}

function taskEventBelongsToCourse(
  event: TaskEvent,
  topicIds: ReadonlySet<string>,
  taskIds: ReadonlySet<string>,
  reviewIds: ReadonlySet<string>,
  assignmentIds: ReadonlySet<string>,
  sharedPracticeSessionKeys: ReadonlySet<string>,
  timezone: string,
): boolean {
  if (event.review_event_id && reviewIds.has(event.review_event_id)) return true;
  if (event.retrieval_task_id && taskIds.has(event.retrieval_task_id)) return true;
  if (event.gate_selected_task_ids_snapshot?.some((id) => taskIds.has(id))) return true;
  if (event.guided_practice_selected_task_ids_snapshot?.some((id) => taskIds.has(id))) return true;
  if (
    (event.subject_type === "mixed_practice" || event.subject_type === "sampler") &&
    sharedPracticeSessionKeys.has(
      sharedPracticeSessionKey(event.subject_type, event.subject_id, event.logged_at, timezone),
    )
  ) return true;

  switch (event.subject_type) {
    case "review_event":
      return reviewIds.has(event.subject_id);
    case "retrieval_task":
      return taskIds.has(event.subject_id);
    case "gate_attempt":
      return taskIds.has(event.subject_id) || topicIds.has(event.subject_id);
    case "assignment":
      return assignmentIds.has(event.subject_id);
    case "corrective_task":
      return taskIds.has(event.subject_id) || topicIds.has(event.subject_id);
    case "topic_consolidation":
    case "initial_learning":
      return topicIds.has(event.subject_id);
    default:
      return false;
  }
}

function planItemBelongsToCourse(
  item: DailyPlan["items"][number],
  topicIds: ReadonlySet<string>,
  taskIds: ReadonlySet<string>,
  reviewIds: ReadonlySet<string>,
  assignmentIds: ReadonlySet<string>,
): boolean {
  if (item.review_event_id && reviewIds.has(item.review_event_id)) return true;
  if (
    item.selected_question_ids.some((id) => taskIds.has(id)) ||
    item.allocated_question_ids.some((id) => taskIds.has(id)) ||
    item.remaining_question_ids.some((id) => taskIds.has(id))
  ) return true;

  switch (item.subject_type) {
    case "review_event":
      return reviewIds.has(item.subject_id);
    case "retrieval_task":
      return taskIds.has(item.subject_id);
    case "gate_attempt":
      return taskIds.has(item.subject_id) || topicIds.has(item.subject_id);
    case "assignment":
      return assignmentIds.has(item.subject_id);
    case "corrective_task":
      return taskIds.has(item.subject_id) || topicIds.has(item.subject_id);
    case "topic_consolidation":
    case "initial_learning":
      return topicIds.has(item.subject_id);
    default:
      return false;
  }
}

/**
 * Build a replacement Study state after a user explicitly confirms permanent
 * deletion of one course. This function is intentionally separate from normal
 * saves: ordinary saves continue to enforce append-only history and stable IDs.
 */
export function deleteCourseStudyData(
  state: StudyMvpState,
  courseId: string,
): StudyMvpState {
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) throw new Error(`Course "${courseId}" was not found.`);

  const unitIds = new Set(
    state.units.filter((unit) => unit.course_id === courseId).map((unit) => unit.id),
  );
  const topicIds = new Set(
    state.topics.filter((topic) => unitIds.has(topic.unit_id)).map((topic) => topic.id),
  );
  const taskIds = new Set(
    state.retrieval_tasks
      .filter((task) => topicIds.has(task.topic_id))
      .map((task) => task.id),
  );
  const reviewIds = new Set(
    state.review_events
      .filter((review) => topicIds.has(review.topic_id))
      .map((review) => review.id),
  );
  const assignmentIds = new Set(
    state.assignments
      .filter((assignment) => assignment.course_id === courseId)
      .map((assignment) => assignment.id),
  );
  const examIds = new Set(
    state.exams
      .filter((exam) => exam.course_id === courseId)
      .map((exam) => exam.id),
  );
  const lectureIds = new Set(
    state.lectures
      .filter((lecture) => unitIds.has(lecture.unit_id) || topicIds.has(lecture.topic_id))
      .map((lecture) => lecture.id),
  );

  const courseEntityIds = new Set<string>([
    courseId,
    ...unitIds,
    ...topicIds,
    ...taskIds,
    ...reviewIds,
    ...assignmentIds,
    ...examIds,
    ...lectureIds,
  ]);

  // Mixed-practice and Sampler selections are frozen as a block. If one of
  // their selected questions belongs to the deleted course, remove that
  // block's shared recorded session as well as its individual attempts.
  const sharedPracticeSessionKeys = new Set(
    state.task_events
      .filter((event) =>
        event.event_type === "guided_practice_attempt" &&
        (event.subject_type === "mixed_practice" || event.subject_type === "sampler") &&
        Boolean(event.guided_practice_selected_task_ids_snapshot?.some((id) => taskIds.has(id)))
      )
      .map((event) => sharedPracticeSessionKey(
        event.subject_type,
        event.subject_id,
        event.logged_at,
        state.settings.timezone,
      )),
  );

  const deletedWorkSessionIds = new Set(
    state.work_sessions
      .filter((session) => {
        if (courseEntityIds.has(session.subject_id)) return true;
        if (
          (session.subject_type === "mixed_practice" || session.subject_type === "sampler") &&
          sharedPracticeSessionKeys.has(
            sharedPracticeSessionKey(session.subject_type, session.subject_id, session.logged_at, state.settings.timezone),
          )
        ) return true;
        if (session.subject_type === "assignment") return assignmentIds.has(session.subject_id);
        if (new Set<string>(["corrective", "recovery", "topic_consolidation", "initial_learning"]).has(session.subject_type)) {
          return topicIds.has(session.subject_id) || taskIds.has(session.subject_id);
        }
        return false;
      })
      .map((session) => session.id),
  );

  // Related events can form a chain (for example, a retry linked to a prior
  // task attempt). Remove the whole chain so no orphaned course reference stays.
  const deletedTaskEventIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of state.task_events) {
      if (deletedTaskEventIds.has(event.id)) continue;
      const belongs =
        taskEventBelongsToCourse(
          event,
          topicIds,
          taskIds,
          reviewIds,
          assignmentIds,
          sharedPracticeSessionKeys,
          state.settings.timezone,
        ) ||
        Boolean(event.work_session_id && deletedWorkSessionIds.has(event.work_session_id)) ||
        Boolean(event.related_event_id && deletedTaskEventIds.has(event.related_event_id));
      if (belongs) {
        deletedTaskEventIds.add(event.id);
        changed = true;
      }
    }
  }

  const remainingTaskEvents = state.task_events.filter(
    (event) => !deletedTaskEventIds.has(event.id),
  );
  const affectedDailyPlanSnapshotIds = new Set<string>();
  const dailyPlanHistory = state.daily_plan_history?.map((snapshot) => {
    const removedItemIds = new Set<string>();
    const items = snapshot.plan.items.filter((item) => {
      const remove = planItemBelongsToCourse(item, topicIds, taskIds, reviewIds, assignmentIds);
      if (remove) removedItemIds.add(item.id);
      return !remove;
    });
    if (items.length === snapshot.plan.items.length) return snapshot;
    affectedDailyPlanSnapshotIds.add(snapshot.id);

    const allocated = items.reduce((total, item) => total + item.allocated_minutes, 0);
    return {
      ...snapshot,
      plan: {
        ...snapshot.plan,
        items,
        allocated_minutes: allocated,
        remaining_budget_minutes: Math.max(0, snapshot.plan.budget_minutes - allocated),
        unresolved_decisions: snapshot.plan.unresolved_decisions.filter(
          (id) => !removedItemIds.has(id),
        ),
        review_reserve_used_minutes: items
          .filter((item) => item.kind === "review")
          .reduce((total, item) => total + item.allocated_minutes, 0),
        mixed_reserve_used_minutes: items
          .filter((item) => item.kind === "mixed_practice")
          .reduce((total, item) => total + item.allocated_minutes, 0),
        priority_1_3_skip_count: items.filter(
          (item) => item.priority <= 3 && item.category === "SKIP",
        ).length,
      },
    };
  });

  // Snapshots retain unrelated items. Section-level completion markers for
  // snapshots that contained deleted items are removed because they cannot
  // be attributed to an individual course safely.
  const remainingWeeklyMetrics = state.weekly_metrics.filter((metric) =>
    !metric.source_event_ids.some((id) => deletedTaskEventIds.has(id)) &&
    !metric.source_snapshot.some((event) => deletedTaskEventIds.has(event.id)),
  );

  const next: StudyMvpState = {
    ...state,
    courses: state.courses.filter((item) => item.id !== courseId),
    units: state.units.filter((item) => !unitIds.has(item.id)),
    topics: state.topics
      .filter((item) => !topicIds.has(item.id))
      .map((item) => ({
        ...item,
        prerequisite_topic_ids: item.prerequisite_topic_ids.filter((id) => !topicIds.has(id)),
      })),
    lectures: state.lectures.filter((item) => !lectureIds.has(item.id)),
    retrieval_tasks: state.retrieval_tasks.filter((item) => !taskIds.has(item.id)),
    review_events: state.review_events.filter((item) => !reviewIds.has(item.id)),
    task_events: remainingTaskEvents,
    work_sessions: state.work_sessions.filter((item) => !deletedWorkSessionIds.has(item.id)),
    assignments: state.assignments.filter((item) => !assignmentIds.has(item.id)),
    exams: state.exams
      .filter((item) => !examIds.has(item.id))
      .map((item) => ({
        ...item,
        coverage_units: item.coverage_units.filter((id) => !unitIds.has(id)),
        coverage_topics: item.coverage_topics.filter((id) => !topicIds.has(id)),
      })),
    weekly_metrics: remainingWeeklyMetrics,
    ...(dailyPlanHistory ? { daily_plan_history: dailyPlanHistory } : {}),
    ...(state.daily_plan_executions
      ? {
          daily_plan_executions: state.daily_plan_executions.filter(
            (execution) => !affectedDailyPlanSnapshotIds.has(execution.plan_snapshot_id),
          ),
        }
      : {}),
  };

  // Keep the exact original schema and all unrelated course data intact.
  assertStudyStateIntegrity(next);
  return next;
}
