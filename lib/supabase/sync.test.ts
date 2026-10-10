import { describe, expect, it } from "vitest";

import {
  normalizeSnapshot,
  snapshotHasUserData,
  snapshotSignature,
  type AppSnapshot,
} from "./sync";

const CALENDAR_KEY =
  "personal-assistant-calendar-items";

describe("snapshot compatibility", () => {
  it("recognizes and preserves the Calendar storage key", () => {
    const calendarData = JSON.stringify([
      {
        id: "task-1",
        type: "task",
        title: "Finish assignment",
        completed: false,
      },
    ]);

    const snapshot = normalizeSnapshot({
      [CALENDAR_KEY]: calendarData,
      "personal-assistant-classes": "[]",
      "unknown-future-key": "some data",
    });

    expect(snapshot[CALENDAR_KEY]).toBe(calendarData);
    expect(snapshot["personal-assistant-classes"]).toBe("[]");
    expect(snapshot).not.toHaveProperty("unknown-future-key");
  });

  it("recognizes non-empty Calendar data as user data", () => {
    const snapshot: AppSnapshot = {
      [CALENDAR_KEY]: JSON.stringify([
        {
          id: "event-1",
          type: "event",
          title: "Study group",
        },
      ]),
    };

    expect(snapshotHasUserData(snapshot)).toBe(true);
  });

  it("does not treat an empty Calendar list as meaningful user data", () => {
    const snapshot: AppSnapshot = {
      [CALENDAR_KEY]: "[]",
    };

    expect(snapshotHasUserData(snapshot)).toBe(false);
  });

  it("produces the same signature when keys are in a different order", () => {
    const first: AppSnapshot = {
      [CALENDAR_KEY]: "[]",
      "personal-assistant-classes": "[]",
    };

    const second: AppSnapshot = {
      "personal-assistant-classes": "[]",
      [CALENDAR_KEY]: "[]",
    };

    expect(snapshotSignature(first)).toBe(
      snapshotSignature(second),
    );
  });
});
