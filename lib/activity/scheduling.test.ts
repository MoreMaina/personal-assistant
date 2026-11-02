import { describe, expect, it } from "vitest";

import { getActivityIdentityKey } from "./identity";
import { applyActivitySchedulesToTasks } from "./scheduling";
import type { ActivitySchedule } from "./types";
import type { TodayTask } from "../today-engine";

const reviewIdentity = {
  domain: "study",
  kind: "review",
  entityId: "review-1",
} as const;

const reviewKey = getActivityIdentityKey(reviewIdentity);

function makeTask(overrides: Partial<TodayTask> = {}): TodayTask {
  return {
    id: "study-review-review-1",
    activityIdentity: reviewIdentity,
    title: "Review — Binary Trees",
    type: "study",
    durationMinutes: 15,
    priority: 2,
    dueAt: "2026-11-05T17:00:00.000Z",
    availableFrom: "2026-11-02T08:00:00.000Z",
    ...overrides,
  };
}

describe("shared activity schedule adapter", () => {
  it("applies all shared scheduling fields to the matching task", () => {
    const task = makeTask();
    const original = { ...task };

    const schedule: ActivitySchedule = {
      activityKey: reviewKey,
      scheduledStartAt: "2026-11-03T09:00:00.000Z",
      dueAt: "2026-11-04T17:00:00.000Z",
      estimatedDurationMinutes: 30,
      priority: 5,
    };

    const result = applyActivitySchedulesToTasks([task], [schedule]);

    expect(result).toEqual([
      {
        ...task,
        availableFrom: schedule.scheduledStartAt,
        dueAt: schedule.dueAt,
        durationMinutes: 30,
        priority: 5,
      },
    ]);

    expect(task).toEqual(original);
    expect(result[0]).not.toBe(task);
  });

  it("overlays only fields explicitly supplied by the shared schedule", () => {
    const task = makeTask();

    const result = applyActivitySchedulesToTasks(
      [task],
      [{ activityKey: reviewKey, priority: 4 }],
    );

    expect(result[0]).toEqual({
      ...task,
      priority: 4,
    });
  });

  it("does not change tasks without a matching shared identity", () => {
    const task = makeTask();
    const otherTask = makeTask({
      id: "project-1",
      activityIdentity: {
        domain: "project",
        kind: "project",
        entityId: "project-1",
      },
      type: "project",
      title: "Write project report",
    });
    const taskWithoutIdentity = makeTask({
      id: "unlinked-task",
      activityIdentity: undefined,
    });

    const result = applyActivitySchedulesToTasks(
      [task, otherTask, taskWithoutIdentity],
      [{ activityKey: reviewKey, priority: 5 }],
    );

    expect(result[0].priority).toBe(5);
    expect(result[1]).toBe(otherTask);
    expect(result[2]).toBe(taskWithoutIdentity);
  });

  it("returns the original tasks unchanged when no schedules exist", () => {
    const tasks = [makeTask()];

    const result = applyActivitySchedulesToTasks(tasks, []);

    expect(result).toBe(tasks);
    expect(result[0]).toBe(tasks[0]);
  });

  it("uses identity keys rather than display titles or local task IDs", () => {
    const task = makeTask({
      id: "a-different-local-id",
      title: "A renamed display title",
    });

    const result = applyActivitySchedulesToTasks(
      [task],
      [{ activityKey: reviewKey, estimatedDurationMinutes: 25 }],
    );

    expect(result[0].durationMinutes).toBe(25);
  });
});
