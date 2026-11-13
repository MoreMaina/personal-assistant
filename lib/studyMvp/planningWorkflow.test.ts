import { describe, expect, it } from "vitest";

import { buildStudyDailyPlan } from "./dashboard";
import { appendDailyPlanSnapshot } from "./dailyPlanHistory";
import { applyDailyPlanDecisions } from "./planningWorkflow";
import { createEmptyStudyState } from "./storage";
import { applyReviewAttempt } from "./workflow";

import type {
  RetrievalTask,
  ReviewEvent,
  StudyMvpState,
  Topic,
} from "./types";

function fixtureState(deferCount = 0): StudyMvpState {
  const empty = createEmptyStudyState({
    timezone: "Africa/Nairobi",
    now: "2026-10-23T07:00:00.000Z",
  });

  const topic: Topic = {
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
  };

  const task = (id: string): RetrievalTask => ({
    id,
    topic_id: topic.id,
    prompt: `Prompt ${id}`,
    expected_answer_criteria: `Criteria ${id}`,
    task_type: "definition",
    purpose: "review",
    estimated_duration_min: 5,
    last_used_on: null,
    active: true,
  });

  const review: ReviewEvent = {
    id: "review-1",
    topic_id: topic.id,
    stage: 2,
    event_kind: "scheduled_review",
    holds_stage: false,
    selected_task_ids: ["task-a", "task-b", "task-c"],
    overall_result: null,
    yellow_gap_severity: null,
    source_review_id: "review-before",
    intended_due_date: "2026-10-22",
    current_due_date: "2026-10-22",
    completed_at: null,
    priority_at_scheduling: 2,
    current_priority: 2,
    defer_count: deferCount,
    moved_from_sunday: false,
    status: "pending",
  };

  return {
    ...empty,
    topics: [topic],
    retrieval_tasks: [task("task-a"), task("task-b"), task("task-c")],
    review_events: [review],
  };
}

describe("Study MVP daily planning decision workflow", () => {

  it("saves allocated review work without recording actual completion", () => {
    const state = fixtureState();
    const plan = buildStudyDailyPlan(state, "2026-10-23").plan;
    const reviewPlan = plan.items.find((item) => item.kind === "review");

    expect(plan.can_finalize).toBe(true);
    expect(reviewPlan).toBeDefined();
    expect(reviewPlan!.allocated_question_ids.length).toBeGreaterThan(0);

    const applied = applyDailyPlanDecisions(state, plan, {
      loggedAt: "2026-10-23T10:00:00.000Z",
    });
    const saved = appendDailyPlanSnapshot(
      applied.state,
      plan,
      "2026-10-23T10:00:00.000Z",
    );

    const actualEvidenceTypes = ["attempt", "gate_attempt", "work_session"];
    const actualEvidence = (studyState: StudyMvpState) =>
      studyState.task_events.filter((event) =>
        actualEvidenceTypes.includes(event.event_type),
      );

    expect(actualEvidence(saved.state)).toEqual(actualEvidence(state));
    expect(saved.state.work_sessions).toEqual(state.work_sessions);
    expect(saved.state.review_events).toEqual(state.review_events);
    expect(saved.state.daily_plan_history).toHaveLength(1);
    expect(
      saved.snapshot.plan.items.find((item) => item.kind === "review")
        ?.allocated_question_ids,
    ).toEqual(reviewPlan!.allocated_question_ids);
  });


  it("records a deferral once and updates the operational due date", () => {
    const state = fixtureState();
    const plan = buildStudyDailyPlan(state, "2026-10-23", {
      explicitDecisions: {
        "review:review-1": {
          disposition: "DEFER",
          reason: "Assignment due today takes priority.",
        },
      },
    }).plan;

    expect(plan.can_finalize).toBe(true);

    const first = applyDailyPlanDecisions(state, plan, {
      loggedAt: "2026-10-23T10:00:00.000Z",
    });

    expect(first.duplicate).toBe(false);
    expect(first.emittedEvents).toHaveLength(1);
    expect(first.emittedEvents[0].event_type).toBe("defer");
    expect(first.state.review_events[0].defer_count).toBe(1);
    expect(first.state.review_events[0].status).toBe("deferred");
    expect(first.state.review_events[0].current_due_date).toBe("2026-10-24");

    const replay = applyDailyPlanDecisions(first.state, plan, {
      loggedAt: "2026-10-23T10:00:00.000Z",
    });

    expect(replay.duplicate).toBe(true);
    expect(replay.emittedEvents).toHaveLength(0);
    expect(replay.state).toBe(first.state);
    expect(replay.state.review_events[0].defer_count).toBe(1);
    expect(replay.state.task_events).toHaveLength(1);
  });

  it("refuses to save a plan with an unresolved third-deferral decision", () => {
    const state = fixtureState(3);
    const plan = buildStudyDailyPlan(state, "2026-10-23").plan;

    expect(plan.can_finalize).toBe(false);
    expect(plan.unresolved_decisions).toContain("review:review-1");
    expect(() =>
      applyDailyPlanDecisions(state, plan),
    ).toThrow(/Resolve these planning decisions/);
    expect(state.task_events).toHaveLength(0);
  });

  it("accepts a forced split decision after three deferrals", () => {
    const state = fixtureState(3);
    const plan = buildStudyDailyPlan(state, "2026-10-23", {
      forcedDecisions: {
        "review:review-1": {
          disposition: "split",
          reason: "Complete the remaining questions across two sessions.",
        },
      },
    }).plan;

    expect(plan.can_finalize).toBe(true);

    const result = applyDailyPlanDecisions(state, plan, {
      loggedAt: "2026-10-23T10:00:00.000Z",
    });

    expect(result.emittedEvents).toHaveLength(1);
    expect(result.emittedEvents[0].event_type).toBe("forced_disposition");
    expect(result.emittedEvents[0].disposition).toBe("split");
    expect(result.state.review_events[0].defer_count).toBe(3);
  });

  it("requires a reason and re-entry condition before allowing SKIP", () => {
    const state = fixtureState();

    expect(() =>
      buildStudyDailyPlan(state, "2026-10-23", {
        explicitDecisions: {
          "review:review-1": {
            disposition: "SKIP",
            reason: " ",
            re_entry_condition: "upcoming_exam",
          },
        },
      }),
    ).toThrow(/requires a reason/);

    expect(() =>
      buildStudyDailyPlan(state, "2026-10-23", {
        explicitDecisions: {
          "review:review-1": {
            disposition: "SKIP",
            reason: "No longer relevant to the current learning goal.",
          },
        },
      }),
    ).toThrow(/requires a re-entry condition/);
  });

  it("records an explicit skip reason and re-entry condition once", () => {
    const state = fixtureState();
    const plan = buildStudyDailyPlan(state, "2026-10-23", {
      explicitDecisions: {
        "review:review-1": {
          disposition: "SKIP",
          reason: "This review is no longer relevant to the current goal.",
          re_entry_condition: "upcoming_exam",
        },
      },
    }).plan;

    expect(plan.can_finalize).toBe(true);

    const first = applyDailyPlanDecisions(state, plan, {
      loggedAt: "2026-10-23T10:00:00.000Z",
    });

    expect(first.emittedEvents).toHaveLength(1);
    expect(first.emittedEvents[0].event_type).toBe("skip");
    expect(first.emittedEvents[0].reason).toBe(
      "This review is no longer relevant to the current goal.",
    );
    expect(first.emittedEvents[0].re_entry_condition).toBe(
      "upcoming_exam",
    );
    expect(first.state.review_events[0].status).toBe("skipped");

    const replay = applyDailyPlanDecisions(first.state, plan, {
      loggedAt: "2026-10-23T10:00:00.000Z",
    });

    expect(replay.duplicate).toBe(true);
    expect(replay.emittedEvents).toHaveLength(0);
    expect(replay.state).toBe(first.state);
    expect(replay.state.task_events).toHaveLength(1);
  });

  it("allows a previously deferred review to resume an attempt", () => {
    const state = fixtureState();
    state.review_events[0] = {
      ...state.review_events[0],
      status: "deferred",
    };

    const result = applyReviewAttempt(state, {
      reviewId: "review-1",
      taskId: "task-a",
      result: "green",
      actualDurationMin: 4,
      loggedAt: "2026-10-24T08:00:00.000Z",
      eventId: "deferred-review-attempt",
    });

    expect(result.outcome).toBe("in_progress");
    expect(
      result.state.task_events.some(
        (event) => event.id === "deferred-review-attempt",
      ),
    ).toBe(true);
    expect(result.state.review_events[0].status).toBe("in_progress");
  });
});
