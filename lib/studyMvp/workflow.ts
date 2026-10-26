import {
  aggregateReviewResult,
  createReviewAfterGate,
  defaultIdFactory,
  deriveLatestGateResult,
  localDateOfTimestamp,
  transitionReview,
  type DerivedGateResult,
  type IdFactory,
  type ReviewAggregation,
  type ReviewTransition,
  type ScheduleDecision,
} from "./reviewEngine";
import type {
  AttemptResult,
  EntityId,
  ISODate,
  ISODateTime,
  RetrievalTask,
  ReviewEvent,
  StudyMvpState,
  TaskEvent,
  TaskPriority,
  Topic,
  YellowGapSeverity,
} from "./types";

export interface ReviewAttemptInput {
  reviewId: EntityId;
  taskId: EntityId;
  result: AttemptResult;
  actualDurationMin: number;
  loggedAt: ISODateTime;
  yellowGapSeverity?: YellowGapSeverity | null;
  criticalErrorFlag?: boolean;
  eventId?: EntityId;
  nextSelectedTaskIds?: readonly EntityId[];
  nextEstimatedDurationMin?: number;
  idFactory?: IdFactory;
  now?: ISODateTime;
}

export interface ReviewAttemptWorkflowResult {
  state: StudyMvpState;
  outcome: "duplicate" | "in_progress" | "incomplete" | "relearn" | "retry" | "advance";
  aggregation: ReviewAggregation;
  transition: ReviewTransition | null;
  attemptEvent: TaskEvent;
}

export interface PauseIncompleteReviewInput {
  reviewId: EntityId;
  pausedAt: ISODateTime;
  idFactory?: IdFactory;
}

export interface GateAttemptInput {
  topicId: EntityId;
  gateSessionId: EntityId;
  selectedTaskIds: readonly EntityId[];
  retrievalTaskId?: EntityId | null;
  result: AttemptResult;
  actualDurationMin: number;
  loggedAt: ISODateTime;
  yellowGapSeverity?: YellowGapSeverity | null;
  criticalErrorFlag?: boolean;
  skillDemonstratedWithoutHints?: boolean;
  correctiveWorkReady?: boolean;
  eventId?: EntityId;
  nextReview?: {
    selectedTaskIds: readonly EntityId[];
    estimatedDurationMin: number;
    priority: TaskPriority;
  };
  idFactory?: IdFactory;
  now?: ISODateTime;
}

export interface GateAttemptWorkflowResult {
  state: StudyMvpState;
  gate: DerivedGateResult;
  completed: boolean;
  scheduleDecision: ScheduleDecision | null;
  attemptEvent: TaskEvent;
}

function requireTimestamp(value: string, label: string): void {
  if (
    !Number.isFinite(Date.parse(value)) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  ) {
    throw new Error(`${label} must be a valid ISO 8601 timestamp with a timezone.`);
  }
}

function requirePositiveDuration(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number of minutes.`);
  }
}

function requireYellowSeverity(
  result: AttemptResult,
  severity: YellowGapSeverity | null | undefined,
): YellowGapSeverity | null {
  if (result === "yellow") {
    if (severity !== "minor" && severity !== "substantive") {
      throw new Error("A Yellow attempt must be classified as minor or substantive.");
    }
    return severity;
  }

  if (severity != null) {
    throw new Error("Only a Yellow attempt may carry Yellow-gap severity.");
  }
  return null;
}

function lastFinalExamDate(state: StudyMvpState): ISODate | null {
  if (state.settings.last_final_exam_date) {
    return state.settings.last_final_exam_date;
  }

  const finals = state.exams.filter((exam) => exam.type === "final");
  if (finals.length === 0) return null;
  return finals.reduce((latest, exam) => exam.date > latest ? exam.date : latest, finals[0].date);
}

function requireNextReviewTasks(
  taskIds: readonly EntityId[],
  topicId: EntityId,
  allTasks: readonly RetrievalTask[],
): void {
  if (
    taskIds.length < 2 ||
    taskIds.length > 3 ||
    new Set(taskIds).size !== taskIds.length
  ) {
    throw new Error("A new review requires two or three distinct task IDs selected before scheduling.");
  }

  const byId = new Map(allTasks.map((task) => [task.id, task]));
  for (const id of taskIds) {
    const task = byId.get(id);
    if (!task || task.topic_id !== topicId || !task.active) {
      throw new Error(`Next-review task "${id}" must be an active task belonging to topic "${topicId}".`);
    }
  }
}

function buildReviewAttemptEvent(
  review: ReviewEvent,
  task: RetrievalTask,
  input: ReviewAttemptInput,
  idFactory: IdFactory,
): TaskEvent {
  return {
    id: input.eventId ?? idFactory("event"),
    logged_at: input.loggedAt,
    event_type: "attempt",
    subject_type: "retrieval_task",
    subject_id: task.id,
    review_event_id: review.id,
    retrieval_task_id: task.id,
    gate_session_id: null,
    gate_selected_task_ids_snapshot: null,
    skill_demonstrated_without_hints: null,
    work_session_id: null,
    related_event_id: null,
    estimated_duration_min_at_event: task.estimated_duration_min,
    task_type_at_event: task.task_type,
    priority_at_event: review.current_priority,
    intended_due_date_at_event: review.intended_due_date,
    current_due_date_at_event: review.current_due_date,
    actual_duration_min: input.actualDurationMin,
    result: input.result,
    yellow_gap_severity: requireYellowSeverity(input.result, input.yellowGapSeverity),
    disposition: null,
    reason: null,
    critical_error_flag: input.criticalErrorFlag ?? false,
    defer_count_at_event: review.defer_count,
    re_entry_condition: null,
    old_priority: null,
    new_priority: null,
  };
}

function decisionEventForRelearn(
  review: ReviewEvent,
  relatedEventId: EntityId,
  reason: string,
  loggedAt: ISODateTime,
  idFactory: IdFactory,
): TaskEvent {
  return {
    id: idFactory("event"),
    logged_at: loggedAt,
    event_type: "relearn",
    subject_type: "review_event",
    subject_id: review.id,
    review_event_id: review.id,
    retrieval_task_id: null,
    gate_session_id: null,
    gate_selected_task_ids_snapshot: null,
    skill_demonstrated_without_hints: null,
    work_session_id: null,
    related_event_id: relatedEventId,
    estimated_duration_min_at_event: null,
    task_type_at_event: null,
    priority_at_event: review.current_priority,
    intended_due_date_at_event: review.intended_due_date,
    current_due_date_at_event: review.current_due_date,
    actual_duration_min: 0,
    result: null,
    yellow_gap_severity: null,
    disposition: "RELEARN",
    reason,
    critical_error_flag: null,
    defer_count_at_event: review.defer_count,
    re_entry_condition: null,
    old_priority: null,
    new_priority: null,
  };
}

function applyReviewTransition(
  state: StudyMvpState,
  sourceReview: ReviewEvent,
  attemptEvent: TaskEvent,
  transition: ReviewTransition,
  idFactory: IdFactory,
): StudyMvpState {
  const reviews = state.review_events.map((review) =>
    review.id === sourceReview.id ? transition.updatedReview : review,
  );
  const emitted: TaskEvent[] = [];

  if (transition.requiresCorrectiveWork) {
    const reason = attemptEvent.result === "red"
      ? "A Red retrieval attempt ended the review immediately; corrective work is required before another retry."
      : "A retry ended with a substantive Yellow; corrective work is required before another retry.";
    emitted.push(decisionEventForRelearn(
      transition.updatedReview,
      attemptEvent.id,
      reason,
      attemptEvent.logged_at,
      idFactory,
    ));
  }

  if (transition.next?.kind === "scheduled") {
    reviews.push(transition.next.review_event);
    emitted.push(transition.next.scheduled_event);
  }

  const topics = state.topics.map((topic) =>
    topic.id === transition.updatedReview.topic_id
      ? { ...topic, status: transition.topicStatus }
      : topic,
  );

  return {
    ...state,
    topics,
    review_events: reviews,
    task_events: [...state.task_events, ...emitted],
  };
}

/**
 * Record one immutable review attempt. A Red ends the review immediately;
 * otherwise the same ReviewEvent stays in progress until all selected tasks
 * have attempts or the caller explicitly pauses it.
 */
export function applyReviewAttempt(
  state: StudyMvpState,
  input: ReviewAttemptInput,
): ReviewAttemptWorkflowResult {
  requireTimestamp(input.loggedAt, "Attempt timestamp");
  requirePositiveDuration(input.actualDurationMin, "Actual duration");
  requireYellowSeverity(input.result, input.yellowGapSeverity);

  const review = state.review_events.find((item) => item.id === input.reviewId);
  if (!review) throw new Error(`Review "${input.reviewId}" was not found.`);
  if (
    review.status !== "pending" &&
    review.status !== "in_progress" &&
    review.status !== "deferred" &&
    review.status !== "missed"
  ) {
    throw new Error(`Review "${review.id}" is ${review.status} and cannot accept another attempt.`);
  }
  if (!review.selected_task_ids.includes(input.taskId)) {
    throw new Error(`Task "${input.taskId}" was not selected for review "${review.id}".`);
  }

  const task = state.retrieval_tasks.find((item) => item.id === input.taskId);
  if (!task || task.topic_id !== review.topic_id) {
    throw new Error(`Task "${input.taskId}" does not belong to the review topic.`);
  }

  const idFactory = input.idFactory ?? defaultIdFactory;
  const attemptEvent = buildReviewAttemptEvent(review, task, input, idFactory);
  const sameId = state.task_events.find((event) => event.id === attemptEvent.id);
  if (sameId) {
    if (JSON.stringify(sameId) !== JSON.stringify(attemptEvent)) {
      throw new Error(`TaskEvent ID "${attemptEvent.id}" is already used for different evidence.`);
    }
    return {
      state,
      outcome: "duplicate",
      aggregation: aggregateReviewResult(review, state.task_events),
      transition: null,
      attemptEvent: sameId,
    };
  }

  const previousAttempts = state.task_events.filter((event) =>
    event.event_type === "attempt" &&
    event.review_event_id === review.id &&
    event.retrieval_task_id === task.id,
  );
  if (previousAttempts.length > 0) {
    throw new Error(`Task "${task.id}" already has an attempt for review "${review.id}".`);
  }

  const eventsWithAttempt = [...state.task_events, attemptEvent];
  const aggregation = aggregateReviewResult(review, eventsWithAttempt);

  if (aggregation.overall_result === "incomplete") {
    const nextState: StudyMvpState = {
      ...state,
      review_events: state.review_events.map((item) => item.id === review.id
        ? { ...item, status: "in_progress", overall_result: null, yellow_gap_severity: null, completed_at: null }
        : item),
      task_events: eventsWithAttempt,
    };
    return {
      state: nextState,
      outcome: "in_progress",
      aggregation,
      transition: null,
      attemptEvent,
    };
  }

  const topic = state.topics.find((item) => item.id === review.topic_id);
  if (!topic) throw new Error(`Topic "${review.topic_id}" was not found.`);

  const nextSelectedTaskIds = input.nextSelectedTaskIds ?? [];
  const retryFailsIntoRelearn =
    review.event_kind === "retry" &&
    aggregation.overall_result === "yellow" &&
    aggregation.yellow_gap_severity === "substantive";
  const transitionMaySchedule =
    aggregation.overall_result !== "red" &&
    !retryFailsIntoRelearn &&
    (
      review.stage < 5 ||
      (
        aggregation.overall_result === "yellow" &&
        aggregation.yellow_gap_severity === "substantive" &&
        review.event_kind !== "retry"
      )
    );

  if (transitionMaySchedule) {
    requireNextReviewTasks(nextSelectedTaskIds, review.topic_id, state.retrieval_tasks);
    requirePositiveDuration(input.nextEstimatedDurationMin ?? 0, "Next review estimate");
  }

  const transition = transitionReview({
    review,
    aggregation,
    completedAt: input.loggedAt,
    completionDate: localDateOfTimestamp(input.loggedAt, state.settings.timezone),
    currentTopicStatus: topic.status,
    lastFinalExamDate: lastFinalExamDate(state),
    nextSelectedTaskIds,
    nextEstimatedDurationMin: input.nextEstimatedDurationMin ?? 0,
    timezone: state.settings.timezone,
    idFactory,
    now: input.now ?? input.loggedAt,
  });

  const stateWithAttempt: StudyMvpState = {
    ...state,
    task_events: eventsWithAttempt,
  };
  const transitioned = applyReviewTransition(
    stateWithAttempt,
    review,
    attemptEvent,
    transition,
    idFactory,
  );

  return {
    state: transitioned,
    outcome: transition.kind,
    aggregation,
    transition,
    attemptEvent,
  };
}

/**
 * Pause an unfinished review at the end of a study session. It keeps the same
 * event ID, stage, and selected task set; the remaining tasks are due the next
 * study day (Sunday is skipped). No attempt history is edited or removed.
 */
export function pauseIncompleteReview(
  state: StudyMvpState,
  input: PauseIncompleteReviewInput,
): StudyMvpState {
  requireTimestamp(input.pausedAt, "Pause timestamp");
  const review = state.review_events.find((item) => item.id === input.reviewId);
  if (!review) throw new Error(`Review "${input.reviewId}" was not found.`);
  if (review.status !== "pending" && review.status !== "in_progress") {
    throw new Error(`Review "${review.id}" is ${review.status} and cannot be paused.`);
  }

  const aggregation = aggregateReviewResult(review, state.task_events);
  if (aggregation.overall_result !== "incomplete" || aggregation.attempted_task_ids.length === 0) {
    throw new Error("Only a review with at least one attempt and remaining selected tasks can be paused as incomplete.");
  }

  const topic = state.topics.find((item) => item.id === review.topic_id);
  if (!topic) throw new Error(`Topic "${review.topic_id}" was not found.`);

  const transition = transitionReview({
    review,
    aggregation,
    completedAt: input.pausedAt,
    completionDate: localDateOfTimestamp(input.pausedAt, state.settings.timezone),
    currentTopicStatus: topic.status,
    lastFinalExamDate: lastFinalExamDate(state),
    nextSelectedTaskIds: [],
    nextEstimatedDurationMin: 0,
    timezone: state.settings.timezone,
    idFactory: input.idFactory ?? defaultIdFactory,
    now: input.pausedAt,
  });

  if (transition.kind !== "incomplete") {
    throw new Error("Review engine returned an unexpected transition while pausing incomplete work.");
  }

  return {
    ...state,
    review_events: state.review_events.map((item) =>
      item.id === review.id ? transition.updatedReview : item,
    ),
  };
}

function buildGateAttemptEvent(
  topic: Topic,
  task: RetrievalTask | undefined,
  input: GateAttemptInput,
  idFactory: IdFactory,
): TaskEvent {
  const skillOnly = !task;
  return {
    id: input.eventId ?? idFactory("event"),
    logged_at: input.loggedAt,
    event_type: "gate_attempt",
    subject_type: "gate_attempt",
    subject_id: task?.id ?? topic.id,
    review_event_id: null,
    retrieval_task_id: task?.id ?? null,
    gate_session_id: input.gateSessionId,
    gate_selected_task_ids_snapshot: [...input.selectedTaskIds],
    skill_demonstrated_without_hints: skillOnly
      ? input.skillDemonstratedWithoutHints === true
      : input.skillDemonstratedWithoutHints ?? false,
    work_session_id: null,
    related_event_id: null,
    estimated_duration_min_at_event: task?.estimated_duration_min ?? null,
    task_type_at_event: task?.task_type ?? null,
    priority_at_event: null,
    intended_due_date_at_event: null,
    current_due_date_at_event: null,
    actual_duration_min: input.actualDurationMin,
    result: input.result,
    yellow_gap_severity: requireYellowSeverity(input.result, input.yellowGapSeverity),
    disposition: null,
    reason: null,
    critical_error_flag: input.criticalErrorFlag ?? false,
    defer_count_at_event: null,
    re_entry_condition: null,
    old_priority: null,
    new_priority: null,
  };
}

function gateFailureDecisionEvent(
  topicId: EntityId,
  sessionId: EntityId,
  relatedEventId: EntityId,
  loggedAt: ISODateTime,
  idFactory: IdFactory,
): TaskEvent {
  return {
    id: idFactory("event"),
    logged_at: loggedAt,
    event_type: "relearn",
    subject_type: "gate_attempt",
    subject_id: topicId,
    review_event_id: null,
    retrieval_task_id: null,
    gate_session_id: sessionId,
    gate_selected_task_ids_snapshot: null,
    skill_demonstrated_without_hints: null,
    work_session_id: null,
    related_event_id: relatedEventId,
    estimated_duration_min_at_event: null,
    task_type_at_event: null,
    priority_at_event: null,
    intended_due_date_at_event: null,
    current_due_date_at_event: null,
    actual_duration_min: 0,
    result: null,
    yellow_gap_severity: null,
    disposition: "RELEARN",
    reason: "The topic gate failed; corrective work must be explicitly marked ready before a new gate session.",
    critical_error_flag: null,
    defer_count_at_event: null,
    re_entry_condition: null,
    old_priority: null,
    new_priority: null,
  };
}

/**
 * Append one gate attempt and derive gate status exclusively from immutable
 * TaskEvents. A passed gate stamps the actual local pass date as Day 0 and
 * creates Review 1; a failed gate puts the topic into relearn.
 */
export function startTopicLearning(
  state: StudyMvpState,
  topicId: EntityId,
): StudyMvpState {
  const topic = state.topics.find((item) => item.id === topicId);
  if (!topic) {
    throw new Error(`Topic "${topicId}" was not found.`);
  }

  if (topic.status !== "not_started") {
    throw new Error(
      `Topic "${topicId}" can only be started from not_started status.`,
    );
  }

  if (
    topic.gate_passed ||
    topic.gate_result === "passed" ||
    topic.gate_result === "skill_based_passed"
  ) {
    throw new Error(`Topic "${topicId}" has already passed its initial gate.`);
  }

  return {
    ...state,
    topics: state.topics.map((item) =>
      item.id === topicId
        ? { ...item, status: "in_learning" }
        : item,
    ),
  };
}

export function applyGateAttempt(
  state: StudyMvpState,
  input: GateAttemptInput,
): GateAttemptWorkflowResult {
  requireTimestamp(input.loggedAt, "Gate attempt timestamp");
  requirePositiveDuration(input.actualDurationMin, "Gate attempt duration");
  requireYellowSeverity(input.result, input.yellowGapSeverity);

  const topic = state.topics.find((item) => item.id === input.topicId);
  if (!topic) throw new Error(`Topic "${input.topicId}" was not found.`);

  if (
    topic.gate_passed ||
    topic.gate_result === "passed" ||
    topic.gate_result === "skill_based_passed"
  ) {
    throw new Error(`Topic "${topic.id}" has already passed its initial gate.`);
  }

  if (topic.status !== "in_learning" && topic.status !== "relearn") {
    throw new Error(
      "Start learning must be recorded before a topic can attempt its initial gate.",
    );
  }

  if (topic.status === "relearn" && topic.gate_result !== "failed") {
    throw new Error(
      "Only a topic with a failed gate can retry from relearn status.",
    );
  }

  const attemptDate = localDateOfTimestamp(
    input.loggedAt,
    state.settings.timezone,
  );
  const dueDate =
    topic.planned_consolidation_date ??
    topic.initial_study_date ??
    attemptDate;

  if (dueDate > attemptDate) {
    throw new Error(
      `This topic's gate is not available before its planned date (${dueDate}).`,
    );
  }

  if (
    input.selectedTaskIds.length < 3 ||
    new Set(input.selectedTaskIds).size !== input.selectedTaskIds.length
  ) {
    throw new Error("A new-topic gate must select at least three distinct retrieval tasks.");
  }

  const tasksById = new Map(state.retrieval_tasks.map((task) => [task.id, task]));
  for (const id of input.selectedTaskIds) {
    const selected = tasksById.get(id);
    if (!selected || selected.topic_id !== topic.id || !selected.active) {
      throw new Error(`Gate task "${id}" must be active and belong to topic "${topic.id}".`);
    }
  }

  const taskId = input.retrievalTaskId ?? null;
  const task = taskId === null ? undefined : tasksById.get(taskId);
  if (taskId !== null && (!task || task.topic_id !== topic.id || !input.selectedTaskIds.includes(taskId))) {
    throw new Error(`Gate attempt task "${taskId}" is not in the selected task set for this topic.`);
  }
  if (!task && input.skillDemonstratedWithoutHints !== true) {
    throw new Error("A taskless gate attempt must explicitly record a skill demonstrated without hints.");
  }

  const priorSessionEvents = state.task_events.filter((event) =>
    event.event_type === "gate_attempt" && event.gate_session_id === input.gateSessionId,
  );
  for (const previous of priorSessionEvents) {
    if (JSON.stringify(previous.gate_selected_task_ids_snapshot) !== JSON.stringify(input.selectedTaskIds)) {
      throw new Error(`Gate session "${input.gateSessionId}" cannot change its selected task set midway through.`);
    }
  }

  if (
    priorSessionEvents.some((event) => event.retrieval_task_id === taskId && taskId !== null) ||
    (taskId === null && priorSessionEvents.some((event) => event.retrieval_task_id === null && event.skill_demonstrated_without_hints === true))
  ) {
    throw new Error("This gate session already contains an attempt for that selected task or skill demonstration.");
  }

  const sameSessionDerivation = deriveLatestGateResult(
    topic.id,
    state.retrieval_tasks,
    priorSessionEvents,
    state.settings.gate_threshold_pct,
  );
  if (priorSessionEvents.length > 0 && sameSessionDerivation.complete) {
    throw new Error(`Gate session "${input.gateSessionId}" is already complete; start a new session to reattempt.`);
  }

  const hasAnyPriorGateEvidence = state.task_events.some((event) =>
    event.event_type === "gate_attempt" &&
    (event.subject_id === topic.id || event.gate_selected_task_ids_snapshot?.some((id) => input.selectedTaskIds.includes(id))),
  );
  const isNewSession = priorSessionEvents.length === 0;
  if (
    isNewSession &&
    topic.gate_result === "failed" &&
    hasAnyPriorGateEvidence &&
    input.correctiveWorkReady !== true
  ) {
    throw new Error("A failed gate can be retried only after corrective work is explicitly marked ready.");
  }

  const idFactory = input.idFactory ?? defaultIdFactory;
  const attemptEvent = buildGateAttemptEvent(topic, task, input, idFactory);
  const sameId = state.task_events.find((event) => event.id === attemptEvent.id);
  if (sameId) {
    if (JSON.stringify(sameId) !== JSON.stringify(attemptEvent)) {
      throw new Error(`TaskEvent ID "${attemptEvent.id}" is already used for different evidence.`);
    }
    const gate = deriveLatestGateResult(
      topic.id,
      state.retrieval_tasks,
      state.task_events,
      state.settings.gate_threshold_pct,
    );
    return { state, gate, completed: gate.complete, scheduleDecision: null, attemptEvent: sameId };
  }

  const allEvidence = [...state.task_events, attemptEvent];
  const gate = deriveLatestGateResult(
    topic.id,
    state.retrieval_tasks,
    allEvidence,
    state.settings.gate_threshold_pct,
  );

  let nextTopic: Topic = {
    ...topic,
    gate_passed: gate.gate_passed,
    gate_result: gate.gate_result,
    status: gate.complete
      ? gate.gate_passed ? "active" : "relearn"
      : "in_learning",
  };
  let scheduleDecision: ScheduleDecision | null = null;
  const emittedEvents: TaskEvent[] = [];
  const nextReviews = [...state.review_events];

  if (gate.complete && gate.gate_passed) {
    const gatePassedDate = localDateOfTimestamp(input.loggedAt, state.settings.timezone);
    nextTopic = { ...nextTopic, initial_study_date: gatePassedDate };

    if (!input.nextReview) {
      throw new Error("A successful gate requires the next review's selected task IDs, estimate, and priority before scheduling.");
    }
    requireNextReviewTasks(input.nextReview.selectedTaskIds, topic.id, state.retrieval_tasks);
    requirePositiveDuration(input.nextReview.estimatedDurationMin, "First review estimate");

    scheduleDecision = createReviewAfterGate({
      topicId: topic.id,
      gatePassedDate,
      lastFinalExamDate: lastFinalExamDate(state),
      selectedTaskIds: input.nextReview.selectedTaskIds,
      estimatedDurationMin: input.nextReview.estimatedDurationMin,
      priority: input.nextReview.priority,
      idFactory,
      now: input.now ?? input.loggedAt,
    });

    if (scheduleDecision.kind === "scheduled") {
      nextReviews.push(scheduleDecision.review_event);
      emittedEvents.push(scheduleDecision.scheduled_event);
    } else {
      nextTopic = { ...nextTopic, status: "maintenance_pending_classification" };
    }
  } else if (gate.complete && !gate.gate_passed) {
    emittedEvents.push(gateFailureDecisionEvent(
      topic.id,
      input.gateSessionId,
      attemptEvent.id,
      input.loggedAt,
      idFactory,
    ));
  }

  return {
    state: {
      ...state,
      topics: state.topics.map((item) => item.id === topic.id ? nextTopic : item),
      review_events: nextReviews,
      task_events: [...allEvidence, ...emittedEvents],
    },
    gate,
    completed: gate.complete,
    scheduleDecision,
    attemptEvent,
  };
}
