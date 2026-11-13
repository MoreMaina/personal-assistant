import { describe, expect, it } from "vitest";
import { createEmptyStudyState } from "./storage";
import { deleteCourseStudyData } from "./courseDeletion";
import type { TaskEvent, Topic, RetrievalTask, WorkSession } from "./types";

const NOW = "2026-10-23T09:00:00.000Z";

function makeTopic(id: string, unitId: string): Topic {
  return {
    id,
    unit_id: unitId,
    topic_number: 1,
    title: `Topic ${id}`,
    order_index: 1,
    learning_objective: "Explain the core idea.",
    objective_type: "explain",
    prerequisite_topic_ids: [],
    status: "not_started",
    planned_consolidation_date: null,
    consolidation_estimated_duration_min: 0,
    initial_study_date: null,
    gate_passed: false,
    gate_result: "pending",
    weakness_flag: false,
    topic_importance: "medium",
  };
}

function makeTask(id: string, topicId: string): RetrievalTask {
  return {
    id,
    topic_id: topicId,
    prompt: "Define the term.",
    expected_answer_criteria: "A correct definition.",
    task_type: "definition",
    purpose: "gate",
    estimated_duration_min: 5,
    last_used_on: null,
    active: true,
  };
}

function makeAttempt(id: string, taskId: string): TaskEvent {
  return {
    id,
    logged_at: NOW,
    event_type: "attempt",
    subject_type: "retrieval_task",
    subject_id: taskId,
    review_event_id: "review-a",
    retrieval_task_id: taskId,
    gate_session_id: null,
    gate_selected_task_ids_snapshot: null,
    skill_demonstrated_without_hints: null,
    work_session_id: null,
    related_event_id: null,
    estimated_duration_min_at_event: 5,
    task_type_at_event: "definition",
    priority_at_event: 2,
    intended_due_date_at_event: "2026-10-23",
    current_due_date_at_event: "2026-10-23",
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
  };
}

describe("permanent course deletion", () => {
  it("removes the selected course's catalog, attempts, sessions and affected week metrics only", () => {
    const state = createEmptyStudyState({ now: NOW, timezone: "UTC" });
    state.courses.push(
      { id: "course-a", name: "Economics", code: "ECO", color: "#557C8A", created_at: NOW },
      { id: "course-b", name: "Mathematics", code: "MAT", color: "#71845C", created_at: NOW },
    );
    state.units.push(
      { id: "unit-a", course_id: "course-a", code: "A", name: "Unit A", order_index: 1 },
      { id: "unit-b", course_id: "course-b", code: "B", name: "Unit B", order_index: 1 },
    );
    state.topics.push(makeTopic("topic-a", "unit-a"), makeTopic("topic-b", "unit-b"));
    state.retrieval_tasks.push(makeTask("task-a", "topic-a"), makeTask("task-b", "topic-b"));
    state.task_events.push(makeAttempt("event-a", "task-a"), makeAttempt("event-b", "task-b"));
    const sessionA: WorkSession = {
      id: "session-a", subject_type: "initial_learning", subject_id: "topic-a",
      planned_duration_min: 30, actual_duration_min: 25, logged_at: NOW, notes: "Course A session",
    };
    const sessionB: WorkSession = {
      id: "session-b", subject_type: "initial_learning", subject_id: "topic-b",
      planned_duration_min: 30, actual_duration_min: 25, logged_at: NOW, notes: "Course B session",
    };
    state.work_sessions.push(sessionA, sessionB);

    const next = deleteCourseStudyData(state, "course-a");

    expect(next.courses.map((course) => course.id)).toEqual(["course-b"]);
    expect(next.units.map((unit) => unit.id)).toEqual(["unit-b"]);
    expect(next.topics.map((topic) => topic.id)).toEqual(["topic-b"]);
    expect(next.retrieval_tasks.map((task) => task.id)).toEqual(["task-b"]);
    expect(next.task_events.map((event) => event.id)).toEqual(["event-b"]);
    expect(next.work_sessions.map((session) => session.id)).toEqual(["session-b"]);
    expect(state.courses).toHaveLength(2);
    expect(state.task_events).toHaveLength(2);
  });

  it("removes a shared mixed-practice session when its frozen selection contains the deleted course", () => {
    const state = createEmptyStudyState({ now: NOW, timezone: "UTC" });
    state.courses.push(
      { id: "course-a", name: "Economics", code: "ECO", color: "#557C8A", created_at: NOW },
      { id: "course-b", name: "Mathematics", code: "MAT", color: "#71845C", created_at: NOW },
    );
    state.units.push(
      { id: "unit-a", course_id: "course-a", code: "A", name: "Unit A", order_index: 1 },
      { id: "unit-b", course_id: "course-b", code: "B", name: "Unit B", order_index: 1 },
    );
    state.topics.push(makeTopic("topic-a", "unit-a"), makeTopic("topic-b", "unit-b"));
    state.retrieval_tasks.push(makeTask("task-a", "topic-a"), makeTask("task-b", "topic-b"));

    const frozenSelection = ["task-a", "task-b"];
    const guidedA: TaskEvent = {
      ...makeAttempt("guided-a", "task-a"),
      event_type: "guided_practice_attempt",
      subject_type: "mixed_practice",
      subject_id: "mixed-session",
      review_event_id: null,
      actual_duration_min: null,
      result: "green",
      priority_at_event: null,
      intended_due_date_at_event: null,
      current_due_date_at_event: null,
      prompt_snapshot: "Question A",
      expected_answer_criteria_snapshot: "Answer A",
      response_text: "Response A",
      guided_practice_selected_task_ids_snapshot: frozenSelection,
    };
    const guidedB: TaskEvent = {
      ...guidedA,
      id: "guided-b",
      retrieval_task_id: "task-b",
      prompt_snapshot: "Question B",
      expected_answer_criteria_snapshot: "Answer B",
      response_text: "Response B",
    };
    const sharedSession: WorkSession = {
      id: "session-mixed",
      subject_type: "mixed_practice",
      subject_id: "mixed-session",
      planned_duration_min: 25,
      actual_duration_min: 25,
      logged_at: NOW,
      notes: "Mixed-practice session",
    };
    const workSessionEvent: TaskEvent = {
      ...makeAttempt("event-mixed-session", "task-b"),
      event_type: "work_session",
      subject_type: "mixed_practice",
      subject_id: "mixed-session",
      review_event_id: null,
      retrieval_task_id: null,
      actual_duration_min: 25,
      result: null,
      task_type_at_event: null,
      priority_at_event: null,
      intended_due_date_at_event: null,
      current_due_date_at_event: null,
      work_session_id: sharedSession.id,
    };
    state.task_events.push(guidedA, guidedB, workSessionEvent);
    state.work_sessions.push(sharedSession);

    const next = deleteCourseStudyData(state, "course-a");
    expect(next.task_events).toHaveLength(0);
    expect(next.work_sessions).toHaveLength(0);
    expect(next.courses.map((course) => course.id)).toEqual(["course-b"]);
  });

  it("rejects a course ID that does not exist", () => {
    const state = createEmptyStudyState({ now: NOW, timezone: "UTC" });
    expect(() => deleteCourseStudyData(state, "missing-course")).toThrow(/was not found/);
  });
});
