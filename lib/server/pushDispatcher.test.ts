import { describe, expect, it } from "vitest";

import type { CalendarTask } from "@/lib/calendarItemStorage";
import {
  getStudyDigest,
  getTaskDigest,
  isNearReminder,
  localDateTimeToUtc,
  timeHasPassedToday,
} from "@/lib/server/pushDispatcher";
import type { StudyMvpState } from "@/lib/studyMvp/types";

function makeTask(
  id: string,
  title: string,
  overrides: Partial<CalendarTask> = {},
): CalendarTask {
  return {
    id,
    type: "task",
    title,
    priority: "medium",
    completed: false,
    createdAt: "2026-11-01T08:00:00.000Z",
    updatedAt: "2026-11-01T08:00:00.000Z",
    ...overrides,
  };
}

describe("push notification scheduling helpers", () => {
  it("converts Nairobi wall-clock time to the correct UTC instant", () => {
    const result = localDateTimeToUtc(
      "2026-11-20",
      "08:00",
      "Africa/Nairobi",
    );

    expect(result?.toISOString()).toBe("2026-11-20T05:00:00.000Z");
  });

  it("rejects nonexistent local times during daylight-saving transitions", () => {
    const result = localDateTimeToUtc(
      "2026-03-08",
      "02:30",
      "America/New_York",
    );

    expect(result).toBeNull();
  });

  it("checks daily digest times in the device timezone", () => {
    const beforeNine = new Date("2026-11-20T05:59:00.000Z");
    const atNine = new Date("2026-11-20T06:00:00.000Z");

    expect(
      timeHasPassedToday(
        beforeNine,
        "Africa/Nairobi",
        "2026-11-20",
        "09:00",
      ),
    ).toBe(false);

    expect(
      timeHasPassedToday(
        atNine,
        "Africa/Nairobi",
        "2026-11-20",
        "09:00",
      ),
    ).toBe(true);
  });

  it("matches a reminder lead-time window without accepting late matches", () => {
    const now = new Date("2026-11-20T05:00:00.000Z");

    expect(
      isNearReminder(
        new Date("2026-11-20T05:30:45.000Z"),
        now,
        30,
      ),
    ).toBe(true);

    expect(
      isNearReminder(
        new Date("2026-11-20T05:32:00.000Z"),
        now,
        30,
      ),
    ).toBe(false);
  });

  it("summarizes due-today and overdue tasks but excludes completed and future tasks", () => {
    const tasks = [
      makeTask("overdue", "Overdue report", {
        dueDate: "2026-11-18",
      }),
      makeTask("today", "Today's assignment", {
        dueDate: "2026-11-20",
      }),
      makeTask("completed", "Finished task", {
        dueDate: "2026-11-19",
        completed: true,
      }),
      makeTask("future", "Future task", {
        dueDate: "2026-11-21",
      }),
      makeTask("unscheduled", "Unscheduled task"),
    ];

    const digest = getTaskDigest(tasks, "2026-11-20");

    expect(digest).toEqual({
      count: 2,
      titles: ["Overdue report", "Today's assignment"],
    });
  });

  it("respects completed and skipped occurrences in recurring task series", () => {
    const tasks = [
      makeTask("recurring-open", "Recurring work", {
        recurrence: {
          frequency: "daily",
          interval: 1,
          startDate: "2026-11-19",
          until: "2026-11-20",
        },
        exceptions: [
          {
            occurrenceDate: "2026-11-19",
            completed: true,
          },
        ],
      }),
      makeTask("recurring-complete", "Completed recurring work", {
        recurrence: {
          frequency: "daily",
          interval: 1,
          startDate: "2026-11-20",
          until: "2026-11-20",
        },
        exceptions: [
          {
            occurrenceDate: "2026-11-20",
            completed: true,
          },
        ],
      }),
      makeTask("recurring-skipped", "Skipped recurring work", {
        recurrence: {
          frequency: "daily",
          interval: 1,
          startDate: "2026-11-20",
          until: "2026-11-20",
        },
        exceptions: [
          {
            occurrenceDate: "2026-11-20",
            skipped: true,
          },
        ],
      }),
    ];

    const digest = getTaskDigest(tasks, "2026-11-20");

    expect(digest).toEqual({
      count: 1,
      titles: ["Recurring work"],
    });
  });

  it("reports unfinished saved-plan sections using finalized dispositions", () => {
    const state = {
      daily_plan_history: [
        {
          id: "plan-today-v1",
          date: "2026-11-20",
          version: 1,
          saved_at: "2026-11-20T05:00:00.000Z",
          plan: {
            items: [
              {
                kind: "review",
                disposition: "DO",
                forced_disposition: null,
              },
              {
                kind: "gate",
                disposition: "DEFER",
                forced_disposition: null,
              },
              {
                kind: "assignment",
                disposition: "DO",
                forced_disposition: "complete",
              },
              {
                kind: "corrective",
                disposition: "DEFER",
                forced_disposition: "override_defer",
              },
              {
                kind: "mixed_practice",
                disposition: "SKIP",
                forced_disposition: "skip",
              },
              {
                kind: "topic_consolidation",
                disposition: "DO",
                forced_disposition: "split",
              },
              {
                kind: "sampler",
                disposition: "DO",
                forced_disposition: null,
              },
            ],
          },
        },
      ],
      daily_plan_executions: [
        {
          id: "execution-today",
          date: "2026-11-20",
          plan_snapshot_id: "plan-today-v1",
          completed_section_ids: ["reviews", "sampler"],
          updated_at: "2026-11-20T06:00:00.000Z",
        },
      ],
    } as unknown as StudyMvpState;

    expect(getStudyDigest(state, "2026-11-20")).toBe(
      "2 unfinished sections: Assignments, Topic consolidation.",
    );
  });

  it("returns no Study digest when every planned section is complete", () => {
    const state = {
      daily_plan_history: [
        {
          id: "plan-complete",
          date: "2026-11-20",
          version: 1,
          saved_at: "2026-11-20T05:00:00.000Z",
          plan: {
            items: [
              {
                kind: "review",
                disposition: "DO",
                forced_disposition: null,
              },
            ],
          },
        },
      ],
      daily_plan_executions: [
        {
          id: "execution-complete",
          date: "2026-11-20",
          plan_snapshot_id: "plan-complete",
          completed_section_ids: ["reviews"],
          updated_at: "2026-11-20T06:00:00.000Z",
        },
      ],
    } as unknown as StudyMvpState;

    expect(getStudyDigest(state, "2026-11-20")).toBeNull();
  });
});

import type {
  GoogleCalendarEvent,
} from "@/lib/googleCalendarTypes";
import {
  buildCandidates,
  type SubscriptionRow,
} from "@/lib/server/pushDispatcher";
import type { CalendarEvent } from "@/lib/calendarItemStorage";

function makeSubscription(
  overrides: Partial<SubscriptionRow> = {},
): SubscriptionRow {
  return {
    id: "subscription-test",
    user_id: "user-test",
    endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
    p256dh_key: "test-p256dh",
    auth_key: "test-auth",
    time_zone: "Africa/Nairobi",
    enabled: true,
    class_reminders_enabled: false,
    calendar_reminders_enabled: true,
    google_calendar_enabled: false,
    task_reminders_enabled: false,
    study_reminders_enabled: false,
    event_reminder_minutes: [30, 10],
    class_reminder_minutes: [30, 10],
    all_day_event_time: "09:00",
    task_digest_time: "09:00",
    study_digest_time: "08:00",
    ...overrides,
  };
}

describe("push candidate generation", () => {
  const now = new Date("2026-11-20T05:00:00.000Z");

  it("creates an app calendar reminder at the configured lead time", () => {
    const event: CalendarEvent = {
      id: "event-1",
      type: "event",
      title: "Economics seminar",
      date: "2026-11-20",
      startTime: "08:30",
      createdAt: "2026-11-01T08:00:00.000Z",
      updatedAt: "2026-11-01T08:00:00.000Z",
    };

    const candidates = buildCandidates(
      makeSubscription(),
      {
        "personal-assistant-calendar-items": JSON.stringify([event]),
      },
      null,
      [],
      now,
    );

    expect(candidates).toContainEqual(
      expect.objectContaining({
        key: "app-event:event-1@2026-11-20:lead:30",
        title: "Economics seminar",
        body: "Starts in 30 minutes (08:30).",
        url: "/calendar",
      }),
    );
  });

  it("does not remind for a cancelled class session", () => {
    const candidates = buildCandidates(
      makeSubscription({
        calendar_reminders_enabled: false,
        class_reminders_enabled: true,
      }),
      {
        "personal-assistant-classes": JSON.stringify([
          {
            id: 17,
            name: "Computer Science",
            type: "Lecture",
            day: "Friday",
            start: "08:30",
            end: "09:30",
          },
        ]),
        "cancelled-class-sessions": JSON.stringify({
          "2026-11-20": [17],
        }),
      },
      null,
      [],
      now,
    );

    expect(candidates).toEqual([]);
  });

  it("creates a class reminder when the session is not cancelled", () => {
    const candidates = buildCandidates(
      makeSubscription({
        calendar_reminders_enabled: false,
        class_reminders_enabled: true,
      }),
      {
        "personal-assistant-classes": JSON.stringify([
          {
            id: 17,
            name: "Computer Science",
            type: "Lecture",
            day: "Friday",
            start: "08:30",
            end: "09:30",
          },
        ]),
        "cancelled-class-sessions": JSON.stringify({}),
      },
      null,
      [],
      now,
    );

    expect(candidates).toContainEqual(
      expect.objectContaining({
        key: "class:17:2026-11-20:lead:30",
        title: "Computer Science",
        body: "Starts in 30 minutes (08:30).",
      }),
    );
  });

  it("keeps same-ID Google events from different calendars distinct", () => {
    const makeGoogleEvent = (
      calendarId: string,
    ): GoogleCalendarEvent => ({
      id: "same-event-id",
      calendarId,
      calendarName: calendarId,
      title: "Calendar event",
      startDate: null,
      endDate: null,
      startDateTime: "2026-11-20T08:30:00+03:00",
      endDateTime: "2026-11-20T09:30:00+03:00",
      allDay: false,
    });

    const candidates = buildCandidates(
      makeSubscription({
        calendar_reminders_enabled: false,
        google_calendar_enabled: true,
      }),
      {},
      null,
      [
        makeGoogleEvent("calendar-one"),
        makeGoogleEvent("calendar-two"),
      ],
      now,
    );

    expect(candidates).toHaveLength(2);
    expect(candidates.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("google-event:calendar-one:same-event-id"),
        expect.stringContaining("google-event:calendar-two:same-event-id"),
      ]),
    );
  });

  it("includes overdue recurring task occurrences older than one year", () => {
    const task = makeTask("old-recurring", "Long overdue recurring task", {
      recurrence: {
        frequency: "daily",
        interval: 1,
        startDate: "2025-01-01",
        until: "2026-11-20",
      },
    });

    expect(
      getTaskDigest([task], "2026-11-20"),
    ).toEqual({
      count: 1,
      titles: ["Long overdue recurring task"],
    });
  });
});
