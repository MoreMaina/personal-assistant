
import { describe, expect, it } from "vitest";

import { getStudyMvpTasks } from "./today-data";
import { createEmptyStudyState } from "./studyMvp/storage";

import type {
  Course,
  RetrievalTask,
  ReviewEvent,
  Topic,
  Unit,
} from "./studyMvp/types";

const NOW = new Date("2026-10-22T22:30:00.000Z");

function makeTopic(): Topic {
  return {
    id: "topic-1",
    unit_id: "unit-1",
    topic_number: 1,
    title: "Binary Trees",
    order_index: 1,
    learning_objective: "Explain binary tree structures",
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
}

function makeRetrievalTask(
  id: string,
  topicId = "topic-1",
  duration = 5,
): RetrievalTask {
  return {
    id,
    topic_id: topicId,
    prompt: `Question ${id}`,
    expected_answer_criteria: `Expected answer ${id}`,
    task_type: "explanation",
    purpose: "review",
    estimated_duration_min: duration,
    last_used_on: null,
    active: true,
  };
}

function makeReviewEvent(
  id: string,
  overrides: Partial<ReviewEvent> = {},
): ReviewEvent {
  return {
    id,
    topic_id: "topic-1",
    stage: 1,
    event_kind: "scheduled_review",
    holds_stage: false,
    selected_task_ids: ["task-1", "task-2"],
    overall_result: null,
    yellow_gap_severity: null,
    source_review_id: null,
    intended_due_date: "2026-10-23",
    current_due_date: "2026-10-23",
    completed_at: null,
    priority_at_scheduling: 2,
    current_priority: 2,
    defer_count: 0,
    moved_from_sunday: false,
    status: "pending",
    ...overrides,
  };
}

function fixtureState() {
  const state = createEmptyStudyState({
    timezone: "Africa/Nairobi",
    now: NOW.toISOString(),
  });

  const course: Course = {
    id: "course-1",
    name: "Computer Science",
    code: "CS",
    color: "#23412f",
    created_at: NOW.toISOString(),
  };

  const unit: Unit = {
    id: "unit-1",
    course_id: "course-1",
    code: "UNIT-1",
    name: "Data Structures",
    order_index: 1,
  };

  state.courses.push(course);
  state.units.push(unit);
  state.topics.push(makeTopic());

  state.retrieval_tasks.push(
    makeRetrievalTask("task-1", "topic-1", 7),
    makeRetrievalTask("task-2", "topic-1", 8),
  );

  state.review_events.push(
    makeReviewEvent("review-1"),
  );

  return state;
}

describe("Today Study MVP data adapter", () => {
  it("builds a correctly labelled and timed review task", () => {
    const state = fixtureState();

    const tasks = getStudyMvpTasks(state, NOW);

    expect(tasks).toEqual([
      {
        id: "study-review-review-1",
        title: "Review — Binary Trees",
        unitName: "Computer Science · Data Structures",
        type: "study",
        durationMinutes: 15,
        priority: 2,
        dueAt: "2026-10-23",
      },
    ]);
  });

  it("uses the Study timezone when determining today's due date", () => {
    const state = fixtureState();

    // UTC date is October 22, but Nairobi date is October 23.
    const tasks = getStudyMvpTasks(state, NOW);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueAt).toBe("2026-10-23");
  });

    it("does not show Study reviews belonging to archived courses", () => {
    const state = fixtureState();

    state.courses[0].archived_at = NOW.toISOString();

    expect(getStudyMvpTasks(state, NOW)).toEqual([]);
  });

  it("includes eligible outstanding review statuses", () => {
    const state = fixtureState();

    state.review_events = [
      makeReviewEvent("pending"),
      makeReviewEvent("in-progress", {
        status: "in_progress",
      }),
      makeReviewEvent("deferred", {
        status: "deferred",
      }),
      makeReviewEvent("missed", {
        status: "missed",
      }),
      makeReviewEvent("future", {
        current_due_date: "2026-10-24",
      }),
      makeReviewEvent("completed", {
        status: "completed",
      }),
      makeReviewEvent("skipped", {
        status: "skipped",
      }),
      makeReviewEvent("retired", {
        status: "retired",
      }),
    ];

    const tasks = getStudyMvpTasks(state, NOW);

    expect(tasks.map((task) => task.id)).toEqual([
      "study-review-pending",
      "study-review-in-progress",
      "study-review-deferred",
      "study-review-missed",
    ]);
  });

  it("does not substitute questions when a review selection is invalid", () => {
    const state = fixtureState();

    state.retrieval_tasks.push(
      makeRetrievalTask("foreign-task", "topic-2", 5),
    );

    state.review_events = [
      makeReviewEvent("too-few", {
        selected_task_ids: ["task-1"],
      }),
      makeReviewEvent("missing-question", {
        selected_task_ids: ["missing-1", "missing-2"],
      }),
      makeReviewEvent("wrong-topic", {
        selected_task_ids: ["task-1", "foreign-task"],
      }),
    ];

    expect(getStudyMvpTasks(state, NOW)).toEqual([]);
  });

  it("does not generate a task for a review with a missing topic", () => {
    const state = fixtureState();

    state.topics = [];

    expect(getStudyMvpTasks(state, NOW)).toEqual([]);
  });

  it("does not generate a task when the topic's unit is missing", () => {
    const state = fixtureState();

    state.units = [];

    expect(getStudyMvpTasks(state, NOW)).toEqual([]);
  });

  it("does not generate a task when the unit's course is missing", () => {
    const state = fixtureState();

    state.courses = [];

    expect(getStudyMvpTasks(state, NOW)).toEqual([]);
  });
});
