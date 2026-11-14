import { describe, expect, it } from "vitest";
import {
  buildWeeklyMetricFlags,
  calculateWeeklyMetrics,
} from "./metrics";
import type { TaskEvent, WeekMetrics } from "./types";

const START = "2026-10-19";
const END = "2026-10-25";
const ZONE = "Africa/Nairobi";

function base(overrides: Partial<TaskEvent> = {}): TaskEvent {
  const id = overrides.review_event_id ?? "r1";

  return {
    id: "event-1",
    logged_at: "2026-10-19T08:00:00.000Z",
    event_type: "review_scheduled",
    subject_type: "review_event",
    subject_id: id,
    review_event_id: id,
    retrieval_task_id: null,
    review_selected_task_ids_snapshot: ["t1", "t2"],
    gate_session_id: null,
    gate_selected_task_ids_snapshot: null,
    skill_demonstrated_without_hints: null,
    work_session_id: null,
    related_event_id: null,
    estimated_duration_min_at_event: 10,
    task_type_at_event: null,
    priority_at_event: 2,
    intended_due_date_at_event: "2026-10-20",
    current_due_date_at_event: "2026-10-20",
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
    ...overrides,
  };
}

function schedule(
  id: string,
  due: string,
  priority: 1 | 2 | 3 | 4 | 5,
  estimate = 10,
  selected = ["t1", "t2"],
): TaskEvent {
  return base({
    id: `s-${id}`,
    review_event_id: id,
    subject_id: id,
    priority_at_event: priority,
    intended_due_date_at_event: due,
    current_due_date_at_event: due,
    estimated_duration_min_at_event: estimate,
    review_selected_task_ids_snapshot: selected,
  });
}

function attempt(
  id: string,
  reviewId: string,
  taskId: string,
  loggedAt: string,
  result: "green" | "yellow" | "red" = "green",
  options: {
    selected?: string[];
    estimated?: number;
    actual?: number;
    taskType?: "definition" | "explanation" | "comparison" | "problem" | "essay_plan" | "application";
    eventType?: "attempt" | "gate_attempt";
  } = {},
): TaskEvent {
  return base({
    id,
    logged_at: loggedAt,
    event_type: options.eventType ?? "attempt",
    subject_type: "retrieval_task",
    subject_id: taskId,
    review_event_id: reviewId,
    retrieval_task_id: taskId,
    review_selected_task_ids_snapshot: options.selected ?? ["t1", "t2"],
    estimated_duration_min_at_event: options.estimated ?? 5,
    task_type_at_event: options.taskType ?? "definition",
    actual_duration_min: options.actual ?? 5,
    result,
    yellow_gap_severity: result === "yellow" ? "minor" : null,
    priority_at_event: null,
    intended_due_date_at_event: null,
    current_due_date_at_event: null,
  });
}

function decision(
  id: string,
  reviewId: string,
  loggedAt: string,
  type: "defer" | "skip" | "relearn" | "forced_disposition",
  disposition: "DEFER" | "SKIP" | "RELEARN" | "override_defer" | "skip" | "relearn",
  relatedEventId: string | null = null,
): TaskEvent {
  return base({
    id,
    logged_at: loggedAt,
    event_type: type,
    subject_type: "review_event",
    subject_id: reviewId,
    review_event_id: reviewId,
    retrieval_task_id: null,
    review_selected_task_ids_snapshot: undefined,
    actual_duration_min: 0,
    result: null,
    task_type_at_event: null,
    disposition,
    reason: "Test decision",
    related_event_id: relatedEventId,
  });
}

function calculate(events: TaskEvent[]) {
  return calculateWeeklyMetrics({
    week_number: 1,
    week_start: START,
    week_end: END,
    timezone: ZONE,
    events,
  });
}

function metric(overrides: Partial<WeekMetrics> = {}): WeekMetrics {
  return {
    week_number: 1,
    week_start: START,
    week_end: END,
    overall_on_time_completion_pct: 90,
    priority_1_3_on_time_completion_pct: 90,
    deferral_rate_pct: 10,
    total_deferral_decisions: 1,
    median_duration_error_pct: {},
    duration_error_sample_counts: {},
    overdue_critical_backlog_min: 10,
    priority_1_3_skip_count: 0,
    priority_4_5_skip_rate_pct: 0,
    notes: "",
    source_event_ids: [],
    source_snapshot: [],
    ...overrides,
  };
}

describe("weekly Study metrics", () => {
  it("uses intended due dates and original scheduling priorities", () => {
    const result = calculate([
      schedule("r1", "2026-10-20", 2),
      schedule("r2", "2026-10-20", 4),
      attempt("a1", "r1", "t1", "2026-10-20T06:00:00Z"),
      attempt("a2", "r1", "t2", "2026-10-20T07:00:00Z"),
      attempt("a3", "r2", "t1", "2026-10-21T06:00:00Z"),
      attempt("a4", "r2", "t2", "2026-10-21T07:00:00Z"),
    ]);

    expect(result.snapshot.overall_on_time_completion_pct).toBe(50);
    expect(result.snapshot.priority_1_3_on_time_completion_pct).toBe(100);
    expect(result.sample_counts.overall_on_time).toEqual({
      completed: 1,
      due: 2,
    });
  });

  it("keeps incomplete reviews in the overdue critical backlog", () => {
    const result = calculate([
      schedule("r1", "2026-10-20", 1, 12, ["t1", "t2", "t3"]),
      attempt("a1", "r1", "t1", "2026-10-20T06:00:00Z", "green", {
        selected: ["t1", "t2", "t3"],
      }),
    ]);

    expect(result.snapshot.overall_on_time_completion_pct).toBe(0);
    expect(result.snapshot.overdue_critical_backlog_min).toBe(12);
    expect(result.sample_counts.overdue_critical_backlog_events).toBe(1);
  });

  it("treats Red as an immediate terminal review outcome", () => {
    const result = calculate([
      schedule("r1", "2026-10-20", 2, 15),
      attempt("a1", "r1", "t1", "2026-10-20T06:00:00Z", "red"),
    ]);

    expect(result.snapshot.overall_on_time_completion_pct).toBe(100);
    expect(result.snapshot.overdue_critical_backlog_min).toBe(0);
  });

  it("counts one deferred review once but counts each defer decision", () => {
    const result = calculate([
      schedule("r1", "2026-10-20", 2),
      decision("d1", "r1", "2026-10-20T08:00:00Z", "defer", "DEFER"),
      decision("d2", "r1", "2026-10-21T08:00:00Z", "forced_disposition", "override_defer"),
    ]);

    expect(result.snapshot.deferral_rate_pct).toBe(100);
    expect(result.snapshot.total_deferral_decisions).toBe(2);
    expect(result.sample_counts.deferral_rate).toEqual({
      deferred_events: 1,
      due_events: 1,
    });
  });

  it("counts explicit priority 1–3 and priority 4–5 skips by review", () => {
    const result = calculate([
      schedule("p2", "2026-10-20", 2),
      schedule("p5", "2026-10-20", 5),
      decision("s1", "p2", "2026-10-20T08:00:00Z", "skip", "SKIP"),
      decision("s2", "p2", "2026-10-21T08:00:00Z", "forced_disposition", "skip"),
      decision("s3", "p5", "2026-10-20T09:00:00Z", "skip", "SKIP"),
    ]);

    expect(result.snapshot.priority_1_3_skip_count).toBe(1);
    expect(result.snapshot.priority_4_5_skip_rate_pct).toBe(100);
    expect(result.sample_counts.priority_4_5_skip_rate).toEqual({
      skipped_events: 1,
      due_events: 1,
    });
  });

  it("retains historical skip count after resolution and re-enters backlog", () => {
    const skip = decision("skip-1", "r1", "2026-10-20T08:00:00Z", "skip", "SKIP");
    const resolution = base({
      id: "resolve-1",
      logged_at: "2026-10-21T08:00:00Z",
      event_type: "skip_resolution",
      subject_type: "review_event",
      subject_id: "r1",
      review_event_id: "r1",
      related_event_id: skip.id,
      retrieval_task_id: null,
      review_selected_task_ids_snapshot: undefined,
      actual_duration_min: null,
      result: null,
      disposition: null,
      reason: null,
    });

    const result = calculate([
      schedule("r1", "2026-10-20", 2, 12),
      skip,
      resolution,
    ]);

    expect(result.snapshot.priority_1_3_skip_count).toBe(1);
    expect(result.snapshot.overdue_critical_backlog_min).toBe(12);
  });

  it("sums overdue priority 1–3 backlog using scheduled estimates", () => {
    const result = calculate([
      schedule("backlog", "2026-10-18", 1, 12),
      schedule("complete", "2026-10-20", 3, 20),
      schedule("skipped", "2026-10-20", 2, 30),
      schedule("relearn", "2026-10-20", 1, 40),
      schedule("p4", "2026-10-20", 4, 50),
      attempt("c1", "complete", "t1", "2026-10-20T06:00:00Z"),
      attempt("c2", "complete", "t2", "2026-10-20T07:00:00Z"),
      decision("s1", "skipped", "2026-10-20T08:00:00Z", "skip", "SKIP"),
      decision("r1", "relearn", "2026-10-20T09:00:00Z", "relearn", "RELEARN"),
    ]);

    expect(result.snapshot.overdue_critical_backlog_min).toBe(12);
    expect(result.sample_counts.overdue_critical_backlog_events).toBe(1);
  });

  it("calculates duration error by task type and requires five samples", () => {
    const events: TaskEvent[] = [];

    [5, 6, 7, 8, 9].forEach((actual, index) => {
      events.push(attempt(
        `definition-${index}`,
        `duration-${index}`,
        "t1",
        `2026-10-20T0${index}:00:00Z`,
        "green",
        { estimated: 5, actual, taskType: "definition" },
      ));
    });

    [5, 6, 7, 8].forEach((actual, index) => {
      events.push(attempt(
        `problem-${index}`,
        `problem-${index}`,
        "t1",
        `2026-10-21T0${index}:00:00Z`,
        "green",
        { estimated: 5, actual, taskType: "problem" },
      ));
    });

    const result = calculate(events);

    expect(result.snapshot.median_duration_error_pct.definition).toBe(40);
    expect(result.snapshot.median_duration_error_pct.problem).toBeNull();
    expect(result.snapshot.duration_error_sample_counts.definition).toBe(5);
    expect(result.snapshot.duration_error_sample_counts.problem).toBe(4);
  });

  it("uses the configured timezone for weekly decision boundaries", () => {
    const result = calculate([
      schedule("r1", "2026-10-25", 2),
      decision("d1", "r1", "2026-10-25T21:30:00Z", "defer", "DEFER"),
    ]);

    // 21:30 UTC on Sunday is 00:30 Monday in Nairobi.
    expect(result.snapshot.total_deferral_decisions).toBe(0);
    expect(result.snapshot.deferral_rate_pct).toBe(0);
  });

  it("reproduces calculated measures from the frozen source snapshot", () => {
    const result = calculate([
      schedule("r1", "2026-10-20", 2),
      attempt("a1", "r1", "t1", "2026-10-20T06:00:00Z"),
      attempt("a2", "r1", "t2", "2026-10-20T07:00:00Z"),
      decision("d1", "r1", "2026-10-21T08:00:00Z", "defer", "DEFER"),
    ]);

    const rebuilt = calculate(result.snapshot.source_snapshot);

    expect(rebuilt.snapshot.overall_on_time_completion_pct)
      .toBe(result.snapshot.overall_on_time_completion_pct);
    expect(rebuilt.snapshot.deferral_rate_pct)
      .toBe(result.snapshot.deferral_rate_pct);
    expect(rebuilt.snapshot.total_deferral_decisions)
      .toBe(result.snapshot.total_deferral_decisions);
    expect(rebuilt.snapshot.overdue_critical_backlog_min)
      .toBe(result.snapshot.overdue_critical_backlog_min);
  });

  it("reconstructs legacy scheduled selections from matching attempt snapshots", () => {
    const legacy = schedule("r1", "2026-10-20", 2);
    delete legacy.review_selected_task_ids_snapshot;

    const result = calculate([
      legacy,
      attempt("a1", "r1", "t1", "2026-10-20T06:00:00Z"),
      attempt("a2", "r1", "t2", "2026-10-20T07:00:00Z"),
    ]);

    expect(result.snapshot.overall_on_time_completion_pct).toBe(100);
    expect(result.data_quality_issues).toContain(
      "Review r1 reconstructed its selection from attempt snapshots; its scheduling snapshot is missing.",
    );
  });

  it("returns null percentages when the corresponding denominator is zero", () => {
    const result = calculate([]);

    expect(result.snapshot.overall_on_time_completion_pct).toBeNull();
    expect(result.snapshot.priority_1_3_on_time_completion_pct).toBeNull();
    expect(result.snapshot.deferral_rate_pct).toBeNull();
    expect(result.snapshot.priority_4_5_skip_rate_pct).toBeNull();
  });

  it("rejects multiple scheduling events for the same review", () => {
    expect(() => calculate([
      schedule("r1", "2026-10-20", 2),
      base({ id: "duplicate", review_event_id: "r1", subject_id: "r1" }),
    ])).toThrow(/multiple review_scheduled events/);
  });
});

describe("weekly metric flags", () => {
  it("flags priority skips and excessive priority 4–5 skip rates", () => {
    const flags = buildWeeklyMetricFlags(
      metric({
        priority_1_3_skip_count: 1,
        priority_4_5_skip_rate_pct: 20,
      }),
      [],
    );

    expect(flags.map((flag) => flag.code)).toContain("priority_1_3_skip");
    expect(flags.map((flag) => flag.code)).toContain("priority_4_5_skip_rate_high");
  });

  it("flags repeated low on-time completion and high deferral", () => {
    const previous = metric({
      week_number: 1,
      week_start: "2026-10-12",
      week_end: "2026-10-18",
      overall_on_time_completion_pct: 70,
      deferral_rate_pct: 25,
    });
    const current = metric({
      week_number: 2,
      overall_on_time_completion_pct: 75,
      deferral_rate_pct: 30,
    });

    const flags = buildWeeklyMetricFlags(current, [previous]);

    expect(flags.map((flag) => flag.code)).toContain("on_time_completion_repeatedly_low");
    expect(flags.map((flag) => flag.code)).toContain("deferral_rate_repeatedly_high");
  });

  it("flags backlog growth across two consecutive weeks", () => {
    const older = metric({
      week_number: 1,
      week_start: "2026-10-05",
      week_end: "2026-10-11",
      overdue_critical_backlog_min: 10,
    });
    const previous = metric({
      week_number: 2,
      week_start: "2026-10-12",
      week_end: "2026-10-18",
      overdue_critical_backlog_min: 15,
    });
    const current = metric({
      week_number: 3,
      overdue_critical_backlog_min: 20,
    });

    const flags = buildWeeklyMetricFlags(current, [older, previous]);

    expect(flags.map((flag) => flag.code)).toContain("critical_backlog_increasing");
  });
});
