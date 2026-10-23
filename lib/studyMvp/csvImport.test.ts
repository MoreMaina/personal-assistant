import { describe, expect, it } from "vitest";
import { createEmptyStudyState } from "./storage";
import { exportTopicCatalogCsv, importTopicCatalogText, TOPIC_CSV_HEADERS } from "./csvImport";
import type { StudyMvpState } from "./types";

function ids() {
  let value = 0;
  return (prefix: string) => `${prefix}_import_${++value}`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function makeCsv(rows: Record<string, unknown>[]): string {
  return [
    TOPIC_CSV_HEADERS.join(","),
    ...rows.map((row) => TOPIC_CSV_HEADERS.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    course_code: "CS1",
    course_name: "Computer Science",
    unit_code: "U1",
    unit_name: "Programming",
    topic_number: 1,
    topic_title: "Variables",
    learning_objective: "Explain variables and their role in a program",
    objective_type: "explain",
    prerequisite_topic_numbers: "",
    topic_importance: "high",
    consolidation_estimated_duration_min: 30,
    task_prompt: "Define a variable",
    expected_answer_criteria: "Definition and a correct example",
    task_type: "definition",
    task_purpose: "gate",
    estimated_duration_min: 5,
    task_active: true,
    ...overrides,
  };
}

function state(): StudyMvpState {
  return createEmptyStudyState({
    timezone: "Africa/Nairobi",
    now: "2026-10-23T08:00:00.000Z",
  });
}

function options() {
  return { now: "2026-10-23T08:00:00.000Z", idFactory: ids() };
}

describe("topic catalog CSV/TSV import", () => {
  it("creates courses, units, topics, and retrieval tasks from multiple rows per topic", () => {
    const input = makeCsv([
      row({ task_prompt: "Define a variable" }),
      row({ task_prompt: "Explain variable scope", task_type: "explanation" }),
      row({ task_prompt: "Compare local and global variables", task_type: "comparison" }),
    ]);
    const result = importTopicCatalogText(state(), input, options());

    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({
      courses_created: 1,
      units_created: 1,
      topics_created: 1,
      existing_topics_reused: 0,
      tasks_created: 3,
      duplicate_tasks_skipped: 0,
    });
    expect(result.state.topics[0]).toMatchObject({
      status: "not_started",
      gate_result: "pending",
      gate_passed: false,
      initial_study_date: null,
      topic_importance: "high",
    });
    expect(result.state.retrieval_tasks).toHaveLength(3);
    expect(result.state.task_events).toHaveLength(0);
  });

  it("detects pasted tab-separated spreadsheet rows", () => {
    const headers = TOPIC_CSV_HEADERS.join("\t");
    const cells = TOPIC_CSV_HEADERS.map((header) => String(row()[header] ?? ""));
    const result = importTopicCatalogText(state(), `${headers}\n${cells.join("\t")}`, options());
    expect(result.ok).toBe(true);
    expect(result.state.topics).toHaveLength(1);
    expect(result.state.retrieval_tasks).toHaveLength(1);
  });

  it("preserves quoted commas, doubled quotes, and embedded newlines", () => {
    const input = makeCsv([row({
      topic_title: "Variables, values, and names",
      task_prompt: 'Explain the phrase "variable scope"\nusing a small example',
      expected_answer_criteria: "Mention scope, lifetime, and a\nvalid example",
    })]);
    const result = importTopicCatalogText(state(), input, options());
    expect(result.ok).toBe(true);
    expect(result.state.topics[0].title).toBe("Variables, values, and names");
    expect(result.state.retrieval_tasks[0].prompt).toBe('Explain the phrase "variable scope"\nusing a small example');
    expect(result.state.retrieval_tasks[0].expected_answer_criteria).toBe("Mention scope, lifetime, and a\nvalid example");
  });

  it("fails atomically when required data or enum values are invalid", () => {
    const original = state();
    const result = importTopicCatalogText(original, makeCsv([row({ objective_type: "memorize" })]), options());
    expect(result.ok).toBe(false);
    expect(result.state).toBe(original);
    expect(result.state.courses).toHaveLength(0);
    expect(result.counts.courses_created).toBe(0);
    expect(result.diagnostics.some((item) => item.severity === "error" && item.message.includes("objective_type"))).toBe(true);
  });

  it("fails atomically if a prerequisite topic number cannot be resolved", () => {
    const original = state();
    const result = importTopicCatalogText(original, makeCsv([row({ prerequisite_topic_numbers: "99" })]), options());
    expect(result.ok).toBe(false);
    expect(result.state).toBe(original);
    expect(result.diagnostics.some((item) => item.message.includes("Prerequisite topic number 99"))).toBe(true);
  });

  it("rejects inconsistent topic metadata across task rows", () => {
    const original = state();
    const result = importTopicCatalogText(original, makeCsv([
      row({ task_prompt: "Question one" }),
      row({ task_prompt: "Question two", topic_title: "Different title" }),
    ]), options());
    expect(result.ok).toBe(false);
    expect(result.state).toBe(original);
    expect(result.diagnostics.some((item) => item.message.includes("conflicting course/unit/topic metadata"))).toBe(true);
  });

  it("is idempotent when the identical catalog is imported twice", () => {
    const input = makeCsv([
      row({ task_prompt: "Question one" }),
      row({ task_prompt: "Question two" }),
    ]);
    const first = importTopicCatalogText(state(), input, options());
    expect(first.ok).toBe(true);
    const second = importTopicCatalogText(first.state, input, options());
    expect(second.ok).toBe(true);
    expect(second.state.courses).toHaveLength(1);
    expect(second.state.units).toHaveLength(1);
    expect(second.state.topics).toHaveLength(1);
    expect(second.state.retrieval_tasks).toHaveLength(2);
    expect(second.counts.courses_created).toBe(0);
    expect(second.counts.units_created).toBe(0);
    expect(second.counts.topics_created).toBe(0);
    expect(second.counts.tasks_created).toBe(0);
    expect(second.counts.duplicate_tasks_skipped).toBe(2);
  });

  it("reuses an existing topic and appends only a genuinely new task", () => {
    const first = importTopicCatalogText(state(), makeCsv([row({ task_prompt: "Question one" })]), options());
    expect(first.ok).toBe(true);
    const second = importTopicCatalogText(first.state, makeCsv([
      row({ task_prompt: "Question one" }),
      row({ task_prompt: "Question two" }),
    ]), options());
    expect(second.ok).toBe(true);
    expect(second.counts.existing_topics_reused).toBe(1);
    expect(second.counts.tasks_created).toBe(1);
    expect(second.state.topics[0].id).toBe(first.state.topics[0].id);
    expect(second.state.retrieval_tasks).toHaveLength(2);
  });

  it("rejects conflicting course codes rather than renaming existing courses", () => {
    const original = state();
    const result = importTopicCatalogText(original, makeCsv([
      row({ task_prompt: "Question one" }),
      row({ course_name: "A different course", topic_number: 2, topic_title: "Arrays", task_prompt: "Question two" }),
    ]), options());
    expect(result.ok).toBe(false);
    expect(result.state).toBe(original);
    expect(result.diagnostics.some((item) => item.message.includes("more than one course name"))).toBe(true);
  });

  it("rejects a task row with a prompt but no answer criteria", () => {
    const original = state();
    const result = importTopicCatalogText(original, makeCsv([row({ expected_answer_criteria: "" })]), options());
    expect(result.ok).toBe(false);
    expect(result.state).toBe(original);
    expect(result.diagnostics.some((item) => item.message.includes("both task_prompt and expected_answer_criteria"))).toBe(true);
  });

  it("does not overwrite an existing topic with conflicting core content", () => {
    const first = importTopicCatalogText(state(), makeCsv([row()]), options());
    expect(first.ok).toBe(true);
    const changed = makeCsv([row({ topic_title: "Different title" })]);
    const result = importTopicCatalogText(first.state, changed, options());
    expect(result.ok).toBe(false);
    expect(result.state).toBe(first.state);
    expect(result.state.topics[0].title).toBe("Variables");
  });

  it("exports a CSV catalog that can be imported again without duplicate tasks", () => {
    const imported = importTopicCatalogText(state(), makeCsv([
      row({ task_prompt: "Question, with comma", task_active: false }),
      row({ task_prompt: "Question two", task_type: "application", task_purpose: "review" }),
    ]), options());
    expect(imported.ok).toBe(true);
    const csv = exportTopicCatalogCsv(imported.state);
    expect(csv.startsWith(TOPIC_CSV_HEADERS.join(","))).toBe(true);

    const roundTrip = importTopicCatalogText(imported.state, csv, options());
    expect(roundTrip.ok).toBe(true);
    expect(roundTrip.state.retrieval_tasks).toHaveLength(2);
    expect(roundTrip.state.retrieval_tasks[0].active).toBe(false);
    expect(roundTrip.counts.tasks_created).toBe(0);
  });

  it("rejects malformed quoted input without modifying state", () => {
    const original = state();
    const result = importTopicCatalogText(original, `${TOPIC_CSV_HEADERS.join(",")}\n"unterminated`, options());
    expect(result.ok).toBe(false);
    expect(result.state).toBe(original);
    expect(result.diagnostics[0].message).toContain("unterminated quoted field");
  });
});
