import { describe, expect, it } from "vitest";
import { buildStudySearchRecords } from "@/lib/studySearch";
import type { StudyMvpState } from "@/lib/studyMvp/types";

describe("buildStudySearchRecords", () => {
  it("indexes only current, non-archived Study MVP courses and their records", () => {
    const state = {
      courses: [
        {
          id: "course-current",
          name: "Current Pharmacy",
          code: "PHA101",
          color: "#006D77",
          created_at: "2026-11-13T08:00:00.000Z",
          academic_year: 2,
          academic_semester: 1,
        },
        {
          id: "course-archived",
          name: "Legacy Deleted Pharmacy",
          code: "OLD101",
          color: "#006D77",
          created_at: "2025-01-01T08:00:00.000Z",
          archived_at: "2026-01-01T08:00:00.000Z",
        },
      ],
      units: [
        { id: "unit-current", course_id: "course-current", code: "U1", name: "Pharmacology", order_index: 1 },
        { id: "unit-archived", course_id: "course-archived", code: "OLD-U1", name: "Outdated Unit", order_index: 1 },
      ],
      topics: [
        {
          id: "topic-current", unit_id: "unit-current", topic_number: 1,
          title: "Drug receptors", order_index: 1, learning_objective: "Explain receptor action",
          objective_type: "explain", prerequisite_topic_ids: [], status: "not_started",
          planned_consolidation_date: null, consolidation_estimated_duration_min: 20,
          initial_study_date: null, gate_passed: false, gate_result: null,
          weakness_flag: false, topic_importance: "medium",
        },
        {
          id: "topic-archived", unit_id: "unit-archived", topic_number: 1,
          title: "Obsolete topic", order_index: 1, learning_objective: "Old objective",
          objective_type: "recall", prerequisite_topic_ids: [], status: "not_started",
          planned_consolidation_date: null, consolidation_estimated_duration_min: 20,
          initial_study_date: null, gate_passed: false, gate_result: null,
          weakness_flag: false, topic_importance: "low",
        },
      ],
      lectures: [
        { id: "lecture-current", unit_id: "unit-current", topic_id: "topic-current", date: "2026-11-13", kind: "lecture" },
        { id: "lecture-archived", unit_id: "unit-archived", topic_id: "topic-archived", date: "2025-02-01", kind: "lecture" },
      ],
      retrieval_tasks: [
        {
          id: "task-current", topic_id: "topic-current", prompt: "Define a receptor agonist",
          expected_answer_criteria: "Definition and mechanism", task_type: "definition",
          purpose: "initial_learning", estimated_duration_min: 5, last_used_on: null, active: true,
        },
        {
          id: "task-archived", topic_id: "topic-archived", prompt: "Old deleted course question",
          expected_answer_criteria: "Old criteria", task_type: "definition",
          purpose: "initial_learning", estimated_duration_min: 5, last_used_on: null, active: true,
        },
      ],
    } as unknown as StudyMvpState;

    const records = buildStudySearchRecords(state);
    const searchable = records.map((record) => `${record.title} ${record.detail} ${record.searchableText}`).join(" ");

    expect(records.some((record) => record.title === "Current Pharmacy" && record.category === "Study course" && record.href === "/settings")).toBe(true);
    expect(records.some((record) => record.title === "Drug receptors" && record.category === "Study topic")).toBe(true);
    expect(records.some((record) => record.title === "Define a receptor agonist" && record.category === "Study question")).toBe(true);
    expect(searchable).not.toContain("Legacy Deleted Pharmacy");
    expect(searchable).not.toContain("Outdated Unit");
    expect(searchable).not.toContain("Obsolete topic");
    expect(searchable).not.toContain("Old deleted course question");
  });
});
