
import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./calendarItemStorage";
import { expandCalendarEvents } from "./calendarRecurrence";


function makeEvent(
  overrides: Pick<CalendarEvent, "id" | "date"> &
    Partial<Omit<CalendarEvent, "id" | "date">>,
): CalendarEvent {
  return {
    ...overrides,
    id: overrides.id,
    type: "event",
    title: overrides.title ?? "Test event",
    date: overrides.date,
    createdAt:
      overrides.createdAt ?? "2026-10-01T08:00:00.000Z",
    updatedAt:
      overrides.updatedAt ?? "2026-10-01T08:00:00.000Z",
  };
}


describe("expandCalendarEvents", () => {
  it("includes one-off events in the inclusive date range", () => {
    const events = [
      makeEvent({ id: "before", date: "2026-09-30" }),
      makeEvent({ id: "start", date: "2026-10-01" }),
      makeEvent({ id: "end", date: "2026-10-03" }),
      makeEvent({ id: "after", date: "2026-10-04" }),
    ];

    const result = expandCalendarEvents(
      events,
      "2026-10-01",
      "2026-10-03",
    );

    expect(result.map((item) => item.eventId)).toEqual([
      "start",
      "end",
    ]);
  });

  it("supports daily recurrence with an interval of two days", () => {
    const event = makeEvent({
      id: "daily",
      date: "2026-10-01",
      recurrence: {
        frequency: "daily",
        interval: 2,
      },
    });

    const result = expandCalendarEvents(
      [event],
      "2026-10-01",
      "2026-10-07",
    );

    expect(result.map((item) => item.date)).toEqual([
      "2026-10-01",
      "2026-10-03",
      "2026-10-05",
      "2026-10-07",
    ]);
  });

  it("supports every-two-week recurrence on selected weekdays", () => {
    const event = makeEvent({
      id: "fortnightly",
      date: "2026-10-07",
      recurrence: {
        frequency: "weekly",
        interval: 2,
        weekdays: ["Monday", "Wednesday"],
      },
    });

    const result = expandCalendarEvents(
      [event],
      "2026-10-07",
      "2026-11-04",
    );

    expect(result.map((item) => item.date)).toEqual([
      "2026-10-07",
      "2026-10-19",
      "2026-10-21",
      "2026-11-02",
      "2026-11-04",
    ]);
  });

  it("skips months that do not contain the monthly date", () => {
    const event = makeEvent({
      id: "month-end",
      date: "2026-10-31",
      recurrence: {
        frequency: "monthly",
        interval: 1,
      },
    });

    const result = expandCalendarEvents(
      [event],
      "2026-10-01",
      "2026-12-31",
    );

    expect(result.map((item) => item.date)).toEqual([
      "2026-10-31",
      "2026-12-31",
    ]);
  });

  it("includes the recurrence end date and excludes later dates", () => {
    const event = makeEvent({
      id: "limited",
      date: "2026-10-01",
      recurrence: {
        frequency: "daily",
        interval: 1,
        until: "2026-10-03",
      },
    });

    const result = expandCalendarEvents(
      [event],
      "2026-10-01",
      "2026-10-05",
    );

    expect(result.map((item) => item.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });

  it("omits a cancelled occurrence", () => {
    const event = makeEvent({
      id: "cancel-one",
      date: "2026-10-01",
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      exceptions: [
        {
          occurrenceDate: "2026-10-02",
          cancelled: true,
        },
      ],
    });

    const result = expandCalendarEvents(
      [event],
      "2026-10-01",
      "2026-10-03",
    );

    expect(result.map((item) => item.date)).toEqual([
      "2026-10-01",
      "2026-10-03",
    ]);
  });

  it("applies occurrence overrides and allows inherited values to be cleared", () => {
    const event = makeEvent({
      id: "edited",
      date: "2026-10-01",
      startTime: "09:00",
      endTime: "10:00",
      location: "Library",
      notes: "Bring notebook",
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
      exceptions: [
        {
          occurrenceDate: "2026-10-02",
          override: {
            date: "2026-10-04",
            title: "Rescheduled event",
            startTime: null,
            endTime: "11:00",
            location: null,
            notes: null,
          },
        },
      ],
    });

    const result = expandCalendarEvents(
      [event],
      "2026-10-01",
      "2026-10-04",
    );

    const moved = result.find(
      (item) => item.originalDate === "2026-10-02",
    );

    expect(moved).toBeDefined();
    expect(moved?.date).toBe("2026-10-04");
    expect(moved?.title).toBe("Rescheduled event");
    expect(moved?.startTime).toBeUndefined();
    expect(moved?.endTime).toBe("11:00");
    expect(moved?.location).toBeUndefined();
    expect(moved?.notes).toBeUndefined();
  });

  it("includes a moved occurrence whose original date is outside the range", () => {
    const event = makeEvent({
      id: "move-into-range",
      date: "2026-10-07",
      recurrence: {
        frequency: "weekly",
        interval: 1,
      },
      exceptions: [
        {
          occurrenceDate: "2026-10-07",
          override: {
            date: "2026-10-10",
          },
        },
      ],
    });

    const result = expandCalendarEvents(
      [event],
      "2026-10-09",
      "2026-10-11",
    );

    expect(result).toHaveLength(1);
    expect(result[0].originalDate).toBe("2026-10-07");
    expect(result[0].date).toBe("2026-10-10");
  });

  it("does not duplicate a moved occurrence within the requested range", () => {
    const event = makeEvent({
      id: "move-inside-range",
      date: "2026-10-07",
      recurrence: {
        frequency: "weekly",
        interval: 1,
      },
      exceptions: [
        {
          occurrenceDate: "2026-10-07",
          override: {
            date: "2026-10-09",
          },
        },
      ],
    });

    const result = expandCalendarEvents(
      [event],
      "2026-10-07",
      "2026-10-10",
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("move-inside-range@2026-10-07");
    expect(result[0].date).toBe("2026-10-09");
  });

  it("returns an empty list for invalid or reversed date ranges", () => {
    const event = makeEvent({
      id: "daily",
      date: "2026-10-01",
      recurrence: {
        frequency: "daily",
        interval: 1,
      },
    });

    expect(
      expandCalendarEvents([event], "2026-10-05", "2026-10-01"),
    ).toEqual([]);

    expect(
      expandCalendarEvents([event], "not-a-date", "2026-10-05"),
    ).toEqual([]);
  });
});
