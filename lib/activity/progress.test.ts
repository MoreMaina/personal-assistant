import { describe, expect, it } from "vitest";

import { getActivityIdentityKey } from "./identity";
import { applyActivityProgressToTasks } from "./progress";
import type { ActivitySession } from "./types";
import type { TodayTask } from "../today-engine";

const NOW = new Date("2026-11-02T10:00:00.000Z");

const reviewIdentity = {
  domain: "study",
  kind: "review",
  entityId: "review-1",
} as const;

const projectIdentity = {
  domain: "project",
  kind: "project",
  entityId: "project-1",
} as const;

const reviewKey = getActivityIdentityKey(reviewIdentity);
const projectKey = getActivityIdentityKey(projectIdentity);

function makeTask(
  overrides: Partial<TodayTask> = {},
): TodayTask {
  return {
    id: "study-review-review-1",
    activityIdentity: reviewIdentity,
    title: "Review — Binary Trees",
    type: "study",
    durationMinutes: 15,
    priority: 2,
    cooldownMinutes: 120,
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<ActivitySession> = {},
): ActivitySession {
  return {
    id: "session-1",
    activityKey: reviewKey,
    startedAt: "2026-11-02T09:00:00.000Z",
    endedAt: "2026-11-02T09:20:00.000Z",
    actualDurationSeconds: 1200,
    plannedDurationSeconds: null,
    source: "stopwatch",
    ...overrides,
  };
}

describe("shared activity progress adapter", () => {
  it("uses the latest completed session end time for cooldowns", () => {
    const task = makeTask();
    const olderSession = makeSession({
      id: "session-old",
      endedAt: "2026-11-02T09:10:00.000Z",
    });
    const latestSession = makeSession({
      id: "session-latest",
      startedAt: "2026-11-02T09:25:00.000Z",
      endedAt: "2026-11-02T09:40:00.000Z",
    });

    const result = applyActivityProgressToTasks(
      [task],
      [olderSession, latestSession],
      NOW,
    );

    expect(result[0].lastWorkedAt).toBe(latestSession.endedAt);
    expect(result[0].cooldownMinutes).toBe(120);
    expect(task.lastWorkedAt).toBeUndefined();
  });

  it("preserves a newer specialist last-worked timestamp", () => {
    const specialistTimestamp = "2026-11-02T09:50:00.000Z";
    const task = makeTask({ lastWorkedAt: specialistTimestamp });

    const result = applyActivityProgressToTasks(
      [task],
      [makeSession()],
      NOW,
    );

    expect(result[0]).toBe(task);
    expect(result[0].lastWorkedAt).toBe(specialistTimestamp);
  });

  it("uses shared progress when it is newer than specialist progress", () => {
    const task = makeTask({
      lastWorkedAt: "2026-11-02T09:10:00.000Z",
    });
    const session = makeSession({
      endedAt: "2026-11-02T09:40:00.000Z",
    });

    const result = applyActivityProgressToTasks(
      [task],
      [session],
      NOW,
    );

    expect(result[0].lastWorkedAt).toBe(session.endedAt);
    expect(task.lastWorkedAt).toBe("2026-11-02T09:10:00.000Z");
  });

  it("matches sessions by stable activity identity across task IDs and titles", () => {
    const task = makeTask({
      id: "renamed-local-task",
      title: "A different display title",
    });

    const result = applyActivityProgressToTasks(
      [task],
      [makeSession({ activityKey: reviewKey })],
      NOW,
    );

    expect(result[0].lastWorkedAt).toBe("2026-11-02T09:20:00.000Z");
  });

  it("does not apply progress from another activity", () => {
    const task = makeTask();
    const unrelatedSession = makeSession({
      activityKey: projectKey,
    });

    const result = applyActivityProgressToTasks(
      [task],
      [unrelatedSession],
      NOW,
    );

    expect(result[0]).toBe(task);
    expect(result[0].lastWorkedAt).toBeUndefined();
  });

  it("leaves tasks without a shared identity untouched", () => {
    const task = makeTask({ activityIdentity: undefined });

    const result = applyActivityProgressToTasks(
      [task],
      [makeSession()],
      NOW,
    );

    expect(result[0]).toBe(task);
  });

  it("ignores future-dated and invalid session end times", () => {
    const task = makeTask();
    const future = makeSession({
      id: "future",
      endedAt: "2026-11-02T11:00:00.000Z",
    });
    const invalid = makeSession({
      id: "invalid",
      endedAt: "not-a-date",
    });

    const result = applyActivityProgressToTasks(
      [task],
      [future, invalid],
      NOW,
    );

    expect(result[0]).toBe(task);
    expect(result[0].lastWorkedAt).toBeUndefined();
  });

  it("returns the original task collection when there are no sessions", () => {
    const tasks = [makeTask()];

    expect(applyActivityProgressToTasks(tasks, [], NOW)).toBe(tasks);
  });
});
