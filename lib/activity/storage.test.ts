import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getActivitySchedule,
  getActivitySchedules,
  getActivitySessions,
  getActivitySessionsForActivity,
  saveActivitySchedule,
  saveActivitySession,
} from "./storage";

import { getActivityIdentityKey } from "./identity";
import type {
  ActivitySchedule,
  ActivitySession,
} from "./types";

function makeStorage() {
  const values = new Map<string, string>();

  const storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };

  vi.stubGlobal("window", { localStorage: storage });
  return values;
}

const bookKey = getActivityIdentityKey({
  domain: "reading",
  kind: "book",
  entityId: 12,
});

const reviewKey = getActivityIdentityKey({
  domain: "study",
  kind: "review",
  entityId: "review-1",
});

function makeSession(
  overrides: Partial<ActivitySession> = {},
): ActivitySession {
  return {
    id: "session-1",
    activityKey: bookKey,
    startedAt: "2026-11-02T08:00:00.000Z",
    endedAt: "2026-11-02T08:10:00.000Z",
    actualDurationSeconds: 600,
    plannedDurationSeconds: 900,
    source: "manual",
    ...overrides,
  };
}

function makeSchedule(
  overrides: Partial<ActivitySchedule> = {},
): ActivitySchedule {
  return {
    activityKey: bookKey,
    scheduledStartAt: "2026-11-03T08:00:00.000Z",
    estimatedDurationMinutes: 30,
    priority: 3,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shared activity storage", () => {
  it("appends sessions and retrieves them by activity identity", () => {
    makeStorage();

    const bookSession = makeSession();
    const reviewSession = makeSession({
      id: "session-2",
      activityKey: reviewKey,
      source: "item_timer",
    });

    saveActivitySession(bookSession);
    saveActivitySession(reviewSession);

    expect(getActivitySessions()).toEqual([
      bookSession,
      reviewSession,
    ]);
    expect(getActivitySessionsForActivity(bookKey)).toEqual([
      bookSession,
    ]);
    expect(getActivitySessionsForActivity(reviewKey)).toEqual([
      reviewSession,
    ]);
  });

  it("rejects duplicate session IDs without replacing the original", () => {
    makeStorage();

    const original = makeSession();
    saveActivitySession(original);

    expect(() =>
      saveActivitySession({
        ...original,
        actualDurationSeconds: 1200,
      }),
    ).toThrow('Activity session "session-1" already exists.');

    expect(getActivitySessions()).toEqual([original]);
  });

  it("rejects sessions with invalid keys, times, durations, or sources", () => {
    makeStorage();

    expect(() =>
      saveActivitySession(makeSession({ activityKey: "not-a-key" })),
    ).toThrow("Cannot save an invalid activity session.");

    expect(() =>
      saveActivitySession(makeSession({
        endedAt: "2026-11-02T07:59:00.000Z",
      })),
    ).toThrow("Cannot save an invalid activity session.");

    expect(() =>
      saveActivitySession(makeSession({ actualDurationSeconds: -1 })),
    ).toThrow("Cannot save an invalid activity session.");

    expect(() =>
      saveActivitySession(makeSession({
        source: "unknown" as ActivitySession["source"],
      })),
    ).toThrow("Cannot save an invalid activity session.");

    expect(getActivitySessions()).toEqual([]);
  });

  it("upserts schedules by activity key while retaining other activities", () => {
    makeStorage();

    const first = makeSchedule();
    const second = makeSchedule({
      activityKey: reviewKey,
      dueAt: "2026-11-05T17:00:00.000Z",
      estimatedDurationMinutes: 20,
      priority: 5,
    });

    saveActivitySchedule(first);
    saveActivitySchedule(second);

    const updatedFirst = makeSchedule({
      dueAt: "2026-11-04T17:00:00.000Z",
      priority: 4,
    });
    saveActivitySchedule(updatedFirst);

    expect(getActivitySchedules()).toEqual([
      updatedFirst,
      second,
    ]);
    expect(getActivitySchedule(bookKey)).toEqual(updatedFirst);
    expect(getActivitySchedule(reviewKey)).toEqual(second);
  });

  it("rejects invalid or empty scheduling metadata", () => {
    makeStorage();

    expect(() =>
      saveActivitySchedule(makeSchedule({ activityKey: "bad-key" })),
    ).toThrow("Cannot save invalid activity scheduling metadata.");

    expect(() =>
      saveActivitySchedule(makeSchedule({ priority: 8 as ActivitySchedule["priority"] })),
    ).toThrow("Cannot save invalid activity scheduling metadata.");

    expect(() =>
      saveActivitySchedule({
        activityKey: bookKey,
        scheduledStartAt: "not-a-date",
      }),
    ).toThrow("Cannot save invalid activity scheduling metadata.");

    expect(getActivitySchedules()).toEqual([]);
  });

  it("preserves malformed stored session data before returning an empty list", () => {
    const values = makeStorage();
    const raw = "{malformed activity sessions";
    values.set("personal-assistant-activity-sessions-v1", raw);

    expect(getActivitySessions()).toEqual([]);
    expect(values.get("personal-assistant-activity-sessions-v1")).toBe(raw);

    const recoveryCopies = [...values.entries()]
      .filter(([key]) =>
        key.startsWith("personal-assistant-recovery-copy-"),
      )
      .map(([, value]) => JSON.parse(value));

    expect(recoveryCopies).toHaveLength(1);
    expect(recoveryCopies[0].rawValue).toBe(raw);
    expect(recoveryCopies[0].reason).toBe("invalid-json");
  });

  it("returns empty collections during server rendering", () => {
    vi.stubGlobal("window", undefined);

    expect(getActivitySessions()).toEqual([]);
    expect(getActivitySchedules()).toEqual([]);
  });
});
