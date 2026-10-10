import { describe, expect, it } from "vitest";

import {
  getEligibleTasks,
  getFreeWindows,
  scoreTask,
  type FixedEvent,
  type FreeWindow,
  type TodayTask,
} from "./today-engine";

function at(time: string): Date {
  return new Date(`2026-10-10T${time}:00Z`);
}

function makeTask(
  overrides: Partial<TodayTask> = {},
): TodayTask {
  return {
    id: "task-1",
    title: "Prepare assignment",
    type: "project",
    durationMinutes: 45,
    priority: 3,
    ...overrides,
  };
}

function makeWindow(): FreeWindow {
  return {
    startAt: at("09:00"),
    endAt: at("11:00"),
    durationMinutes: 120,
  };
}

describe("getFreeWindows", () => {
  it("returns the full period when there are no events", () => {
    const windows = getFreeWindows(
      [],
      at("09:00"),
      at("12:00"),
    );

    expect(windows).toHaveLength(1);
    expect(windows[0].durationMinutes).toBe(180);
    expect(windows[0].startAt.toISOString()).toBe(
      at("09:00").toISOString(),
    );
    expect(windows[0].endAt.toISOString()).toBe(
      at("12:00").toISOString(),
    );
  });

  it("splits free time around a scheduled event", () => {
    const events: FixedEvent[] = [
      {
        id: "class-1",
        title: "Lecture",
        startAt: at("10:00"),
        endAt: at("11:00"),
      },
    ];

    const windows = getFreeWindows(
      events,
      at("09:00"),
      at("12:00"),
    );

    expect(
      windows.map((window) => window.durationMinutes),
    ).toEqual([60, 60]);
  });

  it("does not block time for a cancelled event", () => {
    const events: FixedEvent[] = [
      {
        id: "class-1",
        title: "Cancelled lecture",
        startAt: at("10:00"),
        endAt: at("11:00"),
        cancelled: true,
      },
    ];

    const windows = getFreeWindows(
      events,
      at("09:00"),
      at("12:00"),
    );

    expect(windows).toHaveLength(1);
    expect(windows[0].durationMinutes).toBe(180);
  });

  it("handles overlapping events without double-counting time", () => {
    const events: FixedEvent[] = [
      {
        id: "event-1",
        title: "Meeting A",
        startAt: at("10:00"),
        endAt: at("11:00"),
      },
      {
        id: "event-2",
        title: "Meeting B",
        startAt: at("10:30"),
        endAt: at("12:00"),
      },
    ];

    const windows = getFreeWindows(
      events,
      at("09:00"),
      at("14:00"),
    );

    expect(
      windows.map((window) => window.durationMinutes),
    ).toEqual([60, 120]);
  });
});

describe("getEligibleTasks", () => {
  it("accepts a task that fits the available window", () => {
    const task = makeTask({
      durationMinutes: 45,
    });

    expect(
      getEligibleTasks([task], makeWindow()),
    ).toContainEqual(task);
  });

  it("rejects a task that is too long for the window", () => {
    const task = makeTask({
      durationMinutes: 150,
    });

    expect(
      getEligibleTasks([task], makeWindow()),
    ).toHaveLength(0);
  });

  it("rejects a task that cannot fit after its availability time", () => {
    const task = makeTask({
      durationMinutes: 60,
      availableFrom: at("10:30"),
    });

    expect(
      getEligibleTasks([task], makeWindow()),
    ).toHaveLength(0);
  });
});

describe("scoreTask", () => {
  it("scores a higher-priority task more highly when other factors match", () => {
    const window = makeWindow();
    const now = at("09:00");

    const lowPriority = makeTask({
      priority: 1,
    });

    const highPriority = makeTask({
      priority: 5,
    });

    expect(
      scoreTask(highPriority, window, now),
    ).toBeGreaterThan(
      scoreTask(lowPriority, window, now),
    );
  });
});

describe("deadline eligibility regression tests", () => {
  it("keeps overdue tasks eligible so they can still be worked on", () => {
    const task = makeTask({
      deadlineAt: at("08:30"),
      durationMinutes: 30,
    });

    expect(
      getEligibleTasks([task], makeWindow()),
    ).toContainEqual(task);
  });

  it("uses availableFrom when checking whether a task can finish before its deadline", () => {
    const task = makeTask({
      durationMinutes: 60,
      availableFrom: at("10:30"),
      deadlineAt: at("11:15"),
    });

    const longerWindow: FreeWindow = {
      startAt: at("09:00"),
      endAt: at("12:00"),
      durationMinutes: 180,
    };

    expect(
      getEligibleTasks([task], longerWindow),
    ).toHaveLength(0);
  });
});
