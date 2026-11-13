import type {
  EntityId,
  ISODate,
  ISODateTime,
  ReviewEvent,
  ReviewEventKind,
  ReviewResult,
  ReviewStage,
  RetrievalPurpose,
  RetrievalTask,
  TaskEvent,
  TaskPriority,
  Topic,
  TopicStatus,
  YellowGapSeverity,
} from "./types";

export const REVIEW_INTERVALS_DAYS = [
  1, 3, 7, 14, 30,
] as const;

export type IdFactory = (prefix: string) => EntityId;

export const defaultIdFactory: IdFactory = (prefix) => {
  const cryptoObject = globalThis.crypto as
    | (Crypto & { randomUUID?: () => string })
    | undefined;

  const suffix =
    cryptoObject &&
    typeof cryptoObject.randomUUID === "function"
      ? cryptoObject.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}_${suffix}`;
};

function parseDateOnly(value: ISODate): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ISO date: ${value}`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }

  return parsed;
}

/**
 * Calendar-date arithmetic is independent of the machine timezone.
 * Pass the student's local YYYY-MM-DD date into these functions.
 */
export function addCalendarDays(
  date: ISODate,
  days: number,
): ISODate {
  if (!Number.isSafeInteger(days)) {
    throw new Error("Calendar-day offset must be an integer.");
  }

  const result = parseDateOnly(date);
  result.setUTCDate(result.getUTCDate() + days);

  return result.toISOString().slice(0, 10);
}

export function moveSundayToMonday(
  date: ISODate,
): { date: ISODate; moved: boolean } {
  const weekday = parseDateOnly(date).getUTCDay();

  if (weekday !== 0) {
    return { date, moved: false };
  }

  return {
    date: addCalendarDays(date, 1),
    moved: true,
  };
}

/**
 * The next study day after a given date.
 * Monday–Saturday are study days; Sunday is the rest day.
 */
export function nextStudyDayAfter(date: ISODate): ISODate {
  const next = addCalendarDays(date, 1);
  return moveSundayToMonday(next).date;
}

export function localDateOfTimestamp(
  timestamp: ISODateTime,
  timezone: string,
): ISODate {
  const instant = new Date(timestamp);

  if (!Number.isFinite(instant.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;

  const year = value("year");
  const month = value("month");
  const day = value("day");

  if (!year || !month || !day) {
    throw new Error(`Could not determine local date for ${timezone}.`);
  }

  return `${year}-${month}-${day}`;
}

export interface TaskSelection {
  ready: boolean;
  selected_task_ids: EntityId[];
  reason: string | null;
}

/**
 * Suggests tasks before a gate or review begins.
 *
 * Unused questions are preferred where possible. Selection also
 * tries to cover different task types and prefers, but does not
 * exclusively require, matching purpose labels.
 */
export function selectRetrievalTasks(
  tasks: readonly RetrievalTask[],
  options: {
    topicId: EntityId;
    purpose: RetrievalPurpose;
    recentlyUsedTaskIds?: readonly EntityId[];
    count?: 2 | 3;
  },
): TaskSelection {
  const recent = new Set(options.recentlyUsedTaskIds ?? []);

  const available = tasks.filter(
    (task) =>
      task.topic_id === options.topicId &&
      task.active,
  );

  const minimum = options.purpose === "gate" ? 3 : 2;
  const requested =
    options.purpose === "gate"
      ? 3
      : (options.count ?? 3);

  if (available.length < minimum) {
    return {
      ready: false,
      selected_task_ids: [],
      reason:
        options.purpose === "gate"
          ? "A gate requires at least three active retrieval tasks."
          : "A review requires at least two active retrieval tasks.",
    };
  }

  const target = Math.min(requested, available.length);
  const remaining = [...available];
  const selected: RetrievalTask[] = [];

  while (selected.length < target) {
    const usedTypes = new Set(
      selected.map((task) => task.task_type),
    );

    remaining.sort((a, b) => {
      const aRecent = recent.has(a.id) ? 1 : 0;
      const bRecent = recent.has(b.id) ? 1 : 0;

      if (aRecent !== bRecent) {
        return aRecent - bRecent;
      }

      const aPurpose = a.purpose === options.purpose ? 0 : 1;
      const bPurpose = b.purpose === options.purpose ? 0 : 1;

      if (aPurpose !== bPurpose) {
        return aPurpose - bPurpose;
      }

      const aRepeatedType = usedTypes.has(a.task_type) ? 1 : 0;
      const bRepeatedType = usedTypes.has(b.task_type) ? 1 : 0;

      if (aRepeatedType !== bRepeatedType) {
        return aRepeatedType - bRepeatedType;
      }

      return a.id.localeCompare(b.id);
    });

    const chosen = remaining.shift();

    if (!chosen) break;
    selected.push(chosen);
  }

  return {
    ready: selected.length >= minimum,
    selected_task_ids: selected.map((task) => task.id),
    reason: null,
  };
}

export type GateEvidence = Pick<
  TaskEvent,
  | "event_type"
  | "subject_id"
  | "logged_at"
  | "retrieval_task_id"
  | "gate_session_id"
  | "gate_selected_task_ids_snapshot"
  | "skill_demonstrated_without_hints"
  | "result"
  | "critical_error_flag"
>;

export interface DerivedGateResult {
  gate_result: Topic["gate_result"];
  gate_passed: boolean;
  complete: boolean;
  selected_task_ids: EntityId[];
  green_count: number;
  attempted_count: number;
  green_pct: number | null;
  passed_session_id: EntityId | null;
  reason:
    | "no_attempts"
    | "incomplete"
    | "passed"
    | "skill_based_passed"
    | "below_threshold"
    | "critical_error"
    | "invalid_snapshot";
}

/**
 * Derives gate state from immutable attempt evidence.
 * It never trusts Topic.gate_passed as the source of truth.
 */
export function deriveLatestGateResult(
  topicId: EntityId,
  topicTasks: readonly RetrievalTask[],
  events: readonly GateEvidence[],
  thresholdPct = 60,
): DerivedGateResult {
  const taskIds = new Set(
    topicTasks
      .filter((task) => task.topic_id === topicId)
      .map((task) => task.id),
  );

  const candidates = events.filter((event) => {
    if (
      event.event_type !== "gate_attempt" ||
      !event.gate_session_id
    ) {
      return false;
    }

    if (
      event.retrieval_task_id &&
      taskIds.has(event.retrieval_task_id)
    ) {
      return true;
    }

    if (event.subject_id === topicId) {
      return true;
    }

    return (
      event.gate_selected_task_ids_snapshot?.some(
        (id) => taskIds.has(id),
      ) ?? false
    );
  });

  const empty = (
    reason: DerivedGateResult["reason"],
  ): DerivedGateResult => ({
    gate_result: "pending",
    gate_passed: false,
    complete: false,
    selected_task_ids: [],
    green_count: 0,
    attempted_count: 0,
    green_pct: null,
    passed_session_id: null,
    reason,
  });

  if (candidates.length === 0) {
    return empty("no_attempts");
  }

  const sessions = new Map<EntityId, GateEvidence[]>();

  for (const event of candidates) {
    const sessionId = event.gate_session_id!;

    const group = sessions.get(sessionId) ?? [];
    group.push(event);
    sessions.set(sessionId, group);
  }

  const latestSession = [...sessions.entries()].sort((a, b) => {
    const aLatest = Math.max(
      ...a[1].map((event) => Date.parse(event.logged_at)),
    );

    const bLatest = Math.max(
      ...b[1].map((event) => Date.parse(event.logged_at)),
    );

    return bLatest - aLatest;
  })[0];

  if (!latestSession) {
    return empty("no_attempts");
  }

  const [sessionId, sessionEvents] = latestSession;

  const latestAttempt = [...sessionEvents].sort(
    (a, b) =>
      Date.parse(b.logged_at) - Date.parse(a.logged_at),
  );

  const hasCriticalError = sessionEvents.some(
    (event) => event.critical_error_flag === true,
  );

  const skillPassed = sessionEvents.some(
    (event) =>
      event.skill_demonstrated_without_hints === true &&
      event.result === "green",
  );

  if (skillPassed) {
    if (hasCriticalError) {
      return {
        gate_result: "failed",
        gate_passed: false,
        complete: true,
        selected_task_ids: [],
        green_count: 1,
        attempted_count: 1,
        green_pct: 100,
        passed_session_id: sessionId,
        reason: "critical_error",
      };
    }

    return {
      gate_result: "skill_based_passed",
      gate_passed: true,
      complete: true,
      selected_task_ids: [],
      green_count: 1,
      attempted_count: 1,
      green_pct: 100,
      passed_session_id: sessionId,
      reason: "skill_based_passed",
    };
  }

  const snapshots = sessionEvents
    .map((event) => event.gate_selected_task_ids_snapshot)
    .filter(
      (value): value is EntityId[] => value !== null,
    );

  if (snapshots.length === 0) {
    return empty("incomplete");
  }

  const selected = snapshots[0];

  const consistentSnapshot = snapshots.every(
    (snapshot) =>
      JSON.stringify(snapshot) === JSON.stringify(selected),
  );

  const validSnapshot =
    selected.length >= 3 &&
    new Set(selected).size === selected.length &&
    selected.every((id) => taskIds.has(id));

  if (!consistentSnapshot || !validSnapshot) {
    return {
      gate_result: "failed",
      gate_passed: false,
      complete: true,
      selected_task_ids: selected,
      green_count: 0,
      attempted_count: 0,
      green_pct: null,
      passed_session_id: sessionId,
      reason: "invalid_snapshot",
    };
  }

  const latestByTask = new Map<EntityId, GateEvidence>();

  for (const event of latestAttempt) {
    const taskId = event.retrieval_task_id;

    if (
      taskId &&
      selected.includes(taskId) &&
      !latestByTask.has(taskId)
    ) {
      latestByTask.set(taskId, event);
    }
  }

  const attemptedCount = latestByTask.size;

  // A critical error immediately terminates the gate as a failure,
  // even when other selected tasks have not yet been attempted.
  if (hasCriticalError) {
    return {
      gate_result: "failed",
      gate_passed: false,
      complete: true,
      selected_task_ids: selected,
      green_count: [...latestByTask.values()].filter(
        (event) => event.result === "green",
      ).length,
      attempted_count: attemptedCount,
      green_pct: null,
      passed_session_id: sessionId,
      reason: "critical_error",
    };
  }

  if (selected.some((id) => !latestByTask.has(id))) {
    return {
      gate_result: "pending",
      gate_passed: false,
      complete: false,
      selected_task_ids: selected,
      green_count: [...latestByTask.values()].filter(
        (event) => event.result === "green",
      ).length,
      attempted_count: attemptedCount,
      green_pct: null,
      passed_session_id: sessionId,
      reason: "incomplete",
    };
  }

  const greenCount = [...latestByTask.values()].filter(
    (event) => event.result === "green",
  ).length;

  const greenPct = (greenCount / selected.length) * 100;

  if (hasCriticalError) {
    return {
      gate_result: "failed",
      gate_passed: false,
      complete: true,
      selected_task_ids: selected,
      green_count: greenCount,
      attempted_count: attemptedCount,
      green_pct: greenPct,
      passed_session_id: sessionId,
      reason: "critical_error",
    };
  }

  const passed = greenPct >= thresholdPct;

  return {
    gate_result: passed ? "passed" : "failed",
    gate_passed: passed,
    complete: true,
    selected_task_ids: selected,
    green_count: greenCount,
    attempted_count: attemptedCount,
    green_pct: greenPct,
    passed_session_id: sessionId,
    reason: passed ? "passed" : "below_threshold",
  };
}

export type ReviewEvidence = Pick<
  TaskEvent,
  | "event_type"
  | "review_event_id"
  | "retrieval_task_id"
  | "result"
  | "yellow_gap_severity"
>;

export interface ReviewAggregation {
  overall_result: ReviewResult;
  yellow_gap_severity: YellowGapSeverity | null;
  attempted_task_ids: EntityId[];
}

/**
 * Applies the review aggregation rules. Any Red attempt terminates
 * the review as Red, even if other selected tasks remain unattempted.
 */
export function aggregateReviewResult(
  review: Pick<ReviewEvent, "id" | "selected_task_ids">,
  events: readonly ReviewEvidence[],
): ReviewAggregation {
  const selected = new Set(review.selected_task_ids);

  const attempts = events.filter(
    (event) =>
      event.event_type === "attempt" &&
      event.review_event_id === review.id &&
      event.retrieval_task_id !== null &&
      selected.has(event.retrieval_task_id) &&
      event.result !== null,
  );

  const attemptedIds = [
    ...new Set(
      attempts
        .map((event) => event.retrieval_task_id)
        .filter((id): id is EntityId => id !== null),
    ),
  ];

  if (attempts.some((event) => event.result === "red")) {
    return {
      overall_result: "red",
      yellow_gap_severity: null,
      attempted_task_ids: attemptedIds,
    };
  }

  if (attemptedIds.length < selected.size) {
    return {
      overall_result: "incomplete",
      yellow_gap_severity: null,
      attempted_task_ids: attemptedIds,
    };
  }

  const yellowAttempts = attempts.filter(
    (event) => event.result === "yellow",
  );

  if (yellowAttempts.length > 0) {
    const severity: YellowGapSeverity =
      yellowAttempts.some(
        (event) =>
          event.yellow_gap_severity === "substantive",
      )
        ? "substantive"
        : "minor";

    return {
      overall_result: "yellow",
      yellow_gap_severity: severity,
      attempted_task_ids: attemptedIds,
    };
  }

  return {
    overall_result: "green",
    yellow_gap_severity: null,
    attempted_task_ids: attemptedIds,
  };
}

export type ScheduleDecision =
  | {
      kind: "scheduled";
      review_event: ReviewEvent;
      scheduled_event: TaskEvent;
    }
  | {
      kind: "classify";
      reason: "stage_5_complete" | "post_finals";
      topic_id: EntityId;
    };

export interface CreateReviewOptions {
  topicId: EntityId;
  stage: ReviewStage;
  eventKind: ReviewEventKind;
  holdsStage: boolean;
  selectedTaskIds: readonly EntityId[];
  estimatedDurationMin: number;
  dueDate: ISODate;
  priority: TaskPriority;
  sourceReviewId: EntityId | null;
  timezone?: string;
  movedFromSunday?: boolean;
  idFactory?: IdFactory;
  now?: ISODateTime;
}

function validateSelectedTasks(
  selectedTaskIds: readonly EntityId[],
): void {
  if (
    selectedTaskIds.length < 2 ||
    selectedTaskIds.length > 3 ||
    new Set(selectedTaskIds).size !== selectedTaskIds.length
  ) {
    throw new Error(
      "A review must have two or three distinct tasks selected before it starts.",
    );
  }
}

function buildScheduledReview(
  options: CreateReviewOptions,
): {
  review_event: ReviewEvent;
  scheduled_event: TaskEvent;
} {
  validateSelectedTasks(options.selectedTaskIds);

  if (
    !Number.isFinite(options.estimatedDurationMin) ||
    options.estimatedDurationMin <= 0
  ) {
    throw new Error(
      "A scheduled review requires a positive estimated duration.",
    );
  }

  const idFactory = options.idFactory ?? defaultIdFactory;
  const now =
    options.now ?? new Date().toISOString();

  parseDateOnly(options.dueDate);

  const reviewId = idFactory("review");

  const review: ReviewEvent = {
    id: reviewId,
    topic_id: options.topicId,

    stage: options.stage,
    event_kind: options.eventKind,
    holds_stage: options.holdsStage,

    selected_task_ids: [...options.selectedTaskIds],

    overall_result: null,
    yellow_gap_severity: null,

    source_review_id: options.sourceReviewId,

    intended_due_date: options.dueDate,
    current_due_date: options.dueDate,

    completed_at: null,

    priority_at_scheduling: options.priority,
    current_priority: options.priority,
    defer_count: 0,

    moved_from_sunday: options.movedFromSunday ?? false,
    status: "pending",
  };

  const scheduledEvent: TaskEvent = {
    id: idFactory("event"),
    logged_at: now,

    event_type: "review_scheduled",
    subject_type: "review_event",
    subject_id: reviewId,

    review_event_id: reviewId,
    retrieval_task_id: null,

    gate_session_id: null,
    gate_selected_task_ids_snapshot: null,
    skill_demonstrated_without_hints: null,

    work_session_id: null,
    related_event_id: options.sourceReviewId,

    estimated_duration_min_at_event:
      options.estimatedDurationMin,
    task_type_at_event: null,
    priority_at_event: options.priority,

    intended_due_date_at_event: options.dueDate,
    current_due_date_at_event: options.dueDate,

    actual_duration_min: null,
    result: null,
    yellow_gap_severity: null,

    disposition: null,
    reason: null,

    critical_error_flag: null,
    defer_count_at_event: 0,

    re_entry_condition: null,

    old_priority: null,
    new_priority: null,
  };

  return {
    review_event: review,
    scheduled_event: scheduledEvent,
  };
}

function finalExamBlocks(
  date: ISODate,
  lastFinalExamDate: ISODate | null,
): boolean {
  return (
    lastFinalExamDate !== null &&
    date > lastFinalExamDate
  );
}

/**
 * A passed gate establishes Day 0. Review 1 is due on Day 1,
 * shifted to Monday if Day 1 is Sunday.
 */
export function createReviewAfterGate(options: {
  topicId: EntityId;
  gatePassedDate: ISODate;
  lastFinalExamDate: ISODate | null;
  selectedTaskIds: readonly EntityId[];
  estimatedDurationMin: number;
  priority: TaskPriority;
  idFactory?: IdFactory;
  now?: ISODateTime;
}): ScheduleDecision {
  const next = moveSundayToMonday(
    addCalendarDays(options.gatePassedDate, 1),
  );

  if (
    finalExamBlocks(
      next.date,
      options.lastFinalExamDate,
    )
  ) {
    return {
      kind: "classify",
      reason: "post_finals",
      topic_id: options.topicId,
    };
  }

  const scheduled = buildScheduledReview({
    topicId: options.topicId,
    stage: 1,
    eventKind: "scheduled_review",
    holdsStage: false,
    selectedTaskIds: options.selectedTaskIds,
    estimatedDurationMin: options.estimatedDurationMin,
    dueDate: next.date,
    priority: options.priority,
    sourceReviewId: null,
    movedFromSunday: next.moved,
    idFactory: options.idFactory,
    now: options.now,
  });

  return {
    kind: "scheduled",
    ...scheduled,
  };
}

/**
 * Generate the next normal review after a successful review.
 * The interval is measured from the actual completion date.
 */
export function createNextReviewAfterSuccess(options: {
  sourceReview: ReviewEvent;
  completedDate: ISODate;
  lastFinalExamDate: ISODate | null;
  selectedTaskIds: readonly EntityId[];
  estimatedDurationMin: number;
  priority?: TaskPriority;
  idFactory?: IdFactory;
  now?: ISODateTime;
}): ScheduleDecision {
  const source = options.sourceReview;

  if (source.stage === 5) {
    return {
      kind: "classify",
      reason: "stage_5_complete",
      topic_id: source.topic_id,
    };
  }

  const targetStage = (source.stage + 1) as ReviewStage;
  const interval = REVIEW_INTERVALS_DAYS[targetStage - 1];

  const next = moveSundayToMonday(
    addCalendarDays(options.completedDate, interval),
  );

  if (
    finalExamBlocks(
      next.date,
      options.lastFinalExamDate,
    )
  ) {
    return {
      kind: "classify",
      reason: "post_finals",
      topic_id: source.topic_id,
    };
  }

  const scheduled = buildScheduledReview({
    topicId: source.topic_id,
    stage: targetStage,
    eventKind: "scheduled_review",
    holdsStage: false,
    selectedTaskIds: options.selectedTaskIds,
    estimatedDurationMin: options.estimatedDurationMin,
    dueDate: next.date,
    priority:
      options.priority ?? source.current_priority,
    sourceReviewId: source.id,
    movedFromSunday: next.moved,
    idFactory: options.idFactory,
    now: options.now,
  });

  return {
    kind: "scheduled",
    ...scheduled,
  };
}

/**
 * Retries retain the failed/held stage.
 * Callers must enforce the transition rules before requesting
 * a retry: substantive Yellow on a normal review, or corrective
 * work explicitly marked ready_to_retry after Red/retry failure.
 */
export function createRetryReview(options: {
  sourceReview: ReviewEvent;
  availableAfterDate: ISODate;
  lastFinalExamDate: ISODate | null;
  selectedTaskIds: readonly EntityId[];
  estimatedDurationMin: number;
  priority?: TaskPriority;
  idFactory?: IdFactory;
  now?: ISODateTime;
}): ScheduleDecision {
  const source = options.sourceReview;

  const next = moveSundayToMonday(
    addCalendarDays(options.availableAfterDate, 1),
  );

  if (
    finalExamBlocks(
      next.date,
      options.lastFinalExamDate,
    )
  ) {
    return {
      kind: "classify",
      reason: "post_finals",
      topic_id: source.topic_id,
    };
  }

  const scheduled = buildScheduledReview({
    topicId: source.topic_id,
    stage: source.stage,
    eventKind: "retry",
    holdsStage: true,
    selectedTaskIds: options.selectedTaskIds,
    estimatedDurationMin: options.estimatedDurationMin,
    dueDate: next.date,
    priority:
      options.priority ?? source.current_priority,
    sourceReviewId: source.id,
    movedFromSunday: next.moved,
    idFactory: options.idFactory,
    now: options.now,
  });

  return {
    kind: "scheduled",
    ...scheduled,
  };
}

/**
 * Returns an updated event, if a transition is appropriate, alongside
 * the required next action. It never mutates the supplied event.
 */
export type ReviewTransition =
  | {
      kind: "incomplete";
      updatedReview: ReviewEvent;
      topicStatus: TopicStatus;
      next: null;
      requiresCorrectiveWork: false;
    }
  | {
      kind: "relearn";
      updatedReview: ReviewEvent;
      topicStatus: "relearn";
      next: null;
      requiresCorrectiveWork: true;
    }
  | {
      kind: "retry";
      updatedReview: ReviewEvent;
      topicStatus: TopicStatus;
      next: ScheduleDecision;
      requiresCorrectiveWork: false;
    }
  | {
      kind: "advance";
      updatedReview: ReviewEvent;
      topicStatus: TopicStatus;
      next: ScheduleDecision;
      requiresCorrectiveWork: false;
    };

export function transitionReview(options: {
  review: ReviewEvent;
  aggregation: ReviewAggregation;
  completedAt: ISODateTime;
  completionDate: ISODate;
  currentTopicStatus: TopicStatus;
  lastFinalExamDate: ISODate | null;

  nextSelectedTaskIds: readonly EntityId[];
  nextEstimatedDurationMin: number;

  timezone?: string;
  priority?: TaskPriority;

  idFactory?: IdFactory;
  now?: ISODateTime;
}): ReviewTransition {
  const review = options.review;
  const outcome = options.aggregation;
  const idFactory = options.idFactory ?? defaultIdFactory;

  if (outcome.overall_result === "incomplete") {
    return {
      kind: "incomplete",
      updatedReview: {
        ...review,
        status: "in_progress",
        overall_result: "incomplete",
        current_due_date: nextStudyDayAfter(
          options.completionDate,
        ),
      },
      topicStatus: options.currentTopicStatus,
      next: null,
      requiresCorrectiveWork: false,
    };
  }

  const completedReview: ReviewEvent = {
    ...review,
    status: "completed",
    overall_result: outcome.overall_result,
    yellow_gap_severity: outcome.yellow_gap_severity,
    completed_at: options.completedAt,
  };

  if (outcome.overall_result === "red") {
    return {
      kind: "relearn",
      updatedReview: completedReview,
      topicStatus: "relearn",
      next: null,
      requiresCorrectiveWork: true,
    };
  }

  if (
    outcome.overall_result === "yellow" &&
    outcome.yellow_gap_severity === "substantive"
  ) {
    /*
     * A substantive Yellow during an ordinary review receives an
     * immediate same-stage retry. A substantive Yellow on a retry
     * requires corrective work before another retry is scheduled.
     */
    if (review.event_kind === "retry") {
      return {
        kind: "relearn",
        updatedReview: completedReview,
        topicStatus: "relearn",
        next: null,
        requiresCorrectiveWork: true,
      };
    }

    const next = createRetryReview({
      sourceReview: review,
      availableAfterDate: options.completionDate,
      lastFinalExamDate: options.lastFinalExamDate,
      selectedTaskIds: options.nextSelectedTaskIds,
      estimatedDurationMin: options.nextEstimatedDurationMin,
      priority: options.priority ?? review.current_priority,
      idFactory,
      now: options.now,
    });

    return {
      kind: "retry",
      updatedReview: completedReview,
      topicStatus:
        next.kind === "classify"
          ? "maintenance_pending_classification"
          : "active",
      next,
      requiresCorrectiveWork: false,
    };
  }

  /*
   * Green and minor Yellow are successful stage outcomes.
   * A successful retry advances exactly one stage from its held stage.
   */
  const next = createNextReviewAfterSuccess({
    sourceReview: review,
    completedDate: options.completionDate,
    lastFinalExamDate: options.lastFinalExamDate,
    selectedTaskIds: options.nextSelectedTaskIds,
    estimatedDurationMin: options.nextEstimatedDurationMin,
    priority: options.priority ?? review.current_priority,
    idFactory,
    now: options.now,
  });

  return {
    kind: "advance",
    updatedReview: completedReview,
    topicStatus:
      next.kind === "classify"
        ? "maintenance_pending_classification"
        : "active",
    next,
    requiresCorrectiveWork: false,
  };
}
