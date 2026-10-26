import { describe, expect, it } from "vitest";
import { getGateReadiness } from "./gateReadiness";
import type { RetrievalTask, Topic } from "./types";

const TODAY = "2026-10-26";

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
    status: "in_learning",
    planned_consolidation_date: null,
    consolidation_estimated_duration_min: 30,
    initial_study_date: null,
    gate_passed: false,
    gate_result: "pending",
    weakness_flag: false,
    topic_importance: "medium",
    ...overrides,
  };
}

function makeTask(id: string, overrides: Partial<RetrievalTask> = {}): RetrievalTask {
  return {
    id,
    topic_id: "topic-1",
    prompt: `Prompt ${id}`,
    expected_answer_criteria: `Criteria ${id}`,
    task_type: "definition",
    purpose: "review",
    estimated_duration_min: 5,
    last_used_on: null,
    active: true,
    ...overrides,
  };
}

const threeTasks = [
  makeTask("task-a"),
  makeTask("task-b"),
  makeTask("task-c"),
];

describe("Study gate readiness", () => {
  it("requires an explicit learning start for a not-started topic", () => {
    const readiness = getGateReadiness(
      makeTopic({ status: "not_started" }),
      threeTasks,
      TODAY,
    );

    expect(readiness.status).toBe("not_started");
    expect(readiness.canAttempt).toBe(false);
    expect(readiness.activeQuestionCount).toBe(3);
  });

  it("reports exactly how many active questions are missing", () => {
    const readiness = getGateReadiness(
      makeTopic(),
      threeTasks.slice(0, 2),
      TODAY,
    );

    expect(readiness.status).toBe("missing_questions");
    expect(readiness.missingQuestionCount).toBe(1);
    expect(readiness.canAttempt).toBe(false);
  });

  it("does not unlock a gate before its planned date", () => {
    const readiness = getGateReadiness(
      makeTopic({ planned_consolidation_date: "2026-10-27" }),
      threeTasks,
      TODAY,
    );

    expect(readiness.status).toBe("not_due");
    expect(readiness.dueDate).toBe("2026-10-27");
    expect(readiness.canAttempt).toBe(false);
  });

  it("does not replace inactive questions in an unfinished session", () => {
    const readiness = getGateReadiness(
      makeTopic(),
      threeTasks.slice(0, 2),
      TODAY,
      ["task-a", "task-b", "task-c"],
    );

    expect(readiness.status).toBe("session_questions_unavailable");
    expect(readiness.canAttempt).toBe(false);
    expect(readiness.message).toMatch(/will not substitute/i);
  });

  it("allows an eligible failed gate to reach the corrective-work check", () => {
    const readiness = getGateReadiness(
      makeTopic({ status: "relearn", gate_result: "failed" }),
      threeTasks,
      TODAY,
    );

    expect(readiness.status).toBe("ready");
    expect(readiness.canAttempt).toBe(true);
  });

  it("does not offer another initial gate after a pass", () => {
    const readiness = getGateReadiness(
      makeTopic({
        status: "active",
        gate_passed: true,
        gate_result: "passed",
      }),
      threeTasks,
      TODAY,
    );

    expect(readiness.status).toBe("not_eligible");
    expect(readiness.canAttempt).toBe(false);
  });
});
