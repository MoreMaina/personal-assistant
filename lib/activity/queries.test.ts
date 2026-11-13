import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteBookAndSessions,
  type ReadingSession,
} from "../readingStorage";
import { toReadingActivitySession } from "./adapters/readingSession";
import { getActivityIdentityKey } from "./identity";
import { getCombinedActivitySessions } from "./queries";
import type { ActivitySession } from "./types";

const ACTIVITY_SESSIONS_KEY =
  "personal-assistant-activity-sessions-v1";
const READING_SESSIONS_KEY =
  "personal-assistant-reading-sessions";

const reviewKey = getActivityIdentityKey({
  domain: "study",
  kind: "review",
  entityId: "review-1",
});

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
  vi.stubGlobal("localStorage", storage);
  return values;
}

function makeReadingSession(
  overrides: Partial<ReadingSession> = {},
): ReadingSession {
  return {
    id: 1700000000000,
    bookId: 42,
    startedAt: "2026-11-02T07:00:00.000Z",
    endedAt: "2026-11-02T07:10:12.500Z",
    minutes: 10,
    ...overrides,
  };
}

function makeSharedSession(
  overrides: Partial<ActivitySession> = {},
): ActivitySession {
  return {
    id: "shared-session-1",
    activityKey: reviewKey,
    startedAt: "2026-11-02T06:00:00.000Z",
    endedAt: "2026-11-02T06:10:00.000Z",
    actualDurationSeconds: 600,
    plannedDurationSeconds: null,
    source: "manual",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("combined activity session queries", () => {
  it("combines shared and Reading sessions in newest-first order", () => {
    const values = makeStorage();

    const olderShared = makeSharedSession({
      id: "shared-older",
      startedAt: "2026-11-02T06:00:00.000Z",
      endedAt: "2026-11-02T06:10:00.000Z",
    });

    const newerShared = makeSharedSession({
      id: "shared-newer",
      startedAt: "2026-11-02T08:00:00.000Z",
      endedAt: "2026-11-02T08:10:00.000Z",
    });

    const readingSession = makeReadingSession();

    values.set(
      ACTIVITY_SESSIONS_KEY,
      JSON.stringify([olderShared, newerShared]),
    );
    values.set(
      READING_SESSIONS_KEY,
      JSON.stringify([readingSession]),
    );

    const originalShared = values.get(ACTIVITY_SESSIONS_KEY);
    const originalReading = values.get(READING_SESSIONS_KEY);

    expect(getCombinedActivitySessions()).toEqual([
      newerShared,
      toReadingActivitySession(readingSession),
      olderShared,
    ]);

    expect(values.get(ACTIVITY_SESSIONS_KEY)).toBe(originalShared);
    expect(values.get(READING_SESSIONS_KEY)).toBe(originalReading);
  });

  it("skips an invalid Reading record without blocking valid sessions", () => {
    const values = makeStorage();

    const validReading = makeReadingSession();
    const invalidReading = makeReadingSession({
      id: 1700000000001,
      startedAt: "not-a-date",
    });
    const shared = makeSharedSession();

    const rawReading = JSON.stringify([
      invalidReading,
      validReading,
    ]);

    values.set(READING_SESSIONS_KEY, rawReading);
    values.set(
      ACTIVITY_SESSIONS_KEY,
      JSON.stringify([shared]),
    );

    expect(getCombinedActivitySessions()).toEqual([
      toReadingActivitySession(validReading),
      shared,
    ]);

    // The invalid specialist record is not deleted or rewritten.
    expect(values.get(READING_SESSIONS_KEY)).toBe(rawReading);
  });

  it("reflects Reading session deletion through the specialist store", () => {
    makeStorage();

    const deletedBookSession = makeReadingSession({
      id: 1700000000001,
      bookId: 42,
    });

    const retainedBookSession = makeReadingSession({
      id: 1700000000002,
      bookId: 43,
    });

    window.localStorage.setItem(
      READING_SESSIONS_KEY,
      JSON.stringify([
        deletedBookSession,
        retainedBookSession,
      ]),
    );

    deleteBookAndSessions(42);

    expect(getCombinedActivitySessions()).toEqual([
      toReadingActivitySession(retainedBookSession),
    ]);
  });

  it("returns an empty list during server rendering", () => {
    vi.stubGlobal("window", undefined);

    expect(getCombinedActivitySessions()).toEqual([]);
  });
});
