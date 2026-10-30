import { describe, expect, it } from "vitest";
import {
  getDefaultGateTaskIds,
  buildDailyPlannerTasks,
  buildStudyDailyPlan,
} from "./dashboard";
import { createEmptyStudyState } from "./storage";
import type {
  RetrievalTask,
  ReviewEvent,
  StudyMvpState,
  Topic,
  WorkSession,
} from "./types";

function fixtureState(): StudyMvpState {
  const state = createEmptyStudyState({
    timezone: "Africa/Nairobi",
    now: "2026-10-23T07:00:00.000Z",
  });

    state.courses.push({
    id: "course-1",
    name: "Computer Science",
    code: "CS",
    color: "#23412f",
    created_at: "2026-10-23T07:00:00.000Z",
  });

  state.units.push({
    id: "unit-1",
    course_id: "course-1",
    code: "UNIT-1",
    name: "Unit one",
    order_index: 1,
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
    topic_id: "topic-1",
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
    topic_id: "topic-1",
    stage: 1,
    event_kind: "scheduled_review",
    holds_stage: false,
    selected_task_ids: ["task-a", "task-b", "task-c"],
    overall_result: null,
    yellow_gap_severity: null,
    source_review_id: null,
    intended_due_date: "2026-10-22",
    current_due_date: "2026-10-22",
    completed_at: null,
    priority_at_scheduling: 2,
    current_priority: 2,
    defer_count: 0,
    moved_from_sunday: false,
    status: "in_progress",
  };

  return {
    ...state,
    topics: [topic],
    retrieval_tasks: [task("task-a"), task("task-b"), task("task-c")],
    review_events: [review],
  };
}

describe("Study MVP dashboard planner adapter", () => {
  it("keeps the review's fixed selection and returns only unanswered questions", () => {
    const state = fixtureState();

    state.task_events.push({
      id: "attempt-a",
      logged_at: "2026-10-22T08:00:00.000Z",
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
      intended_due_date_at_event: "2026-10-22",
      current_due_date_at_event: "2026-10-22",
      actual_duration_min: 4,
      result: "green",
      yellow_gap_severity: null,
      disposition: null,
      reason: null,
      critical_error_flag: false,
      defer_count_at_event: 0,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
    });

    const built = buildStudyDailyPlan(state, "2026-10-23");
    const item = built.plan.items.find(
      (candidate) => candidate.id === "review:review-1",
    );

    expect(item?.kind).toBe("review");
    expect(item?.selected_question_ids).toEqual([
      "task-a",
      "task-b",
      "task-c",
    ]);
    // The original selection remains immutable; today's plan allocates
    // only the unanswered questions. "remaining" means unallocated work.
    expect(item?.allocated_question_ids).toEqual([
      "task-b",
      "task-c",
    ]);
    expect(item?.remaining_question_ids).toEqual([]);
    expect(built.omittedReviewIds).toEqual([]);
  });

  it("does not include a review before its current due date", () => {
    const state = fixtureState();
    state.review_events[0] = {
      ...state.review_events[0],
      intended_due_date: "2026-10-25",
      current_due_date: "2026-10-25",
    };

    const built = buildDailyPlannerTasks(state, "2026-10-23");

    expect(built.tasks.some((item) => item.kind === "review")).toBe(false);
    expect(built.omittedReviewIds).toEqual([]);
  });

    it("excludes reviews, gates, and consolidation from archived courses", () => {
    const state = fixtureState();

    state.topics[0] = {
      ...state.topics[0],
      status: "in_learning",
      gate_passed: false,
      gate_result: "pending",
      planned_consolidation_date: "2026-10-22",
    };

    state.courses[0].archived_at =
      "2026-10-23T07:00:00.000Z";

    const built = buildDailyPlannerTasks(
      state,
      "2026-10-23",
    );

    expect(
      built.tasks.some((item) =>
        ["review", "gate", "topic_consolidation"].includes(item.kind),
      ),
    ).toBe(false);
  });

  it("excludes initial learning and assignments from archived courses", () => {
    const state = fixtureState();

    state.topics[0] = {
      ...state.topics[0],
      status: "not_started",
      gate_passed: false,
      gate_result: "pending",
      planned_consolidation_date: null,
    };

    state.assignments.push({
      id: "assignment-1",
      course_id: "course-1",
      title: "Test assignment",
      due_date: "2026-10-23",
      estimated_duration_min: 60,
      remaining_min: 60,
      max_session_min: 30,
      importance: "high",
      status: "pending",
    });

    state.courses[0].archived_at =
      "2026-10-23T07:00:00.000Z";

    const built = buildDailyPlannerTasks(
      state,
      "2026-10-23",
    );

    expect(
      built.tasks.some((item) =>
        ["initial_learning", "assignment"].includes(item.kind),
      ),
    ).toBe(false);
  });

  it("counts only topic-consolidation WorkSessions for consolidation progress", () => {
    const state = fixtureState();
    state.topics[0] = {
      ...state.topics[0],
      status: "in_learning",
      planned_consolidation_date: "2026-10-22",
      consolidation_estimated_duration_min: 60,
    };

    const session: WorkSession = {
      id: "consolidation-work",
      subject_type: "topic_consolidation",
      subject_id: "topic-1",
      planned_duration_min: 30,
      actual_duration_min: 20,
      logged_at: "2026-10-22T08:00:00.000Z",
      notes: "Partial consolidation",
    };

    state.work_sessions.push(session);
    state.work_sessions.push({
      ...session,
      id: "corrective-work",
      subject_type: "corrective",
      actual_duration_min: 15,
    });

    const built = buildDailyPlannerTasks(state, "2026-10-23");
    const item = built.tasks.find(
      (candidate) => candidate.kind === "topic_consolidation",
    );

    expect(item?.kind).toBe("topic_consolidation");
    if (item?.kind !== "topic_consolidation") {
      throw new Error("Expected a consolidation task");
    }
    expect(item.loggedConsolidationMinutes).toBe(20);
  });

  it("adds an eligible in-learning topic gate to the daily plan", () => {
    const state = fixtureState();
    state.topics[0] = {
      ...state.topics[0],
      status: "in_learning",
      gate_passed: false,
      gate_result: "pending",
      planned_consolidation_date: "2026-10-22",
    };

    const built = buildStudyDailyPlan(state, "2026-10-23");
    const gate = built.plan.items.find(
      (item) => item.id === "gate:topic-1",
    );

    expect(gate?.kind).toBe("gate");
    expect(gate?.selected_question_ids).toEqual([
      "task-a",
      "task-b",
      "task-c",
    ]);
    expect(gate?.allocated_question_ids).toHaveLength(3);
    expect(gate?.category).toBe("PROTECTED");
    expect(built.omittedGateTopicIds).toEqual([]);
  });

  it("does not schedule a gate before its planned date", () => {
    const state = fixtureState();
    state.topics[0] = {
      ...state.topics[0],
      status: "in_learning",
      gate_passed: false,
      gate_result: "pending",
      planned_consolidation_date: "2026-10-25",
    };

    const built = buildDailyPlannerTasks(state, "2026-10-23");

    expect(built.tasks.some((task) => task.kind === "gate")).toBe(false);
    expect(built.omittedGateTopicIds).toEqual([]);
  });

  it("does not schedule a topic whose gate has passed despite inconsistent status flags", () => {
    const passStates: Array<{
      gate_passed: boolean;
      gate_result: Topic["gate_result"];
    }> = [
      { gate_passed: true, gate_result: "pending" },
      { gate_passed: false, gate_result: "passed" },
      { gate_passed: false, gate_result: "skill_based_passed" },
    ];

    for (const passState of passStates) {
      const state = fixtureState();
      state.topics[0] = {
        ...state.topics[0],
        status: "in_learning",
        planned_consolidation_date: "2026-10-22",
        ...passState,
      };

      const built = buildDailyPlannerTasks(state, "2026-10-23");

      expect(built.tasks.some((task) => task.kind === "gate")).toBe(false);
      expect(built.omittedGateTopicIds).toEqual([]);
    }
  });

  it("resumes an unfinished gate with the original selected questions", () => {
    const state = fixtureState();
    state.topics[0] = {
      ...state.topics[0],
      status: "in_learning",
      gate_passed: false,
      gate_result: "pending",
      planned_consolidation_date: "2026-10-22",
    };

    state.task_events.push({
      id: "gate-attempt-a",
      logged_at: "2026-10-22T08:00:00.000Z",
      event_type: "gate_attempt",
      subject_type: "gate_attempt",
      subject_id: "task-a",
      review_event_id: null,
      retrieval_task_id: "task-a",
      gate_session_id: "gate-session-1",
      gate_selected_task_ids_snapshot: [
        "task-a",
        "task-b",
        "task-c",
      ],
      skill_demonstrated_without_hints: false,
      work_session_id: null,
      related_event_id: null,
      estimated_duration_min_at_event: 5,
      task_type_at_event: "definition",
      priority_at_event: null,
      intended_due_date_at_event: null,
      current_due_date_at_event: null,
      actual_duration_min: 4,
      result: "green",
      yellow_gap_severity: null,
      disposition: null,
      reason: null,
      critical_error_flag: false,
      defer_count_at_event: null,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
    });

    const built = buildDailyPlannerTasks(state, "2026-10-23");
    const gate = built.tasks.find((task) => task.kind === "gate");

    expect(gate?.kind).toBe("gate");
    if (gate?.kind !== "gate") {
      throw new Error("Expected an in-learning gate task");
    }

    expect(gate.selectedQuestions.map((question) => question.id)).toEqual([
      "task-a",
      "task-b",
      "task-c",
    ]);
    expect(gate.remainingQuestionIds).toEqual([
      "task-b",
      "task-c",
    ]);
    expect(built.omittedGateTopicIds).toEqual([]);
  });

  it("does not schedule an unfinished gate when an original question is inactive", () => {
    const state = fixtureState();
    state.topics[0] = {
      ...state.topics[0],
      status: "in_learning",
      gate_result: "pending",
      gate_passed: false,
      planned_consolidation_date: "2026-10-22",
    };
    state.retrieval_tasks[1] = {
      ...state.retrieval_tasks[1],
      active: false,
    };

    state.task_events.push({
      id: "gate-attempt-inactive-question",
      logged_at: "2026-10-22T08:00:00.000Z",
      event_type: "gate_attempt",
      subject_type: "gate_attempt",
      subject_id: "task-a",
      review_event_id: null,
      retrieval_task_id: "task-a",
      gate_session_id: "gate-session-inactive",
      gate_selected_task_ids_snapshot: [
        "task-a",
        "task-b",
        "task-c",
      ],
      skill_demonstrated_without_hints: false,
      work_session_id: null,
      related_event_id: null,
      estimated_duration_min_at_event: 5,
      task_type_at_event: "definition",
      priority_at_event: null,
      intended_due_date_at_event: null,
      current_due_date_at_event: null,
      actual_duration_min: 4,
      result: "green",
      yellow_gap_severity: null,
      disposition: null,
      reason: null,
      critical_error_flag: false,
      defer_count_at_event: null,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
    });

    const built = buildDailyPlannerTasks(state, "2026-10-23");

    expect(built.tasks.some((task) => task.kind === "gate")).toBe(false);
    expect(built.omittedGateTopicIds).toEqual(["topic-1"]);
  });

  it("does not silently schedule relearn topics as new-topic gates", () => {
    const state = fixtureState();
    state.topics[0] = {
      ...state.topics[0],
      status: "relearn",
      gate_result: "failed",
      planned_consolidation_date: "2026-10-22",
    };

    const built = buildDailyPlannerTasks(state, "2026-10-23");

    expect(built.tasks.some((task) => task.kind === "gate")).toBe(false);
    expect(built.omittedGateTopicIds).toEqual([]);
  });

  it("flags an eligible topic that has fewer than three active gate tasks", () => {
    const state = fixtureState();
    state.topics[0] = {
      ...state.topics[0],
      status: "in_learning",
      gate_passed: false,
      gate_result: "pending",
      planned_consolidation_date: "2026-10-22",
    };
    state.retrieval_tasks = state.retrieval_tasks.slice(0, 2);

    const built = buildDailyPlannerTasks(state, "2026-10-23");

    expect(built.tasks.some((task) => task.kind === "gate")).toBe(false);
    expect(built.omittedGateTopicIds).toEqual(["topic-1"]);
  });

  it("omits a due review rather than substituting questions if its selection is invalid", () => {
    const state = fixtureState();
    state.retrieval_tasks = [state.retrieval_tasks[0]];

    const built = buildDailyPlannerTasks(state, "2026-10-23");

    expect(built.omittedReviewIds).toEqual(["review-1"]);
    expect(built.tasks.some((item) => item.kind === "review")).toBe(false);
  });
});


describe("default gate task selection", () => {
  it("prefers three or more active gate-purpose questions", () => {
    const candidate = (
      id: string,
      purpose: RetrievalTask["purpose"],
    ): RetrievalTask => ({
      id,
      topic_id: "topic-1",
      prompt: `Prompt ${id}`,
      expected_answer_criteria: `Criteria ${id}`,
      task_type: "definition",
      purpose,
      estimated_duration_min: 5,
      last_used_on: null,
      active: true,
    });

    const candidates = [
      candidate("review-a", "review"),
      candidate("review-b", "review"),
      candidate("review-c", "review"),
      candidate("gate-a", "gate"),
      candidate("gate-b", "gate"),
      candidate("gate-c", "gate"),
    ];

    expect(getDefaultGateTaskIds(candidates)).toEqual([
      "gate-a",
      "gate-b",
      "gate-c",
    ]);

    // With fewer than three gate-purpose questions, preserve the existing
    // fallback to the first three active questions in topic order.
    expect(getDefaultGateTaskIds(candidates.slice(0, 5))).toEqual([
      "review-a",
      "review-b",
      "review-c",
    ]);
  });
});


describe("weekday mixed practice and Saturday sampler scheduling", () => {
  it("uses the configured mixed-practice target on Monday-Wednesday and Thursday-Friday", () => {
    const cases = [
      { date: "2026-10-26", target: 37 }, // Monday
      { date: "2026-10-28", target: 37 }, // Wednesday
      { date: "2026-10-29", target: 22 }, // Thursday
      { date: "2026-10-30", target: 22 }, // Friday
    ];

    for (const testCase of cases) {
      const state = fixtureState();
      state.settings.mixed_practice_target_mon_wed = 37;
      state.settings.mixed_practice_target_thu_fri = 22;

      const mixed = buildDailyPlannerTasks(state, testCase.date).tasks.find(
        (task) => task.kind === "mixed_practice",
      );

      expect(mixed).toBeDefined();
      if (mixed?.kind !== "mixed_practice") {
        throw new Error(`Mixed practice was not built for ${testCase.date}.`);
      }
      expect(mixed.targetDurationMin).toBe(testCase.target);
    }
  });

  it("schedules Saturday sampler without mixed practice and schedules neither on Sunday", () => {
    const saturdayTasks = buildDailyPlannerTasks(
      fixtureState(),
      "2026-10-24",
    ).tasks;

    expect(
      saturdayTasks.some((task) => task.kind === "mixed_practice"),
    ).toBe(false);

    expect(
      saturdayTasks.find((task) => task.kind === "sampler"),
    ).toMatchObject({
      kind: "sampler",
      due: true,
      targetDurationMin: 80,
      analysisMaxMin: 10,
    });

    const sundayTasks = buildDailyPlannerTasks(
      fixtureState(),
      "2026-10-25",
    ).tasks;

    expect(
      sundayTasks.some(
        (task) => task.kind === "mixed_practice" || task.kind === "sampler",
      ),
    ).toBe(false);
  });
});
