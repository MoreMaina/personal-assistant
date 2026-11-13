import { describe, expect, it } from "vitest";
import { assignCourseToAcademicPeriod, setActiveAcademicPeriod } from "./academicPeriod";
import { createEmptyStudyState } from "./storage";

describe("Study academic periods", () => {
  it("keeps existing courses Unassigned until explicitly assigned", () => {
    const state = createEmptyStudyState({ now: "2026-11-12T08:00:00.000Z" });
    state.courses.push({
      id: "course-old", name: "Existing course", code: "OLD", color: "#006D77",
      created_at: "2026-11-01T08:00:00.000Z",
    });
    const active = setActiveAcademicPeriod(state, 3, 2, "2026-11-12T08:00:00.000Z");

    expect(active.settings.active_academic_year).toBe(3);
    expect(active.settings.active_academic_semester).toBe(2);
    expect(active.courses[0].academic_year).toBeNull();
    expect(active.courses[0].academic_semester).toBeNull();
    expect(active.settings_change_history).toHaveLength(1);
  });

  it("assigns a course without changing its content or associated study history", () => {
    const state = createEmptyStudyState({ now: "2026-11-12T08:00:00.000Z" });
    state.courses.push({
      id: "course-1", name: "Pharmacy", code: "PHA", color: "#006D77",
      created_at: "2026-11-01T08:00:00.000Z",
    });
    state.task_events.push({
      id: "event-1", logged_at: "2026-11-11T09:00:00.000Z",
      event_type: "content_preparation", subject_type: "initial_learning", subject_id: "topic-x",
      review_event_id: null, retrieval_task_id: null, gate_session_id: null,
      gate_selected_task_ids_snapshot: null, skill_demonstrated_without_hints: null,
      work_session_id: null, related_event_id: null, estimated_duration_min_at_event: null,
      task_type_at_event: null, priority_at_event: null, intended_due_date_at_event: null,
      current_due_date_at_event: null, actual_duration_min: null, result: null,
      yellow_gap_severity: null, disposition: null, reason: null,
      critical_error_flag: null, defer_count_at_event: null, re_entry_condition: null,
      old_priority: null, new_priority: null,
    });

    const next = assignCourseToAcademicPeriod(state, "course-1", 2, 1);
    expect(next.courses[0]).toMatchObject({
      name: "Pharmacy", academic_year: 2, academic_semester: 1,
    });
    expect(next.task_events).toEqual(state.task_events);
  });

  it("rejects incomplete or invalid academic-period pairs", () => {
    const state = createEmptyStudyState();
    expect(() => setActiveAcademicPeriod(state, 2, null)).toThrow(/both a positive study year/);
    expect(() => assignCourseToAcademicPeriod(state, "missing", 2, 1)).toThrow(/was not found/);
    expect(() => assignCourseToAcademicPeriod(state, "missing", 0, 1)).toThrow(/both a valid year and semester/);
  });
});
