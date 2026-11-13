import { getReadingSessions } from "../readingStorage";
import { toReadingActivitySession } from "./adapters/readingSession";
import { getActivitySessions } from "./storage";
import type { ActivitySession } from "./types";

function compareSessionsNewestFirst(
  left: ActivitySession,
  right: ActivitySession,
): number {
  const startDifference =
    Date.parse(right.startedAt) - Date.parse(left.startedAt);

  if (startDifference !== 0) {
    return startDifference;
  }

  const endDifference =
    Date.parse(right.endedAt) - Date.parse(left.endedAt);

  if (endDifference !== 0) {
    return endDifference;
  }

  return left.id.localeCompare(right.id);
}

/**
 * Combines native shared sessions with in-memory Reading adaptations.
 *
 * Reading remains authoritative for its specialist records. This function
 * does not copy, modify, or delete records in either source store.
 *
 * Do not deduplicate by session ID: legacy Reading IDs are Date.now-based
 * and are not guaranteed to be unique.
 */
export function getCombinedActivitySessions(): ActivitySession[] {
  const sessions = [...getActivitySessions()];

  for (const readingSession of getReadingSessions()) {
    try {
      sessions.push(toReadingActivitySession(readingSession));
    } catch {
      // Exclude only this invalid legacy record from the shared view.
      // Its specialist storage record remains untouched.
    }
  }

  return sessions.sort(compareSessionsNewestFirst);
}
