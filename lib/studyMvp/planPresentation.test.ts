import { describe, expect, it } from "vitest";

import type { PlannedItem } from "./dailyPlanner";
import type { PlanTaskKind } from "./types";
import { getDailyPlanItemPresentation } from "./planPresentation";
import { createEmptyStudyState } from "./storage";
import type {
  Assignment,
  ReviewEvent,
  Topic,
} from "./types";

function fixtureState() {
  const state = createEmptyStudyState({
    timezone: "Africa/Nairobi",
    now: "2026-10-24T07:00:00.000Z",
  });

  state.courses.push({
    id: "course-1",
    name: "Biology",
    code: "BIO",
    color: "green",
    created_at: "2026-10-01T07:00:00.000Z",
  });

  state.units.push({
    id: "unit-1",
    course_id: "course-1",
    code: "CELL",
    name: "Cell structure",
    order_index: 1,
  });

  const topic: Topic = {
    id: "topic-1",
    unit_id: "unit-1",
    topic_number: 1,
    title: "Membrane transport",
    order_index: 1,
    learning_objective: "Explain membrane transport",
    objective_type: "explain",
    prerequisite_topic_ids: [],
    status: "active",
    planned_consolidation_date: null,
    consolidation_estimated_duration_min: 30,
    initial_study_date: "2026-10-20",
    gate_passed: true,
    gate_result: "passed",
    weakness_flag: false,
    topic_importance: "medium",
  };

  state.topics.push(topic);

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
    defer_count: 0,
    moved_from_sunday: false,
    status: "pending",
  };

  state.review_events.push(review);

  const assignment: Assignment = {
    id: "assignment-1",
    course_id: "course-1",
    title: "Cell membrane essay",
    due_date: "2026-10-25",
    estimated_duration_min: 60,
    remaining_min: 45,
    max_session_min: 30,
    importance: "high",
    status: "in_progress",
  };

  state.assignments.push(assignment);

  return state;
}

function planItem(
  kind: PlanTaskKind,
  subject_id: string,
  review_event_id: string | null = null,
): Pick<PlannedItem, "kind" | "subject_id" | "review_event_id"> {
  return { kind, subject_id, review_event_id };
}

describe("daily plan presentation labels", () => {
  it("shows a topic and its course/unit instead of an internal ID", () => {
    const presentation = getDailyPlanItemPresentation(
      planItem("topic_consolidation", "topic-1"),
      fixtureState(),
    );

    expect(presentation).toEqual({
      title: "Membrane transport",
      subtitle: "Topic consolidation · Biology (BIO) · Cell structure",
    });
  });

  it("resolves a review through its ReviewEvent and displays its stage", () => {
    const presentation = getDailyPlanItemPresentation(
      planItem("review", "review-1", "review-1"),
      fixtureState(),
    );

    expect(presentation).toEqual({
      title: "Membrane transport",
      subtitle:
        "Review · Stage 2 · Due 2026-10-22 · Biology (BIO) · Cell structure",
    });
    expect(presentation.title).not.toContain("review-1");
  });

  it("labels gates with the actual topic name", () => {
    const presentation = getDailyPlanItemPresentation(
      planItem("gate", "topic-1"),
      fixtureState(),
    );

    expect(presentation.title).toBe("Membrane transport");
    expect(presentation.subtitle).toBe(
      "Initial learning gate · Biology (BIO) · Cell structure",
    );
  });

  it("shows the real assignment title, course and due date", () => {
    const presentation = getDailyPlanItemPresentation(
      planItem("assignment", "assignment-1"),
      fixtureState(),
    );

    expect(presentation).toEqual({
      title: "Cell membrane essay",
      subtitle: "Assignment · Biology (BIO) · Due 2026-10-25",
    });
  });

  it("provides readable fallbacks without exposing missing entity IDs", () => {
    const state = fixtureState();

    const missingTopic = getDailyPlanItemPresentation(
      planItem("topic_consolidation", "deleted-topic-id"),
      state,
    );
    const missingAssignment = getDailyPlanItemPresentation(
      planItem("assignment", "deleted-assignment-id"),
      state,
    );

    expect(missingTopic.title).toBe("Topic details unavailable");
    expect(missingAssignment.title).toBe("Assignment details unavailable");
    expect(JSON.stringify([missingTopic, missingAssignment])).not.toContain(
      "deleted-",
    );
  });

  it("uses descriptive titles for mixed practice and the Saturday sampler", () => {
    const state = fixtureState();

    expect(
      getDailyPlanItemPresentation(
        planItem("mixed_practice", "mixed-practice:2026-10-24"),
        state,
      ),
    ).toEqual({
      title: "Mixed practice",
      subtitle: "Mixed retrieval across active topics",
    });

    expect(
      getDailyPlanItemPresentation(
        planItem("sampler", "sampler:2026-10-24"),
        state,
      ),
    ).toEqual({
      title: "Saturday sampler",
      subtitle: "80-minute sampling block · up to 10 minutes for analysis",
    });
  });
});
