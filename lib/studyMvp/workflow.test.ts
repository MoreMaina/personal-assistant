import { describe, expect, it } from "vitest";
import { applyGateAttempt, applyReviewAttempt, pauseIncompleteReview, startTopicLearning } from "./workflow";
import { createEmptyStudyState } from "./storage";
import type { RetrievalTask, ReviewEvent, StudyMvpState, Topic } from "./types";

function makeIdFactory() {
  let index = 0;
  return (prefix: string) => `${prefix}_${++index}`;
}

function makeTask(
  id: string,
  topicId = "topic-1",
  purpose: RetrievalTask["purpose"] = "review",
): RetrievalTask {
  return {
    id,
    topic_id: topicId,
    prompt: `Prompt ${id}`,
    expected_answer_criteria: `Criteria ${id}`,
    task_type: "definition",
    purpose,
    estimated_duration_min: 5,
    last_used_on: null,
    active: true,
  };
}

function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: "topic-1",
    unit_id: "unit-1",
    topic_number: 1,
    title: "Topic one",
    order_index: 1,
    learning_objective: "Explain the topic",
    objective_type: "explain",
    prerequisite_topic_ids: [],
    status: "active",
    planned_consolidation_date: null,
    consolidation_estimated_duration_min: 30,
    initial_study_date: "2026-10-19",
    gate_passed: true,
    gate_result: "passed",
    weakness_flag: false,
    topic_importance: "medium",
    ...overrides,
  };
}

function makeReview(overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    id: "review-1",
    topic_id: "topic-1",
    stage: 2,
    event_kind: "scheduled_review",
    holds_stage: false,
    selected_task_ids: ["task-a", "task-b", "task-c"],
    overall_result: null,
    yellow_gap_severity: null,
    source_review_id: "review-before",
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

function makeState(options: { review?: ReviewEvent; includeReview?: boolean; topic?: Topic; taskPurpose?: RetrievalTask["purpose"] } = {}): StudyMvpState {
  const empty = createEmptyStudyState({ timezone: "Africa/Nairobi", now: "2026-10-20T07:00:00.000Z" });
  const taskPurpose = options.taskPurpose ?? "review";
  return {
    ...empty,
    topics: [options.topic ?? makeTopic()],
    retrieval_tasks: [
      makeTask("task-a", "topic-1", taskPurpose),
      makeTask("task-b", "topic-1", taskPurpose),
      makeTask("task-c", "topic-1", taskPurpose),
    ],
    review_events: options.includeReview === false ? [] : [options.review ?? makeReview()],
  };
}

function reviewAttempt(
  state: StudyMvpState,
  taskId: string,
  result: "green" | "yellow" | "red" = "green",
  overrides: Partial<Parameters<typeof applyReviewAttempt>[1]> = {},
) {
  return applyReviewAttempt(state, {
    reviewId: "review-1",
    taskId,
    result,
    actualDurationMin: 4,
    loggedAt: "2026-10-20T09:00:00.000Z",
    ...(result === "yellow" ? { yellowGapSeverity: "minor" as const } : {}),
    nextSelectedTaskIds: ["task-a", "task-b"],
    nextEstimatedDurationMin: 10,
    eventId: `attempt-${taskId}`,
    idFactory: makeIdFactory(),
    ...overrides,
  });
}

describe("Study workflow: review attempts", () => {
  it("keeps an unfinished review's identity, stage, and selected tasks", () => {
    const initial = makeState();
    const result = reviewAttempt(initial, "task-a");
    const review = result.state.review_events[0];

    expect(result.outcome).toBe("in_progress");
    expect(review.id).toBe("review-1");
    expect(review.stage).toBe(2);
    expect(review.selected_task_ids).toEqual(["task-a", "task-b", "task-c"]);
    expect(review.status).toBe("in_progress");
    expect(result.state.task_events).toHaveLength(1);
  });

  it("pauses incomplete work to the next study day without replacing the event", () => {
    const first = reviewAttempt(makeState(), "task-a");
    const paused = pauseIncompleteReview(first.state, {
      reviewId: "review-1",
      pausedAt: "2026-10-24T16:00:00.000Z",
    });
    const review = paused.review_events[0];

    expect(review.id).toBe("review-1");
    expect(review.stage).toBe(2);
    expect(review.selected_task_ids).toEqual(["task-a", "task-b", "task-c"]);
    expect(review.current_due_date).toBe("2026-10-26");
    expect(review.overall_result).toBe("incomplete");
    expect(paused.task_events).toHaveLength(1);
  });

  it("ends immediately on Red and requires relearning", () => {
    const result = reviewAttempt(makeState(), "task-a", "red");
    const review = result.state.review_events[0];

    expect(result.outcome).toBe("relearn");
    expect(review.status).toBe("completed");
    expect(review.overall_result).toBe("red");
    expect(result.state.topics[0].status).toBe("relearn");
    expect(result.state.review_events).toHaveLength(1);
    expect(result.state.task_events.map((event) => event.event_type)).toEqual(["attempt", "relearn"]);
  });

  it("advances exactly one stage only after all selected tasks are attempted", () => {
    let state = makeState();
    state = reviewAttempt(state, "task-a").state;
    state = reviewAttempt(state, "task-b").state;
    const result = reviewAttempt(state, "task-c");

    expect(result.outcome).toBe("advance");
    expect(result.state.review_events[0].stage).toBe(2);
    expect(result.state.review_events[0].overall_result).toBe("green");
    expect(result.state.review_events[1].stage).toBe(3);
    expect(result.state.review_events[1].event_kind).toBe("scheduled_review");
    expect(result.state.review_events[1].intended_due_date).toBe("2026-10-27");
    expect(result.state.task_events.filter((event) => event.event_type === "review_scheduled")).toHaveLength(1);
  });

  it("schedules a substantive Yellow retry at the held stage", () => {
    let state = makeState();
    state = reviewAttempt(state, "task-a").state;
    state = reviewAttempt(state, "task-b").state;
    const result = reviewAttempt(state, "task-c", "yellow", { yellowGapSeverity: "substantive" });

    expect(result.outcome).toBe("retry");
    expect(result.state.review_events[1].stage).toBe(2);
    expect(result.state.review_events[1].event_kind).toBe("retry");
    expect(result.state.review_events[1].holds_stage).toBe(true);
    expect(result.state.review_events[1].source_review_id).toBe("review-1");
  });

  it("does not allow a duplicate attempt for the same task under another event ID", () => {
    const first = reviewAttempt(makeState(), "task-a");
    expect(() => reviewAttempt(first.state, "task-a", "green", { eventId: "another-event" })).toThrow(/already has an attempt/);
  });

  it("rejects a task that was not in the preselected review set", () => {
    const state = makeState();
    state.retrieval_tasks.push(makeTask("task-d"));
    expect(() => reviewAttempt(state, "task-d")).toThrow(/was not selected/);
  });

  it("requires a minor/substantive severity for Yellow", () => {
    expect(() => reviewAttempt(makeState(), "task-a", "yellow", { yellowGapSeverity: null })).toThrow(/classified/);
  });
});

describe("Study workflow: topic gate", () => {
  function gateState(): StudyMvpState {
    return makeState({
      includeReview: false,
      topic: makeTopic({ status: "in_learning", gate_passed: false, gate_result: "pending", initial_study_date: null }),
      taskPurpose: "gate",
    });
  }

  function gateAttempt(state: StudyMvpState, taskId: string, result: "green" | "yellow" | "red" = "green", overrides: Partial<Parameters<typeof applyGateAttempt>[1]> = {}) {
    return applyGateAttempt(state, {
      topicId: "topic-1",
      gateSessionId: "gate-session-1",
      selectedTaskIds: ["task-a", "task-b", "task-c"],
      retrievalTaskId: taskId,
      result,
      actualDurationMin: 5,
      loggedAt: "2026-10-20T09:00:00.000Z",
      eventId: `gate-${overrides.gateSessionId ?? "gate-session-1"}-${taskId}`,
      idFactory: makeIdFactory(),
      ...overrides,
    });
  }

  it("requires an explicit Start learning transition before a gate attempt", () => {
    let state = gateState();
    state.topics[0] = {
      ...state.topics[0],
      status: "not_started",
    };

    expect(() => gateAttempt(state, "task-a")).toThrow(/start learning/i);

    state = startTopicLearning(state, "topic-1");
    expect(state.topics[0].status).toBe("in_learning");
    expect(gateAttempt(state, "task-a").completed).toBe(false);
  });

  it("blocks a gate before its planned date", () => {
    const state = gateState();
    state.topics[0] = {
      ...state.topics[0],
      planned_consolidation_date: "2026-10-21",
    };

    expect(() => gateAttempt(state, "task-a")).toThrow(/planned date/i);
  });

  it("keeps the gate pending until all selected tasks have attempts", () => {
    const result = gateAttempt(gateState(), "task-a");
    expect(result.completed).toBe(false);
    expect(result.gate.gate_result).toBe("pending");
    expect(result.state.topics[0].status).toBe("in_learning");
    expect(result.state.review_events).toHaveLength(0);
  });

  it("passes the gate and schedules Review 1 from the actual local pass date", () => {
    let state = gateAttempt(gateState(), "task-a").state;
    state = gateAttempt(state, "task-b").state;
    const result = gateAttempt(state, "task-c", "green", {
      nextReview: { selectedTaskIds: ["task-a", "task-b"], estimatedDurationMin: 10, priority: 2 },
    });

    expect(result.completed).toBe(true);
    expect(result.gate.gate_passed).toBe(true);
    expect(result.state.topics[0].gate_result).toBe("passed");
    expect(result.state.topics[0].initial_study_date).toBe("2026-10-20");
    expect(result.state.review_events).toHaveLength(1);
    expect(result.state.review_events[0].stage).toBe(1);
    expect(result.state.review_events[0].intended_due_date).toBe("2026-10-21");
    expect(result.state.task_events.filter((event) => event.event_type === "review_scheduled")).toHaveLength(1);
  });

  it("rejects changing the gate task snapshot mid-session", () => {
    const initial = gateState();
    initial.retrieval_tasks.push(makeTask("task-d", "topic-1", "gate"));
    const first = gateAttempt(initial, "task-a");
    expect(() => gateAttempt(first.state, "task-b", "green", {
      selectedTaskIds: ["task-b", "task-c", "task-d"],
    })).toThrow(/cannot change its selected task set/);
  });

  it("requires explicit corrective readiness before starting a new session after a failed gate", () => {
    const failed = gateAttempt(gateState(), "task-a", "red", { criticalErrorFlag: true });
    expect(failed.gate.complete).toBe(true);
    expect(failed.gate.gate_passed).toBe(false);
    expect(failed.state.topics[0].status).toBe("relearn");
    const nextSession = {
      topicId: "topic-1",
      gateSessionId: "gate-session-2",
      selectedTaskIds: ["task-a", "task-b", "task-c"],
      retrievalTaskId: "task-a",
      result: "green" as const,
      actualDurationMin: 5,
      loggedAt: "2026-10-21T09:00:00.000Z",
      eventId: "gate-session-2-task-a",
      idFactory: makeIdFactory(),
    };
    expect(() => applyGateAttempt(failed.state, nextSession)).toThrow(/explicitly marked ready/);
    expect(() => applyGateAttempt(failed.state, { ...nextSession, correctiveWorkReady: true })).not.toThrow();
  });

  it("rejects gate sessions with fewer than three selected tasks", () => {
    expect(() => gateAttempt(gateState(), "task-a", "green", {
      selectedTaskIds: ["task-a", "task-b"],
    })).toThrow(/at least three/);
  });
});
