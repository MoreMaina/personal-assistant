import { getCombinedActivitySessions } from "./queries";
import { getActivityIdentityKey } from "./identity";
import type { ActivitySession } from "./types";
import type { DateLike, TodayTask } from "../today-engine";

function getTimestamp(value: DateLike | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const timestamp =
    value instanceof Date ? value.getTime() : Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Applies the latest completed shared session to matching Today tasks.
 *
 * The session end time drives the existing cooldown mechanism.
 * A newer specialist lastWorkedAt value is always preserved.
 * Neither sessions nor feature-specific task records are modified.
 */
export function applyActivityProgressToTasks(
  tasks: TodayTask[],
  sessions: readonly ActivitySession[] = getCombinedActivitySessions(),
  now = new Date(),
): TodayTask[] {
  if (tasks.length === 0 || sessions.length === 0) {
    return tasks;
  }

  const nowMs = now.getTime();
  const latestByActivity = new Map<string, ActivitySession>();

  for (const session of sessions) {
    const endedAt = Date.parse(session.endedAt);

    // A future-dated record must not trigger a current cooldown.
    if (!Number.isFinite(endedAt) || endedAt > nowMs) {
      continue;
    }

    const existing = latestByActivity.get(session.activityKey);

    if (!existing || endedAt > Date.parse(existing.endedAt)) {
      latestByActivity.set(session.activityKey, session);
    }
  }

  if (latestByActivity.size === 0) {
    return tasks;
  }

  return tasks.map((task) => {
    if (!task.activityIdentity) {
      return task;
    }

    const activityKey = getActivityIdentityKey(task.activityIdentity);
    const latestSession = latestByActivity.get(activityKey);

    if (!latestSession) {
      return task;
    }

    const sessionEndedAt = Date.parse(latestSession.endedAt);
    const existingWorkedAt = getTimestamp(task.lastWorkedAt);

    // Never replace a newer timestamp from a specialist workflow.
    if (
      existingWorkedAt !== null &&
      existingWorkedAt >= sessionEndedAt
    ) {
      return task;
    }

    return {
      ...task,
      lastWorkedAt: latestSession.endedAt,
    };
  });
}
