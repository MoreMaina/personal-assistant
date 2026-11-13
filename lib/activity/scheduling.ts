import { getActivityIdentityKey } from "./identity";
import { getActivitySchedules } from "./storage";
import type { ActivitySchedule } from "./types";
import type { TodayTask } from "../today-engine";

/**
 * Applies shared scheduling metadata to a planner projection.
 *
 * Feature-specific records are never modified. Shared values only affect
 * the task object passed to the Today recommendation engine.
 *
 * scheduledStartAt is treated as a not-before boundary through
 * TodayTask.availableFrom; it does not create a fixed calendar event.
 */
export function applyActivitySchedulesToTasks(
  tasks: TodayTask[],
  schedules: readonly ActivitySchedule[] = getActivitySchedules(),
): TodayTask[] {
  if (schedules.length === 0) {
    return tasks;
  }

  const schedulesByKey = new Map(
    schedules.map((schedule) => [schedule.activityKey, schedule]),
  );

  return tasks.map((task) => {
    if (!task.activityIdentity) {
      return task;
    }

    const activityKey = getActivityIdentityKey(task.activityIdentity);
    const schedule = schedulesByKey.get(activityKey);

    if (!schedule) {
      return task;
    }

    const scheduledTask: TodayTask = { ...task };

    if (schedule.estimatedDurationMinutes != null) {
      scheduledTask.durationMinutes = schedule.estimatedDurationMinutes;
    }

    if (schedule.priority != null) {
      scheduledTask.priority = schedule.priority;
    }

    if (schedule.dueAt != null) {
      scheduledTask.dueAt = schedule.dueAt;
    }

    if (schedule.scheduledStartAt != null) {
      scheduledTask.availableFrom = schedule.scheduledStartAt;
    }

    return scheduledTask;
  });
}
