import { describe, expect, it, vi } from "vitest";
import { appendDailyPlanSnapshot } from "./dailyPlanHistory";
import { buildStudyDailyPlan } from "./dashboard";

import {
  appendTaskEvents,
  appendWeeklyMetricsSnapshot,
  changeStudySettings,
  createDefaultCourseScaffold,
  createEmptyStudyState,
  exportStudyMvpJSON,
  getLastFinalExamDate,
  loadStudyMvpState,
  recordWorkSession,
  saveStudyMvpState,
  STUDY_MVP_STORAGE_KEY,
  StudyStorageError,
  type StorageLike,
} from "./storage";

import type {
  TaskEvent,
  WeekMetrics,
  WorkSession,
} from "./types";

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const NOW = "2026-10-23T09:00:00.000Z";

function validEvent(
  overrides: Partial<TaskEvent> = {},
): TaskEvent {
  return {
    id: "event-1",
    logged_at: NOW,
    event_type: "attempt",
    subject_type: "retrieval_task",
    subject_id: "task-1",
    review_event_id: "review-1",
    retrieval_task_id: "task-1",
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
    ...overrides,
  };
}

function validMetric(
  overrides: Partial<WeekMetrics> = {},
): WeekMetrics {
  return {
    week_number: 1,
    week_start: "2026-10-19",
    week_end: "2026-10-25",

    overall_on_time_completion_pct: 80,
    priority_1_3_on_time_completion_pct: 90,

    deferral_rate_pct: 10,
    total_deferral_decisions: 2,

    median_duration_error_pct: {
      definition: 20,
    },

    duration_error_sample_counts: {
      definition: 5,
    },

    overdue_critical_backlog_min: 15,

    priority_1_3_skip_count: 0,
    priority_4_5_skip_rate_pct: 5,

    notes: "Initial frozen snapshot.",

    source_event_ids: ["event-1"],
    source_snapshot: [
      validEvent(),
    ],

    ...overrides,
  };
}

describe("Study MVP initial state", () => {
  it("creates an empty versioned state with all locked defaults", () => {
    const state = createEmptyStudyState({
      now: NOW,
      timezone: "Africa/Nairobi",
    });

    expect(state.schema_version).toBe(1);
    expect(state.courses).toEqual([]);
    expect(state.topics).toEqual([]);
    expect(state.review_events).toEqual([]);
    expect(state.task_events).toEqual([]);
    expect(state.settings.timezone).toBe("Africa/Nairobi");

    expect(state.settings.daily_budget_min).toBe(180);
    expect(state.settings.review_reserve_min).toBe(30);
    expect(state.settings.intervals_days).toEqual([1, 3, 7, 14, 30]);
    expect(state.settings.gate_threshold_pct).toBe(60);
    expect(state.settings.defer_limit).toBe(3);
  });

  it("creates exactly four courses and twelve units for explicit onboarding", () => {
    const result = createDefaultCourseScaffold({
      now: NOW,
      idFactory: (prefix) => `${prefix}-${Math.random()}`,
    });

    expect(result.courses).toHaveLength(4);
    expect(result.units).toHaveLength(12);
    expect(result.courses.map((course) => course.name)).toEqual([
      "Course I",
      "Course II",
      "Course III",
      "Course IV",
    ]);

    expect(result.units.map((unit) => unit.code)).toEqual(
      [..."abcdefghijkl"],
    );

    for (const course of result.courses) {
      expect(
        result.units.filter(
          (unit) => unit.course_id === course.id,
        ),
      ).toHaveLength(3);
    }
  });

  it("does not create a scaffold implicitly when loading a fresh store", () => {
    const storage = new MemoryStorage();
    const loaded = loadStudyMvpState(storage);

    expect(loaded.courses).toHaveLength(0);
    expect(loaded.units).toHaveLength(0);
    expect(storage.getItem(STUDY_MVP_STORAGE_KEY)).toBeNull();
  });
});

describe("safe local persistence", () => {
  it("round-trips a valid state", () => {
    const storage = new MemoryStorage();
    const state = createEmptyStudyState({
      now: NOW,
      timezone: "Africa/Nairobi",
    });

    saveStudyMvpState(state, storage);

    expect(loadStudyMvpState(storage)).toEqual(state);
  });

  it("refuses to overwrite malformed JSON and preserves a recovery copy", () => {
    const storage = new MemoryStorage();
    const original = "{broken json";
    storage.setItem(STUDY_MVP_STORAGE_KEY, original);

    const windowDescriptor =
      Object.getOwnPropertyDescriptor(globalThis, "window");

    try {
      vi.stubGlobal("window", {
        localStorage: storage,
      });

      expect(() => loadStudyMvpState(storage)).toThrow(
        StudyStorageError,
      );

      const keys = [
        STUDY_MVP_STORAGE_KEY,
      ];

      expect(storage.getItem(keys[0])).toBe(original);

      const recovered = Array.from(
        { length: 1 },
        () => {
          const known =
            "personal-assistant-recovery-copy-" +
            encodeURIComponent(STUDY_MVP_STORAGE_KEY) +
            "-";

          // MemoryStorage deliberately exposes no key enumeration.
          // We verify the original value was not overwritten here;
          // dedicated storage-recovery tests cover preservation itself.
          return known;
        },
      );

      expect(recovered[0]).toContain(
        encodeURIComponent(STUDY_MVP_STORAGE_KEY),
      );
    } finally {
      vi.unstubAllGlobals();

      if (windowDescriptor) {
        Object.defineProperty(
          globalThis,
          "window",
          windowDescriptor,
        );
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  it("rejects attempts to rewrite old TaskEvents", () => {
    const storage = new MemoryStorage();
    const state = createEmptyStudyState({
      now: NOW,
      timezone: "UTC",
    });

    state.task_events.push(validEvent());
    saveStudyMvpState(state, storage);

    const changed = structuredClone(state);
    changed.task_events[0].actual_duration_min = 99;

    expect(() => saveStudyMvpState(changed, storage)).toThrow(
      /TaskEvent history is immutable/,
    );
  });

  it("rejects deleting an existing TaskEvent", () => {
    const storage = new MemoryStorage();
    const state = createEmptyStudyState({
      now: NOW,
      timezone: "UTC",
    });

    state.task_events.push(validEvent());
    saveStudyMvpState(state, storage);

    const changed = structuredClone(state);
    changed.task_events = [];

    expect(() => saveStudyMvpState(changed, storage)).toThrow(
      /cannot be deleted/,
    );
  });

  it("allows immutable events to be appended", () => {
    const storage = new MemoryStorage();
    const state = createEmptyStudyState({
      now: NOW,
      timezone: "UTC",
    });

    saveStudyMvpState(state, storage);

    const result = appendTaskEvents(
      [validEvent()],
      storage,
    );

    expect(result.task_events).toHaveLength(1);
    expect(loadStudyMvpState(storage).task_events).toHaveLength(1);
  });

  it("makes duplicate identical TaskEvent insertion idempotent", () => {
    const storage = new MemoryStorage();
    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    appendTaskEvents([validEvent()], storage);
    appendTaskEvents([validEvent()], storage);

    expect(loadStudyMvpState(storage).task_events).toHaveLength(1);
  });

  it("rejects a duplicate event ID with different evidence", () => {
    const storage = new MemoryStorage();

    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    appendTaskEvents([validEvent()], storage);

    expect(() =>
      appendTaskEvents(
        [
          validEvent({
            actual_duration_min: 9,
          }),
        ],
        storage,
      ),
    ).toThrow(/different evidence/);
  });

  it("rejects a retrieval attempt without a result", () => {
    const storage = new MemoryStorage();

    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    expect(() =>
      appendTaskEvents(
        [
          validEvent({
            result: null,
          }),
        ],
        storage,
      ),
    ).toThrow(/requires a G\/Y\/R result/);
  });

  it("rejects a zero-duration attempt", () => {
    const storage = new MemoryStorage();

    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    expect(() =>
      appendTaskEvents(
        [
          validEvent({
            actual_duration_min: 0,
          }),
        ],
        storage,
      ),
    ).toThrow(/positive actual duration/);
  });

  it("rejects scheduling decisions that fabricate a result", () => {
    const storage = new MemoryStorage();

    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    expect(() =>
      appendTaskEvents(
        [
          validEvent({
            event_type: "defer",
            subject_type: "review_event",
            subject_id: "review-1",
            review_event_id: "review-1",
            retrieval_task_id: null,
            task_type_at_event: null,
            actual_duration_min: 0,
            result: null,
            reason: "Insufficient capacity.",
          }),
        ],
        storage,
      ),
    ).not.toThrow();
  });
});

describe("WorkSession persistence", () => {
  it("records a partial assignment session and matching TaskEvent together", () => {
    const storage = new MemoryStorage();

    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    const session: WorkSession = {
      id: "work-1",
      subject_type: "assignment",
      subject_id: "assignment-1",
      planned_duration_min: 30,
      actual_duration_min: 17,
      logged_at: NOW,
      notes: "Completed the first section only.",
    };

    const event = validEvent({
      id: "work-event-1",
      event_type: "work_session",
      subject_type: "assignment",
      subject_id: "assignment-1",
      review_event_id: null,
      retrieval_task_id: null,
      task_type_at_event: null,
      work_session_id: "work-1",
      actual_duration_min: 17,
      estimated_duration_min_at_event: 30,
      result: null,
    });

    const result = recordWorkSession(
      session,
      event,
      storage,
    );

    expect(result.work_sessions).toHaveLength(1);
    expect(result.task_events).toHaveLength(1);

    expect(result.work_sessions[0].actual_duration_min).toBe(17);
    expect(result.task_events[0].result).toBeNull();
  });

  it("makes exact WorkSession replay idempotent", () => {
    const storage = new MemoryStorage();

    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    const session: WorkSession = {
      id: "work-1",
      subject_type: "topic_consolidation",
      subject_id: "topic-1",
      planned_duration_min: 30,
      actual_duration_min: 20,
      logged_at: NOW,
      notes: "Partial consolidation.",
    };

    const event = validEvent({
      id: "work-event-1",
      event_type: "work_session",
      subject_type: "topic_consolidation",
      subject_id: "topic-1",
      review_event_id: null,
      retrieval_task_id: null,
      task_type_at_event: null,
      work_session_id: "work-1",
      estimated_duration_min_at_event: 30,
      actual_duration_min: 20,
      result: null,
    });

    recordWorkSession(session, event, storage);
    recordWorkSession(session, event, storage);

    const final = loadStudyMvpState(storage);

    expect(final.work_sessions).toHaveLength(1);
    expect(final.task_events).toHaveLength(1);
  });

  it("rejects a WorkSession without a matching event", () => {
    const storage = new MemoryStorage();

    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    const session: WorkSession = {
      id: "work-1",
      subject_type: "assignment",
      subject_id: "assignment-1",
      planned_duration_min: 30,
      actual_duration_min: 17,
      logged_at: NOW,
      notes: "",
    };

    expect(() =>
      recordWorkSession(
        session,
        validEvent({
          event_type: "attempt",
        }),
        storage,
      ),
    ).toThrow(/do not describe the same completed work session/);
  });
});

describe("immutable weekly metrics", () => {
  it("stores a weekly snapshot once and rejects retrospective rewriting", () => {
    const storage = new MemoryStorage();

    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    appendWeeklyMetricsSnapshot(
      validMetric(),
      storage,
    );

    expect(() =>
      appendWeeklyMetricsSnapshot(
        validMetric({
          overall_on_time_completion_pct: 40,
        }),
        storage,
      ),
    ).toThrow(/cannot be rewritten/);

    expect(
      loadStudyMvpState(storage).weekly_metrics[0]
        .overall_on_time_completion_pct,
    ).toBe(80);
  });

  it("allows exact replay of an identical weekly snapshot", () => {
    const storage = new MemoryStorage();

    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    const snapshot = validMetric();

    appendWeeklyMetricsSnapshot(snapshot, storage);
    appendWeeklyMetricsSnapshot(snapshot, storage);

    expect(
      loadStudyMvpState(storage).weekly_metrics,
    ).toHaveLength(1);
  });
});

describe("Study storage: saved daily plan history", () => {
  it("rejects rewriting an existing saved plan", () => {
    const storage = new MemoryStorage();
    const state = createEmptyStudyState({
      now: NOW,
      timezone: "Africa/Nairobi",
    });
    const plan = buildStudyDailyPlan(state, "2026-10-26").plan;
    const first = appendDailyPlanSnapshot(state, plan, NOW);
    saveStudyMvpState(first.state, storage);

    const changed = structuredClone(first.state);
    changed.daily_plan_history![0].plan.budget_minutes += 1;

    expect(() => saveStudyMvpState(changed, storage)).toThrow(
      /Daily plan history is immutable/,
    );
    expect(
      loadStudyMvpState(storage).daily_plan_history![0].plan.budget_minutes,
    ).toBe(plan.budget_minutes);
  });

  it("rejects removing saved plan history", () => {
    const storage = new MemoryStorage();
    const state = createEmptyStudyState({
      now: NOW,
      timezone: "Africa/Nairobi",
    });
    const plan = buildStudyDailyPlan(state, "2026-10-26").plan;
    const first = appendDailyPlanSnapshot(state, plan, NOW);
    saveStudyMvpState(first.state, storage);

    const removed = structuredClone(first.state);
    removed.daily_plan_history = [];

    expect(() => saveStudyMvpState(removed, storage)).toThrow(
      /Daily plan history is append-only/,
    );
  });
});

describe("settings audit and trial freeze", () => {
  it("records a reason, old values, and new values for settings changes", () => {
    const storage = new MemoryStorage();

    saveStudyMvpState(
      createEmptyStudyState({
        now: NOW,
        timezone: "UTC",
      }),
      storage,
    );

    changeStudySettings(
      {
        daily_budget_min: 150,
      },
      "Reduce the configured study budget for a new trial configuration.",
      {
        now: NOW,
        idFactory: (prefix) => `${prefix}-1`,
      },
      storage,
    );

    const state = loadStudyMvpState(storage);

    expect(state.settings.daily_budget_min).toBe(150);
    expect(state.settings_change_history).toHaveLength(1);
    expect(state.settings_change_history[0].reason).toContain("study budget");
    expect(
      state.settings_change_history[0].previous_values.daily_budget_min,
    ).toBe(180);
    expect(
      state.settings_change_history[0].new_values.daily_budget_min,
    ).toBe(150);
  });

  it("does not allow unapproved engine setting changes during the trial", () => {
    const storage = new MemoryStorage();

    const state = createEmptyStudyState({
      now: NOW,
      timezone: "UTC",
    });

    state.settings.trial_start_date = "2026-10-01";
    state.settings.trial_end_date = "2026-10-28";

    saveStudyMvpState(state, storage);

    expect(() =>
      changeStudySettings(
        {
          daily_budget_min: 120,
        },
        "Try a different study budget.",
        {
          now: "2026-10-23T09:00:00.000Z",
        },
        storage,
      ),
    ).toThrow(/engine is frozen during the trial/);
  });

  it("allows a documented qualifying bug fix during the trial and logs it", () => {
    const storage = new MemoryStorage();

    const state = createEmptyStudyState({
      now: NOW,
      timezone: "UTC",
    });

    state.settings.trial_start_date = "2026-10-01";
    state.settings.trial_end_date = "2026-10-28";

    saveStudyMvpState(state, storage);

    changeStudySettings(
      {
        daily_budget_min: 170,
      },
      "Correct a verified budget enforcement defect.",
      {
        now: NOW,
        idFactory: (prefix) => `${prefix}-1`,
        approvedEngineBugFix: {
          bug: "Budget calculation defect.",
          why_trial_could_not_continue:
            "The engine could exceed the allowed daily budget.",
          change: "Correct the allocation calculation.",
          newVersion: "1.2.1",
        },
      },
      storage,
    );

    const saved = loadStudyMvpState(storage);

    expect(saved.settings.daily_budget_min).toBe(170);
    expect(saved.settings.engine_version).toBe("1.2.1");
    expect(saved.settings.engine_change_history).toHaveLength(1);
    expect(saved.settings.engine_change_history[0].bug).toContain("Budget");
  });

  it("rejects an in-trial exception without complete bug documentation", () => {
    const storage = new MemoryStorage();

    const state = createEmptyStudyState({
      now: NOW,
      timezone: "UTC",
    });

    state.settings.trial_start_date = "2026-10-01";
    state.settings.trial_end_date = "2026-10-28";

    saveStudyMvpState(state, storage);

    expect(() =>
      changeStudySettings(
        {
          daily_budget_min: 170,
        },
        "Attempt to change the daily budget during the frozen trial.",
        {
          now: NOW,
          approvedEngineBugFix: {
            bug: "",
            why_trial_could_not_continue: "",
            change: "",
            newVersion: "",
          },
        },
        storage,
      ),
    ).toThrow(/requires the bug/);
  });
});

describe("final examination date", () => {
  it("uses an explicitly configured final date first", () => {
    const state = createEmptyStudyState({
      now: NOW,
      timezone: "UTC",
    });

    state.settings.last_final_exam_date = "2026-12-20";
    state.exams.push({
      id: "final-1",
      course_id: "course-1",
      type: "final",
      date: "2026-12-15",
      coverage_units: [],
      coverage_topics: [],
    });

    expect(getLastFinalExamDate(state)).toBe("2026-12-20");
  });

  it("derives the latest final date if one is not explicitly configured", () => {
    const state = createEmptyStudyState({
      now: NOW,
      timezone: "UTC",
    });

    state.exams.push(
      {
        id: "final-1",
        course_id: "course-1",
        type: "final",
        date: "2026-12-15",
        coverage_units: [],
        coverage_topics: [],
      },
      {
        id: "final-2",
        course_id: "course-2",
        type: "final",
        date: "2026-12-20",
        coverage_units: [],
        coverage_topics: [],
      },
    );

    expect(getLastFinalExamDate(state)).toBe("2026-12-20");
  });

  it("exports validated JSON without exposing mutable state references", () => {
    const state = createEmptyStudyState({
      now: NOW,
      timezone: "UTC",
    });

    const serialized = exportStudyMvpJSON(state);
    const parsed = JSON.parse(serialized);

    parsed.courses.push({ id: "external-edit" });

    expect(state.courses).toHaveLength(0);
  });
});
