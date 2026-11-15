import type {
  ISODate,
  RetrievalTaskType,
  TaskEvent,
  WeekMetrics,
  WeeklyMetricSampleCounts,
} from "./types";

const TASK_TYPES: RetrievalTaskType[] = [
  "definition", "explanation", "comparison",
  "problem", "essay_plan", "application",
];

export interface WeeklyMetricsInput {
  week_number: number;
  week_start: ISODate;
  week_end: ISODate;
  timezone: string;
  events: readonly TaskEvent[];
}

export interface WeeklyMetricsCalculation {
  snapshot: WeekMetrics;
  sample_counts: WeeklyMetricSampleCounts;
  data_quality_issues: string[];
}

export type WeeklyMetricFlagCode =
  | "priority_1_3_skip"
  | "critical_backlog_increasing"
  | "deferral_rate_repeatedly_high"
  | "on_time_completion_repeatedly_low"
  | "priority_4_5_skip_rate_high";

export interface WeeklyMetricFlag {
  code: WeeklyMetricFlagCode;
  severity: "warning" | "critical";
  message: string;
}

interface ReviewRecord {
  id: string;
  due: ISODate;
  priority: number;
  estimate: number | null;
  attempts: TaskEvent[];
  decisions: TaskEvent[];
  completionDate: ISODate | null;
  skipped: boolean;
  activeSkip: boolean;
  relearned: boolean;
  deferred: boolean;
}

function assertDate(value: string, name: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${name} is not a valid date.`);
  }
}

function localDate(timestamp: string, timezone: string): ISODate {
  const instant = new Date(timestamp);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Invalid TaskEvent timestamp: ${timestamp}`);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function inRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

function percent(numerator: number, denominator: number): number | null {
  return denominator === 0
    ? null
    : Number(((numerator / denominator) * 100).toFixed(1));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  return Number(value.toFixed(1));
}

function validSelection(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 3 &&
    value.every((id) => typeof id === "string" && id.trim().length > 0) &&
    new Set(value).size === value.length
  );
}

function sameSelection(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function orderEvents(a: TaskEvent, b: TaskEvent): number {
  return (
    new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime() ||
    a.id.localeCompare(b.id)
  );
}

function disposition(event: TaskEvent): string {
  return String(event.disposition ?? "").toLowerCase();
}

function isDefer(event: TaskEvent): boolean {
  return event.event_type === "defer" ||
    (
      event.event_type === "forced_disposition" &&
      ["override_defer", "defer"].includes(disposition(event))
    );
}

function isSkip(event: TaskEvent): boolean {
  return event.event_type === "skip" ||
    (
      event.event_type === "forced_disposition" &&
      disposition(event) === "skip"
    );
}

function isRelearn(event: TaskEvent): boolean {
  return event.event_type === "relearn" ||
    (
      event.event_type === "forced_disposition" &&
      disposition(event) === "relearn"
    );
}

function getActiveSkip(decisions: TaskEvent[]): boolean {
  const active = new Set<string>();

  for (const event of [...decisions].sort(orderEvents)) {
    if (isSkip(event)) active.add(event.id);

    if (
      event.event_type === "skip_resolution" &&
      event.related_event_id
    ) {
      active.delete(event.related_event_id);
    }
  }

  return active.size > 0;
}

function resolveSelection(
  scheduled: TaskEvent,
  attempts: TaskEvent[],
  issues: string[],
): { ids: string[] | null; valid: boolean } {
  const frozen = scheduled.review_selected_task_ids_snapshot;

  if (frozen !== undefined && !validSelection(frozen)) {
    issues.push(`Review ${scheduled.review_event_id} has an invalid scheduled task snapshot.`);
    return { ids: null, valid: false };
  }

  const attemptSelections: string[][] = [];

  for (const attempt of attempts) {
    const selection = attempt.review_selected_task_ids_snapshot;
    if (selection === undefined) continue;

    if (!validSelection(selection)) {
      issues.push(`Attempt ${attempt.id} has an invalid review selection snapshot.`);
      return { ids: null, valid: false };
    }

    if (
      attempt.retrieval_task_id &&
      !selection.includes(attempt.retrieval_task_id)
    ) {
      issues.push(`Attempt ${attempt.id} is outside its frozen task selection.`);
      return { ids: null, valid: false };
    }

    if (!attemptSelections.some((item) => sameSelection(item, selection))) {
      attemptSelections.push(selection);
    }
  }

  if (frozen !== undefined) {
    if (
      attemptSelections.some((selection) => !sameSelection(selection, frozen))
    ) {
      issues.push(`Review ${scheduled.review_event_id} has conflicting attempt selections.`);
      return { ids: null, valid: false };
    }
    return { ids: [...frozen], valid: true };
  }

  if (attemptSelections.length === 1) {
    issues.push(
      `Review ${scheduled.review_event_id} reconstructed its selection from attempt snapshots; its scheduling snapshot is missing.`,
    );
    return { ids: [...attemptSelections[0]], valid: true };
  }

  if (attempts.length > 0) {
    issues.push(`Review ${scheduled.review_event_id} cannot reconstruct its selected tasks.`);
    return { ids: null, valid: false };
  }

  // No attempts means this review is still incomplete. Its selection
  // is not needed to establish that fact.
  return { ids: null, valid: true };
}

function completionDate(
  attempts: TaskEvent[],
  selected: string[] | null,
  selectionValid: boolean,
  timezone: string,
): ISODate | null {
  const completedTasks = new Set<string>();

  for (const attempt of [...attempts].sort(orderEvents)) {
    const date = localDate(attempt.logged_at, timezone);

    // Red is an immediate terminal outcome in the review state machine.
    if (attempt.result === "red") return date;

    if (!selectionValid || !selected) continue;

    if (attempt.retrieval_task_id) {
      completedTasks.add(attempt.retrieval_task_id);
    }

    if (selected.every((id) => completedTasks.has(id))) {
      return date;
    }
  }

  return null;
}

/**
 * Calculate all eight measures from immutable TaskEvent history.
 * No mutable ReviewEvent or queue state is accepted.
 */
export function calculateWeeklyMetrics(
  input: WeeklyMetricsInput,
): WeeklyMetricsCalculation {
  const { week_number, week_start, week_end, timezone, events } = input;

  if (!Number.isSafeInteger(week_number) || week_number < 1) {
    throw new Error("week_number must be a positive integer.");
  }
  assertDate(week_start, "week_start");
  assertDate(week_end, "week_end");
  if (week_start > week_end) {
    throw new Error("week_start must not be after week_end.");
  }

  // Validate the reporting timezone.
  new Intl.DateTimeFormat("en-US", { timeZone: timezone });

  const seenIds = new Set<string>();
  for (const event of events) {
    if (seenIds.has(event.id)) {
      throw new Error(`Duplicate TaskEvent ID: ${event.id}`);
    }
    seenIds.add(event.id);
  }

  const issues: string[] = [];
  const throughWeekEnd = events
    .filter((event) => localDate(event.logged_at, timezone) <= week_end)
    .sort(orderEvents);

  const schedules = throughWeekEnd.filter(
    (event) => event.event_type === "review_scheduled",
  );

  const records = new Map<string, ReviewRecord>();

  for (const scheduled of schedules) {
    const id = scheduled.review_event_id;
    if (!id) throw new Error(`Scheduled event ${scheduled.id} has no review ID.`);
    if (records.has(id)) {
      throw new Error(`Review ${id} has multiple review_scheduled events.`);
    }

    const due = scheduled.intended_due_date_at_event;
    if (!due) throw new Error(`Review ${id} has no intended due date.`);
    assertDate(due, `Review ${id} intended due date`);

    const priority = scheduled.priority_at_event;
    if (priority === null || priority < 1 || priority > 5) {
      throw new Error(`Review ${id} has no valid scheduling priority snapshot.`);
    }

    const linked = throughWeekEnd.filter(
      (event) => event.review_event_id === id,
    );
    const attempts = linked.filter((event) => event.event_type === "attempt");
    const decisions = linked.filter(
      (event) =>
        isDefer(event) ||
        isSkip(event) ||
        isRelearn(event) ||
        event.event_type === "skip_resolution",
    );

    const selection = resolveSelection(scheduled, attempts, issues);
    const estimate = scheduled.estimated_duration_min_at_event;

    let validEstimate: number | null = null;
    if (estimate !== null && Number.isFinite(estimate) && estimate > 0) {
      validEstimate = estimate;
    } else {
      issues.push(`Review ${id} has no valid scheduling estimate snapshot.`);
    }

    records.set(id, {
      id,
      due,
      priority,
      estimate: validEstimate,
      attempts,
      decisions,
      completionDate: completionDate(
        attempts,
        selection.ids,
        selection.valid,
        timezone,
      ),
      skipped: decisions.some(isSkip),
      activeSkip: getActiveSkip(decisions),
      relearned: decisions.some(isRelearn),
      deferred: decisions.some(isDefer),
    });
  }

  const allReviews = [...records.values()];
  const dueThisWeek = allReviews.filter(
    (review) => inRange(review.due, week_start, week_end),
  );

  const completedOnTime = dueThisWeek.filter(
    (review) => review.completionDate === review.due,
  ).length;

  const priority13Due = dueThisWeek.filter(
    (review) => review.priority <= 3,
  );
  const priority13OnTime = priority13Due.filter(
    (review) => review.completionDate === review.due,
  ).length;

  const deferredDue = dueThisWeek.filter((review) => review.deferred).length;

  // Measure 4 counts individual deferral decisions, including a forced
  // override_defer, rather than counting distinct reviews.
  const deferralDecisions = throughWeekEnd.filter((event) =>
    inRange(localDate(event.logged_at, timezone), week_start, week_end) &&
    isDefer(event),
  ).length;

  // Duration error is grouped by the task type and estimate frozen
  // on each retrieval attempt, never by today's question-bank values.
  const durationSamples: Record<RetrievalTaskType, number[]> = {
    definition: [],
    explanation: [],
    comparison: [],
    problem: [],
    essay_plan: [],
    application: [],
  };

  for (const event of throughWeekEnd) {
    if (
      !inRange(localDate(event.logged_at, timezone), week_start, week_end) ||
      !["attempt", "gate_attempt"].includes(event.event_type)
    ) continue;

    const type = event.task_type_at_event;
    const estimate = event.estimated_duration_min_at_event;
    const actual = event.actual_duration_min;

    if (
      type === null ||
      !TASK_TYPES.includes(type) ||
      estimate === null ||
      !Number.isFinite(estimate) ||
      estimate <= 0 ||
      actual === null ||
      !Number.isFinite(actual) ||
      actual <= 0
    ) {
      issues.push(`Attempt ${event.id} lacks valid duration-error evidence and was excluded.`);
      continue;
    }

    durationSamples[type].push(
      (Math.abs(actual - estimate) / estimate) * 100,
    );
  }

  const durationMedians: Partial<
    Record<RetrievalTaskType, number | null>
  > = {};
  const durationCounts: Partial<Record<RetrievalTaskType, number>> = {};

  for (const type of TASK_TYPES) {
    durationCounts[type] = durationSamples[type].length;
    durationMedians[type] = durationSamples[type].length >= 5
      ? median(durationSamples[type])
      : null;
  }

  // Historical backlog at the end of the week. Deferred work remains
  // backlog. Completed, relearned and currently skipped reviews do not.
  const backlog = allReviews.filter(
    (review) =>
      review.due <= week_end &&
      review.priority <= 3 &&
      review.completionDate === null &&
      !review.activeSkip &&
      !review.relearned,
  );

  let backlogMinutes = 0;
  for (const review of backlog) {
    if (review.estimate === null) {
      issues.push(`Overdue review ${review.id} has no estimate; backlog minutes are incomplete.`);
    } else {
      backlogMinutes += review.estimate;
    }
  }

  const priority13Skipped = dueThisWeek.filter(
    (review) => review.priority <= 3 && review.skipped,
  ).length;

  const priority45Due = dueThisWeek.filter(
    (review) => review.priority >= 4,
  );
  const priority45Skipped = priority45Due.filter(
    (review) => review.skipped,
  ).length;

  const sampleCounts: WeeklyMetricSampleCounts = {
    overall_on_time: {
      completed: completedOnTime,
      due: dueThisWeek.length,
    },
    priority_1_3_on_time: {
      completed: priority13OnTime,
      due: priority13Due.length,
    },
    deferral_rate: {
      deferred_events: deferredDue,
      due_events: dueThisWeek.length,
    },
    total_deferral_decisions: deferralDecisions,
    duration_error: durationCounts,
    overdue_critical_backlog_events: backlog.length,
    priority_1_3_skips: priority13Skipped,
    priority_4_5_skip_rate: {
      skipped_events: priority45Skipped,
      due_events: priority45Due.length,
    },
  };

  // Freeze all event evidence through week-end. This intentionally
  // includes previous-week events needed to reconstruct overdue backlog.
  const sourceSnapshot = throughWeekEnd.map((event) => ({
    ...event,
    review_selected_task_ids_snapshot:
      event.review_selected_task_ids_snapshot
        ? [...event.review_selected_task_ids_snapshot]
        : event.review_selected_task_ids_snapshot,
    gate_selected_task_ids_snapshot:
      event.gate_selected_task_ids_snapshot
        ? [...event.gate_selected_task_ids_snapshot]
        : event.gate_selected_task_ids_snapshot,
    guided_practice_selected_task_ids_snapshot:
      event.guided_practice_selected_task_ids_snapshot
        ? [...event.guided_practice_selected_task_ids_snapshot]
        : event.guided_practice_selected_task_ids_snapshot,
  }));

  const uniqueIssues = [...new Set(issues)];

  const snapshot: WeekMetrics = {
    week_number,
    week_start,
    week_end,
    overall_on_time_completion_pct: percent(
      completedOnTime,
      dueThisWeek.length,
    ),
    priority_1_3_on_time_completion_pct: percent(
      priority13OnTime,
      priority13Due.length,
    ),
    deferral_rate_pct: percent(
      deferredDue,
      dueThisWeek.length,
    ),
    total_deferral_decisions: deferralDecisions,
    median_duration_error_pct: durationMedians,
    duration_error_sample_counts: durationCounts,
    overdue_critical_backlog_min: backlogMinutes,
    priority_1_3_skip_count: priority13Skipped,
    priority_4_5_skip_rate_pct: percent(
      priority45Skipped,
      priority45Due.length,
    ),
    notes: "",
    timezone,
    sample_counts: sampleCounts,
    data_quality_issues: uniqueIssues,
    source_event_ids: sourceSnapshot.map((event) => event.id),
    source_snapshot: sourceSnapshot,
  };

  return {
    snapshot,
    sample_counts: sampleCounts,
    data_quality_issues: uniqueIssues,
  };
}

function addDays(date: ISODate, days: number): ISODate {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Dashboard flags from the current and saved consecutive weekly snapshots.
 */
export function buildWeeklyMetricFlags(
  current: WeekMetrics,
  previousWeeks: readonly WeekMetrics[],
): WeeklyMetricFlag[] {
  const history = [...previousWeeks].sort(
    (a, b) => a.week_end.localeCompare(b.week_end),
  );

  const previous = history
    .filter((week) => addDays(week.week_end, 1) === current.week_start)
    .at(-1);

  const twoWeeksAgo = previous
    ? history
        .filter((week) => addDays(week.week_end, 1) === previous.week_start)
        .at(-1)
    : undefined;

  const flags: WeeklyMetricFlag[] = [];

  if (current.priority_1_3_skip_count > 0) {
    flags.push({
      code: "priority_1_3_skip",
      severity: "critical",
      message: "A priority 1–3 review was explicitly skipped. Review the plan.",
    });
  }

  if (
    current.priority_4_5_skip_rate_pct !== null &&
    current.priority_4_5_skip_rate_pct > 15
  ) {
    flags.push({
      code: "priority_4_5_skip_rate_high",
      severity: "warning",
      message: "Priority 4–5 skip rate exceeded 15%. Review workload.",
    });
  }

  if (
    previous &&
    current.deferral_rate_pct !== null &&
    previous.deferral_rate_pct !== null &&
    current.deferral_rate_pct > 20 &&
    previous.deferral_rate_pct > 20
  ) {
    flags.push({
      code: "deferral_rate_repeatedly_high",
      severity: "warning",
      message: "Deferral rate exceeded 20% for two consecutive weeks.",
    });
  }

  if (
    previous &&
    current.overall_on_time_completion_pct !== null &&
    previous.overall_on_time_completion_pct !== null &&
    current.overall_on_time_completion_pct < 80 &&
    previous.overall_on_time_completion_pct < 80
  ) {
    flags.push({
      code: "on_time_completion_repeatedly_low",
      severity: "warning",
      message: "Overall on-time completion was below 80% for two consecutive weeks.",
    });
  }

  if (
    previous &&
    twoWeeksAgo &&
    current.overdue_critical_backlog_min >
      previous.overdue_critical_backlog_min &&
    previous.overdue_critical_backlog_min >
      twoWeeksAgo.overdue_critical_backlog_min
  ) {
    flags.push({
      code: "critical_backlog_increasing",
      severity: "warning",
      message: "Overdue critical backlog increased for two consecutive weeks.",
    });
  }

  return flags;
}
