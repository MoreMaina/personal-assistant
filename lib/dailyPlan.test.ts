import { describe, expect, it } from "vitest";

import { validateDailyPlanAnswer } from "./dailyPlan";

const todayDate = "2026-10-12";
const tomorrowDate = "2026-10-13";

const input = {
  todayDate,
  tomorrowDate,
  now: new Date("2026-10-12T06:00:00"),
  tasks: [
    {
      id: "calendar:assignment-1",
      title: "Finish assignment",
      minutes: 90,
    },
  ],
  windows: [
    {
      date: todayDate,
      startAt: new Date("2026-10-12T07:00:00"),
      endAt: new Date("2026-10-12T10:00:00"),
    },
    {
      date: tomorrowDate,
      startAt: new Date("2026-10-13T07:00:00"),
      endAt: new Date("2026-10-13T12:00:00"),
    },
  ],
};

function answer(
  blocks: unknown[],
): string {
  return JSON.stringify({
    summary: "Suggested plan",
    blocks,
  });
}

function block(
  overrides: Record<string, unknown> = {},
) {
  return {
    date: todayDate,
    taskId: "calendar:assignment-1",
    start: "07:30",
    end: "09:00",
    reason: "The task is overdue.",
    ...overrides,
  };
}

describe("daily plan validation", () => {
  it("accepts a block that fits a real window and resolves the title locally", () => {
    const result = validateDailyPlanAnswer(
      answer([block()]),
      input,
    );

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].title).toBe("Finish assignment");
    expect(result.blocks[0].durationMinutes).toBe(90);
  });

  it("rejects ordinary prose instead of structured JSON", () => {
    expect(() =>
      validateDailyPlanAnswer("Here is your plan", input),
    ).toThrow(/verifiable schedule/i);
  });

  it("rejects a task ID that is not in the supplied local options", () => {
    expect(() =>
      validateDailyPlanAnswer(
        answer([block({ taskId: "invented-task" })]),
        input,
      ),
    ).toThrow(/task that could not be verified/i);
  });

  it("rejects a block outside the actual free window", () => {
    expect(() =>
      validateDailyPlanAnswer(
        answer([block({ start: "09:30", end: "10:30" })]),
        input,
      ),
    ).toThrow(/actual free window/i);
  });

  it("rejects blocks that have already started today", () => {
    const laterInput = {
      ...input,
      now: new Date("2026-10-12T08:00:00"),
    };

    expect(() =>
      validateDailyPlanAnswer(
        answer([block({ start: "07:30", end: "09:00" })]),
        laterInput,
      ),
    ).toThrow(/past/i);
  });

  it("rejects blocks that conflict with an event with an unknown end time", () => {
    expect(() =>
      validateDailyPlanAnswer(
        answer([block()]),
        {
          ...input,
          pointEvents: [
            {
              date: todayDate,
              time: "08:15",
              title: "Test",
            },
          ],
        },
      ),
    ).toThrow(/conflicts with the timed event/i);
  });

  it("rejects a block that overlaps an event which started before the block", () => {
    expect(() =>
      validateDailyPlanAnswer(
        answer([block({ start: "08:30", end: "10:00" })]),
        {
          ...input,
          pointEvents: [
            {
              date: todayDate,
              time: "08:00",
              endTime: "09:00",
              title: "Existing class",
            },
          ],
        },
      ),
    ).toThrow(/conflicts with the timed event "Existing class"/i);
  });

  it("rejects adjacent blocks without the required 10-minute break", () => {
    expect(() =>
      validateDailyPlanAnswer(
        answer([
          block(),
          block({
            start: "09:05",
            end: "09:30",
          }),
        ]),
        {
          ...input,
          tasks: [
            ...input.tasks,
            {
              id: "calendar:assignment-2",
              title: "Revision notes",
              minutes: 30,
            },
          ],
        },
      ),
    ).toThrow(/10 minutes/i);
  });

  it("rejects blocks longer than 90 minutes", () => {
    expect(() =>
      validateDailyPlanAnswer(
        answer([block({ end: "09:31" })]),
        input,
      ),
    ).toThrow(/allowed hours or duration/i);
  });

  it("accepts an empty block list when nothing fits", () => {
    const result = validateDailyPlanAnswer(answer([]), input);
    expect(result.blocks).toEqual([]);
  });

  it("rejects a block exceeding the task estimate even when under 90 minutes", () => {
    const shorterTaskInput = {
      ...input,
      tasks: [{ ...input.tasks[0], minutes: 45 }],
    };

    expect(() =>
      validateDailyPlanAnswer(
        answer([block({ start: "07:30", end: "08:30" })]),
        shorterTaskInput,
      ),
    ).toThrow(/allowed hours or duration/i);
  });

  it("rejects malformed 24-hour times", () => {
    expect(() =>
      validateDailyPlanAnswer(
        answer([block({ start: "25:00" })]),
        input,
      ),
    ).toThrow(/invalid time/i);
  });

  it("rejects plans containing more than three blocks", () => {
    expect(() =>
      validateDailyPlanAnswer(
        answer([block(), block(), block(), block()]),
        input,
      ),
    ).toThrow(/invalid schedule structure/i);
  });

  it("rejects overlapping work blocks", () => {
    const twoTaskInput = {
      ...input,
      tasks: [
        ...input.tasks,
        {
          id: "calendar:assignment-2",
          title: "Revision notes",
          minutes: 30,
        },
      ],
    };

    expect(() =>
      validateDailyPlanAnswer(
        answer([
          block(),
          block({
            taskId: "calendar:assignment-2",
            start: "08:30",
            end: "09:00",
          }),
        ]),
        twoTaskInput,
      ),
    ).toThrow(/overlap or leave less than 10 minutes/i);
  });
});
