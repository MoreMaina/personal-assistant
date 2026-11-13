import { getActivityIdentityKey } from "../identity";

import type { ReadingSession } from "../../readingStorage";
import type { ActivitySession } from "../types";

const INVALID_SESSION =
  "Cannot convert an invalid Reading session into a shared activity session.";

/**
 * Converts an existing completed Reading session into the shared
 * activity contract without modifying or persisting either record.
 */
export function toReadingActivitySession(
  session: ReadingSession,
): ActivitySession {
  if (
    !Number.isSafeInteger(session.id) ||
    session.id < 0 ||
    !Number.isSafeInteger(session.bookId) ||
    session.bookId < 0 ||
    !Number.isSafeInteger(session.minutes) ||
    session.minutes < 1
  ) {
    throw new Error(INVALID_SESSION);
  }

  const startedAtMs = Date.parse(session.startedAt);
  const endedAtMs = Date.parse(session.endedAt);

  if (
    !Number.isFinite(startedAtMs) ||
    !Number.isFinite(endedAtMs) ||
    endedAtMs < startedAtMs
  ) {
    throw new Error(INVALID_SESSION);
  }

  const actualDurationSeconds = Math.round(
    (endedAtMs - startedAtMs) / 1000,
  );

  if (
    !Number.isSafeInteger(actualDurationSeconds) ||
    actualDurationSeconds < 0
  ) {
    throw new Error(INVALID_SESSION);
  }

  return {
    id: "reading-session:" + session.bookId + ":" + session.id,
    activityKey: getActivityIdentityKey({
      domain: "reading",
      kind: "book",
      entityId: session.bookId,
    }),
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    actualDurationSeconds,
    plannedDurationSeconds: null,
    source: "stopwatch",
  };
}
