import type {
  EntityId,
  ISODate,
  PlanningDisposition,
  ForcedDisposition,
  ReviewEventStatus,
  SkipReentryCondition,
  TaskEvent,
  TaskEventSubjectType,
  TaskPriority,
  TopicImportance,
  RetrievalTaskType,
} from "./types";

import { addCalendarDays } from "./reviewEngine";

/**
 * Study System App — MVP v1.2
 *
 * Pure daily allocation engine.
 *
 * Important invariants:
 * 1. The sum of allocations never exceeds the daily budget.
 * 2. Reservations are capacity holds, not additional allocations.
 * 3. Each considered task receives one current disposition, unless
 *    an explicit decision is still required before finalization.
 * 4. Partial reviews retain the same review ID and selected questions.
 * 5. Existing corrective work is not silently marked complete.
 * 6. Scheduling decisions can be recorded idempotently.
 */

export type PlanTaskKind =
  | "initial_learning"
  | "topic_consolidation"
  | "gate"
  | "review"
  | "assignment"
  | "corrective"
  | "recovery"
  | "mixed_practice"
  | "sampler";

export type PlanCategory =
  | "PROTECTED"
  | "DO"
  | "DEFER"
  | "SKIP"
  | "RELEARN";

export type DecisionSource =
  | "automatic_capacity"
  | "explicit"
  | "forced"
  | "existing_state"
  | null;

export interface PlanningQuestion {
  id: EntityId;
  estimatedDurationMin: number;
  taskType?: RetrievalTaskType;
}

interface PlanningTaskBase {
  id: EntityId;
  subjectId?: EntityId;
  priority: TaskPriority;

  importance?: TopicImportance;
  weaknessFlag?: boolean;
  prerequisiteWithin48Hours?: boolean;
  overdueDays?: number;

  /**
   * Optional explicit override for eligibility.
   * Normally eligibility is derived from the task kind and date.
   */
  considered?: boolean;
}

export interface ConsolidationPlanTask
  extends PlanningTaskBase {
  kind: "topic_consolidation";
  topicId: EntityId;
  plannedDate: ISODate;
  inLearning: boolean;

  consolidationEstimatedDurationMin: number;

  /**
   * This value must be calculated only from WorkSession records
   * whose subject is this topic's consolidation.
   *
   * Gate attempts and corrective work must never be included.
   */
  loggedConsolidationMinutes: number;
}

export interface InitialLearningPlanTask
  extends PlanningTaskBase {
  kind: "initial_learning";
  topicId: EntityId;
  plannedDate: ISODate;
  estimatedDurationMin: number;
}

export interface GatePlanTask extends PlanningTaskBase {
  kind: "gate";
  topicId: EntityId;
  dueDate: ISODate;
  selectedQuestions: PlanningQuestion[];
  remainingQuestionIds?: EntityId[];
}

export interface ReviewPlanTask extends PlanningTaskBase {
  kind: "review";
  reviewEventId: EntityId;
  topicId: EntityId;

  stage: 1 | 2 | 3 | 4 | 5;
  eventKind: "scheduled_review" | "retry";
  status: ReviewEventStatus;

  intendedDueDate: ISODate;
  currentDueDate: ISODate;

  deferCount: number;

  /**
   * The question set was selected before the review started.
   * Do not replace this selection when resuming an incomplete review.
   */
  selectedQuestions: PlanningQuestion[];

  /**
   * For an incomplete review, this contains only the questions
   * that remain to be attempted. The selectedQuestions array remains
   * unchanged, preserving the original review selection.
   */
  remainingQuestionIds?: EntityId[];
}

export type AssignmentPlanStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface AssignmentPlanTask
  extends PlanningTaskBase {
  kind: "assignment";
  dueDate: ISODate;

  remainingMin: number;
  maxSessionMin: number | null;

  status: AssignmentPlanStatus;
}

export interface RepairPlanTask
  extends PlanningTaskBase {
  kind: "corrective" | "recovery";
  dueDate?: ISODate;
  estimatedDurationMin: number;

  /**
   * An override requires both a prerequisite needed within 48 hours
   * and a recorded reason.
   */
  capOverrideApproved?: boolean;
  capOverrideReason?: string;
}

export interface MixedPracticePlanTask
  extends PlanningTaskBase {
  kind: "mixed_practice";
  due: boolean;
  targetDurationMin?: number;
}

export interface SamplerPlanTask
  extends PlanningTaskBase {
  kind: "sampler";
  due: boolean;
  targetDurationMin?: number;
  analysisMaxMin?: number;
}

export type PlanningTask =
  | ConsolidationPlanTask
  | GatePlanTask
  | ReviewPlanTask
  | AssignmentPlanTask
  | RepairPlanTask
  | MixedPracticePlanTask
  | SamplerPlanTask;

export interface PlannerSettings {
  daily_budget_min: number;
  review_reserve_min: number;
  min_mixed_practice_min: number;

  mixed_practice_target_mon_wed: number;
  mixed_practice_target_thu_fri: number;

  repair_recovery_cap_min: number;
  recovery_block_min: number;

  default_assignment_session_target_min: number;
  defer_limit: number;

  saturday_sampler_duration_min: number;
  saturday_sampler_analysis_max_min: number;
}

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  daily_budget_min: 180,
  review_reserve_min: 30,
  min_mixed_practice_min: 10,

  mixed_practice_target_mon_wed: 30,
  mixed_practice_target_thu_fri: 25,

  repair_recovery_cap_min: 30,
  recovery_block_min: 25,

  default_assignment_session_target_min: 30,
  defer_limit: 3,

  saturday_sampler_duration_min: 80,
  saturday_sampler_analysis_max_min: 10,
};

export interface ExplicitPlanningDecision {
  disposition: "DEFER" | "SKIP" | "RELEARN";
  reason: string;
  re_entry_condition?: SkipReentryCondition;
}

export interface ForcedPlanningDecision {
  disposition: ForcedDisposition;
  reason: string;
  re_entry_condition?: SkipReentryCondition;
}

export interface DailyPlannerInput {
  date: ISODate;
  settings: PlannerSettings;
  tasks: readonly PlanningTask[];

  explicitDecisions?: Readonly<
    Record<string, ExplicitPlanningDecision | undefined>
  >;

  forcedDecisions?: Readonly<
    Record<string, ForcedPlanningDecision | undefined>
  >;
}

export interface PlannedItem {
  id: EntityId;
  subject_id: EntityId;
  kind: PlanTaskKind;

  subject_type: TaskEventSubjectType;
  review_event_id: EntityId | null;

  priority: TaskPriority;
  priority_at_scheduling: TaskPriority | null;

  intended_due_date: ISODate | null;
  current_due_date: ISODate | null;

  defer_count: number;

  estimated_minutes: number;
  allocated_minutes: number;
  remaining_minutes: number;

  selected_question_ids: EntityId[];
  allocated_question_ids: EntityId[];
  remaining_question_ids: EntityId[];

  analysis_minutes: number;

  disposition: PlanningDisposition | null;
  category: PlanCategory | null;

  reason: string | null;
  re_entry_condition: SkipReentryCondition | null;

  forced_disposition: ForcedDisposition | null;
  decision_source: DecisionSource;

  decision_required: boolean;
  cap_override_used: boolean;
}

export interface DailyPlan {
  date: ISODate;
  budget_minutes: number;
  allocated_minutes: number;
  remaining_budget_minutes: number;

  items: PlannedItem[];

  initial_review_reserve_minutes: number;
  initial_mixed_reserve_minutes: number;

  review_reserve_used_minutes: number;
  mixed_reserve_used_minutes: number;

  can_finalize: boolean;
  unresolved_decisions: EntityId[];

  has_silent_drops: boolean;
  has_conflicting_dispositions: boolean;

  priority_1_3_skip_count: number;
  plan_review_flag: boolean;

  mixed_minimum_reduced: boolean;
  repair_cap_override_used: boolean;

  warnings: string[];
}

interface MutablePlanItem extends PlannedItem {
  task: PlanningTask;
  fixedDecision: boolean;
  explicitComplete: boolean;
  explicitSplit: boolean;
  forceReason: string | null;
}

const IMPORTANCE_ORDER: Record<TopicImportance, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function assertNonNegativeInteger(
  value: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `${label} must be a non-negative whole number.`,
    );
  }
}

function parseDate(date: ISODate): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid ISO date: ${date}`);
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`Invalid calendar date: ${date}`);
  }

  return parsed;
}

function weekday(date: ISODate): number {
  return parseDate(date).getUTCDay();
}

function validateSettings(settings: PlannerSettings): void {
  for (const [key, value] of Object.entries(settings)) {
    assertNonNegativeInteger(value, key);
  }

  if (settings.defer_limit < 1) {
    throw new Error("The deferral limit must be at least one.");
  }

  if (settings.default_assignment_session_target_min < 1) {
    throw new Error(
      "The default assignment session target must be positive.",
    );
  }
}

function mixedTargetForDate(
  date: ISODate,
  settings: PlannerSettings,
): number {
  const day = weekday(date);

  if (day >= 1 && day <= 3) {
    return settings.mixed_practice_target_mon_wed;
  }

  if (day === 4 || day === 5) {
    return settings.mixed_practice_target_thu_fri;
  }

  return 0;
}

function questionSelection(
  questions: readonly PlanningQuestion[],
  remainingIds: readonly EntityId[] | undefined,
  minimumSelected: number,
  maximumSelected: number,
  label: string,
): PlanningQuestion[] {
  const allIds = questions.map((question) => question.id);

  if (new Set(allIds).size !== allIds.length) {
    throw new Error(`${label} contains duplicate question IDs.`);
  }

  if (
    questions.length < minimumSelected ||
    questions.length > maximumSelected
  ) {
    throw new Error(
      `${label} must contain between ${minimumSelected} and ${maximumSelected} selected questions.`,
    );
  }

  for (const question of questions) {
    assertNonNegativeInteger(
      question.estimatedDurationMin,
      `${label} question duration`,
    );

    if (question.estimatedDurationMin < 1) {
      throw new Error(
        `${label} question durations must be positive.`,
      );
    }
  }

  const remaining = remainingIds ?? allIds;

  if (new Set(remaining).size !== remaining.length) {
    throw new Error(`${label} remaining question IDs contain duplicates.`);
  }

  if (remaining.some((id) => !allIds.includes(id))) {
    throw new Error(
      `${label} remaining questions must be part of its original selection.`,
    );
  }

  return remaining.map((id) =>
    questions.find((question) => question.id === id)!,
  );
}

function estimateTaskMinutes(
  task: PlanningTask,
  date: ISODate,
  settings: PlannerSettings,
): number {
  let estimate: number;

  switch (task.kind) {
    case "initial_learning": {
      assertNonNegativeInteger(
        task.estimatedDurationMin,
        "Initial learning estimate",
      );
      estimate = task.estimatedDurationMin;
      break;
    }

    case "topic_consolidation": {
      assertNonNegativeInteger(
        task.consolidationEstimatedDurationMin,
        "Consolidation estimate",
      );
      assertNonNegativeInteger(
        task.loggedConsolidationMinutes,
        "Logged consolidation minutes",
      );

      estimate = Math.max(
        0,
        task.consolidationEstimatedDurationMin -
          task.loggedConsolidationMinutes,
      );
      break;
    }

    case "gate": {
      estimate = questionSelection(
        task.selectedQuestions,
        task.remainingQuestionIds,
        3,
        Number.MAX_SAFE_INTEGER,
        "Initial-learning gate",
      ).reduce(
        (total, question) =>
          total + question.estimatedDurationMin,
        0,
      );
      break;
    }

    case "review": {
      estimate = questionSelection(
        task.selectedQuestions,
        task.remainingQuestionIds,
        1,
        3,
        "Review",
      ).reduce(
        (total, question) =>
          total + question.estimatedDurationMin,
        0,
      );
      break;
    }

    case "assignment":
      assertNonNegativeInteger(
        task.remainingMin,
        "Assignment remaining minutes",
      );

      if (task.maxSessionMin !== null) {
        assertNonNegativeInteger(
          task.maxSessionMin,
          "Assignment maximum session",
        );
      }

      estimate = task.remainingMin;
      break;

    case "corrective":
    case "recovery":
      assertNonNegativeInteger(
        task.estimatedDurationMin,
        "Repair/recovery estimate",
      );
      estimate = task.estimatedDurationMin;
      break;

    case "mixed_practice":
      estimate =
        task.targetDurationMin ??
        mixedTargetForDate(date, settings);

      assertNonNegativeInteger(
        estimate,
        "Mixed-practice target",
      );
      break;

    case "sampler": {
      const main =
        task.targetDurationMin ??
        settings.saturday_sampler_duration_min;

      const analysis =
        task.analysisMaxMin ??
        settings.saturday_sampler_analysis_max_min;

      assertNonNegativeInteger(main, "Sampler duration");
      assertNonNegativeInteger(analysis, "Sampler analysis duration");

      estimate = main + analysis;
      break;
    }
  }

  return estimate;
}

function isTaskConsidered(
  task: PlanningTask,
  date: ISODate,
  settings: PlannerSettings,
): boolean {
  if (task.considered === false) {
    return false;
  }

  if (task.considered === true) {
    return true;
  }

  switch (task.kind) {
    case "initial_learning":
    return (
      task.plannedDate <= date &&
      estimateTaskMinutes(task, date, settings) > 0
    );

    case "topic_consolidation":
      return (
        task.inLearning &&
        task.plannedDate <= date &&
        estimateTaskMinutes(task, date, settings) > 0
      );

    case "gate":
      return task.dueDate <= date;

    case "review":
      return (
        task.status !== "completed" &&
        task.status !== "skipped" &&
        task.status !== "retired" &&
        task.currentDueDate <= date
      );

    case "assignment": {
      const active =
        task.status !== "completed" &&
        task.status !== "cancelled";

      return (
        active &&
        task.remainingMin > 0 &&
        task.dueDate <= addCalendarDays(date, 7)
      );
    }

    case "corrective":
    case "recovery":
      return estimateTaskMinutes(task, date, settings) > 0;

    case "mixed_practice":
      return (
        task.due &&
        estimateTaskMinutes(task, date, settings) > 0
      );

    case "sampler":
      return (
        task.due &&
        weekday(date) === 6 &&
        estimateTaskMinutes(task, date, settings) > 0
      );
  }
}

function subjectTypeForTask(
  task: PlanningTask,
): TaskEventSubjectType {
  switch (task.kind) {
    case "initial_learning":
      return "initial_learning";
    case "topic_consolidation":
      return "topic_consolidation";
    case "gate":
      return "gate_attempt";
    case "review":
      return "review_event";
    case "assignment":
      return "assignment";
    case "corrective":
      return "corrective_task";
    case "recovery":
      return "corrective_task";
    case "mixed_practice":
      return "mixed_practice";
    case "sampler":
      return "sampler";
  }
}

function taskDueDate(task: PlanningTask): ISODate | null {
  switch (task.kind) {
    case "initial_learning":
      return task.plannedDate;
    case "topic_consolidation":
      return task.plannedDate;
    case "gate":
    case "assignment":
      return task.dueDate;
    case "review":
      return task.currentDueDate;
    case "corrective":
    case "recovery":
      return task.dueDate ?? null;
    case "mixed_practice":
    case "sampler":
      return null;
  }
}

function compareTasks(
  a: PlanningTask,
  b: PlanningTask,
  date: ISODate,
  settings: PlannerSettings,
): number {
  if (a.priority !== b.priority) {
    return a.priority - b.priority;
  }

  const aDate = taskDueDate(a) ?? "9999-12-31";
  const bDate = taskDueDate(b) ?? "9999-12-31";

  if (aDate !== bDate) {
    return aDate.localeCompare(bDate);
  }

  const aPrerequisite = a.prerequisiteWithin48Hours ? 1 : 0;
  const bPrerequisite = b.prerequisiteWithin48Hours ? 1 : 0;

  if (aPrerequisite !== bPrerequisite) {
    return bPrerequisite - aPrerequisite;
  }

  const aWeak = a.weaknessFlag ? 1 : 0;
  const bWeak = b.weaknessFlag ? 1 : 0;

  if (aWeak !== bWeak) {
    return bWeak - aWeak;
  }

  const aImportance = IMPORTANCE_ORDER[a.importance ?? "medium"];
  const bImportance = IMPORTANCE_ORDER[b.importance ?? "medium"];

  if (aImportance !== bImportance) {
    return bImportance - aImportance;
  }

  const aOverdue = a.overdueDays ?? 0;
  const bOverdue = b.overdueDays ?? 0;

  if (aOverdue !== bOverdue) {
    return bOverdue - aOverdue;
  }

  // Fit is the final tie-breaker, never the primary priority rule.
  const aEstimate = estimateTaskMinutes(a, date, settings);
  const bEstimate = estimateTaskMinutes(b, date, settings);

  if (aEstimate !== bEstimate) {
    return aEstimate - bEstimate;
  }

  return a.id.localeCompare(b.id);
}

function categoryForDisposition(
  task: PlanningTask,
  disposition: PlanningDisposition,
): PlanCategory {
  if (
    disposition === "DO" &&
    (
      task.kind === "topic_consolidation" ||
      task.kind === "gate"
    )
  ) {
    return "PROTECTED";
  }

  if (disposition === "DO") return "DO";
  if (disposition === "DEFER") return "DEFER";
  if (disposition === "SKIP") return "SKIP";
  return "RELEARN";
}

function createMutableItem(
  task: PlanningTask,
  date: ISODate,
  settings: PlannerSettings,
): MutablePlanItem {
  const estimate = estimateTaskMinutes(task, date, settings);

  if (estimate <= 0) {
    throw new Error(
      `Considered task "${task.id}" has no remaining estimated work.`,
    );
  }

  let selectedQuestionIds: EntityId[] = [];
  let remainingQuestionIds: EntityId[] = [];

  if (task.kind === "review" || task.kind === "gate") {
    const questions = questionSelection(
      task.selectedQuestions,
      task.remainingQuestionIds,
      task.kind === "gate" ? 3 : 1,
      task.kind === "gate" ? Number.MAX_SAFE_INTEGER : 3,
      task.kind === "gate" ? "Initial-learning gate" : "Review",
    );

    selectedQuestionIds = task.selectedQuestions.map(
      (question) => question.id,
    );
    remainingQuestionIds = questions.map(
      (question) => question.id,
    );
  }

  return {
    id: task.id,
    subject_id: task.subjectId ?? (
      task.kind === "review"
        ? task.reviewEventId
        : task.kind === "topic_consolidation" ||
            task.kind === "gate" ||
            task.kind === "initial_learning"
          ? task.topicId
          : task.id
    ),

    kind: task.kind,
    subject_type: subjectTypeForTask(task),

    review_event_id:
      task.kind === "review"
        ? task.reviewEventId
        : null,

    priority: task.priority,
    priority_at_scheduling:
      task.kind === "review"
        ? task.priority
        : null,

    intended_due_date:
      task.kind === "review"
        ? task.intendedDueDate
        : null,

    current_due_date: taskDueDate(task),

    defer_count:
      task.kind === "review"
        ? task.deferCount
        : 0,

    estimated_minutes: estimate,
    allocated_minutes: 0,
    remaining_minutes: estimate,

    selected_question_ids: selectedQuestionIds,
    allocated_question_ids: [],
    remaining_question_ids: remainingQuestionIds,

    analysis_minutes: 0,

    disposition: null,
    category: null,

    reason: null,
    re_entry_condition: null,

    forced_disposition: null,
    decision_source: null,

    decision_required: false,
    cap_override_used: false,

    task,
    fixedDecision: false,
    explicitComplete: false,
    explicitSplit: false,
    forceReason: "",
  };
}

function setDisposition(
  item: MutablePlanItem,
  disposition: PlanningDisposition,
  reason: string,
  source: DecisionSource,
  reentry?: SkipReentryCondition,
): void {
  item.disposition = disposition;
  item.category = categoryForDisposition(item.task, disposition);
  item.reason = reason;
  item.decision_source = source;
  item.re_entry_condition = reentry ?? null;
  item.fixedDecision = true;
  item.decision_required = false;
}

function applyExplicitDecision(
  item: MutablePlanItem,
  decision: ExplicitPlanningDecision,
): void {
  const reason = decision.reason.trim();

  if (!reason) {
    throw new Error(
      `Explicit ${decision.disposition} for "${item.id}" requires a reason.`,
    );
  }

  if (
    decision.disposition === "SKIP" &&
    !decision.re_entry_condition
  ) {
    throw new Error(
      `SKIP for "${item.id}" requires a re-entry condition.`,
    );
  }

  setDisposition(
    item,
    decision.disposition,
    reason,
    "explicit",
    decision.re_entry_condition,
  );
}

function applyForcedDecision(
  item: MutablePlanItem,
  decision: ForcedPlanningDecision,
): void {
  const reason = decision.reason.trim();

  if (!reason) {
    throw new Error(
      `Forced disposition for "${item.id}" requires a reason.`,
    );
  }

  if (item.kind !== "review") {
    throw new Error(
      `Forced deferral decisions apply only to review events: "${item.id}".`,
    );
  }

  if (
    decision.disposition === "skip" &&
    !decision.re_entry_condition
  ) {
    throw new Error(
      `Forced SKIP for "${item.id}" requires a re-entry condition.`,
    );
  }

  item.forced_disposition = decision.disposition;
  item.forceReason = reason;
  item.decision_source = "forced";
  item.re_entry_condition =
    decision.re_entry_condition ?? null;

  switch (decision.disposition) {
    case "skip":
      setDisposition(
        item,
        "SKIP",
        reason,
        "forced",
        decision.re_entry_condition,
      );
      break;

    case "relearn":
      setDisposition(item, "RELEARN", reason, "forced");
      break;

    case "override_defer":
      setDisposition(item, "DEFER", reason, "forced");
      break;

    case "complete":
      item.explicitComplete = true;
      break;

    case "split":
      item.explicitSplit = true;
      break;
  }
}

function remainingQuestionsFor(
  item: MutablePlanItem,
): PlanningQuestion[] {
  const task = item.task;

  if (task.kind !== "review" && task.kind !== "gate") {
    return [];
  }

  const ids = new Set(item.remaining_question_ids);

  return task.selectedQuestions.filter(
    (question) => ids.has(question.id),
  );
}

function unreservedFreeMinutes(
  allocated: number,
  budget: number,
  reviewReserve: number,
  mixedReserve: number,
): number {
  return Math.max(
    0,
    budget - allocated - reviewReserve - mixedReserve,
  );
}

function consumeSimpleAllocation(
  item: MutablePlanItem,
  requested: number,
  allocatedTotal: { value: number },
  budget: number,
  reviewReserve: number,
  mixedReserve: number,
): number {
  const available = unreservedFreeMinutes(
    allocatedTotal.value,
    budget,
    reviewReserve,
    mixedReserve,
  );

  const amount = Math.min(
    Math.max(0, requested),
    item.remaining_minutes,
    available,
  );

  item.allocated_minutes += amount;
  item.remaining_minutes -= amount;
  allocatedTotal.value += amount;

  return amount;
}

function allocateQuestionSubset(
  item: MutablePlanItem,
  availableMinutes: number,
): {
  questionIds: EntityId[];
  minutes: number;
} {
  const remaining = remainingQuestionsFor(item);

  const sorted = [...remaining].sort((a, b) => {
    if (a.estimatedDurationMin !== b.estimatedDurationMin) {
      return a.estimatedDurationMin - b.estimatedDurationMin;
    }

    return a.id.localeCompare(b.id);
  });

  let available = Math.max(0, availableMinutes);
  let minutes = 0;
  const questionIds: EntityId[] = [];

  for (const question of sorted) {
    if (question.estimatedDurationMin <= available) {
      questionIds.push(question.id);
      minutes += question.estimatedDurationMin;
      available -= question.estimatedDurationMin;
    }
  }

  return { questionIds, minutes };
}

function allocateReview(
  item: MutablePlanItem,
  allocatedTotal: { value: number },
  budget: number,
  reviewReserve: { value: number },
  mixedReserve: { value: number },
  useReviewReserve: boolean,
): number {
  if (
    item.fixedDecision ||
    item.decision_required
  ) {
    return 0;
  }

  const free = unreservedFreeMinutes(
    allocatedTotal.value,
    budget,
    reviewReserve.value,
    mixedReserve.value,
  );

  const available =
    free + (
      useReviewReserve
        ? reviewReserve.value
        : 0
    );

  const remainingQuestions = remainingQuestionsFor(item);

  if (item.explicitComplete) {
    const fullCost = remainingQuestions.reduce(
      (total, question) =>
        total + question.estimatedDurationMin,
      0,
    );

    if (fullCost > available) {
      item.reason =
        "The forced complete decision cannot fit in today's available capacity.";
      return 0;
    }
  }

  const allocation = allocateQuestionSubset(
    item,
    available,
  );

  if (allocation.minutes <= 0) {
    return 0;
  }

  const reservedUsed = useReviewReserve
    ? Math.min(allocation.minutes, reviewReserve.value)
    : 0;

  reviewReserve.value -= reservedUsed;

  item.allocated_minutes += allocation.minutes;
  item.remaining_minutes -= allocation.minutes;

  allocatedTotal.value += allocation.minutes;

  item.allocated_question_ids.push(
    ...allocation.questionIds,
  );

  const allocatedIds = new Set(
    item.allocated_question_ids,
  );

  item.remaining_question_ids =
    item.remaining_question_ids.filter(
      (id) => !allocatedIds.has(id),
    );

  return allocation.minutes;
}

function initializeUserChoices(
  item: MutablePlanItem,
  input: DailyPlannerInput,
): void {
  const task = item.task;

  const forced =
    input.forcedDecisions?.[item.id];

  if (forced) {
    applyForcedDecision(item, forced);
    return;
  }

  if (
    task.kind === "review" &&
    task.deferCount >= input.settings.defer_limit
  ) {
    item.decision_required = true;
    item.reason =
      "Three deferrals have been reached. Record a forced disposition before finalizing the plan.";
    return;
  }

  const explicit =
    input.explicitDecisions?.[item.id];

  if (explicit) {
    applyExplicitDecision(item, explicit);
  }
}

function closeUnallocatedItems(
  items: MutablePlanItem[],
  settings: PlannerSettings,
): void {
  for (const item of items) {
    if (item.disposition !== null) {
      continue;
    }

    if (item.decision_required) {
      continue;
    }

    if (item.explicitComplete) {
      const complete =
        item.remaining_question_ids.length === 0 &&
        item.allocated_question_ids.length > 0;

      if (!complete) {
        item.decision_required = true;
        item.reason =
          "The selected complete decision cannot be fulfilled within the daily budget. Resolve the capacity conflict before finalizing.";
        continue;
      }

      setDisposition(
        item,
        "DO",
        item.forceReason ?? item.reason ?? "Explicit forced disposition.",
        "forced",
      );

      continue;
    }

    if (item.explicitSplit) {
      if (item.allocated_minutes <= 0) {
        item.decision_required = true;
        item.reason =
          "The selected split decision cannot make progress within today's available capacity.";
        continue;
      }

      setDisposition(
        item,
        "DO",
        item.forceReason ?? item.reason ?? "Explicit forced disposition.",
        "forced",
      );

      continue;
    }

    if (
      item.kind === "corrective" ||
      item.kind === "recovery"
    ) {
      setDisposition(
        item,
        "RELEARN",
        item.allocated_minutes > 0
          ? "Corrective/recovery work allocated within the shared repair budget."
          : "This item remains in the corrective/recovery queue; no minutes were added beyond the available repair budget.",
        "existing_state",
      );

      continue;
    }

    if (item.allocated_minutes > 0) {
      const partialReview =
        item.kind === "review" &&
        item.remaining_question_ids.length > 0;

      const partialConsolidation =
        item.kind === "topic_consolidation" &&
        item.remaining_minutes > 0;

      const reason =
        partialReview
          ? "Partial review: preserve the same ReviewEvent and carry the remaining selected questions into the next study day."
          : partialConsolidation
            ? "Partial consolidation: keep the topic in_learning until the learning gate passes."
            : item.kind === "sampler" &&
                item.allocated_minutes < item.estimated_minutes
              ? "Partial Saturday sampler; remaining work requires an explicit future plan."
              : item.remaining_minutes > 0
                ? "Partial work allocated; remaining estimated work stays visible."
                : item.forceReason || "Allocated within today's budget.";

      setDisposition(item, "DO", reason, item.decision_source);

      continue;
    }

    if (
      item.kind === "review" &&
      item.defer_count + 1 >= settings.defer_limit
    ) {
      item.decision_required = true;
      item.reason =
        "A further capacity deferral would reach the deferral limit. Record a forced disposition before finalizing.";
      continue;
    }

    setDisposition(
      item,
      "DEFER",
      item.reason ?? "Insufficient remaining capacity today.",
      item.decision_source ?? "automatic_capacity",
    );
  }
}

function makeRestDayPlan(
  date: ISODate,
  budget: number,
): DailyPlan {
  return {
    date,
    budget_minutes: budget,
    allocated_minutes: 0,
    remaining_budget_minutes: budget,

    items: [],

    initial_review_reserve_minutes: 0,
    initial_mixed_reserve_minutes: 0,

    review_reserve_used_minutes: 0,
    mixed_reserve_used_minutes: 0,

    can_finalize: true,
    unresolved_decisions: [],

    has_silent_drops: false,
    has_conflicting_dispositions: false,

    priority_1_3_skip_count: 0,
    plan_review_flag: false,

    mixed_minimum_reduced: false,
    repair_cap_override_used: false,

    warnings: [
      "Sunday is the rest day. No study minutes are allocated.",
      `The next study day is ${addCalendarDays(date, 1)}.`,
    ],
  };
}

export function generateDailyPlan(
  input: DailyPlannerInput,
): DailyPlan {
  parseDate(input.date);
  validateSettings(input.settings);

  const {
    date,
    settings,
  } = input;

  if (weekday(date) === 0) {
    return makeRestDayPlan(
      date,
      settings.daily_budget_min,
    );
  }

  const allIds = input.tasks.map((task) => task.id);

  if (new Set(allIds).size !== allIds.length) {
    throw new Error(
      "Planning task IDs must be unique within a daily plan.",
    );
  }

  const considered = input.tasks.filter(
    (task) => isTaskConsidered(task, date, settings),
  );

  const items: MutablePlanItem[] = considered.map(
    (task) => createMutableItem(task, date, settings),
  );

  for (const item of items) {
    const task = item.task;

    if (
      (task.kind === "corrective" ||
        task.kind === "recovery") &&
      task.capOverrideApproved
    ) {
      if (!task.prerequisiteWithin48Hours) {
        throw new Error(
          `Repair-cap override "${task.id}" requires a prerequisite needed within 48 hours.`,
        );
      }

      if (!task.capOverrideReason?.trim()) {
        throw new Error(
          `Repair-cap override "${task.id}" requires an auditable reason.`,
        );
      }
    }

    initializeUserChoices(item, input);
  }

  const warnings: string[] = [];
  let mixedMinimumReduced = false;
  let repairCapOverrideUsed = false;

  const allocatedTotal = { value: 0 };

  const reviewReserve = { value: 0 };
  const mixedReserve = { value: 0 };

  const activeItems = items.filter(
    (item) =>
      !item.fixedDecision &&
      !item.decision_required,
  );

  const sorted = (list: MutablePlanItem[]) =>
    [...list].sort((a, b) =>
      compareTasks(a.task, b.task, date, settings),
    );

  /*
   * 1. Protected learning.
   *
   * Only remaining consolidation time counts. Logged consolidation
   * work has already been subtracted from the estimate.
   */
  const consolidations = sorted(
    activeItems.filter(
      (item) => item.kind === "topic_consolidation",
    ),
  );

  for (const item of consolidations) {
    consumeSimpleAllocation(
      item,
      item.estimated_minutes,
      allocatedTotal,
      settings.daily_budget_min,
      reviewReserve.value,
      mixedReserve.value,
    );
  }

  /*
   * A gate is a real retrieval activity and consumes the same budget.
   * It cannot be considered passed by the allocation engine.
   */
  const gates = sorted(
    activeItems.filter(
      (item) => item.kind === "gate",
    ),
  );

  for (const item of gates) {
    const free = unreservedFreeMinutes(
      allocatedTotal.value,
      settings.daily_budget_min,
      reviewReserve.value,
      mixedReserve.value,
    );

    const selection = allocateQuestionSubset(item, free);

    if (selection.minutes > 0) {
      item.allocated_minutes += selection.minutes;
      item.remaining_minutes -= selection.minutes;

      allocatedTotal.value += selection.minutes;

      item.allocated_question_ids.push(
        ...selection.questionIds,
      );

      const allocatedIds = new Set(
        item.allocated_question_ids,
      );

      item.remaining_question_ids =
        item.remaining_question_ids.filter(
          (id) => !allocatedIds.has(id),
        );
    }
  }

  /*
   * 2. Reserve the priority 1–3 review pool.
   * The reservation is not yet counted as used study time.
   */
  const highPriorityReviews = sorted(
    activeItems.filter(
      (item) =>
        item.kind === "review" &&
        item.priority <= 3,
    ),
  );

  const reserveEligible = highPriorityReviews.filter(
    (item) =>
      item.task.kind === "review" &&
      !item.explicitComplete &&
      !item.explicitSplit,
  );

  const p13Need = reserveEligible.reduce(
    (total, item) =>
      total + item.remaining_minutes,
    0,
  );

  reviewReserve.value = Math.min(
    p13Need,
    settings.review_reserve_min,
    unreservedFreeMinutes(
      allocatedTotal.value,
      settings.daily_budget_min,
      reviewReserve.value,
      mixedReserve.value,
    ),
  );

  const initialReviewReserve = reviewReserve.value;

  /*
   * 3. Reserve the mixed-practice minimum only if the capacity exists.
   */
  const mixedTasks = sorted(
    activeItems.filter(
      (item) => item.kind === "mixed_practice",
    ),
  );

  const mixedTask = mixedTasks[0];

  if (mixedTask) {
    const target = mixedTask.estimated_minutes;

    const freeAfterReviewReserve =
      unreservedFreeMinutes(
        allocatedTotal.value,
        settings.daily_budget_min,
        reviewReserve.value,
        mixedReserve.value,
      );

    if (
      target > 0 &&
      freeAfterReviewReserve >=
        settings.min_mixed_practice_min
    ) {
      mixedReserve.value = Math.min(
        target,
        settings.min_mixed_practice_min,
        freeAfterReviewReserve,
      );
    }
  }

  const initialMixedReserve = mixedReserve.value;
    /*
   * Allocate initial learning after protecting review
   * and mixed-practice reserves, before assignments.
   */
  const initialLearningTasks = sorted(
    activeItems.filter(
      (item) => item.kind === "initial_learning",
    ),
  );

  for (const item of initialLearningTasks) {
    consumeSimpleAllocation(
      item,
      item.estimated_minutes,
      allocatedTotal,
      settings.daily_budget_min,
      reviewReserve.value,
      mixedReserve.value,
    );
  }

  /*
   * 4. Allocate initial assignment sessions.
   * The review and mixed reservations cannot be double-counted.
   */
  const assignments = sorted(
    activeItems.filter(
      (item) => item.kind === "assignment",
    ),
  );

  const assignmentAllocations = new Map<EntityId, number>();

  for (const item of assignments) {
    const task = item.task;

    if (task.kind !== "assignment") continue;

    const maxSession =
      task.maxSessionMin ?? task.remainingMin;

    const target = Math.min(
      task.remainingMin,
      maxSession,
      settings.default_assignment_session_target_min,
      unreservedFreeMinutes(
        allocatedTotal.value,
        settings.daily_budget_min,
        reviewReserve.value,
        mixedReserve.value,
      ),
    );

    const allocated = consumeSimpleAllocation(
      item,
      target,
      allocatedTotal,
      settings.daily_budget_min,
      reviewReserve.value,
      mixedReserve.value,
    );

    assignmentAllocations.set(item.id, allocated);
  }

  /*
   * 5. Allocate priority 1–3 reviews using their reserve first,
   * then any free capacity.
   */
  for (const item of highPriorityReviews) {
    allocateReview(
      item,
      allocatedTotal,
      settings.daily_budget_min,
      reviewReserve,
      mixedReserve,
      true,
    );
  }

  /*
   * Release unused review reservation.
   */
  reviewReserve.value = 0;

  /*
   * 6. Corrective learning and backlog recovery share one cap.
   * An approved urgent prerequisite override can use only existing
   * budget capacity and, if necessary, release the mixed minimum.
   */
  const repairs = sorted(
    activeItems.filter(
      (item) =>
        item.kind === "corrective" ||
        item.kind === "recovery",
    ),
  );

  let repairUsed = 0;
  let recoveryUsed = 0;
  let effectiveRepairCap = settings.repair_recovery_cap_min;

  for (const item of repairs) {
    const task = item.task;

    if (
      task.kind !== "corrective" &&
      task.kind !== "recovery"
    ) {
      continue;
    }

    let taskCap = effectiveRepairCap - repairUsed;

    const free = unreservedFreeMinutes(
      allocatedTotal.value,
      settings.daily_budget_min,
      reviewReserve.value,
      mixedReserve.value,
    );

    const availableIncludingMixedReserve =
      free + mixedReserve.value;

    const approvedOverride =
      task.kind === "corrective" &&
      task.capOverrideApproved === true &&
      task.prerequisiteWithin48Hours === true;

    if (
      approvedOverride &&
      availableIncludingMixedReserve > taskCap
    ) {
      const potential = Math.min(
        item.remaining_minutes,
        availableIncludingMixedReserve,
      );

      const reserveToRelease = Math.min(
        mixedReserve.value,
        Math.max(0, potential - free),
      );

      if (reserveToRelease > 0) {
        mixedReserve.value -= reserveToRelease;
        mixedMinimumReduced = true;

        warnings.push(
          `Mixed-practice minimum reduced by ${reserveToRelease} minute(s) for urgent prerequisite repair "${item.id}".`,
        );
      }

      const newCap = repairUsed + potential;

      if (newCap > effectiveRepairCap) {
        effectiveRepairCap = newCap;
        item.cap_override_used = true;
        item.forced_disposition = "relearn";
        item.forceReason = task.capOverrideReason!.trim();
        item.decision_source = "forced";
        repairCapOverrideUsed = true;

        warnings.push(
          `Repair/recovery cap explicitly overridden for "${item.id}": ${item.forceReason}`,
        );
      }

      taskCap = effectiveRepairCap - repairUsed;
    }

    /*
     * Recovery's 25-minute block is a target within the shared cap,
     * never an additional 25 minutes on top.
     */
    const recoveryTargetRemaining =
      task.kind === "recovery"
        ? Math.max(
            0,
            settings.recovery_block_min - recoveryUsed,
          )
        : Number.MAX_SAFE_INTEGER;

    const allocation = consumeSimpleAllocation(
      item,
      Math.min(
        item.remaining_minutes,
        Math.max(0, taskCap),
        recoveryTargetRemaining,
      ),
      allocatedTotal,
      settings.daily_budget_min,
      reviewReserve.value,
      mixedReserve.value,
    );

    repairUsed += allocation;

    if (task.kind === "recovery") {
      recoveryUsed += allocation;
    }

    if (item.cap_override_used) {
      item.reason = item.forceReason;
    }
  }

  /*
   * 7. Expand existing assignment sessions when capacity remains.
   * Extension updates the same allocation; it does not create a
   * second allocation for the same minutes.
   */
  for (const item of assignments) {
    const task = item.task;

    if (task.kind !== "assignment") continue;

    const currentAllocation =
      assignmentAllocations.get(item.id) ?? 0;

    const maximum =
      task.maxSessionMin ?? task.remainingMin;

    const sessionRoom = Math.max(
      0,
      maximum - currentAllocation,
    );

    const remainingWork = Math.max(
      0,
      task.remainingMin - currentAllocation,
    );

    const extra = Math.min(
      sessionRoom,
      remainingWork,
      unreservedFreeMinutes(
        allocatedTotal.value,
        settings.daily_budget_min,
        reviewReserve.value,
        mixedReserve.value,
      ),
    );

    if (extra > 0) {
      item.allocated_minutes += extra;
      item.remaining_minutes -= extra;
      allocatedTotal.value += extra;

      assignmentAllocations.set(
        item.id,
        currentAllocation + extra,
      );
    }
  }

  /*
   * 8. Lower-priority reviews. Unused high-priority reservation
   * has already been released.
   */
  const lowerPriorityReviews = sorted(
    activeItems.filter(
      (item) =>
        item.kind === "review" &&
        item.priority >= 4,
    ),
  );

  for (const item of lowerPriorityReviews) {
    allocateReview(
      item,
      allocatedTotal,
      settings.daily_budget_min,
      reviewReserve,
      mixedReserve,
      false,
    );
  }

  /*
   * 9. Mixed practice: first spend its minimum reservation, then
   * expand only from genuinely free capacity.
   */
  if (
    mixedTask &&
    !mixedTask.fixedDecision &&
    !mixedTask.decision_required
  ) {
    const reservedAllocation = Math.min(
      mixedReserve.value,
      mixedTask.remaining_minutes,
    );

    mixedTask.allocated_minutes += reservedAllocation;
    mixedTask.remaining_minutes -= reservedAllocation;
    allocatedTotal.value += reservedAllocation;
    mixedReserve.value -= reservedAllocation;

    const expansion = consumeSimpleAllocation(
      mixedTask,
      mixedTask.remaining_minutes,
      allocatedTotal,
      settings.daily_budget_min,
      reviewReserve.value,
      mixedReserve.value,
    );

    if (
      mixedTask.allocated_minutes <
        settings.min_mixed_practice_min &&
      mixedTask.estimated_minutes >=
        settings.min_mixed_practice_min
    ) {
      mixedMinimumReduced = true;

      warnings.push(
        "The minimum mixed-practice block could not be met without violating higher-priority commitments or the daily budget.",
      );
    }

    if (
      expansion > 0 &&
      mixedTask.allocated_minutes >
        settings.min_mixed_practice_min
    ) {
      // Expansion already counted by the shared allocation ledger.
    }
  }

  /*
   * Saturday sampler: 80 minutes plus up to 10 minutes of analysis.
   * It is flexible within the same remaining daily budget.
   */
  const samplers = sorted(
    activeItems.filter(
      (item) => item.kind === "sampler",
    ),
  );

  for (const item of samplers) {
    const task = item.task;

    if (task.kind !== "sampler") continue;

    const coreTarget =
      task.targetDurationMin ??
      settings.saturday_sampler_duration_min;

    const analysisTarget =
      task.analysisMaxMin ??
      settings.saturday_sampler_analysis_max_min;

    const coreRemaining = Math.max(
      0,
      coreTarget - item.allocated_minutes,
    );

    const coreAllocation = consumeSimpleAllocation(
      item,
      coreRemaining,
      allocatedTotal,
      settings.daily_budget_min,
      reviewReserve.value,
      mixedReserve.value,
    );

    const analysisAllocation = consumeSimpleAllocation(
      item,
      analysisTarget,
      allocatedTotal,
      settings.daily_budget_min,
      reviewReserve.value,
      mixedReserve.value,
    );

    item.analysis_minutes =
      Math.min(analysisTarget, analysisAllocation);

    /*
     * Both allocations were charged against the shared budget.
     * estimated_minutes includes the analysis allowance.
     */
    void coreAllocation;
  }

  /*
   * 10. Resolve every task not already resolved.
   *
   * A review whose next DEFER would reach the deferral limit is
   * blocked for an explicit forced decision rather than silently
   * creating a third deferral.
   */
  closeUnallocatedItems(items, settings);

  for (const item of items) {
    if (
      item.disposition === "SKIP" &&
      item.priority <= 3 &&
      item.kind === "review"
    ) {
      warnings.push(
        `Priority 1–3 review "${item.id}" was explicitly skipped; review the plan.`,
      );
    }

    if (
      item.kind === "assignment" &&
      item.task.kind === "assignment" &&
      item.task.dueDate <= addCalendarDays(date, 2) &&
      item.task.remainingMin > item.allocated_minutes
    ) {
      warnings.push(
        `Assignment "${item.id}" is due within 48 hours and has unfinished estimated work.`,
      );
    }
  }

  /*
   * Verify that no code path overspent the budget. Fail closed:
   * an invalid allocation must never be presented as a valid plan.
   */
  const actualAllocated = items.reduce(
    (total, item) => total + item.allocated_minutes,
    0,
  );

  const hasBudgetViolation =
    actualAllocated > settings.daily_budget_min;

  if (hasBudgetViolation) {
    throw new Error(
      `Daily budget violation: allocated ${actualAllocated} minutes against a ${settings.daily_budget_min}-minute budget.`,
    );
  }

  const unresolved = items
    .filter(
      (item) =>
        item.disposition === null &&
        item.decision_required,
    )
    .map((item) => item.id);

  const hasSilentDrops = items.some(
    (item) =>
      item.disposition === null &&
      !item.decision_required,
  );

  const hasConflictingDispositions = items.some(
    (item) => {
      if (item.disposition === null) return false;

      return (
        item.category !==
        categoryForDisposition(
          item.task,
          item.disposition,
        )
      );
    },
  );

  const p13Skips = items.filter(
    (item) =>
      item.kind === "review" &&
      item.priority <= 3 &&
      item.disposition === "SKIP",
  ).length;

  /*
   * Reconcile the allocation ledger with the item-level total.
   * Each task has exactly one item and can contribute minutes once.
   */
  if (allocatedTotal.value !== actualAllocated) {
    throw new Error(
      `Allocation ledger mismatch: ledger ${allocatedTotal.value}, items ${actualAllocated}.`,
    );
  }

  if (hasSilentDrops) {
    throw new Error(
      "Daily plan contains a silent drop: a considered task has neither a disposition nor a required decision.",
    );
  }

  if (hasConflictingDispositions) {
    throw new Error(
      "Daily plan contains a conflicting disposition/category pair.",
    );
  }

  const publicItems: PlannedItem[] = items.map((item): PlannedItem => ({
    id: item.id,
    subject_id: item.subject_id,
    kind: item.kind,
    subject_type: item.subject_type,
    review_event_id: item.review_event_id,
    priority: item.priority,
    priority_at_scheduling: item.priority_at_scheduling,
    intended_due_date: item.intended_due_date,
    current_due_date: item.current_due_date,
    defer_count: item.defer_count,
    estimated_minutes: item.estimated_minutes,
    allocated_minutes: item.allocated_minutes,
    remaining_minutes: item.remaining_minutes,
    selected_question_ids: [...item.selected_question_ids],
    allocated_question_ids: [...item.allocated_question_ids],
    remaining_question_ids: [...item.remaining_question_ids],
    analysis_minutes: item.analysis_minutes,
    disposition: item.disposition,
    category: item.category,
    reason: item.reason,
    re_entry_condition: item.re_entry_condition,
    forced_disposition: item.forced_disposition,
    decision_source: item.decision_source,
    decision_required: item.decision_required,
    cap_override_used: item.cap_override_used,
  }));

  return {
    date,
    budget_minutes: settings.daily_budget_min,
    allocated_minutes: actualAllocated,
    remaining_budget_minutes:
      settings.daily_budget_min - actualAllocated,

    items: publicItems,

    initial_review_reserve_minutes:
      initialReviewReserve,

    initial_mixed_reserve_minutes:
      initialMixedReserve,

    review_reserve_used_minutes:
      initialReviewReserve - reviewReserve.value,

    mixed_reserve_used_minutes:
      initialMixedReserve - mixedReserve.value,

    can_finalize:
      unresolved.length === 0 &&
      !hasSilentDrops &&
      !hasConflictingDispositions,

    unresolved_decisions: unresolved,

    has_silent_drops: hasSilentDrops,
    has_conflicting_dispositions:
      hasConflictingDispositions,

    priority_1_3_skip_count: p13Skips,
    plan_review_flag: p13Skips > 0,

    mixed_minimum_reduced: mixedMinimumReduced,
    repair_cap_override_used: repairCapOverrideUsed,

    warnings,
  };
}

function stableHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

/**
 * Creates immutable decision events from a plan.
 *
 * Idempotency: event IDs are deterministic for the planning date,
 * task, decision, reason, re-entry condition, and forced disposition.
 * Reprocessing an identical planning cycle therefore emits no
 * duplicate event when the existing event list is supplied.
 *
 * A changed decision creates a different event rather than editing
 * the original event.
 */
export function createPlanningDecisionEvents(
  plan: DailyPlan,
  existingEvents: readonly TaskEvent[],
  options: {
    loggedAt?: string;
  } = {},
): TaskEvent[] {
  const existingIds = new Set(
    existingEvents.map((event) => event.id),
  );

  const created: TaskEvent[] = [];

  for (const item of plan.items) {
    const isForced =
      item.forced_disposition !== null &&
      item.decision_source === "forced";

    const isDecisionEvent =
      isForced ||
      (
        item.decision_source === "automatic_capacity" &&
        item.disposition === "DEFER"
      ) ||
      (
        item.decision_source === "explicit" &&
        (
          item.disposition === "DEFER" ||
          item.disposition === "SKIP" ||
          item.disposition === "RELEARN"
        )
      );

    if (!isDecisionEvent) {
      continue;
    }

    if (item.disposition === null && !isForced) {
      continue;
    }

    const disposition = item.disposition;

    if (!isForced && disposition === "SKIP") {
      if (!item.reason?.trim()) {
        throw new Error(`SKIP for "${item.id}" requires a reason.`);
      }

      if (!item.re_entry_condition) {
        throw new Error(
          `SKIP for "${item.id}" requires a re-entry condition.`,
        );
      }
    }

    if (
      !isForced &&
      (
        disposition === "DEFER" ||
        disposition === "RELEARN"
      ) &&
      !item.reason?.trim()
    ) {
      throw new Error(
        `${disposition} for "${item.id}" requires a reason.`,
      );
    }

    const eventType = isForced
      ? "forced_disposition"
      : disposition === "DEFER"
        ? "defer"
        : disposition === "SKIP"
          ? "skip"
          : "relearn";

    const identity = [
      plan.date,
      item.id,
      eventType,
      disposition ?? "",
      item.forced_disposition ?? "",
      item.reason ?? "",
      item.re_entry_condition ?? "",
    ].join("\n");

    const eventId =
      `plan_${plan.date}_${stableHash(identity)}`;

    if (existingIds.has(eventId)) {
      continue;
    }

    const deferCount =
      disposition === "DEFER"
        ? item.defer_count + 1
        : item.defer_count;

    const event: TaskEvent = {
      id: eventId,
      logged_at:
        options.loggedAt ??
        `${plan.date}T12:00:00.000Z`,

      event_type: eventType,
      subject_type: item.subject_type,
      subject_id: item.subject_id,

      review_event_id: item.review_event_id,
      retrieval_task_id: null,

      gate_session_id:
        item.kind === "gate"
          ? item.subject_id
          : null,

      gate_selected_task_ids_snapshot:
        item.kind === "gate"
          ? [...item.selected_question_ids]
          : null,

      skill_demonstrated_without_hints: null,

      work_session_id: null,
      related_event_id: null,

      estimated_duration_min_at_event:
        item.estimated_minutes,

      task_type_at_event: null,
      priority_at_event:
        item.priority_at_scheduling,

      intended_due_date_at_event:
        item.intended_due_date,

      current_due_date_at_event:
        item.current_due_date,

      actual_duration_min: 0,
      result: null,
      yellow_gap_severity: null,

      disposition:
        item.forced_disposition ??
        disposition,

      reason: item.reason,

      critical_error_flag: null,
      defer_count_at_event: deferCount,

      re_entry_condition:
        item.re_entry_condition,

      old_priority: null,
      new_priority: null,
    };

    created.push(event);
    existingIds.add(eventId);
  }

  return created;
}
