import { readStoredJson } from "../storageRecovery";

import {
  ACTIVITY_KINDS,
  type ActivityDomain,
  type ActivitySchedule,
  type ActivitySession,
} from "./types";

const ACTIVITY_SESSIONS_KEY =
  "personal-assistant-activity-sessions-v1";
const ACTIVITY_SCHEDULES_KEY =
  "personal-assistant-activity-schedules-v1";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isActivityKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) {
    return false;
  }

  const parts = value.split(":");
  if (
    parts.length !== 5 ||
    parts[0] !== "pa" ||
    parts[1] !== "v1"
  ) {
    return false;
  }

  const domain = parts[2];
  if (
    !Object.prototype.hasOwnProperty.call(
      ACTIVITY_KINDS,
      domain,
    )
  ) {
    return false;
  }

  const allowedKinds =
    ACTIVITY_KINDS[domain as ActivityDomain] as readonly string[];

  if (!allowedKinds.includes(parts[3]) || !parts[4]) {
    return false;
  }

  try {
    return decodeURIComponent(parts[4]).trim().length > 0;
  } catch {
    return false;
  }
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isActivityPriority(value: unknown): boolean {
  return value === 1 || value === 2 || value === 3 ||
    value === 4 || value === 5;
}

function isActivitySession(value: unknown): value is ActivitySession {
  if (!isRecord(value)) return false;

  const validSource =
    value.source === "manual" ||
    value.source === "item_timer" ||
    value.source === "stopwatch" ||
    value.source === "pomodoro";

  const plannedDurationIsValid =
    value.plannedDurationSeconds === undefined ||
    value.plannedDurationSeconds === null ||
    isNonNegativeInteger(value.plannedDurationSeconds);

  const notesAreValid =
    value.notes === undefined ||
    typeof value.notes === "string";

  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    value.id.length <= 1024 &&
    isActivityKey(value.activityKey) &&
    isTimestamp(value.startedAt) &&
    isTimestamp(value.endedAt) &&
    Date.parse(value.endedAt) >= Date.parse(value.startedAt) &&
    isNonNegativeInteger(value.actualDurationSeconds) &&
    plannedDurationIsValid &&
    validSource &&
    notesAreValid
  );
}

function isActivitySchedule(value: unknown): value is ActivitySchedule {
  if (!isRecord(value) || !isActivityKey(value.activityKey)) {
    return false;
  }

  const scheduledStartIsValid =
    value.scheduledStartAt === undefined ||
    value.scheduledStartAt === null ||
    isTimestamp(value.scheduledStartAt);

  const dueAtIsValid =
    value.dueAt === undefined ||
    value.dueAt === null ||
    isTimestamp(value.dueAt);

  const durationIsValid =
    value.estimatedDurationMinutes === undefined ||
    value.estimatedDurationMinutes === null ||
    (
      Number.isSafeInteger(value.estimatedDurationMinutes) &&
      Number(value.estimatedDurationMinutes) >= 1
    );

  const priorityIsValid =
    value.priority === undefined ||
    value.priority === null ||
    isActivityPriority(value.priority);

  const hasSchedulingValue = [
    value.scheduledStartAt,
    value.dueAt,
    value.estimatedDurationMinutes,
    value.priority,
  ].some((item) => item !== undefined && item !== null);

  return (
    scheduledStartIsValid &&
    dueAtIsValid &&
    durationIsValid &&
    priorityIsValid &&
    hasSchedulingValue
  );
}

function isActivitySessionArray(value: unknown): boolean {
  if (!Array.isArray(value) || !value.every(isActivitySession)) {
    return false;
  }

  return new Set(value.map((session) => session.id)).size === value.length;
}

function isActivityScheduleArray(value: unknown): boolean {
  if (!Array.isArray(value) || !value.every(isActivitySchedule)) {
    return false;
  }

  return (
    new Set(value.map((schedule) => schedule.activityKey)).size ===
    value.length
  );
}

function requireBrowserStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Activity storage is only available in the browser.");
  }

  return window.localStorage;
}

function readArray<T>(
  key: string,
  validate: (value: unknown) => boolean,
): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(key);
  if (raw === null) return [];

  return readStoredJson<T[]>(key, raw, [], validate);
}

/** Returns completed shared sessions without changing feature-specific logs. */
export function getActivitySessions(): ActivitySession[] {
  return readArray<ActivitySession>(
    ACTIVITY_SESSIONS_KEY,
    isActivitySessionArray,
  );
}

/** Returns completed sessions linked to one stable shared activity key. */
export function getActivitySessionsForActivity(
  activityKey: string,
): ActivitySession[] {
  if (!isActivityKey(activityKey)) {
    throw new Error("Cannot query sessions for an invalid activity key.");
  }

  return getActivitySessions().filter(
    (session) => session.activityKey === activityKey,
  );
}

/** Appends a completed session. Existing session IDs cannot be overwritten. */
export function saveActivitySession(
  session: ActivitySession,
): ActivitySession {
  if (!isActivitySession(session)) {
    throw new Error("Cannot save an invalid activity session.");
  }

  const sessions = getActivitySessions();

  if (sessions.some((item) => item.id === session.id)) {
    throw new Error(`Activity session "${session.id}" already exists.`);
  }

  requireBrowserStorage().setItem(
    ACTIVITY_SESSIONS_KEY,
    JSON.stringify([...sessions, session]),
  );

  return session;
}

/** Returns optional shared scheduling metadata. */
export function getActivitySchedules(): ActivitySchedule[] {
  return readArray<ActivitySchedule>(
    ACTIVITY_SCHEDULES_KEY,
    isActivityScheduleArray,
  );
}

export function getActivitySchedule(
  activityKey: string,
): ActivitySchedule | null {
  if (!isActivityKey(activityKey)) {
    throw new Error("Cannot query a schedule for an invalid activity key.");
  }

  return (
    getActivitySchedules().find(
      (schedule) => schedule.activityKey === activityKey,
    ) ?? null
  );
}

/** Creates or updates the schedule for one activity without touching others. */
export function saveActivitySchedule(
  schedule: ActivitySchedule,
): ActivitySchedule {
  if (!isActivitySchedule(schedule)) {
    throw new Error("Cannot save invalid activity scheduling metadata.");
  }

  const schedules = getActivitySchedules();
  const existingIndex = schedules.findIndex(
    (item) => item.activityKey === schedule.activityKey,
  );

  if (existingIndex >= 0) {
    schedules[existingIndex] = schedule;
  } else {
    schedules.push(schedule);
  }

  requireBrowserStorage().setItem(
    ACTIVITY_SCHEDULES_KEY,
    JSON.stringify(schedules),
  );

  return schedule;
}
