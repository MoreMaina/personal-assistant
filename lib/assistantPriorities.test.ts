import { describe, expect, it } from "vitest";
import { buildAssistantContext } from "./assistantContext";

describe("AI task prioritization", () => {
  it("ranks overdue, today, soon, later, and undated tasks", () => {
    const context = buildAssistantContext({
      "personal-assistant-calendar-items": JSON.stringify([
        { id: "future", title: "Future", type: "task", dueDate: "2026-10-25", priority: "high", completed: false },
        { id: "undated", title: "Undated", type: "task", priority: "high", completed: false },
        { id: "today", title: "Today", type: "task", dueDate: "2026-10-11", priority: "low", completed: false },
        { id: "overdue", title: "Overdue", type: "task", dueDate: "2026-10-07", priority: "medium", completed: false },
        { id: "soon", title: "Soon", type: "task", dueDate: "2026-10-13", priority: "high", completed: false },
      ]),
    }, "2026-10-11");

    expect(context.prioritizedTasks.map((task) => task.id)).toEqual([
      "overdue", "today", "soon", "future", "undated",
    ]);
    expect(context.prioritizedTasks[0].urgency).toBe("overdue");
    expect(context.prioritizedTasks[1].urgency).toBe("due today");
  });

  it("excludes completed tasks and calendar events", () => {
    const context = buildAssistantContext({
      "personal-assistant-calendar-items": JSON.stringify([
        { id: "done", title: "Done", type: "task", dueDate: "2026-10-10", priority: "high", completed: true },
        { id: "event", title: "Lecture", type: "event", date: "2026-10-11" },
        { id: "open", title: "Open", type: "task", dueDate: "2026-10-12", priority: "medium", completed: false },
      ]),
    }, "2026-10-11");

    expect(context.prioritizedTasks.map((task) => task.id)).toEqual(["open"]);
  });
});
