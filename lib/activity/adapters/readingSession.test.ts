import { describe, expect, it } from "vitest";

import type { ReadingSession } from "../../readingStorage";
import { toReadingActivitySession } from "./readingSession";

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

describe("Reading activity session adapter", () => {
  it("converts a Reading session using its stable book identity", () => {
    const session = makeReadingSession();

    expect(toReadingActivitySession(session)).toEqual({
      id: "reading-session:42:1700000000000",
      activityKey: "pa:v1:reading:book:42",
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      actualDurationSeconds: 613,
      plannedDurationSeconds: null,
      source: "stopwatch",
    });
  });

  it("produces the same shared identity and session ID on repeated conversion", () => {
    const session = makeReadingSession();

    expect(toReadingActivitySession(session)).toEqual(
      toReadingActivitySession(session),
    );

    expect(session).toEqual(makeReadingSession());
  });

  it("rejects invalid session IDs, book IDs and durations", () => {
    expect(() =>
      toReadingActivitySession(makeReadingSession({ id: -1 })),
    ).toThrow();

    expect(() =>
      toReadingActivitySession(makeReadingSession({ bookId: -1 })),
    ).toThrow();

    expect(() =>
      toReadingActivitySession(makeReadingSession({ minutes: 0 })),
    ).toThrow();
  });

  it("rejects invalid or reversed timestamps", () => {
    expect(() =>
      toReadingActivitySession(
        makeReadingSession({ startedAt: "not-a-date" }),
      ),
    ).toThrow();

    expect(() =>
      toReadingActivitySession(
        makeReadingSession({
          endedAt: "2026-11-02T06:59:59.000Z",
        }),
      ),
    ).toThrow();
  });
});
