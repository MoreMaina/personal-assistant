import {
  preserveStoredValue,
} from "../storageRecovery";

import {
  defaultIdFactory,
  localDateOfTimestamp,
} from "./reviewEngine";

import type {
  Course,
  EngineChangeRecord,
  EntityId,
  ISODate,
  ISODateTime,
  ReviewEvent,
  SettingsChangeRecord,
  StudyMvpState,
  StudySettings,
  TaskEvent,
  Unit,
  WeekMetrics,
  WorkSession,
} from "./types";

/**
 * Study MVP local persistence.
 *
 * The new framework intentionally has its own storage key. The legacy
 * Study storage key is not overwritten, migrated, or removed here.
 *
 * This implementation uses a single localStorage document as the
 * persistence equivalent for the existing single-user application.
 * Historical records are append-only and every state update is
 * checked before the replacement document is written.
 */

export const STUDY_MVP_STORAGE_KEY =
  "personal-assistant-study-mvp-v1";

export const STUDY_MVP_SCHEMA_VERSION = 1 as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CreateStudyStateOptions {
  now?: ISODateTime;
  timezone?: string;
}

export interface StudyStorageIntegrityError {
  code:
    | "invalid-json"
    | "invalid-shape"
    | "immutable-history"
    | "invalid-event"
    | "duplicate-id";
  message: string;
}

export class StudyStorageError extends Error {
  readonly code: StudyStorageIntegrityError["code"];

  constructor(
    code: StudyStorageIntegrityError["code"],
    message: string,
  ) {
    super(message);
    this.name = "StudyStorageError";
    this.code = code;
  }
}

function browserStorage(): StorageLike {
  if (typeof window === "undefined") {
    throw new StudyStorageError(
      "invalid-shape",
      "Study MVP persistence is only available in the browser.",
    );
  }

  return window.localStorage;
}

function resolveTimezone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC"
    );
  } catch {
    return "UTC";
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function hasTimezone(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isDateOnly(value: unknown): value is ISODate {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toISOString().slice(0, 10) === value;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function isTaskEventType(value: unknown): value is TaskEvent["event_type"] {
  return [
    "review_scheduled",
    "attempt",
    "gate_attempt",
    "defer",
    "skip",
    "relearn",
    "work_session",
    "forced_disposition",
    "priority_change",
    "skip_resolution",
    "content_preparation",
  ].includes(String(value));
}

function isAttemptResult(value: unknown): value is TaskEvent["result"] {
  return (
    value === "green" ||
    value === "yellow" ||
    value === "red" ||
    value === null
  );
}

function isPriority(value: unknown): boolean {
  return (
    Number.isInteger(value) &&
    typeof value === "number" &&
    value >= 1 &&
    value <= 5
  );
}

function validateTaskEventShape(
  event: unknown,
): asserts event is TaskEvent {
  if (!isRecord(event)) {
    throw new StudyStorageError(
      "invalid-event",
      "TaskEvent must be an object.",
    );
  }

  const requiredStrings = [
    "id",
    "event_type",
    "subject_type",
    "subject_id",
    "logged_at",
  ];

  for (const key of requiredStrings) {
    if (!isNonEmptyString(event[key])) {
      throw new StudyStorageError(
        "invalid-event",
        `TaskEvent.${key} must be a non-empty string.`,
      );
    }
  }

  if (!hasTimezone(event.logged_at)) {
    throw new StudyStorageError(
      "invalid-event",
      "TaskEvent.logged_at must be an ISO 8601 timestamp with a timezone.",
    );
  }

  if (!isTaskEventType(event.event_type)) {
    throw new StudyStorageError(
      "invalid-event",
      `Unsupported TaskEvent type: ${String(event.event_type)}`,
    );
  }

  if (
    event.result !== null &&
    event.result !== "green" &&
    event.result !== "yellow" &&
    event.result !== "red"
  ) {
    throw new StudyStorageError(
      "invalid-event",
      "TaskEvent.result must be Green, Yellow, Red, or null.",
    );
  }

  if (
    event.actual_duration_min !== null &&
    !isFiniteNumber(event.actual_duration_min)
  ) {
    throw new StudyStorageError(
      "invalid-event",
      "TaskEvent actual duration must be numeric or null.",
    );
  }

  const isRetrievalAttempt =
    event.event_type === "attempt" ||
    event.event_type === "gate_attempt";

  if (isRetrievalAttempt) {
    if (!isAttemptResult(event.result) || event.result === null) {
      throw new StudyStorageError(
        "invalid-event",
        "A completed retrieval attempt requires a G/Y/R result.",
      );
    }

    if (!isPositiveNumber(event.actual_duration_min)) {
      throw new StudyStorageError(
        "invalid-event",
        "A retrieval attempt requires a positive actual duration.",
      );
    }

    if (
      event.event_type === "attempt" &&
      (
        !isNonEmptyString(event.retrieval_task_id) ||
        !isNonEmptyString(event.review_event_id)
      )
    ) {
      throw new StudyStorageError(
        "invalid-event",
        "A review attempt must link to its review and retrieval task.",
      );
    }

    if (
      event.event_type === "gate_attempt" &&
      !isNonEmptyString(event.gate_session_id)
    ) {
      throw new StudyStorageError(
        "invalid-event",
        "A gate attempt requires a shared gate_session_id.",
      );
    }

    if (
      event.event_type === "gate_attempt" &&
      !isNonEmptyString(event.retrieval_task_id) &&
      event.skill_demonstrated_without_hints !== true
    ) {
      throw new StudyStorageError(
        "invalid-event",
        "A gate attempt requires a retrieval task or a recorded skill demonstration.",
      );
    }

    if (
      isNonEmptyString(event.retrieval_task_id) &&
      !isNonEmptyString(event.task_type_at_event)
    ) {
      throw new StudyStorageError(
        "invalid-event",
        "A retrieval attempt requires its task type snapshot.",
      );
    }

    if (
      event.event_type === "gate_attempt" &&
      !isStringArray(event.gate_selected_task_ids_snapshot)
    ) {
      throw new StudyStorageError(
        "invalid-event",
        "Each gate attempt requires the selected gate-task snapshot.",
      );
    }
  } else if (event.result !== null) {
    throw new StudyStorageError(
      "invalid-event",
      "Only attempt and gate_attempt events may contain a G/Y/R result.",
    );
  }

  if (event.event_type === "work_session") {
    if (!isNonEmptyString(event.work_session_id)) {
      throw new StudyStorageError(
        "invalid-event",
        "A work_session event requires a work_session_id.",
      );
    }

    if (!isPositiveNumber(event.actual_duration_min)) {
      throw new StudyStorageError(
        "invalid-event",
        "A work_session event requires a positive actual duration.",
      );
    }
  }

  if (event.event_type === "content_preparation") {
    if (!isPositiveNumber(event.actual_duration_min)) {
      throw new StudyStorageError(
        "invalid-event",
        "Content preparation must record a positive duration.",
      );
    }
  }

  if (
    event.event_type === "defer" ||
    event.event_type === "skip" ||
    event.event_type === "relearn" ||
    event.event_type === "forced_disposition"
  ) {
    if (!isNonEmptyString(event.reason)) {
      throw new StudyStorageError(
        "invalid-event",
        `${event.event_type} events require a reason.`,
      );
    }

    if (
      event.actual_duration_min !== null &&
      event.actual_duration_min !== 0
    ) {
      throw new StudyStorageError(
        "invalid-event",
        `${event.event_type} decisions must not record study duration.`,
      );
    }
  }

  if (
    event.event_type === "skip" &&
    (
      ![
        "later_failure",
        "upcoming_exam",
        "time_available",
        "never",
      ].includes(String(event.re_entry_condition))
    )
  ) {
    throw new StudyStorageError(
      "invalid-event",
      "A SKIP event requires a valid re-entry condition.",
    );
  }

  if (
    event.event_type === "priority_change" &&
    (
      !isPriority(event.old_priority) ||
      !isPriority(event.new_priority)
    )
  ) {
    throw new StudyStorageError(
      "invalid-event",
      "Priority-change events require old and new priority snapshots.",
    );
  }

  if (event.event_type === "review_scheduled") {
    if (
      !isNonEmptyString(event.review_event_id) ||
      !isDateOnly(event.intended_due_date_at_event) ||
      !isDateOnly(event.current_due_date_at_event) ||
      !isPriority(event.priority_at_event)
    ) {
      throw new StudyStorageError(
        "invalid-event",
        "A review_scheduled event requires its review ID, dates, and priority snapshot.",
      );
    }

    if (
      event.actual_duration_min !== null &&
      event.actual_duration_min !== 0
    ) {
      throw new StudyStorageError(
        "invalid-event",
        "A scheduling event must not record study duration.",
      );
    }
  }

  if (
    event.intended_due_date_at_event !== null &&
    !isDateOnly(event.intended_due_date_at_event)
  ) {
    throw new StudyStorageError(
      "invalid-event",
      "Intended due-date snapshots must be ISO calendar dates.",
    );
  }

  if (
    event.current_due_date_at_event !== null &&
    !isDateOnly(event.current_due_date_at_event)
  ) {
    throw new StudyStorageError(
      "invalid-event",
      "Current due-date snapshots must be ISO calendar dates.",
    );
  }

  if (
    event.estimated_duration_min_at_event !== null &&
    (
      !isFiniteNumber(event.estimated_duration_min_at_event) ||
      event.estimated_duration_min_at_event < 0
    )
  ) {
    throw new StudyStorageError(
      "invalid-event",
      "Estimated duration snapshots must be non-negative.",
    );
  }
}

function duplicateIds(
  values: readonly { id: string }[],
): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const value of values) {
    if (seen.has(value.id)) {
      duplicates.push(value.id);
    }

    seen.add(value.id);
  }

  return duplicates;
}

function assertUniqueIds(
  values: readonly { id: string }[],
  label: string,
): void {
  const duplicates = duplicateIds(values);

  if (duplicates.length > 0) {
    throw new StudyStorageError(
      "duplicate-id",
      `${label} contains duplicate IDs: ${duplicates.join(", ")}`,
    );
  }
}

function assertDailyPlanHistory(value: unknown): void {
  // Older schema-v1 records predate saved daily plans.
  if (value === undefined) return;

  if (!Array.isArray(value)) {
    throw new StudyStorageError(
      "invalid-shape",
      "Daily plan history must be an array when present.",
    );
  }

  const seenIds = new Set<string>();
  const nextVersionByDate = new Map<string, number>();

  for (const raw of value as unknown[]) {
    if (!isRecord(raw)) {
      throw new StudyStorageError(
        "invalid-shape",
        "A saved daily plan snapshot must be an object.",
      );
    }

    const id = raw.id;
    const date = raw.date;
    const version = raw.version;
    const savedAt = raw.saved_at;
    const plan = raw.plan;

    if (
      !isNonEmptyString(id) ||
      seenIds.has(id) ||
      !isDateOnly(date) ||
      !Number.isSafeInteger(version) ||
      (version as number) < 1 ||
      !hasTimezone(savedAt) ||
      !isRecord(plan) ||
      plan.date !== date ||
      !Array.isArray(plan.items) ||
      !Array.isArray(plan.warnings) ||
      !Array.isArray(plan.unresolved_decisions) ||
      typeof plan.can_finalize !== "boolean" ||
      !isFiniteNumber(plan.budget_minutes) ||
      !isFiniteNumber(plan.allocated_minutes) ||
      !isFiniteNumber(plan.remaining_budget_minutes) ||
      plan.budget_minutes < 0 ||
      plan.allocated_minutes < 0 ||
      plan.remaining_budget_minutes < 0 ||
      plan.allocated_minutes > plan.budget_minutes
    ) {
      throw new StudyStorageError(
        "invalid-shape",
        "A saved daily plan snapshot has invalid identity, date, version, timestamp, or plan data.",
      );
    }

    const expectedVersion = (nextVersionByDate.get(date) ?? 0) + 1;
    if (version !== expectedVersion) {
      throw new StudyStorageError(
        "invalid-shape",
        `Saved plan versions for ${date} must be sequential, starting at version 1.`,
      );
    }

    const itemIds = new Set<string>();
    for (const rawItem of plan.items as unknown[]) {
      if (
        !isRecord(rawItem) ||
        !isNonEmptyString(rawItem.id) ||
        itemIds.has(rawItem.id) ||
        !isNonEmptyString(rawItem.kind) ||
        !isNonEmptyString(rawItem.subject_id) ||
        !isFiniteNumber(rawItem.allocated_minutes) ||
        rawItem.allocated_minutes < 0 ||
        !isFiniteNumber(rawItem.remaining_minutes) ||
        rawItem.remaining_minutes < 0 ||
        !Array.isArray(rawItem.selected_question_ids) ||
        !Array.isArray(rawItem.allocated_question_ids) ||
        !Array.isArray(rawItem.remaining_question_ids)
      ) {
        throw new StudyStorageError(
          "invalid-shape",
          `Saved plan "${id}" contains an invalid work item.`,
        );
      }

      itemIds.add(rawItem.id);
    }

    seenIds.add(id);
    nextVersionByDate.set(date, version as number);
  }
}

export function assertStudyStateIntegrity(
  state: StudyMvpState,
): void {
  if (state.schema_version !== STUDY_MVP_SCHEMA_VERSION) {
    throw new StudyStorageError(
      "invalid-shape",
      `Unsupported Study schema version: ${String(state.schema_version)}`,
    );
  }

  assertDailyPlanHistory(state.daily_plan_history);
  const dailyPlanHistory = state.daily_plan_history ?? [];

  const collections: Array<[
    string,
    readonly { id: string }[],
  ]> = [
    ["courses", state.courses],
    ["units", state.units],
    ["topics", state.topics],
    ["lectures", state.lectures],
    ["retrieval_tasks", state.retrieval_tasks],
    ["review_events", state.review_events],
    ["task_events", state.task_events],
    ["work_sessions", state.work_sessions],
    ["assignments", state.assignments],
    ["exams", state.exams],
    ["settings_change_history", state.settings_change_history],
    ["daily_plan_history", dailyPlanHistory],
  ];

  for (const [name, values] of collections) {
    if (!Array.isArray(values)) {
      throw new StudyStorageError(
        "invalid-shape",
        `${name} must be an array.`,
      );
    }

    assertUniqueIds(values, name);
  }

  for (const event of state.task_events) {
    validateTaskEventShape(event);
  }

  const workSessionIds = new Set(
    state.work_sessions.map((session) => session.id),
  );

  for (const event of state.task_events) {
    if (
      event.event_type === "work_session" &&
      (
        !event.work_session_id ||
        !workSessionIds.has(event.work_session_id)
      )
    ) {
      throw new StudyStorageError(
        "invalid-event",
        "Every work_session event must reference a stored WorkSession.",
      );
    }
  }

  /*
   * Gate attempts from the same session must share exactly one
   * selected-task snapshot. This prevents the gate definition
   * from changing halfway through a session.
   */
  const gateSnapshots = new Map<string, string>();

  for (const event of state.task_events) {
    if (event.event_type !== "gate_attempt") {
      continue;
    }

    const sessionId = event.gate_session_id;

    if (!sessionId) {
      throw new StudyStorageError(
        "invalid-event",
        "Gate attempt is missing its session ID.",
      );
    }

    const snapshot = JSON.stringify(
      event.gate_selected_task_ids_snapshot,
    );

    const previous = gateSnapshots.get(sessionId);

    if (previous !== undefined && previous !== snapshot) {
      throw new StudyStorageError(
        "invalid-event",
        `Gate session "${sessionId}" contains conflicting selected-task snapshots.`,
      );
    }

    gateSnapshots.set(sessionId, snapshot);
  }

  for (const metric of state.weekly_metrics) {
    if (
      !Number.isSafeInteger(metric.week_number) ||
      metric.week_number < 1 ||
      !isDateOnly(metric.week_start) ||
      !isDateOnly(metric.week_end) ||
      !Array.isArray(metric.source_event_ids) ||
      !Array.isArray(metric.source_snapshot)
    ) {
      throw new StudyStorageError(
        "invalid-shape",
        "A weekly metrics snapshot has an invalid structure.",
      );
    }
  }

  const metricWeeks = state.weekly_metrics.map(
    (metric) => `${metric.week_number}:${metric.week_start}`,
  );

  if (new Set(metricWeeks).size !== metricWeeks.length) {
    throw new StudyStorageError(
      "duplicate-id",
      "Weekly metric snapshots must be unique per week and start date.",
    );
  }
}

function hasRequiredStateShape(
  value: unknown,
): value is StudyMvpState {
  if (!isRecord(value)) {
    return false;
  }

  if (value.schema_version !== STUDY_MVP_SCHEMA_VERSION) {
    return false;
  }

  const requiredArrays = [
    "courses",
    "units",
    "topics",
    "lectures",
    "retrieval_tasks",
    "review_events",
    "task_events",
    "work_sessions",
    "assignments",
    "exams",
    "weekly_metrics",
    "settings_change_history",
  ];

  if (
    !requiredArrays.every(
      (key) => Array.isArray(value[key]),
    )
  ) {
    return false;
  }

  if (
    value.daily_plan_history !== undefined &&
    !Array.isArray(value.daily_plan_history)
  ) {
    return false;
  }

  if (!isRecord(value.settings)) {
    return false;
  }

  return true;
}

function preserveInvalidValue(
  rawValue: string,
  reason: "invalid-json" | "invalid-shape",
): void {
  preserveStoredValue(
    STUDY_MVP_STORAGE_KEY,
    rawValue,
    reason,
  );
}

function parseState(
  rawValue: string,
): StudyMvpState {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    preserveInvalidValue(rawValue, "invalid-json");

    throw new StudyStorageError(
      "invalid-json",
      "Study MVP data is malformed. A recovery copy was preserved; the stored data has not been overwritten.",
    );
  }

  if (!hasRequiredStateShape(parsed)) {
    preserveInvalidValue(rawValue, "invalid-shape");

    throw new StudyStorageError(
      "invalid-shape",
      "Study MVP data has an invalid structure. A recovery copy was preserved; the stored data has not been overwritten.",
    );
  }

  try {
    assertStudyStateIntegrity(parsed);
  } catch (error) {
    preserveInvalidValue(rawValue, "invalid-shape");

    throw new StudyStorageError(
      "invalid-shape",
      `Study MVP integrity validation failed. The original data was preserved. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return parsed;
}

export function createDefaultSettings(
  timezone = resolveTimezone(),
): StudySettings {
  return {
    timezone,

    study_days: [1, 2, 3, 4, 5, 6],
    rest_day: 0,

    daily_budget_min: 180,
    review_reserve_min: 30,
    min_mixed_practice_min: 10,

    mixed_practice_target_mon_wed: 30,
    mixed_practice_target_thu_fri: 25,

    repair_recovery_cap_min: 30,
    recovery_block_min: 25,

    default_assignment_session_target_min: 30,

    intervals_days: [1, 3, 7, 14, 30],
    gate_threshold_pct: 60,
    defer_limit: 3,
    skip_rate_threshold_pct_p45: 15,

    trial_start_date: null,
    trial_end_date: null,

    last_final_exam_date: null,

    week4_evaluation_start: null,
    week4_evaluation_end: null,

    engine_version: "1.2.0",
    engine_change_history: [],
  };
}

export function createEmptyStudyState(
  options: CreateStudyStateOptions = {},
): StudyMvpState {
  const now =
    options.now ?? new Date().toISOString();

  if (!hasTimezone(now)) {
    throw new StudyStorageError(
      "invalid-shape",
      "The Study state creation timestamp must include a timezone.",
    );
  }

  return {
    schema_version: STUDY_MVP_SCHEMA_VERSION,

    courses: [],
    units: [],
    topics: [],
    lectures: [],
    retrieval_tasks: [],

    review_events: [],
    task_events: [],
    work_sessions: [],

    assignments: [],
    exams: [],

    settings: createDefaultSettings(
      options.timezone ?? resolveTimezone(),
    ),

    weekly_metrics: [],
    settings_change_history: [],
    daily_plan_history: [],
  };
}

/**
 * Create the default four-course, twelve-unit scaffold.
 * This is an explicit onboarding action, not a side effect of loading.
 */
export function createDefaultCourseScaffold(options: {
  now?: ISODateTime;
  idFactory?: (prefix: string) => EntityId;
} = {}): Pick<StudyMvpState, "courses" | "units"> {
  const now = options.now ?? new Date().toISOString();
  const idFactory = options.idFactory ?? defaultIdFactory;

  if (!hasTimezone(now)) {
    throw new StudyStorageError(
      "invalid-shape",
      "Scaffold creation requires an ISO 8601 timestamp.",
    );
  }

  const courses: Course[] = [];
  const units: Unit[] = [];

  const roman = ["I", "II", "III", "IV"];
  const colors = [
    "#557C8A",
    "#A46D51",
    "#71845C",
    "#8173A5",
  ];

  const letters = "abcdefghijkl";

  for (let courseIndex = 0; courseIndex < 4; courseIndex += 1) {
    const courseId = idFactory("course");

    courses.push({
      id: courseId,
      name: `Course ${roman[courseIndex]}`,
      code: `C${courseIndex + 1}`,
      color: colors[courseIndex],
      created_at: now,
    });

    for (let offset = 0; offset < 3; offset += 1) {
      const unitIndex = courseIndex * 3 + offset;

      units.push({
        id: idFactory("unit"),
        course_id: courseId,
        code: letters[unitIndex],
        name: `Unit ${letters[unitIndex]}`,
        order_index: offset + 1,
      });
    }
  }

  return { courses, units };
}

export function loadStudyMvpState(
  storage: StorageLike = browserStorage(),
): StudyMvpState {
  const raw = storage.getItem(STUDY_MVP_STORAGE_KEY);

  if (raw === null) {
    return createEmptyStudyState();
  }

  return parseState(raw);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const object = value as Record<string, unknown>;

  return `{${Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableJson(object[key])}`,
    )
    .join(",")}}`;
}

function assertAppendOnlyHistory<T>(
  previous: readonly T[],
  next: readonly T[],
  label: string,
): void {
  if (next.length < previous.length) {
    throw new StudyStorageError(
      "immutable-history",
      `${label} is append-only; existing records cannot be deleted.`,
    );
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (
      stableJson(previous[index]) !==
      stableJson(next[index])
    ) {
      throw new StudyStorageError(
        "immutable-history",
        `${label} is immutable; record at index ${index} cannot be changed.`,
      );
    }
  }
}

function assertStableEntityIds<T extends { id: string }>(
  previous: readonly T[],
  next: readonly T[],
  label: string,
): void {
  const nextById = new Map(
    next.map((entity) => [entity.id, entity]),
  );

  for (const entity of previous) {
    const replacement = nextById.get(entity.id);

    if (!replacement) {
      throw new StudyStorageError(
        "immutable-history",
        `${label} "${entity.id}" cannot be deleted; archive it instead.`,
      );
    }

    if (replacement.id !== entity.id) {
      throw new StudyStorageError(
        "immutable-history",
        `${label} IDs must remain stable.`,
      );
    }
  }
}

function assertReviewIdentity(
  previous: readonly ReviewEvent[],
  next: readonly ReviewEvent[],
): void {
  const nextById = new Map(
    next.map((review) => [review.id, review]),
  );

  for (const oldReview of previous) {
    const newReview = nextById.get(oldReview.id);

    if (!newReview) {
      throw new StudyStorageError(
        "immutable-history",
        `ReviewEvent "${oldReview.id}" cannot be deleted.`,
      );
    }

    const immutableFields: Array<keyof ReviewEvent> = [
      "id",
      "topic_id",
      "stage",
      "event_kind",
      "holds_stage",
      "selected_task_ids",
      "source_review_id",
      "intended_due_date",
      "priority_at_scheduling",
      "moved_from_sunday",
    ];

    for (const field of immutableFields) {
      if (
        stableJson(oldReview[field]) !==
        stableJson(newReview[field])
      ) {
        throw new StudyStorageError(
          "immutable-history",
          `ReviewEvent "${oldReview.id}" cannot change immutable field "${field}".`,
        );
      }
    }

    if (
      oldReview.completed_at !== null &&
      (
        oldReview.completed_at !== newReview.completed_at ||
        oldReview.overall_result !== newReview.overall_result ||
        oldReview.yellow_gap_severity !== newReview.yellow_gap_severity
      )
    ) {
      throw new StudyStorageError(
        "immutable-history",
        `Completed ReviewEvent "${oldReview.id}" cannot have its terminal result rewritten.`,
      );
    }
  }
}

function assertSafeStateReplacement(
  previous: StudyMvpState,
  next: StudyMvpState,
): void {
  assertAppendOnlyHistory(
    previous.task_events,
    next.task_events,
    "TaskEvent history",
  );

  assertAppendOnlyHistory(
    previous.work_sessions,
    next.work_sessions,
    "WorkSession history",
  );

  assertAppendOnlyHistory(
    previous.weekly_metrics,
    next.weekly_metrics,
    "Weekly metrics snapshots",
  );

  assertAppendOnlyHistory(
    previous.daily_plan_history ?? [],
    next.daily_plan_history ?? [],
    "Daily plan history",
  );

  assertAppendOnlyHistory(
    previous.settings_change_history,
    next.settings_change_history,
    "Settings change history",
  );

  assertAppendOnlyHistory(
    previous.settings.engine_change_history,
    next.settings.engine_change_history,
    "Engine change history",
  );

  assertStableEntityIds(previous.courses, next.courses, "Course");
  assertStableEntityIds(previous.units, next.units, "Unit");
  assertStableEntityIds(previous.topics, next.topics, "Topic");
  assertStableEntityIds(previous.lectures, next.lectures, "Lecture");
  assertStableEntityIds(
    previous.retrieval_tasks,
    next.retrieval_tasks,
    "RetrievalTask",
  );

  assertStableEntityIds(
    previous.review_events,
    next.review_events,
    "ReviewEvent",
  );

  assertStableEntityIds(
    previous.assignments,
    next.assignments,
    "Assignment",
  );

  assertStableEntityIds(previous.exams, next.exams, "Exam");

  assertReviewIdentity(
    previous.review_events,
    next.review_events,
  );
}

/**
 * Save an existing state without allowing event or metrics history
 * to be rewritten. Use updateStudyMvpState for ordinary mutations.
 */
export function saveStudyMvpState(
  next: StudyMvpState,
  storage: StorageLike = browserStorage(),
): void {
  assertStudyStateIntegrity(next);

  const raw = storage.getItem(STUDY_MVP_STORAGE_KEY);

  if (raw !== null) {
    const previous = parseState(raw);
    assertSafeStateReplacement(previous, next);
  }

  /*
   * One localStorage value is replaced atomically by the browser.
   * A thrown quota/security error propagates; it is never ignored.
   */
  storage.setItem(
    STUDY_MVP_STORAGE_KEY,
    JSON.stringify(next),
  );
}

/**
 * Explicitly replace the local Study state after preserving its exact
 * previous value under a separate recovery key.
 *
 * If preserving the recovery copy fails, the original state is untouched.
 */
export function replaceStudyMvpStateWithRecovery(
  next: StudyMvpState,
  storage: StorageLike = browserStorage(),
): void {
  assertStudyStateIntegrity(next);

  const raw = storage.getItem(STUDY_MVP_STORAGE_KEY);

  if (raw !== null) {
    const baseKey =
      `${STUDY_MVP_STORAGE_KEY}.recovery.${Date.now()}`;
    let recoveryKey = baseKey;
    let suffix = 1;

    while (storage.getItem(recoveryKey) !== null) {
      recoveryKey = `${baseKey}.${suffix}`;
      suffix += 1;
    }

    storage.setItem(
      recoveryKey,
      JSON.stringify({
        format: "personal-assistant-study-mvp-local-recovery",
        saved_at: new Date().toISOString(),
        original_storage_key: STUDY_MVP_STORAGE_KEY,
        raw_value: raw,
      }),
    );
  }

  storage.setItem(
    STUDY_MVP_STORAGE_KEY,
    JSON.stringify(next),
  );
}

export function updateStudyMvpState(
  updater: (current: StudyMvpState) => StudyMvpState,
  storage: StorageLike = browserStorage(),
): StudyMvpState {
  const current = loadStudyMvpState(storage);
  const next = updater(current);

  if (next === current) {
    return current;
  }

  saveStudyMvpState(next, storage);

  return next;
}

/**
 * Append immutable TaskEvents. Replaying an identical event ID with
 * identical payload is idempotent. Reusing an event ID for different
 * evidence is rejected.
 */
export function appendTaskEvents(
  incoming: readonly TaskEvent[],
  storage: StorageLike = browserStorage(),
): StudyMvpState {
  for (const event of incoming) {
    validateTaskEventShape(event);
  }

  return updateStudyMvpState((current) => {
    const byId = new Map(
      current.task_events.map((event) => [event.id, event]),
    );

    const additions: TaskEvent[] = [];

    for (const event of incoming) {
      const existing = byId.get(event.id);

      if (existing) {
        if (stableJson(existing) !== stableJson(event)) {
          throw new StudyStorageError(
            "immutable-history",
            `TaskEvent ID "${event.id}" already exists with different evidence.`,
          );
        }

        continue;
      }

      additions.push(event);
      byId.set(event.id, event);
    }

    if (additions.length === 0) {
      return current;
    }

    return {
      ...current,
      task_events: [
        ...current.task_events,
        ...additions,
      ],
    };
  }, storage);
}

/**
 * Persist a WorkSession and its event together.
 *
 * A caller must supply an explicit, truthful actual duration.
 * Partial work sessions never imply assignment completion,
 * gate completion, or corrective readiness.
 */
export function recordWorkSession(
  session: WorkSession,
  event: TaskEvent,
  storage: StorageLike = browserStorage(),
): StudyMvpState {
  if (
    !isNonEmptyString(session.id) ||
    !isNonEmptyString(session.subject_id) ||
    !isPositiveNumber(session.planned_duration_min) ||
    !isPositiveNumber(session.actual_duration_min) ||
    !hasTimezone(session.logged_at)
  ) {
    throw new StudyStorageError(
      "invalid-event",
      "WorkSession requires IDs, positive planned and actual durations, and a timestamp with timezone.",
    );
  }

  if (
    event.event_type !== "work_session" ||
    event.work_session_id !== session.id ||
    event.subject_id !== session.subject_id ||
    event.actual_duration_min !== session.actual_duration_min ||
    event.result !== null
  ) {
    throw new StudyStorageError(
      "invalid-event",
      "WorkSession and TaskEvent do not describe the same completed work session.",
    );
  }

  if (
    event.subject_type !== (
      session.subject_type === "assignment"
        ? "assignment"
        : session.subject_type === "corrective"
          ? "corrective_task"
          : "topic_consolidation"
    )
  ) {
    throw new StudyStorageError(
      "invalid-event",
      "WorkSession subject type does not match its TaskEvent.",
    );
  }

  validateTaskEventShape(event);

  return updateStudyMvpState((current) => {
    const existingSession = current.work_sessions.find(
      (item) => item.id === session.id,
    );

    const existingEvent = current.task_events.find(
      (item) => item.id === event.id,
    );

    if (existingSession) {
      if (stableJson(existingSession) !== stableJson(session)) {
        throw new StudyStorageError(
          "immutable-history",
          `WorkSession "${session.id}" already exists with different data.`,
        );
      }

      if (
        !existingEvent ||
        stableJson(existingEvent) !== stableJson(event)
      ) {
        throw new StudyStorageError(
          "immutable-history",
          "An existing WorkSession must retain its matching immutable TaskEvent.",
        );
      }

      return current;
    }

    if (existingEvent) {
      throw new StudyStorageError(
        "immutable-history",
        `TaskEvent "${event.id}" already exists without this WorkSession.`,
      );
    }

    const next: StudyMvpState = {
      ...current,
      work_sessions: [
        ...current.work_sessions,
        session,
      ],
      task_events: [
        ...current.task_events,
        event,
      ],
    };

    return next;
  }, storage);
}

/**
 * Snapshot one completed evaluation period. A previously stored
 * week cannot be replaced with recalculated metrics.
 */
export function appendWeeklyMetricsSnapshot(
  snapshot: WeekMetrics,
  storage: StorageLike = browserStorage(),
): StudyMvpState {
  return updateStudyMvpState((current) => {
    const alreadyExists = current.weekly_metrics.some(
      (metric) =>
        metric.week_number === snapshot.week_number &&
        metric.week_start === snapshot.week_start,
    );

    if (alreadyExists) {
      const existing = current.weekly_metrics.find(
        (metric) =>
          metric.week_number === snapshot.week_number &&
          metric.week_start === snapshot.week_start,
      )!;

      if (stableJson(existing) === stableJson(snapshot)) {
        return current;
      }

      throw new StudyStorageError(
        "immutable-history",
        `Metrics snapshot for Week ${snapshot.week_number} already exists and cannot be rewritten.`,
      );
    }

    return {
      ...current,
      weekly_metrics: [
        ...current.weekly_metrics,
        snapshot,
      ],
    };
  }, storage);
}

const LOCKED_TRIAL_ENGINE_SETTINGS = new Set<
  keyof StudySettings
>([
  "study_days",
  "rest_day",
  "daily_budget_min",
  "review_reserve_min",
  "min_mixed_practice_min",
  "mixed_practice_target_mon_wed",
  "mixed_practice_target_thu_fri",
  "repair_recovery_cap_min",
  "recovery_block_min",
  "default_assignment_session_target_min",
  "intervals_days",
  "gate_threshold_pct",
  "defer_limit",
  "skip_rate_threshold_pct_p45",
]);

export interface ApprovedEngineBugFix {
  bug: string;
  why_trial_could_not_continue: string;
  change: string;
  newVersion: string;
}

export function changeStudySettings(
  patch: Partial<StudySettings>,
  reason: string,
  options: {
    now?: ISODateTime;
    idFactory?: (prefix: string) => EntityId;
    approvedEngineBugFix?: ApprovedEngineBugFix;
  } = {},
  storage: StorageLike = browserStorage(),
): StudyMvpState {
  const cleanReason = reason.trim();

  if (!cleanReason) {
    throw new StudyStorageError(
      "invalid-shape",
      "Settings changes require an audit reason.",
    );
  }

  const now =
    options.now ?? new Date().toISOString();

  const idFactory =
    options.idFactory ?? defaultIdFactory;

  if (!hasTimezone(now)) {
    throw new StudyStorageError(
      "invalid-shape",
      "Settings changes require an ISO 8601 timestamp with timezone.",
    );
  }

  return updateStudyMvpState((current) => {
    const changedFields = (
      Object.keys(patch) as Array<keyof StudySettings>
    ).filter(
      (key) =>
        stableJson(current.settings[key]) !==
        stableJson(patch[key]),
    );

    if (changedFields.length === 0) {
      return current;
    }

    const localDate = localDateOfTimestamp(
      now,
      current.settings.timezone,
    );

    const trialActive =
      current.settings.trial_start_date !== null &&
      current.settings.trial_end_date !== null &&
      localDate >= current.settings.trial_start_date &&
      localDate <= current.settings.trial_end_date;

    const lockedChangedFields = changedFields.filter(
      (field) => LOCKED_TRIAL_ENGINE_SETTINGS.has(field),
    );

    const bugFix = options.approvedEngineBugFix;

    if (trialActive && lockedChangedFields.length > 0) {
      if (!bugFix) {
        throw new StudyStorageError(
          "immutable-history",
          `The engine is frozen during the trial. Locked settings cannot change: ${lockedChangedFields.join(", ")}.`,
        );
      }

      if (
        !bugFix.bug.trim() ||
        !bugFix.why_trial_could_not_continue.trim() ||
        !bugFix.change.trim() ||
        !bugFix.newVersion.trim()
      ) {
        throw new StudyStorageError(
          "invalid-shape",
          "An approved in-trial engine fix requires the bug, reason the trial cannot continue, change description, and new version.",
        );
      }
    }

    const previousValues: Partial<StudySettings> = {};
    const newValues: Partial<StudySettings> = {};

    for (const field of changedFields) {
      (previousValues as Record<string, unknown>)[field] =
        structuredClone(current.settings[field]);

      (newValues as Record<string, unknown>)[field] =
        structuredClone(patch[field]);
    }

    let nextSettings: StudySettings = {
      ...current.settings,
      ...patch,
    };

    let engineChangeHistory =
      current.settings.engine_change_history;

    if (trialActive && lockedChangedFields.length > 0 && bugFix) {
      const record: EngineChangeRecord = {
        id: idFactory("engine-change"),
        date: now,
        previous_version: current.settings.engine_version,
        new_version: bugFix.newVersion,
        bug: bugFix.bug.trim(),
        why_trial_could_not_continue:
          bugFix.why_trial_could_not_continue.trim(),
        change: bugFix.change.trim(),
      };

      engineChangeHistory = [
        ...engineChangeHistory,
        record,
      ];

      nextSettings = {
        ...nextSettings,
        engine_version: bugFix.newVersion,
        engine_change_history: engineChangeHistory,
      };
    }

    const record: SettingsChangeRecord = {
      id: idFactory("settings-change"),
      changed_at: now,
      reason: cleanReason,
      changed_fields: changedFields.map(String),
      previous_values: previousValues,
      new_values: newValues,
    };

    return {
      ...current,
      settings: nextSettings,
      settings_change_history: [
        ...current.settings_change_history,
        record,
      ],
    };
  }, storage);
}

/**
 * A manually configured final date takes precedence. Otherwise use
 * the latest recorded final examination, as specified in MVP v1.2.
 */
export function getLastFinalExamDate(
  state: StudyMvpState,
): ISODate | null {
  if (state.settings.last_final_exam_date) {
    return state.settings.last_final_exam_date;
  }

  const finals = state.exams.filter(
    (exam) => exam.type === "final",
  );

  if (finals.length === 0) {
    return null;
  }

  return finals.reduce(
    (latest, exam) =>
      exam.date > latest ? exam.date : latest,
    finals[0].date,
  );
}

/**
 * Return a JSON export without exposing mutable references to callers.
 */
export function exportStudyMvpJSON(
  state: StudyMvpState,
): string {
  assertStudyStateIntegrity(state);

  return JSON.stringify(
    structuredClone(state),
    null,
    2,
  );
}
