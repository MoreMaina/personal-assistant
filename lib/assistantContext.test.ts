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

  it("selects study context when the question is about courses or units", () => {
    const context = buildAssistantContext({
      "personal-assistant-projects": JSON.stringify([
        { id: "project-1", name: "Research project", status: "active" },
      ]),
      "personal-assistant-study-v2": JSON.stringify({
        courses: [{ id: "course-1", name: "Computer Science" }],
        units: [{ id: "unit-1", name: "Data Structures" }],
      }),
    });

    const selected = selectRelevantAssistantContext(
      context,
      "What units am I studying this semester?",
    );

    expect(selected.contextScope).toBe("study");
    expect(selected).toHaveProperty("study");
    expect(selected).toHaveProperty("currentSemester");
    expect(selected).not.toHaveProperty("projects");
    expect(JSON.stringify(selected)).toContain("Data Structures");
    expect(JSON.stringify(selected)).not.toContain("Research project");
  });

  it("preserves the full context for an explicit weekly review", () => {
    const context = buildAssistantContext({
      "personal-assistant-projects": JSON.stringify([
        { id: "project-1", name: "Research project", status: "active" },
      ]),
      "personal-assistant-books": JSON.stringify([
        { id: "book-1", title: "A reading book", currentPage: 42 },
      ]),
    });

    expect(isWeeklyReviewQuestion("Summarize my week")).toBe(true);
    expect(isWeeklyReviewQuestion("Review my week")).toBe(true);
    expect(isWeeklyReviewQuestion("What tasks should I focus on today?")).toBe(false);

    const selected = selectRelevantAssistantContext(context, "Summarize my week");

    expect(selected.contextScope).toBe("full weekly review");
    expect(selected).toHaveProperty("taskSummary");
    expect(selected).toHaveProperty("prioritizedTasks");
    expect(selected).toHaveProperty("study");
    expect(selected).toHaveProperty("books");
    expect(selected).toHaveProperty("projects");
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
