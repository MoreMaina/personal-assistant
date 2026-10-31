import { describe, expect, it } from "vitest";

import { createEmptyStudyState } from "./storage";
import { findStudyReferenceIssues } from "./integrityDiagnostics";

import type {
  Assignment,
  Course,
  Exam,
  ReviewEvent,
  RetrievalTask,
  Topic,
  Unit,
} from "./types";

const NOW = "2026-10-31T09:00:00.000Z";

function makeCourse(
  id = "course-1",
): Course {
  return {
    id,
    name: "Computer Science",
    code: "CS",
    color: "#23412f",
    created_at: NOW,
  };
}

function makeUnit(
  id = "unit-1",
  courseId = "course-1",
): Unit {
  return {
    id,
    course_id: courseId,
    code: "UNIT-1",
    name: "Data Structures",
    order_index: 1,
  };
}

function makeTopic(
  id = "topic-1",
  unitId = "unit-1",
): Topic {
  return {
    id,
    unit_id: unitId,
    topic_number: 1,
    title: "Binary Trees",
    order_index: 1,
    learning_objective: "Explain binary tree structures",
    objective_type: "explain",
    prerequisite_topic_ids: [],
    status: "active",
    planned_consolidation_date: null,
    consolidation_estimated_duration_min: 30,
    initial_study_date: "2026-10-30",
    gate_passed: true,
    gate_result: "passed",
    weakness_flag: false,
    topic_importance: "medium",
  };
}

function makeTask(): RetrievalTask {
  return {
    id: "task-1",
    topic_id: "topic-1",
    prompt: "Explain a binary tree.",
    expected_answer_criteria: "A correct explanation.",
    task_type: "explanation",
    purpose: "review",
    estimated_duration_min: 5,
    last_used_on: null,
    active: true,
  };
}

function makeReview(): ReviewEvent {
  return {
    id: "review-1",
    topic_id: "topic-1",
    stage: 1,
    event_kind: "scheduled_review",
    holds_stage: false,
    selected_task_ids: ["task-1"],
    overall_result: null,
    yellow_gap_severity: null,
    source_review_id: null,
    intended_due_date: "2026-10-31",
    current_due_date: "2026-10-31",
    completed_at: null,
    priority_at_scheduling: 2,
    current_priority: 2,
    defer_count: 0,
    moved_from_sunday: false,
    status: "pending",
  };
}

function makeAssignment(): Assignment {
  return {
    id: "assignment-1",
    course_id: "course-1",
    title: "Data structures assignment",
    due_date: "2026-11-10",
    estimated_duration_min: 60,
    remaining_min: 60,
    max_session_min: 30,
    importance: "medium",
    status: "pending",
  };
}

function makeExam(): Exam {
  return {
    id: "exam-1",
    course_id: "course-1",
    type: "cat1",
    date: "2026-11-15",
    coverage_units: ["unit-1"],
    coverage_topics: ["topic-1"],
  };
}

function validState() {
  const state = createEmptyStudyState({
    now: NOW,
    timezone: "Africa/Nairobi",
  });

  state.courses.push(makeCourse());
  state.units.push(makeUnit());
  state.topics.push(makeTopic());

  state.lectures.push({
    id: "lecture-1",
    unit_id: "unit-1",
    topic_id: "topic-1",
    date: "2026-10-31",
    kind: "lecture",
  });

  state.retrieval_tasks.push(makeTask());
  state.review_events.push(makeReview());
  state.assignments.push(makeAssignment());
  state.exams.push(makeExam());

  return state;
}

describe("Study reference diagnostics", () => {
  it("finds no broken references in a valid state", () => {
    const state = validState();

    expect(findStudyReferenceIssues(state)).toEqual([]);
  });

  it("does not treat an archived course as a missing parent", () => {
    const state = validState();
    state.courses[0].archived_at = NOW;

    expect(findStudyReferenceIssues(state)).toEqual([]);
  });

  it("reports units and topics whose parent records are missing", () => {
    const state = validState();

    state.courses = [];
    state.topics.push(
      makeTopic("topic-orphan", "missing-unit"),
    );

    const issues = findStudyReferenceIssues(state);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collection: "units",
          recordId: "unit-1",
          field: "course_id",
          referencedId: "course-1",
          problem: "missing_reference",
        }),
        expect.objectContaining({
          collection: "topics",
          recordId: "topic-orphan",
          field: "unit_id",
          referencedId: "missing-unit",
          problem: "missing_reference",
        }),
      ]),
    );
  });

  it("reports missing topic, retrieval-task and review references", () => {
    const state = validState();

    state.retrieval_tasks[0].topic_id = "missing-topic";
    state.review_events[0].topic_id = "missing-topic";
    state.review_events[0].selected_task_ids = ["missing-task"];
    state.review_events[0].source_review_id = "missing-review";

    const issues = findStudyReferenceIssues(state);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collection: "retrieval_tasks",
          field: "topic_id",
          referencedId: "missing-topic",
        }),
        expect.objectContaining({
          collection: "review_events",
          field: "topic_id",
          referencedId: "missing-topic",
        }),
        expect.objectContaining({
          collection: "review_events",
          field: "selected_task_ids",
          referencedId: "missing-task",
        }),
        expect.objectContaining({
          collection: "review_events",
          field: "source_review_id",
          referencedId: "missing-review",
        }),
      ]),
    );
  });

  it("reports a lecture whose topic belongs to another unit", () => {
    const state = validState();

    state.courses.push(makeCourse("course-2"));
    state.units.push(makeUnit("unit-2", "course-2"));
    state.topics.push(makeTopic("topic-2", "unit-2"));
    state.lectures[0].topic_id = "topic-2";

    expect(findStudyReferenceIssues(state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collection: "lectures",
          recordId: "lecture-1",
          field: "topic_id",
          referencedId: "topic-2",
          problem: "parent_mismatch",
        }),
      ]),
    );
  });

  it("reports exam coverage that belongs to a different course", () => {
    const state = validState();

    state.courses.push(makeCourse("course-2"));
    state.units.push(makeUnit("unit-2", "course-2"));
    state.topics.push(makeTopic("topic-2", "unit-2"));

    state.exams[0].coverage_units = ["unit-2"];
    state.exams[0].coverage_topics = ["topic-2"];

    expect(findStudyReferenceIssues(state)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collection: "exams",
          field: "coverage_units",
          referencedId: "unit-2",
          problem: "parent_mismatch",
        }),
        expect.objectContaining({
          collection: "exams",
          field: "coverage_topics",
          referencedId: "topic-2",
          problem: "parent_mismatch",
        }),
      ]),
    );
  });
});
