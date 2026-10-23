import { describe, expect, it } from "vitest";

import {
  aggregateReviewResult,
  addCalendarDays,
  createNextReviewAfterSuccess,
  createReviewAfterGate,
  createRetryReview,
  deriveLatestGateResult,
  moveSundayToMonday,
  nextStudyDayAfter,
  selectRetrievalTasks,
  transitionReview,
  type GateEvidence,
  type ReviewEvidence,
} from "./reviewEngine";

import type {
  EntityId,
  RetrievalTask,
  ReviewEvent,
  TaskEvent,
} from "./types";

const fixedIds = (prefix: string) => `${prefix}_fixed`;

function task(
  id: string,
  topicId = "topic-1",
  taskType: RetrievalTask["task_type"] = "definition",
  purpose: RetrievalTask["purpose"] = "review",
): RetrievalTask {
  return {
    id,
    topic_id: topicId,
    prompt: `Question ${id}`,
    expected_answer_criteria: `Criteria ${id}`,
    task_type: taskType,
    purpose,
    estimated_duration_min: 5,
    last_used_on: null,
    active: true,
  };
}

function makeReview(
  overrides: Partial<ReviewEvent> = {},
): ReviewEvent {
  return {
    id: "review-1",
    topic_id: "topic-1",
    stage: 2,
    event_kind: "scheduled_review",
    holds_stage: false,
    selected_task_ids: ["task-a", "task-b", "task-c"],
    overall_result: null,
    yellow_gap_severity: null,
    source_review_id: "review-previous",
    intended_due_date: "2026-10-20",
    current_due_date: "2026-10-20",
    completed_at: null,
    priority_at_scheduling: 2,
    current_priority: 2,
    defer_count: 0,
    moved_from_sunday: false,
    status: "pending",
    ...overrides,
  };
}

function makeTaskEvent(
  overrides: Partial<TaskEvent> = {},
): TaskEvent {
  return {
    id: "event-1",
    logged_at: "2026-10-20T09:00:00.000Z",
    event_type: "attempt",
    subject_type: "retrieval_task",
    subject_id: "task-a",
    review_event_id: "review-1",
    retrieval_task_id: "task-a",
    gate_session_id: null,
    gate_selected_task_ids_snapshot: null,
    skill_demonstrated_without_hints: null,
    work_session_id: null,
    related_event_id: null,
    estimated_duration_min_at_event: 5,
    task_type_at_event: "definition",
    priority_at_event: 2,
    intended_due_date_at_event: "2026-10-20",
    current_due_date_at_event: "2026-10-20",
    actual_duration_min: 5,
    result: "green",
    yellow_gap_severity: null,
    disposition: null,
    reason: null,
    critical_error_flag: false,
    defer_count_at_event: 0,
    re_entry_condition: null,
    old_priority: null,
    new_priority: null,
    ...overrides,
  };
}

function gateEvidence(
  taskId: EntityId,
  result: "green" | "yellow" | "red",
  overrides: Partial<GateEvidence> = {},
): GateEvidence {
  return {
    event_type: "gate_attempt",
    subject_id: taskId,
    logged_at: "2026-10-20T09:00:00.000Z",
    retrieval_task_id: taskId,
    gate_session_id: "gate-session-1",
    gate_selected_task_ids_snapshot: [
      "gate-a",
      "gate-b",
      "gate-c",
    ],
    skill_demonstrated_without_hints: false,
    result,
    critical_error_flag: false,
    ...overrides,
  };
}

describe("calendar date rules", () => {
  it("adds calendar days without depending on machine timezone", () => {
    expect(addCalendarDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addCalendarDays("2026-10-31", 3)).toBe("2026-11-03");
  });

  it("moves Sunday to Monday and leaves other dates unchanged", () => {
    expect(moveSundayToMonday("2026-11-01")).toEqual({
      date: "2026-11-02",
      moved: true,
    });

    expect(moveSundayToMonday("2026-11-02")).toEqual({
      date: "2026-11-02",
      moved: false,
    });
  });

  it("returns the next study day and skips Sunday", () => {
    expect(nextStudyDayAfter("2026-10-30")).toBe("2026-10-31");
    expect(nextStudyDayAfter("2026-10-31")).toBe("2026-11-02");
    expect(nextStudyDayAfter("2026-11-01")).toBe("2026-11-02");
  });

  it("rejects invalid calendar dates", () => {
    expect(() => addCalendarDays("2026-02-30", 1)).toThrow();
    expect(() => addCalendarDays("not-a-date", 1)).toThrow();
  });
});

describe("retrieval task selection", () => {
  it("requires at least three active questions for an initial gate", () => {
    const selection = selectRetrievalTasks(
      [task("a"), task("b")],
      { topicId: "topic-1", purpose: "gate" },
    );

    expect(selection.ready).toBe(false);
    expect(selection.selected_task_ids).toEqual([]);
  });

  it("selects diverse, less recently used active tasks when available", () => {
    const tasks = [
      task("a", "topic-1", "definition", "gate"),
      task("b", "topic-1", "definition", "gate"),
      task("c", "topic-1", "problem", "review"),
      task("d", "topic-1", "comparison", "review"),
      task("inactive", "topic-1", "application", "review"),
    ].map((item) =>
      item.id === "inactive"
        ? { ...item, active: false }
        : item,
    );

    const selection = selectRetrievalTasks(tasks, {
      topicId: "topic-1",
      purpose: "review",
      recentlyUsedTaskIds: ["a", "b"],
      count: 3,
    });

    expect(selection.ready).toBe(true);
    expect(selection.selected_task_ids).toHaveLength(3);
    expect(selection.selected_task_ids).not.toContain("inactive");

    // Use fresh questions where possible, while allowing a previously
    // used question to fill the selection when fewer than three fresh
    // active questions exist.
    expect(selection.selected_task_ids).toContain("c");
    expect(selection.selected_task_ids).toContain("d");
    expect(
      selection.selected_task_ids.some(
        (id) => !["a", "b"].includes(id),
      ),
    ).toBe(true);

    const selectedTypes = new Set(
      selection.selected_task_ids.map(
        (id) => tasks.find((item) => item.id === id)!.task_type,
      ),
    );
    expect(selectedTypes.size).toBeGreaterThan(1);
  });

  it("does not require a task's preferred purpose to match its actual use", () => {
    const selection = selectRetrievalTasks(
      [
        task("gate-1", "topic-1", "definition", "gate"),
        task("gate-2", "topic-1", "explanation", "gate"),
        task("gate-3", "topic-1", "problem", "gate"),
      ],
      { topicId: "topic-1", purpose: "review", count: 3 },
    );

    expect(selection.ready).toBe(true);
    expect(selection.selected_task_ids).toHaveLength(3);
  });
});

describe("initial-learning gate derivation", () => {
  const tasks = [
    task("gate-a", "topic-1"),
    task("gate-b", "topic-1"),
    task("gate-c", "topic-1"),
  ];

  it("passes when all three tasks are attempted and at least 60% are Green", () => {
    const events = [
      gateEvidence("gate-a", "green"),
      gateEvidence("gate-b", "green"),
      gateEvidence("gate-c", "yellow"),
    ];

    const result = deriveLatestGateResult("topic-1", tasks, events);

    expect(result.gate_result).toBe("passed");
    expect(result.gate_passed).toBe(true);
    expect(result.green_pct).toBeCloseTo(66.666, 2);
  });

  it("remains pending while selected questions are unattempted", () => {
    const events = [
      gateEvidence("gate-a", "green"),
      gateEvidence("gate-b", "green"),
    ];

    const result = deriveLatestGateResult("topic-1", tasks, events);

    expect(result.gate_result).toBe("pending");
    expect(result.complete).toBe(false);
  });

  it("fails when the Green threshold is not met", () => {
    const events = [
      gateEvidence("gate-a", "green"),
      gateEvidence("gate-b", "yellow"),
      gateEvidence("gate-c", "red"),
    ];

    const result = deriveLatestGateResult("topic-1", tasks, events);

    expect(result.gate_result).toBe("failed");
    expect(result.gate_passed).toBe(false);
    expect(result.reason).toBe("below_threshold");
  });

  it("fails if a critical conceptual error occurred even when the percentage passes", () => {
    const events = [
      gateEvidence("gate-a", "green", {
        critical_error_flag: true,
      }),
      gateEvidence("gate-b", "green"),
      gateEvidence("gate-c", "yellow"),
    ];

    const result = deriveLatestGateResult("topic-1", tasks, events);

    expect(result.gate_result).toBe("failed");
    expect(result.reason).toBe("critical_error");
  });

  it("supports the skill-demonstrated-without-hints alternative", () => {
    const evidence = gateEvidence("topic-1", "green", {
      subject_id: "topic-1",
      retrieval_task_id: null,
      gate_selected_task_ids_snapshot: null,
      skill_demonstrated_without_hints: true,
    });

    const result = deriveLatestGateResult(
      "topic-1",
      tasks,
      [evidence],
    );

    expect(result.gate_result).toBe("skill_based_passed");
    expect(result.gate_passed).toBe(true);
  });
});

describe("review aggregation", () => {
  const review = makeReview();
  const selected = ["task-a", "task-b", "task-c"];

  it("marks an unfinished review incomplete", () => {
    const result = aggregateReviewResult(review, [
      makeTaskEvent({ retrieval_task_id: "task-a" }),
      makeTaskEvent({
        id: "event-2",
        retrieval_task_id: "task-b",
      }),
    ]);

    expect(result.overall_result).toBe("incomplete");
    expect(result.attempted_task_ids).toHaveLength(2);
  });

  it("makes Red terminal even if other selected questions remain", () => {
    const events: ReviewEvidence[] = [
      {
        event_type: "attempt",
        review_event_id: review.id,
        retrieval_task_id: "task-a",
        result: "red",
        yellow_gap_severity: null,
      },
    ];

    const result = aggregateReviewResult(review, events);

    expect(result.overall_result).toBe("red");
  });

  it("classifies the review Yellow and preserves substantive severity", () => {
    const events: ReviewEvidence[] = [
      {
        event_type: "attempt",
        review_event_id: review.id,
        retrieval_task_id: "task-a",
        result: "green",
        yellow_gap_severity: null,
      },
      {
        event_type: "attempt",
        review_event_id: review.id,
        retrieval_task_id: "task-b",
        result: "yellow",
        yellow_gap_severity: "minor",
      },
      {
        event_type: "attempt",
        review_event_id: review.id,
        retrieval_task_id: "task-c",
        result: "yellow",
        yellow_gap_severity: "substantive",
      },
    ];

    const result = aggregateReviewResult(review, events);

    expect(result.overall_result).toBe("yellow");
    expect(result.yellow_gap_severity).toBe("substantive");
  });

  it("returns Green when every selected task is Green", () => {
    const events = selected.map((id) =>
      makeTaskEvent({
        id: `event-${id}`,
        retrieval_task_id: id,
        result: "green",
      }),
    );

    const result = aggregateReviewResult(review, events);

    expect(result.overall_result).toBe("green");
  });
});

describe("review scheduling", () => {
  it("schedules Review 1 one day after the gate and moves Sunday to Monday", () => {
    const decision = createReviewAfterGate({
      topicId: "topic-1",
      gatePassedDate: "2026-10-31",
      lastFinalExamDate: "2026-12-15",
      selectedTaskIds: ["a", "b", "c"],
      estimatedDurationMin: 15,
      priority: 2,
      idFactory: fixedIds,
      now: "2026-10-31T10:00:00.000Z",
    });

    expect(decision.kind).toBe("scheduled");

    if (decision.kind === "scheduled") {
      expect(decision.review_event.stage).toBe(1);
      expect(decision.review_event.intended_due_date).toBe("2026-11-02");
      expect(decision.review_event.moved_from_sunday).toBe(true);
      expect(decision.scheduled_event.event_type).toBe("review_scheduled");
      expect(decision.scheduled_event.intended_due_date_at_event).toBe("2026-11-02");
    }
  });

  it("advances from the actual completion date using the next stage's interval", () => {
    const decision = createNextReviewAfterSuccess({
      sourceReview: makeReview({ stage: 2 }),
      completedDate: "2026-10-20",
      lastFinalExamDate: "2026-12-15",
      selectedTaskIds: ["next-a", "next-b"],
      estimatedDurationMin: 10,
      idFactory: fixedIds,
    });

    expect(decision.kind).toBe("scheduled");

    if (decision.kind === "scheduled") {
      expect(decision.review_event.stage).toBe(3);
      expect(decision.review_event.intended_due_date).toBe("2026-10-27");
    }
  });

  it("does not schedule ordinary reviews beyond the last final", () => {
    const decision = createReviewAfterGate({
      topicId: "topic-1",
      gatePassedDate: "2026-10-31",
      lastFinalExamDate: "2026-11-01",
      selectedTaskIds: ["a", "b", "c"],
      estimatedDurationMin: 15,
      priority: 2,
      idFactory: fixedIds,
    });

    expect(decision).toEqual({
      kind: "classify",
      reason: "post_finals",
      topic_id: "topic-1",
    });
  });

  it("does not create a normal review after Stage 5", () => {
    const decision = createNextReviewAfterSuccess({
      sourceReview: makeReview({ stage: 5 }),
      completedDate: "2026-10-20",
      lastFinalExamDate: "2026-12-15",
      selectedTaskIds: ["next-a", "next-b"],
      estimatedDurationMin: 10,
      idFactory: fixedIds,
    });

    expect(decision).toEqual({
      kind: "classify",
      reason: "stage_5_complete",
      topic_id: "topic-1",
    });
  });

  it("keeps a retry at the held stage and schedules it on the next study day", () => {
    const decision = createRetryReview({
      sourceReview: makeReview({ stage: 2 }),
      availableAfterDate: "2026-10-31",
      lastFinalExamDate: "2026-12-15",
      selectedTaskIds: ["retry-a", "retry-b"],
      estimatedDurationMin: 10,
      idFactory: fixedIds,
    });

    expect(decision.kind).toBe("scheduled");

    if (decision.kind === "scheduled") {
      expect(decision.review_event.event_kind).toBe("retry");
      expect(decision.review_event.stage).toBe(2);
      expect(decision.review_event.holds_stage).toBe(true);
      expect(decision.review_event.intended_due_date).toBe("2026-11-02");
      expect(decision.review_event.source_review_id).toBe("review-1");
    }
  });
});

describe("review state transitions", () => {
  it("keeps an incomplete review and its selected task IDs without creating another event", () => {
    const original = makeReview();

    const result = transitionReview({
      review: original,
      aggregation: {
        overall_result: "incomplete",
        yellow_gap_severity: null,
        attempted_task_ids: ["task-a"],
      },
      completedAt: "2026-10-20T12:00:00.000Z",
      completionDate: "2026-10-20",
      currentTopicStatus: "active",
      lastFinalExamDate: "2026-12-15",
      nextSelectedTaskIds: ["next-a", "next-b"],
      nextEstimatedDurationMin: 10,
    });

    expect(result.kind).toBe("incomplete");

    if (result.kind === "incomplete") {
      expect(result.updatedReview.id).toBe(original.id);
      expect(result.updatedReview.stage).toBe(original.stage);
      expect(result.updatedReview.selected_task_ids).toEqual(original.selected_task_ids);
      expect(result.updatedReview.current_due_date).toBe("2026-10-21");
      expect(result.next).toBeNull();
    }
  });

  it("creates a same-stage retry for substantive Yellow on an ordinary review", () => {
    const result = transitionReview({
      review: makeReview({ stage: 2 }),
      aggregation: {
        overall_result: "yellow",
        yellow_gap_severity: "substantive",
        attempted_task_ids: ["task-a", "task-b", "task-c"],
      },
      completedAt: "2026-10-20T12:00:00.000Z",
      completionDate: "2026-10-20",
      currentTopicStatus: "active",
      lastFinalExamDate: "2026-12-15",
      nextSelectedTaskIds: ["retry-a", "retry-b"],
      nextEstimatedDurationMin: 10,
      idFactory: fixedIds,
    });

    expect(result.kind).toBe("retry");

    if (result.kind === "retry") {
      expect(result.next.kind).toBe("scheduled");

      if (result.next.kind === "scheduled") {
        expect(result.next.review_event.stage).toBe(2);
        expect(result.next.review_event.event_kind).toBe("retry");
      }
    }
  });

  it("advances a successful Stage 2 retry to Stage 3, not Stage 4", () => {
    const result = transitionReview({
      review: makeReview({
        stage: 2,
        event_kind: "retry",
        holds_stage: true,
      }),
      aggregation: {
        overall_result: "green",
        yellow_gap_severity: null,
        attempted_task_ids: ["task-a", "task-b", "task-c"],
      },
      completedAt: "2026-10-20T12:00:00.000Z",
      completionDate: "2026-10-20",
      currentTopicStatus: "relearn",
      lastFinalExamDate: "2026-12-15",
      nextSelectedTaskIds: ["next-a", "next-b"],
      nextEstimatedDurationMin: 10,
      idFactory: fixedIds,
    });

    expect(result.kind).toBe("advance");

    if (result.kind === "advance") {
      expect(result.next.kind).toBe("scheduled");

      if (result.next.kind === "scheduled") {
        expect(result.next.review_event.stage).toBe(3);
        expect(result.next.review_event.intended_due_date).toBe("2026-10-27");
      }
    }
  });

  it("sends a Red review to RELEARN without scheduling a retry prematurely", () => {
    const result = transitionReview({
      review: makeReview({ stage: 2 }),
      aggregation: {
        overall_result: "red",
        yellow_gap_severity: null,
        attempted_task_ids: ["task-a"],
      },
      completedAt: "2026-10-20T12:00:00.000Z",
      completionDate: "2026-10-20",
      currentTopicStatus: "active",
      lastFinalExamDate: "2026-12-15",
      nextSelectedTaskIds: ["retry-a", "retry-b"],
      nextEstimatedDurationMin: 10,
      idFactory: fixedIds,
    });

    expect(result.kind).toBe("relearn");

    if (result.kind === "relearn") {
      expect(result.topicStatus).toBe("relearn");
      expect(result.requiresCorrectiveWork).toBe(true);
      expect(result.next).toBeNull();
    }
  });

  it("does not schedule another retry after substantive Yellow on a retry until corrective work is ready", () => {
    const result = transitionReview({
      review: makeReview({
        stage: 2,
        event_kind: "retry",
        holds_stage: true,
      }),
      aggregation: {
        overall_result: "yellow",
        yellow_gap_severity: "substantive",
        attempted_task_ids: ["task-a", "task-b", "task-c"],
      },
      completedAt: "2026-10-20T12:00:00.000Z",
      completionDate: "2026-10-20",
      currentTopicStatus: "active",
      lastFinalExamDate: "2026-12-15",
      nextSelectedTaskIds: ["retry-a", "retry-b"],
      nextEstimatedDurationMin: 10,
      idFactory: fixedIds,
    });

    expect(result.kind).toBe("relearn");

    if (result.kind === "relearn") {
      expect(result.next).toBeNull();
      expect(result.requiresCorrectiveWork).toBe(true);
    }
  });
});
