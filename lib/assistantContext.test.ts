import { describe, expect, it } from "vitest";
import {
  buildAssistantContext,
  isWeeklyReviewQuestion,
  selectRelevantAssistantContext,
} from "./assistantContext";

describe("buildAssistantContext", () => {
  it("only includes allowlisted fields", () => {
    const context = buildAssistantContext({
      "personal-assistant-projects": JSON.stringify([{
        id: 1,
        name: "Dissertation",
        status: "active",
        privateNotes: "should never be sent",
        essayBody: "should never be sent",
      }]),
    });
    expect(context.projects).toEqual([{
      id: 1, name: "Dissertation", status: "active",
    }]);
    expect(JSON.stringify(context)).not.toContain("should never be sent");
  });

  it("handles malformed JSON and malformed study shapes", () => {
    const context = buildAssistantContext({
      "personal-assistant-projects": "{bad json",
      "personal-assistant-study-v2": JSON.stringify({
        lectures: "not a list",
      }),
    });
    expect(context.projects).toEqual([]);
    expect(context.study.lectures).toEqual([]);
  });

  it("summarizes task statuses and urgency counts", () => {
    const records = [
      { type: "task", title: "Completed task", completed: true, dueDate: "2026-10-08" },
      { type: "task", title: "Overdue task", completed: false, dueDate: "2026-10-10", priority: "high" },
      { type: "task", title: "Due today", completed: false, dueDate: "2026-10-11" },
      { type: "task", title: "Due in seven days", completed: false, dueDate: "2026-10-18" },
      { type: "task", title: "Future task", completed: false, dueDate: "2026-10-19" },
      { type: "task", title: "Undated task", completed: false },
      { type: "task", title: "Invalid date task", completed: false, dueDate: "not-a-date" },
      { type: "event", title: "Calendar event", completed: false, dueDate: "2026-10-10" },
    ];

    const context = buildAssistantContext({
      "personal-assistant-calendar-items": JSON.stringify(records),
    }, "2026-10-11");

    expect(context.taskSummary).toMatchObject({
      taskRecordsExamined: 7,
      completedTasks: 1,
      incompleteTasks: 6,
      incompleteTaskUrgency: {
        overdue: 1,
        dueToday: 1,
        dueWithin7Days: 1,
        futureDueDate: 1,
        noDueDate: 1,
        unclassified: 1,
      },
      completedTaskExamples: ["Completed task"],
      calendarRecordsExamined: 8,
      sourceCalendarItemCount: 8,
      recordScanLimit: 200,
      mayBeTruncated: false,
    });
  });

  it("marks task summaries as potentially incomplete beyond 200 calendar records", () => {
    const records = Array.from({ length: 201 }, (_, index) => ({
      type: "task",
      title: `Task ${index + 1}`,
      completed: index === 200,
      dueDate: "2026-10-20",
    }));

    const context = buildAssistantContext({
      "personal-assistant-calendar-items": JSON.stringify(records),
    }, "2026-10-11");

    expect(context.taskSummary).toMatchObject({
      taskRecordsExamined: 200,
      completedTasks: 0,
      incompleteTasks: 200,
      calendarRecordsExamined: 200,
      sourceCalendarItemCount: 201,
      recordScanLimit: 200,
      mayBeTruncated: true,
      incompleteTaskUrgency: {
        overdue: 0,
        dueToday: 0,
        dueWithin7Days: 0,
        futureDueDate: 200,
        noDueDate: 0,
        unclassified: 0,
      },
    });
  });


  it("limits task questions to task context rather than unrelated study and project records", () => {
    const context = buildAssistantContext({
      "personal-assistant-calendar-items": JSON.stringify([
        {
          id: "task-1",
          type: "task",
          title: "Submit report",
          dueDate: "2026-10-14",
          priority: "high",
          completed: false,
        },
      ]),
      "personal-assistant-projects": JSON.stringify([
        { id: "project-1", name: "Research project", status: "active" },
      ]),
      "personal-assistant-study-v2": JSON.stringify({
        courses: [{ id: "course-1", name: "Computer Science" }],
      }),
    }, "2026-10-13");

    const selected = selectRelevantAssistantContext(
      context,
      "What tasks should I focus on today?",
    );

    expect(selected.contextScope).toBe("tasks");
    expect(selected).toHaveProperty("prioritizedTasks");
    expect(selected).not.toHaveProperty("study");
    expect(selected).not.toHaveProperty("projects");
    expect(selected).not.toHaveProperty("taskSummary");
    expect(JSON.stringify(selected)).not.toContain("Computer Science");
    expect(JSON.stringify(selected)).not.toContain("Research project");
  });

  it("selects current Study MVP courses and units for study questions", () => {
    const context = buildAssistantContext({
      "personal-assistant-projects": JSON.stringify([
        { id: "project-1", name: "Research project", status: "active" },
      ]),
      "personal-assistant-current-semester": JSON.stringify("Semester 1"),
      "personal-assistant-study-v2": JSON.stringify({
        courses: [{ id: "old-course", name: "Deleted legacy course" }],
      }),
    }, "2026-11-12", {
      courses: [{ id: "course-1", name: "Computer Science", code: "CS101", archived_at: null }],
      units: [{ id: "unit-1", course_id: "course-1", name: "Data Structures" }],
    }, true);

    const selected = selectRelevantAssistantContext(
      context,
      "What units am I studying this semester?",
    );

    expect(selected.contextScope).toBe("study");
    expect(selected).toHaveProperty("study");
    expect(selected).toHaveProperty("currentSemester", "Semester 1");
    expect(selected).not.toHaveProperty("projects");
    expect(JSON.stringify(selected)).toContain("Computer Science");
    expect(JSON.stringify(selected)).toContain("Data Structures");
    expect(JSON.stringify(selected)).not.toContain("Deleted legacy course");
    expect(JSON.stringify(selected)).not.toContain("Research project");
  });

  it("uses current active Study courses in weekly reviews and omits legacy program and semester details", () => {
    const context = buildAssistantContext({
      "personal-assistant-projects": JSON.stringify([
        { id: "project-1", name: "Research project", status: "active" },
      ]),
      "personal-assistant-books": JSON.stringify([
        { id: "book-1", title: "A reading book", currentPage: 42 },
      ]),
      "personal-assistant-current-semester": JSON.stringify("Semester 1"),
      "personal-assistant-study-v2": JSON.stringify({
        programs: [{ id: "program-old", name: "BPharm" }],
        semesters: [{ id: "semester-old", name: "Semester 1" }],
        courses: [{ id: "old-course", name: "Pharmaceutics III" }],
      }),
    }, "2026-11-12", {
      courses: [
        { id: "course-current", name: "Current Pharmacy Course", code: "PHA101", archived_at: null },
        { id: "course-archived", name: "Archived Pharmacy Course", code: "PHA099", archived_at: "2026-10-01T10:00:00.000Z" },
      ],
      units: [
        { id: "unit-current", course_id: "course-current", name: "Current Unit" },
        { id: "unit-archived", course_id: "course-archived", name: "Archived Unit" },
      ],
      topics: [{ id: "topic-current", unit_id: "unit-current" }],
      lectures: [
        { id: "lecture-current", unit_id: "unit-current", date: "2026-11-10", kind: "lecture" },
        { id: "lecture-archived", unit_id: "unit-archived", date: "2026-11-10", kind: "lecture" },
      ],
    }, true);

    expect(isWeeklyReviewQuestion("Summarize my week")).toBe(true);
    expect(isWeeklyReviewQuestion("Review my week")).toBe(true);
    expect(isWeeklyReviewQuestion("What tasks should I focus on today?")).toBe(false);

    const selected = selectRelevantAssistantContext(context, "Summarize my week");
    const serialized = JSON.stringify(selected);

    expect(selected.contextScope).toBe("full weekly review");
    expect(selected).toHaveProperty("taskSummary");
    expect(selected).toHaveProperty("prioritizedTasks");
    expect(selected).toHaveProperty("study");
    expect(selected).toHaveProperty("books");
    expect(selected).toHaveProperty("projects");
    expect(selected).not.toHaveProperty("currentSemester");
    expect(serialized).toContain("Current Pharmacy Course");
    expect(serialized).toContain("Current Unit");
    expect(serialized).not.toContain("Pharmaceutics III");
    expect(serialized).not.toContain("Archived Pharmacy Course");
    expect(serialized).not.toContain("Archived Unit");
    expect(serialized).not.toContain("BPharm");
    expect(serialized).not.toContain("Semester 1");
  });

  it("does not fall back to stale legacy courses when current Study data are unavailable", () => {
    const context = buildAssistantContext({
      "personal-assistant-study-v2": JSON.stringify({
        programs: [{ id: "program-old", name: "BPharm" }],
        semesters: [{ id: "semester-old", name: "Semester 1" }],
        courses: [{ id: "old-course", name: "Deleted legacy course" }],
      }),
    }, "2026-11-12", null, false);

    const selected = selectRelevantAssistantContext(context, "Summarize my week");
    const serialized = JSON.stringify(selected);

    expect((selected.study as { catalogueStatus: string }).catalogueStatus).toBe("unavailable");
    expect(serialized).not.toContain("Deleted legacy course");
    expect(serialized).not.toContain("BPharm");
    expect(serialized).not.toContain("Semester 1");
  });

  it("keeps general productivity advice separate from personal records", () => {
    const context = buildAssistantContext({
      "personal-assistant-calendar-items": JSON.stringify([
        {
          id: "task-1",
          type: "task",
          title: "Submit report",
          dueDate: "2026-10-21",
          priority: "high",
          completed: false,
        },
      ]),
      "personal-assistant-projects": JSON.stringify([
        { id: "project-1", name: "Research project", status: "active" },
      ]),
      "personal-assistant-study-v2": JSON.stringify({
        courses: [{ id: "course-1", name: "Computer Science" }],
      }),
    });

    const generalTaskAdvice = selectRelevantAssistantContext(
      context,
      "Explain the difference between urgent and important tasks. Give three practical examples and one simple way to prioritize them.",
    );

    const hypotheticalProductivitySystem = selectRelevantAssistantContext(
      context,
      "Design a practical productivity system for someone who works full-time, studies six hours per week, and manages a personal project. Include a realistic weekly schedule, daily routines, task prioritization, study techniques, project milestones, habit-building strategies, and a weekly review.",
    );

    expect(generalTaskAdvice).toEqual({
      contextScope: "general question",
    });

    expect(hypotheticalProductivitySystem).toEqual({
      contextScope: "general question",
    });

    const personalTaskQuestion = selectRelevantAssistantContext(
      context,
      "What are the tasks I need to finish?",
    );

    expect(personalTaskQuestion.contextScope).toBe("tasks");
    expect(personalTaskQuestion).toHaveProperty("prioritizedTasks");
  });

  it("does not attach personal records to unrelated general-knowledge questions", () => {
    const context = buildAssistantContext({
      "personal-assistant-projects": JSON.stringify([
        { id: "project-1", name: "Research project", status: "active" },
      ]),
    });

    const selected = selectRelevantAssistantContext(
      context,
      "Explain the Pomodoro technique",
    );

    expect(selected).toEqual({ contextScope: "general question" });
  });

});


describe("Study progress evidence for AI Copilot", () => {
  it("provides evidence summaries instead of treating the catalogue as progress", () => {
    const context = buildAssistantContext(
      {},
      "2026-11-22",
      {
        courses: [{
          id: "course-1",
          name: "Pharmacy",
          code: "PHA",
          archived_at: null,
        }],
        units: [{
          id: "unit-1",
          course_id: "course-1",
          name: "Pharmacology",
        }],
        topics: [
          {
            id: "topic-1",
            unit_id: "unit-1",
            title: "Autonomic drugs",
            status: "in_learning",
            weakness_flag: true,
          },
          {
            id: "topic-2",
            unit_id: "unit-1",
            title: "Antibiotics",
            status: "not_started",
          },
        ],
        review_events: [
          {
            id: "review-1",
            topic_id: "topic-1",
            status: "pending",
            current_due_date: "2026-11-19",
            current_priority: "high",
          },
          {
            id: "review-2",
            topic_id: "topic-2",
            status: "completed",
            current_due_date: "2026-11-21",
          },
        ],
        task_events: [
          {
            id: "event-1",
            event_type: "attempt",
            logged_at: "2026-11-20T08:00:00.000Z",
            result: "green",
            response_text: "PRIVATE STUDENT ANSWER",
          },
          {
            id: "event-2",
            event_type: "attempt",
            logged_at: "2026-11-21T08:00:00.000Z",
            result: "yellow",
          },
          {
            id: "event-3",
            event_type: "defer",
            logged_at: "2026-11-21T09:00:00.000Z",
            disposition: "DEFER",
            reason: "PRIVATE REASON",
          },
          {
            id: "event-old",
            event_type: "attempt",
            logged_at: "2026-11-01T08:00:00.000Z",
            result: "red",
          },
        ],
        work_sessions: [
          {
            id: "session-1",
            logged_at: "2026-11-20T09:00:00.000Z",
            actual_duration_min: 45,
            notes: "PRIVATE SESSION NOTES",
          },
          {
            id: "session-2",
            logged_at: "2026-11-21T09:00:00.000Z",
            actual_duration_min: 30,
          },
          {
            id: "session-old",
            logged_at: "2026-11-01T09:00:00.000Z",
            actual_duration_min: 120,
          },
        ],
        assignments: [{
          id: "assignment-1",
          title: "Research report",
          due_date: "2026-11-25",
          status: "in_progress",
          importance: "high",
        }],
        exams: [{
          id: "exam-1",
          course_id: "course-1",
          type: "cat2",
          date: "2026-12-01",
        }],
        settings: {
          trial_start_date: "2026-11-01",
          trial_end_date: "2026-11-28",
          week4_evaluation_start: "2026-11-22",
          week4_evaluation_end: "2026-11-28",
        },
        trial_periods: [{
          id: "trial-current",
          start_date: "2026-11-01",
          end_date: "2026-11-28",
          week4_evaluation_start: "2026-11-22",
          week4_evaluation_end: "2026-11-28",
          created_at: "2026-11-01T07:00:00.000Z",
          source: "user_confirmed",
        }],
        current_trial_id: "trial-current",
        weekly_metrics: [{
          trial_id: "trial-current",
          week_number: 1,
          week_start: "2026-11-01",
          week_end: "2026-11-07",
          overall_on_time_completion_pct: 80,
          priority_1_3_on_time_completion_pct: 90,
          deferral_rate_pct: 15,
          overdue_critical_backlog_min: 20,
          source_event_ids: ["event-old"],
          source_snapshot: [],
        }, {
          week_number: 2,
          week_start: "2026-11-08",
          week_end: "2026-11-14",
          overall_on_time_completion_pct: 75,
          priority_1_3_on_time_completion_pct: 85,
          deferral_rate_pct: 20,
          overdue_critical_backlog_min: 25,
          source_event_ids: [],
          source_snapshot: [],
        }],
      },
      true,
    );

    const selected = selectRelevantAssistantContext(
      context,
      "Review my study progress",
    );

    expect(selected.contextScope).toBe("study progress review");
    expect(selected).toHaveProperty("study");
    expect(selected).not.toHaveProperty("projects");
    expect(selected).not.toHaveProperty("books");

    const serialized = JSON.stringify(selected);
    const study = selected.study as {
      progressEvidence: {
        topics: {
          total: number;
          flaggedWeaknessCount: number;
          legacyNeedsReviewCount: number;
        };
        reviews: {
          overdueOpenCount: number;
        };
        taskEvents: {
          recentSevenDayCount: number;
          recentResultCounts: Record<string, number>;
        };
        workSessions: {
          recentStudyMinutes: number;
          recentStudyDays: number;
        };
        upcomingCommitments: {
          assignmentsWithinFourteenDays: unknown[];
          examsWithinThirtyDays: unknown[];
        };
        trial: { status: string; id: string | null };
        trialHistory: {
          currentTrialId: string | null;
          historyCount: number;
          periods: Array<{ id: string; status: string; source: string }>;
        };
        weeklyMetrics: {
          legacyUnassignedCount: number;
          trialAttributedCount: number;
        };
      };
    };

    expect(study.progressEvidence.topics).toMatchObject({
      total: 2,
      flaggedWeaknessCount: 1,
      legacyNeedsReviewCount: 2,
    });
    expect(study.progressEvidence.reviews.overdueOpenCount).toBe(1);
    expect(study.progressEvidence.taskEvents).toMatchObject({
      recentSevenDayCount: 3,
      recentResultCounts: {
        green: 1,
        yellow: 1,
      },
    });
    expect(study.progressEvidence.workSessions).toMatchObject({
      recentStudyMinutes: 75,
      recentStudyDays: 2,
    });
    expect(study.progressEvidence.upcomingCommitments.assignmentsWithinFourteenDays)
      .toHaveLength(1);
    expect(study.progressEvidence.upcomingCommitments.examsWithinThirtyDays)
      .toHaveLength(1);
    expect(study.progressEvidence.trial).toMatchObject({
      id: "trial-current",
      status: "active",
      source: "user_confirmed",
    });
    expect(study.progressEvidence.trialHistory).toMatchObject({
      currentTrialId: "trial-current",
      historyCount: 1,
      periods: [{ id: "trial-current", status: "active", source: "user_confirmed" }],
    });
    expect(study.progressEvidence.weeklyMetrics).toMatchObject({
      legacyUnassignedCount: 1,
      trialAttributedCount: 1,
    });

    expect(serialized).not.toContain("PRIVATE STUDENT ANSWER");
    expect(serialized).not.toContain("PRIVATE REASON");
    expect(serialized).not.toContain("PRIVATE SESSION NOTES");
  });

  it("does not describe unavailable Study evidence as an empty completed record", () => {
    const context = buildAssistantContext({}, "2026-11-22", null, false);
    const selected = selectRelevantAssistantContext(
      context,
      "Review my study progress",
    );

    const study = selected.study as {
      progressEvidence: { evidenceStatus: string };
    };

    expect(study.progressEvidence.evidenceStatus).toBe("unavailable");
  });
});
