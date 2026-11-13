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
