import { describe, expect, it } from "vitest";
import { createEmptyStudyState } from "./storage";
import {
  addRetrievalQuestion,
  createRetrievalQuestionVersion,
  setRetrievalQuestionActive,
  setTopicPreparationStatus,
  setUnitPlannerExcluded,
  updateTopicLearningObjective,
  type RetrievalQuestionDraft,
} from "./preparationManagement";
import { getTopicPreparationReadiness } from "./preparationReadiness";
import type { RetrievalTask, Topic } from "./types";

const draft: RetrievalQuestionDraft = {
  prompt: "Compare the receptor actions of two drug classes.",
  expected_answer_criteria: "Name both receptor targets and explain the clinical consequence.",
  task_type: "comparison",
  purpose: "gate",
  estimated_duration_min: 5,
};

const topic: Topic = {
  id: "topic-1",
  unit_id: "unit-1",
  topic_number: 1,
  title: "Autonomic pharmacology",
  order_index: 1,
  learning_objective: "Compare receptor actions and clinical effects of major autonomic drugs.",
  objective_type: "compare",
  prerequisite_topic_ids: [],
  status: "not_started",
  planned_consolidation_date: null,
  consolidation_estimated_duration_min: 35,
  initial_study_date: null,
  gate_passed: false,
  gate_result: "pending",
  weakness_flag: false,
  topic_importance: "medium",
  preparation_status: "draft",
};

function makeTask(id: string, purpose: RetrievalTask["purpose"]): RetrievalTask {
  return {
    id,
    topic_id: "topic-1",
    prompt: `Question ${id}`,
    expected_answer_criteria: `Expected criteria for ${id}.`,
    task_type: "explanation",
    purpose,
    estimated_duration_min: 5,
    last_used_on: null,
    active: true,
  };
}

function baseState() {
  const state = createEmptyStudyState({ now: "2026-11-22T00:00:00.000Z", timezone: "Africa/Nairobi" });
  state.courses.push({
    id: "course-1", name: "Pharmacology", code: "PHA", color: "#23412f",
    created_at: "2026-11-22T00:00:00.000Z",
  });
  state.units.push({ id: "unit-1", course_id: "course-1", code: "U1", name: "Autonomic", order_index: 1 });
  state.topics.push({ ...topic });
  return state;
}

describe("Study preparation management", () => {
  it("adds a new active question without changing existing task IDs", () => {
    const state = baseState();
    state.retrieval_tasks.push(makeTask("existing", "gate"));
    const next = addRetrievalQuestion(state, "topic-1", draft, () => "new-question");
    expect(next.retrieval_tasks.map((task) => task.id)).toEqual(["existing", "new-question"]);
    expect(next.retrieval_tasks[0]).toEqual(state.retrieval_tasks[0]);
    expect(next.retrieval_tasks[1].active).toBe(true);
    expect(next.retrieval_tasks[1].version_number).toBe(1);
  });

  it("creates a replacement as a new version and retains the original question text", () => {
    const state = baseState();
    state.retrieval_tasks.push(makeTask("original", "gate"));
    const next = createRetrievalQuestionVersion(
      state,
      "original",
      { ...draft, prompt: "Updated comparison question" },
      () => "version-2",
    );
    expect(next.retrieval_tasks).toHaveLength(2);
    expect(next.retrieval_tasks[0]).toMatchObject({
      id: "original", prompt: "Question original", active: false,
      available_for_new_sessions: false,
    });
    expect(next.retrieval_tasks[1]).toMatchObject({
      id: "version-2", prompt: "Updated comparison question", active: true,
      version_number: 2, supersedes_task_id: "original",
      available_for_new_sessions: true,
    });
    expect(state.retrieval_tasks[0].active).toBe(true);
  });

  it("keeps a question active for an unfinished Review while excluding it from new sessions", () => {
    const state = baseState();
    state.retrieval_tasks.push(makeTask("original", "review"));
    state.review_events.push({
      id: "review-open",
      topic_id: "topic-1",
      stage: 1,
      event_kind: "scheduled_review",
      holds_stage: false,
      selected_task_ids: ["original", "review-peer"],
      overall_result: null,
      yellow_gap_severity: null,
      source_review_id: null,
      intended_due_date: "2026-11-22",
      current_due_date: "2026-11-22",
      completed_at: null,
      priority_at_scheduling: 3,
      current_priority: 3,
      defer_count: 0,
      moved_from_sunday: false,
      status: "pending",
    });
    state.retrieval_tasks.push(makeTask("review-peer", "review"));

    const next = createRetrievalQuestionVersion(
      state,
      "original",
      { ...draft, purpose: "review", prompt: "Updated review question" },
      () => "review-v2",
    );
    expect(next.retrieval_tasks.find((task) => task.id === "original")).toMatchObject({
      active: true,
      available_for_new_sessions: false,
    });
    expect(next.review_events[0].selected_task_ids).toEqual(["original", "review-peer"]);
    expect(next.retrieval_tasks.find((task) => task.id === "review-v2")?.available_for_new_sessions).toBe(true);
  });

  it("preserves questions referenced by an unfinished guided-practice selection", () => {
    const state = baseState();
    state.retrieval_tasks.push(makeTask("mixed-1", "mixed"));
    state.retrieval_tasks.push(makeTask("mixed-2", "mixed"));
    state.task_events.push({
      id: "guided-attempt-1",
      logged_at: "2026-11-22T08:00:00.000Z",
      event_type: "guided_practice_attempt",
      subject_type: "mixed_practice",
      subject_id: "mixed-1",
      review_event_id: null,
      retrieval_task_id: "mixed-1",
      review_selected_task_ids_snapshot: undefined,
      gate_session_id: null,
      gate_selected_task_ids_snapshot: null,
      skill_demonstrated_without_hints: null,
      work_session_id: null,
      related_event_id: null,
      estimated_duration_min_at_event: 5,
      task_type_at_event: "explanation",
      priority_at_event: null,
      intended_due_date_at_event: null,
      current_due_date_at_event: null,
      actual_duration_min: 5,
      result: "green",
      yellow_gap_severity: null,
      disposition: null,
      reason: null,
      critical_error_flag: null,
      defer_count_at_event: 0,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
      prompt_snapshot: "Question mixed-1",
      expected_answer_criteria_snapshot: "Expected criteria for mixed-1.",
      guided_practice_selected_task_ids_snapshot: ["mixed-1", "mixed-2"],
    });

    const next = setRetrievalQuestionActive(state, "mixed-2", false);
    expect(next.retrieval_tasks.find((task) => task.id === "mixed-2")).toMatchObject({
      active: true,
      available_for_new_sessions: false,
    });
  });

  it("does not permit two successors for a version", () => {
    const state = baseState();
    state.retrieval_tasks.push(makeTask("original", "gate"));
    const once = createRetrievalQuestionVersion(state, "original", draft, () => "v2");
    expect(() => createRetrievalQuestionVersion(once, "original", draft, () => "v3"))
      .toThrow(/newer version/i);
  });

  it("deactivates and restores without deleting the question", () => {
    const state = baseState();
    state.retrieval_tasks.push(makeTask("original", "gate"));
    const inactive = setRetrievalQuestionActive(state, "original", false);
    expect(inactive.retrieval_tasks).toHaveLength(1);
    expect(inactive.retrieval_tasks[0].active).toBe(false);
    expect(inactive.retrieval_tasks[0].available_for_new_sessions).toBe(false);
    const restored = setRetrievalQuestionActive(inactive, "original", true);
    expect(restored.retrieval_tasks[0].active).toBe(true);
    expect(restored.retrieval_tasks[0].available_for_new_sessions).toBe(true);
  });

  it("only marks a topic Ready when the full readiness rule passes", () => {
    const state = baseState();
    expect(() => setTopicPreparationStatus(state, "topic-1", "ready"))
      .toThrow(/not ready yet/i);
    state.retrieval_tasks = [
      makeTask("g1", "gate"), makeTask("g2", "gate"), makeTask("g3", "gate"),
      makeTask("r1", "review"), makeTask("r2", "review"),
    ];
    const ready = setTopicPreparationStatus(state, "topic-1", "ready");
    expect(ready.topics[0].preparation_status).toBe("ready");
  });

  it("demotes a Ready topic when its usable question bank becomes incomplete", () => {
    const state = baseState();
    state.retrieval_tasks = [
      makeTask("g1", "gate"), makeTask("g2", "gate"), makeTask("g3", "gate"),
      makeTask("r1", "review"), makeTask("r2", "review"),
    ];
    state.topics[0].preparation_status = "ready";
    const next = setRetrievalQuestionActive(state, "g3", false);
    expect(next.topics[0].preparation_status).toBe("draft");
  });

  it("limits the current question bank to five usable questions", () => {
    const state = baseState();
    state.retrieval_tasks = [
      makeTask("g1", "gate"), makeTask("g2", "gate"), makeTask("g3", "gate"),
      makeTask("r1", "review"), makeTask("r2", "review"),
    ];
    expect(() => addRetrievalQuestion(state, "topic-1", draft, () => "g4"))
      .toThrow(/3–5 active questions/i);
  });

  it("rejects a new question when its prompt duplicates an available question", () => {
    const state = baseState();
    const existing = makeTask("existing", "gate");
    existing.prompt = "  compare   THE receptor actions of two drug classes.  ";
    state.retrieval_tasks.push(existing);

    expect(() => addRetrievalQuestion(state, "topic-1", draft, () => "new-question"))
      .toThrow(/same prompt/i);
  });

  it("rejects a replacement that duplicates another available question", () => {
    const state = baseState();
    state.retrieval_tasks.push(makeTask("original", "gate"));

    const other = makeTask("other", "review");
    other.prompt = draft.prompt.toUpperCase();
    state.retrieval_tasks.push(other);

    expect(() =>
      createRetrievalQuestionVersion(state, "original", draft, () => "version-2"),
    ).toThrow(/same prompt/i);
  });

  it("rejects restoring a question when another available question has its prompt", () => {
    const state = baseState();

    const toRestore = makeTask("to-restore", "gate");
    toRestore.prompt = draft.prompt;
    toRestore.active = false;
    toRestore.available_for_new_sessions = false;

    const existing = makeTask("existing", "review");
    existing.prompt = draft.prompt.toUpperCase();

    state.retrieval_tasks.push(toRestore, existing);

    expect(() => setRetrievalQuestionActive(state, "to-restore", true))
      .toThrow(/same prompt/i);
  });

  it("blocks Ready status when available questions contain duplicate prompts", () => {
    const state = baseState();
    state.retrieval_tasks = [
      makeTask("g1", "gate"),
      makeTask("g2", "gate"),
      makeTask("g3", "gate"),
      makeTask("r1", "review"),
      makeTask("r2", "review"),
    ];

    state.retrieval_tasks[1].prompt = state.retrieval_tasks[0].prompt.toUpperCase();

    const readiness = getTopicPreparationReadiness(
      state.topics[0],
      state.retrieval_tasks,
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((item) => item.code === "duplicate_prompt")).toBe(true);
  });

  it("updates objective fields and supports reversible unit exclusion", () => {
    const state = baseState();
    const updated = updateTopicLearningObjective(
      state, "topic-1", "  Explain receptor selectivity and clinical effects.  ", "explain",
    );
    expect(updated.topics[0]).toMatchObject({
      learning_objective: "Explain receptor selectivity and clinical effects.",
      objective_type: "explain",
    });
    const excluded = setUnitPlannerExcluded(updated, "unit-1", true);
    expect(excluded.units[0].planner_excluded).toBe(true);
    const restored = setUnitPlannerExcluded(excluded, "unit-1", false);
    expect(restored.units[0].planner_excluded).toBe(false);
  });
});
