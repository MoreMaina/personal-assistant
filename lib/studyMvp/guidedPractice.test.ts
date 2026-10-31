import { describe, expect, it } from "vitest";

import { createEmptyStudyState } from "./storage";
import { getGuidedPracticeQuestions } from "./guidedPractice";

import type {
  RetrievalTask,
  Topic,
} from "./types";

const NOW = "2026-10-31T09:00:00.000Z";

function fixtureState() {
  const state = createEmptyStudyState({
    now: NOW,
    timezone: "Africa/Nairobi",
  });

  state.courses.push({
    id: "course-1",
    name: "Computer Science",
    code: "CS",
    color: "#23412f",
    created_at: NOW,
  });

  state.units.push(
    {
      id: "unit-1",
      course_id: "course-1",
      code: "UNIT-1",
      name: "Data Structures",
      order_index: 1,
    },
    {
      id: "unit-2",
      course_id: "course-1",
      code: "UNIT-2",
      name: "Algorithms",
      order_index: 2,
    },
  );

  const makeTopic = (
    id: string,
    unitId: string,
    order: number,
  ): Topic => ({
    id,
    unit_id: unitId,
    topic_number: order,
    title: `Topic ${order}`,
    order_index: order,
    learning_objective: `Explain topic ${order}`,
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
  });

  state.topics.push(
    makeTopic("topic-1", "unit-1", 1),
    makeTopic("topic-2", "unit-2", 2),
  );

  const makeTask = (
    id: string,
    topicId: string,
    purpose: RetrievalTask["purpose"],
    lastUsedOn: string | null = null,
    active = true,
  ): RetrievalTask => ({
    id,
    topic_id: topicId,
    prompt: `Prompt ${id}`,
    expected_answer_criteria: `Criteria ${id}`,
    task_type: "explanation",
    purpose,
    estimated_duration_min: 5,
    last_used_on: lastUsedOn,
    active,
  });

  state.retrieval_tasks.push(
    makeTask("mixed-a1", "topic-1", "mixed"),
    makeTask("mixed-a2", "topic-1", "mixed", "2026-10-29"),
    makeTask("mixed-b1", "topic-2", "mixed"),
    makeTask("sampler-a", "topic-1", "sampler"),
    makeTask("review-a", "topic-1", "review"),
    makeTask("inactive-a", "topic-2", "mixed", null, false),
  );

  return state;
}

describe("guided practice question selection", () => {
  it("alternates mixed-practice questions across active topics", () => {
    const questions = getGuidedPracticeQuestions(
      fixtureState(),
      "mixed",
    );

    expect(questions.map((item) => item.taskId)).toEqual([
      "mixed-a1",
      "mixed-b1",
      "mixed-a2",
    ]);

    expect(
      new Set(questions.map((item) => item.topicId)).size,
    ).toBe(2);
  });

  it("requires questions from at least two topics for mixed practice", () => {
    const state = fixtureState();

    state.topics = state.topics.slice(0, 1);

    expect(
      getGuidedPracticeQuestions(state, "mixed"),
    ).toEqual([]);
  });

  it("selects sampler questions separately from mixed-practice questions", () => {
    const questions = getGuidedPracticeQuestions(
      fixtureState(),
      "sampler",
    );

    expect(questions.map((item) => item.taskId)).toEqual([
      "sampler-a",
    ]);
  });

  it("excludes inactive tasks, non-active topics and archived courses", () => {
    const state = fixtureState();

    state.topics[1] = {
      ...state.topics[1],
      status: "relearn",
    };

    state.courses[0].archived_at = NOW;

    expect(
      getGuidedPracticeQuestions(state, "mixed"),
    ).toEqual([]);
  });

  it("returns the prompt, expected criteria and topic context", () => {
    const questions = getGuidedPracticeQuestions(
      fixtureState(),
      "sampler",
    );

    expect(questions[0]).toMatchObject({
      taskId: "sampler-a",
      topicId: "topic-1",
      courseName: "Computer Science",
      unitName: "Data Structures",
      topicTitle: "Topic 1",
      prompt: "Prompt sampler-a",
      expectedAnswerCriteria: "Criteria sampler-a",
      taskType: "explanation",
      estimatedDurationMin: 5,
    });
  });

  it("returns an empty list when no eligible prepared questions exist", () => {
    const state = fixtureState();

    state.retrieval_tasks = [];

    expect(
      getGuidedPracticeQuestions(state, "mixed"),
    ).toEqual([]);

    expect(
      getGuidedPracticeQuestions(state, "sampler"),
    ).toEqual([]);
  });
});
