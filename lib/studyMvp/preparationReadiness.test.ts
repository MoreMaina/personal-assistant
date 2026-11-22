import { describe, expect, it } from "vitest";
import {
  getTopicPreparationReadiness,
  isRetrievalTaskAvailableForNewSessions,
  isTopicPreparedForPlanner,
} from "./preparationReadiness";
import type { RetrievalTask, Topic, Unit } from "./types";

const topic: Topic = {
  id: "topic-1",
  unit_id: "unit-1",
  topic_number: 1,
  title: "Autonomic pharmacology",
  order_index: 1,
  learning_objective:
    "Compare the receptor actions and clinical effects of major autonomic drugs.",
  objective_type: "compare",
  prerequisite_topic_ids: [],
  status: "not_started",
  planned_consolidation_date: null,
  consolidation_estimated_duration_min: 30,
  initial_study_date: null,
  gate_passed: false,
  gate_result: "pending",
  weakness_flag: false,
  topic_importance: "medium",
};

const unit: Unit = {
  id: "unit-1",
  course_id: "course-1",
  code: "PHA101",
  name: "Pharmacology",
  order_index: 1,
};

function task(
  id: string,
  purpose: RetrievalTask["purpose"],
  overrides: Partial<RetrievalTask> = {},
): RetrievalTask {
  return {
    id,
    topic_id: "topic-1",
    prompt: `Question ${id}`,
    expected_answer_criteria: `Criteria for ${id}`,
    task_type: "explanation",
    purpose,
    estimated_duration_min: 5,
    last_used_on: null,
    active: true,
    ...overrides,
  };
}

const completeQuestionBank = [
  task("g1", "gate"),
  task("g2", "gate"),
  task("g3", "gate"),
  task("r1", "review"),
  task("r2", "review"),
];

describe("topic preparation readiness", () => {
  it("accepts a specific objective and a complete five-question bank", () => {
    const result = getTopicPreparationReadiness(
      topic,
      completeQuestionBank,
    );

    expect(result.ready).toBe(true);
    expect(result.activeTaskCount).toBe(5);
    expect(result.activeGateQuestionCount).toBe(3);
    expect(result.activeReviewQuestionCount).toBe(2);
    expect(result.blockers).toEqual([]);
  });

  it("blocks generic objectives and insufficient Gate or Review questions", () => {
    const result = getTopicPreparationReadiness(
      {
        ...topic,
        learning_objective: "Understand the topic",
      },
      [task("g1", "gate"), task("r1", "review")],
    );

    expect(result.ready).toBe(false);
    expect(result.blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "generic_objective",
        "task_count",
        "gate_questions",
        "review_questions",
      ]),
    );
  });

  it("requires prompts and expected-answer criteria on active questions", () => {
    const result = getTopicPreparationReadiness(
      topic,
      [
        task("g1", "gate", { prompt: "" }),
        task("g2", "gate"),
        task("g3", "gate", { expected_answer_criteria: "" }),
        task("r1", "review"),
        task("r2", "review"),
      ],
    );

    expect(result.blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "missing_task_prompt",
        "missing_answer_criteria",
      ]),
    );
  });

  it("ignores inactive and superseded questions when assessing the bank", () => {
    const result = getTopicPreparationReadiness(
      topic,
      [
        task("g1", "gate"),
        task("g2", "gate"),
        task("newer-gate", "gate", { version_number: 2, supersedes_task_id: "older-gate" }),
        task("r1", "review"),
        task("r2", "review"),
        task("inactive", "gate", { active: false }),
        task("older-gate", "gate", { version_number: 1 }),
      ],
    );

    expect(result.ready).toBe(true);
    expect(result.activeTaskCount).toBe(5);
  });

  it("excludes superseded or manually unavailable questions from new sessions", () => {
    const older = task("older", "gate");
    const newer = task("newer", "gate", { supersedes_task_id: "older", version_number: 2 });
    const manuallyUnavailable = task("paused", "gate", { available_for_new_sessions: false });
    const all = [older, newer, manuallyUnavailable];
    expect(isRetrievalTaskAvailableForNewSessions(older, all)).toBe(false);
    expect(isRetrievalTaskAvailableForNewSessions(newer, all)).toBe(true);
    expect(isRetrievalTaskAvailableForNewSessions(manuallyUnavailable, all)).toBe(false);
  });

  it("keeps legacy topics planner-compatible until explicitly reviewed", () => {
    expect(
      isTopicPreparedForPlanner(topic, unit),
    ).toBe(true);
  });

  it("blocks new initial learning for Draft or Excluded topics", () => {
    expect(
      isTopicPreparedForPlanner(
        { ...topic, preparation_status: "draft" },
        unit,
      ),
    ).toBe(false);

    expect(
      isTopicPreparedForPlanner(
        { ...topic, preparation_status: "excluded" },
        unit,
      ),
    ).toBe(false);
  });

  it("blocks new initial learning for excluded units without deleting content", () => {
    expect(
      isTopicPreparedForPlanner(
        topic,
        { ...unit, planner_excluded: true },
      ),
    ).toBe(false);

    expect(topic.title).toBe("Autonomic pharmacology");
  });
});
