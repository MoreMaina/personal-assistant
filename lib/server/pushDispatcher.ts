import "server-only";

import { createHash } from "node:crypto";
import * as webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  expandCalendarEvents,
  expandCalendarTasks,
} from "@/lib/calendarRecurrence";
import type {
  CalendarEvent,
  CalendarItem,
  CalendarTask,
} from "@/lib/calendarItemStorage";
import { classes as defaultClasses, type ClassItem } from "@/lib/classes";
import type { GoogleCalendarEvent } from "@/lib/googleCalendarTypes";
import {
  decryptGoogleCalendarRefreshToken,
  encryptGoogleCalendarRefreshToken,
  getGoogleCalendarOAuthConfig,
  hasOnlyAllowedGoogleCalendarScopes,
  listGoogleCalendarEvents,
  refreshGoogleCalendarAccessToken,
} from "@/lib/server/googleCalendarOAuth";
import type {
  DailyPlanExecution,
  SavedDailyPlanSnapshot,
  StudyMvpState,
  StudySessionSectionId,
} from "@/lib/studyMvp/types";
import { createAdminClient } from "@/lib/supabase/admin";

type JsonRecord = Record<string, unknown>;

export type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  time_zone: string;
  enabled: boolean;
  class_reminders_enabled: boolean;
  calendar_reminders_enabled: boolean;
  google_calendar_enabled: boolean;
  task_reminders_enabled: boolean;
  study_reminders_enabled: boolean;
  event_reminder_minutes: number[];
  class_reminder_minutes: number[];
  all_day_event_time: string;
  task_digest_time: string;
  study_digest_time: string;
};

export type NotificationCandidate = {
  key: string;
  title: string;
  body: string;
  url: string;
};

type DispatchStats = {
  subscriptions: number;
  users: number;
  sent: number;
  failed: number;
  skipped: number;
  expired: number;
  errors: number;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const APP_CALENDAR_KEY = "personal-assistant-calendar-items";
const APP_CLASSES_KEY = "personal-assistant-classes";
const CANCELLED_CLASSES_KEY = "cancelled-class-sessions";
const REMINDER_WINDOW_MS = 75 * 1000;

const PLAN_KIND_TO_SECTION: Record<string, StudySessionSectionId> = {
  initial_learning: "initial_learning",
  topic_consolidation: "topic_consolidation",
  gate: "topic_gate",
  review: "reviews",
  assignment: "assignments",
  corrective: "corrective",
  recovery: "recovery",
  mixed_practice: "mixed_practice",
  sampler: "sampler",
};

const SECTION_LABELS: Record<StudySessionSectionId, string> = {
  initial_learning: "Initial learning",
  topic_gate: "Topic gate",
  reviews: "Reviews",
  topic_consolidation: "Topic consolidation",
  assignments: "Assignments",
  corrective: "Corrective work",
  recovery: "Recovery",
  mixed_practice: "Mixed practice",
  sampler: "Sampler",
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function parseStoredValue(
  source: JsonRecord,
  key: string,
): unknown {
  const value = source[key];

  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseArray<T>(
  source: JsonRecord,
  key: string,
): T[] | undefined {
  const value = parseStoredValue(source, key);
  return Array.isArray(value) ? value as T[] : undefined;
}

function validDateParts(date: string): [number, number, number] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const [year, month, day] = date.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return [year, month, day];
}

function addDays(date: string, amount: number): string {
  const parts = validDateParts(date);
  if (!parts) return date;

  const value = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  value.setUTCDate(value.getUTCDate() + amount);

  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getZonedParts(
  instant: Date,
  timeZone: string,
): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts: Record<string, string> = {};

  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function dateInZone(instant: Date, timeZone: string): string {
  const parts = getZonedParts(instant, timeZone);

  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function normalizeTime(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;

  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/);
  return match ? `${match[1]}:${match[2]}` : fallback;
}

/**
 * Convert a wall-clock time in an IANA timezone to an absolute instant.
 * Nonexistent local times during a daylight-saving transition are skipped.
 */
export function localDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date | null {
  const dateParts = validDateParts(date);
  const normalizedTime = normalizeTime(time, "");
  if (!dateParts || !normalizedTime) return null;

  const [hour, minute] = normalizedTime.split(":").map(Number);
  const wanted = Date.UTC(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    hour,
    minute,
    0,
  );

  let guess = wanted;

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const observed = getZonedParts(new Date(guess), timeZone);
      const observedAsUtc = Date.UTC(
        observed.year,
        observed.month - 1,
        observed.day,
        observed.hour,
        observed.minute,
        observed.second,
      );
      const difference = wanted - observedAsUtc;

      if (difference === 0) break;
      guess += difference;
    }

    const finalParts = getZonedParts(new Date(guess), timeZone);

    if (
      finalParts.year !== dateParts[0] ||
      finalParts.month !== dateParts[1] ||
      finalParts.day !== dateParts[2] ||
      finalParts.hour !== hour ||
      finalParts.minute !== minute
    ) {
      return null;
    }

    return new Date(guess);
  } catch {
    return null;
  }
}

export function timeHasPassedToday(
  now: Date,
  timeZone: string,
  date: string,
  time: string,
): boolean {
  try {
    if (dateInZone(now, timeZone) !== date) return false;

    const current = getZonedParts(now, timeZone);
    const target = normalizeTime(time, "09:00");
    const [hour, minute] = target.split(":").map(Number);

    return current.hour * 60 + current.minute >= hour * 60 + minute;
  } catch {
    return false;
  }
}

export function isNearReminder(
  eventInstant: Date,
  now: Date,
  leadMinutes: number,
): boolean {
  const expected = leadMinutes * 60 * 1000;
  const remaining = eventInstant.getTime() - now.getTime();

  // A small overlapping window tolerates scheduler jitter. The database
  // delivery claim prevents the overlap from producing duplicate alerts.
  return Math.abs(remaining - expected) <= REMINDER_WINDOW_MS;
}

function validReminderMinutes(values: unknown): number[] {
  if (!Array.isArray(values)) return [30, 10];

  const valid = [...new Set(
    values.filter(
      (value): value is number =>
        typeof value === "number" &&
        [10, 30, 60].includes(value),
    ),
  )].sort((a, b) => b - a);

  return valid.length > 0 ? valid : [30, 10];
}

function makeCandidate(
  key: string,
  title: string,
  body: string,
  url: string,
): NotificationCandidate {
  return {
    key: key.slice(0, 512),
    title: title.trim().slice(0, 100),
    body: body.trim().slice(0, 240),
    url,
  };
}

function addTimedReminderCandidates(
  output: NotificationCandidate[],
  now: Date,
  eventInstant: Date | null,
  leadMinutes: number[],
  keyPrefix: string,
  title: string,
  eventTime: string,
  url: string,
): void {
  if (!eventInstant) return;

  for (const lead of leadMinutes) {
    if (!isNearReminder(eventInstant, now, lead)) continue;

    output.push(makeCandidate(
      `${keyPrefix}:lead:${lead}`,
      title,
      `Starts in ${lead} minutes (${eventTime}).`,
      url,
    ));
  }
}

export function getTaskDigest(
  tasks: CalendarTask[],
  today: string,
): { count: number; titles: string[] } | null {
  const pendingByTask = new Map<string, string>();

  for (const task of tasks) {
    if (!task.recurrence) {
      if (
        !task.completed &&
        typeof task.dueDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) &&
        task.dueDate <= today
      ) {
        pendingByTask.set(task.id, task.title);
      }

      continue;
    }

    const recurrenceStart =
      task.recurrence.startDate ?? task.dueDate;

    if (
      typeof recurrenceStart !== "string" ||
      !validDateParts(recurrenceStart) ||
      recurrenceStart > today
    ) {
      continue;
    }

    const occurrences = expandCalendarTasks(
      [task],
      recurrenceStart,
      today,
    );

    if (occurrences.some((occurrence) => !occurrence.completed)) {
      pendingByTask.set(task.id, task.title);
    }
  }

  if (pendingByTask.size === 0) return null;

  return {
    count: pendingByTask.size,
    titles: [...pendingByTask.values()],
  };
}

export function getStudyDigest(
  stateValue: unknown,
  today: string,
): string | null {
  if (!isRecord(stateValue)) return null;

  const state = stateValue as unknown as StudyMvpState;
  const history = Array.isArray(state.daily_plan_history)
    ? state.daily_plan_history as SavedDailyPlanSnapshot[]
    : [];

  const snapshots = history
    .filter((snapshot) =>
      snapshot &&
      snapshot.date === today &&
      snapshot.plan &&
      Array.isArray(snapshot.plan.items),
    )
    .sort((a, b) => b.version - a.version);

  const snapshot = snapshots[0];
  if (!snapshot) return null;

  const executions = Array.isArray(state.daily_plan_executions)
    ? state.daily_plan_executions as DailyPlanExecution[]
    : [];

  const execution = executions.find(
    (entry) => entry.plan_snapshot_id === snapshot.id,
  );

  const completed = new Set<StudySessionSectionId>(
    execution?.completed_section_ids ?? [],
  );

  const planned = new Set<StudySessionSectionId>();

  for (const item of snapshot.plan.items) {
    if (
      item.disposition === "SKIP" ||
      item.disposition === "DEFER" ||
      item.forced_disposition === "skip" ||
      item.forced_disposition === "override_defer"
    ) {
      continue;
    }

    const section = PLAN_KIND_TO_SECTION[item.kind];
    if (section) planned.add(section);
  }

  const unfinished = [...planned].filter(
    (section) => !completed.has(section),
  );

  if (unfinished.length === 0) return null;

  const labels = unfinished.map((section) => SECTION_LABELS[section]);
  const visible = labels.slice(0, 4).join(", ");
  const extra = labels.length > 4
    ? `, and ${labels.length - 4} more`
    : "";

  return `${unfinished.length} unfinished sections: ${visible}${extra}.`;
}

function getWeekdayForDate(date: string): string | null {
  const parts = validDateParts(date);
  if (!parts) return null;

  const names = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  return names[new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay()];
}

function getAppCalendarCandidates(
  output: NotificationCandidate[],
  now: Date,
  subscription: SubscriptionRow,
  appData: JsonRecord,
  today: string,
): void {
  if (!subscription.calendar_reminders_enabled) return;

  const items = parseArray<CalendarItem>(appData, APP_CALENDAR_KEY) ?? [];
  const events = items.filter(
    (item): item is CalendarEvent =>
      isRecord(item) && item.type === "event",
  );

  if (events.length === 0) return;

  const occurrences = expandCalendarEvents(
    events,
    addDays(today, -2),
    addDays(today, 2),
  );

  const leadMinutes = validReminderMinutes(
    subscription.event_reminder_minutes,
  );
  const allDayTime = normalizeTime(
    subscription.all_day_event_time,
    "09:00",
  );

  for (const occurrence of occurrences) {
    const eventTimeZone = occurrence.timeZone || subscription.time_zone;

    if (!occurrence.startTime) {
      if (
        timeHasPassedToday(
          now,
          eventTimeZone,
          occurrence.date,
          allDayTime,
        )
      ) {
        output.push(makeCandidate(
          `app-event:allday:${occurrence.id}:${occurrence.date}`,
          occurrence.title,
          `All-day event today: ${occurrence.title}.`,
          "/calendar",
        ));
      }

      continue;
    }

    const instant = localDateTimeToUtc(
      occurrence.date,
      occurrence.startTime,
      eventTimeZone,
    );

    addTimedReminderCandidates(
      output,
      now,
      instant,
      leadMinutes,
      `app-event:${occurrence.id}`,
      occurrence.title,
      occurrence.startTime,
      "/calendar",
    );
  }
}

function getClassCandidates(
  output: NotificationCandidate[],
  now: Date,
  subscription: SubscriptionRow,
  appData: JsonRecord,
  today: string,
): void {
  if (!subscription.class_reminders_enabled) return;

  // The app shows its built-in timetable when no custom list is saved.
  const savedClasses = parseArray<ClassItem>(
    appData,
    APP_CLASSES_KEY,
  );
  const classList = savedClasses ?? defaultClasses;

  const cancelledValue = parseStoredValue(
    appData,
    CANCELLED_CLASSES_KEY,
  );

  const cancelled = isRecord(cancelledValue)
    ? cancelledValue as Record<string, unknown>
    : {};

  const leadMinutes = validReminderMinutes(
    subscription.class_reminder_minutes,
  );

  for (const date of [today, addDays(today, 1)]) {
    const weekday = getWeekdayForDate(date);
    if (!weekday) continue;

    const cancelledIds = new Set<number>(
      Array.isArray(cancelled[date])
        ? (cancelled[date] as unknown[]).filter(
            (id): id is number => typeof id === "number",
          )
        : [],
    );

    for (const item of classList) {
      if (
        !item ||
        typeof item.id !== "number" ||
        typeof item.name !== "string" ||
        typeof item.day !== "string" ||
        typeof item.start !== "string" ||
        item.day.toLowerCase() !== weekday.toLowerCase() ||
        cancelledIds.has(item.id)
      ) {
        continue;
      }

      const instant = localDateTimeToUtc(
        date,
        item.start,
        subscription.time_zone,
      );

      addTimedReminderCandidates(
        output,
        now,
        instant,
        leadMinutes,
        `class:${item.id}:${date}`,
        item.name,
        item.start,
        "/",
      );
    }
  }
}

function getGoogleCalendarCandidates(
  output: NotificationCandidate[],
  now: Date,
  subscription: SubscriptionRow,
  events: GoogleCalendarEvent[],
): void {
  if (!subscription.google_calendar_enabled) return;

  const leadMinutes = validReminderMinutes(
    subscription.event_reminder_minutes,
  );
  const allDayTime = normalizeTime(
    subscription.all_day_event_time,
    "09:00",
  );

  for (const event of events) {
    const title = event.title || "Google Calendar event";

    if (event.allDay && event.startDate) {
      if (
        timeHasPassedToday(
          now,
          subscription.time_zone,
          event.startDate,
          allDayTime,
        )
      ) {
        output.push(makeCandidate(
          `google-event:allday:${event.calendarId}:${event.id}:${event.startDate}`,
          title,
          `All-day event today: ${title}.`,
          "/calendar",
        ));
      }

      continue;
    }

    if (!event.startDateTime) continue;

    const instant = new Date(event.startDateTime);
    if (!Number.isFinite(instant.getTime())) continue;

    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: subscription.time_zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);

    addTimedReminderCandidates(
      output,
      now,
      instant,
      leadMinutes,
      `google-event:${event.calendarId}:${event.id}:${event.startDateTime}`,
      title,
      localTime,
      "/calendar",
    );
  }
}

function getDailyDigestCandidates(
  output: NotificationCandidate[],
  now: Date,
  subscription: SubscriptionRow,
  appData: JsonRecord,
  studyState: unknown,
  today: string,
): void {
  if (subscription.task_reminders_enabled) {
    const items = parseArray<CalendarItem>(appData, APP_CALENDAR_KEY) ?? [];
    const tasks = items.filter(
      (item): item is CalendarTask =>
        isRecord(item) && item.type === "task",
    );

    const digest = getTaskDigest(tasks, today);
    const digestTime = normalizeTime(
      subscription.task_digest_time,
      "09:00",
    );

    if (
      digest &&
      timeHasPassedToday(now, subscription.time_zone, today, digestTime)
    ) {
      const shownTitles = digest.titles.slice(0, 3).join(", ");
      const extra = digest.titles.length > 3
        ? `, plus ${digest.titles.length - 3} more`
        : "";

      output.push(makeCandidate(
        `task-digest:${today}`,
        "Calendar task reminder",
        `${digest.count} unfinished task${digest.count === 1 ? "" : "s"} due today or overdue: ${shownTitles}${extra}.`,
        "/calendar",
      ));
    }
  }

  if (subscription.study_reminders_enabled) {
    const digestTime = normalizeTime(
      subscription.study_digest_time,
      "08:00",
    );
    const summary = getStudyDigest(studyState, today);

    if (
      summary &&
      timeHasPassedToday(now, subscription.time_zone, today, digestTime)
    ) {
      output.push(makeCandidate(
        `study-digest:${today}`,
        "Your Study Planner",
        summary,
        "/study",
      ));
    }
  }
}

export function buildCandidates(
  subscription: SubscriptionRow,
  appData: JsonRecord,
  studyState: unknown,
  googleEvents: GoogleCalendarEvent[],
  now: Date,
): NotificationCandidate[] {
  let today: string;

  try {
    today = dateInZone(now, subscription.time_zone);
  } catch {
    return [];
  }

  const output: NotificationCandidate[] = [];

  getAppCalendarCandidates(
    output,
    now,
    subscription,
    appData,
    today,
  );

  getClassCandidates(
    output,
    now,
    subscription,
    appData,
    today,
  );

  getGoogleCalendarCandidates(
    output,
    now,
    subscription,
    googleEvents,
  );

  getDailyDigestCandidates(
    output,
    now,
    subscription,
    appData,
    studyState,
    today,
  );

  // Protect against repeated occurrences from malformed stored data.
  return [...new Map(output.map((item) => [item.key, item])).values()];
}

async function loadGoogleEvents(
  admin: SupabaseClient,
  userId: string,
  connection: JsonRecord | null,
  now: Date,
): Promise<GoogleCalendarEvent[]> {
  if (
    !connection ||
    typeof connection.encrypted_refresh_token !== "string"
  ) {
    return [];
  }

  const config = getGoogleCalendarOAuthConfig();
  if (!config) return [];

  const scopes = Array.isArray(connection.scopes)
    ? connection.scopes.filter(
        (scope): scope is string => typeof scope === "string",
      )
    : [];

  if (!hasOnlyAllowedGoogleCalendarScopes(scopes)) return [];

  const refreshToken = decryptGoogleCalendarRefreshToken(
    connection.encrypted_refresh_token,
  );

  const token = await refreshGoogleCalendarAccessToken(
    config,
    refreshToken,
  );

  if (token.refreshToken) {
    const encrypted = encryptGoogleCalendarRefreshToken(
      token.refreshToken,
    );

    const { error } = await admin
      .from("user_google_calendar_connections")
      .update({
        encrypted_refresh_token: encrypted,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      throw new Error("Google Calendar credential rotation could not be saved.");
    }
  }

  const result = await listGoogleCalendarEvents(
    token.accessToken,
    new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
  );

  return result.events;
}

function getPushStatusCode(error: unknown): number | null {
  if (!isRecord(error)) return null;

  return typeof error.statusCode === "number"
    ? error.statusCode
    : null;
}

async function sendCandidate(
  admin: SupabaseClient,
  subscription: SubscriptionRow,
  candidate: NotificationCandidate,
): Promise<"sent" | "failed" | "skipped" | "expired"> {
  const { data: deliveryId, error: claimError } = await admin.rpc(
    "claim_push_notification_delivery",
    {
      p_subscription_id: subscription.id,
      p_notification_key: candidate.key,
      p_lease_seconds: 180,
    },
  );

  if (claimError) {
    throw new Error("The notification delivery could not be claimed.");
  }

  if (typeof deliveryId !== "string" || !deliveryId) {
    return "skipped";
  }

  const tag = createHash("sha256")
    .update(candidate.key)
    .digest("hex")
    .slice(0, 32);

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh_key,
          auth: subscription.auth_key,
        },
      },
      JSON.stringify({
        title: candidate.title,
        body: candidate.body,
        url: candidate.url,
        tag,
      }),
      {
        TTL: 60 * 60 * 12,
        urgency: "normal",
      },
    );
  } catch (error) {
    const statusCode = getPushStatusCode(error);
    const expired = statusCode === 404 || statusCode === 410;

    await admin.rpc("mark_push_notification_failed", {
      p_delivery_id: deliveryId,
      p_error: expired
        ? `Push subscription expired (${statusCode}).`
        : statusCode
          ? `Push provider returned status ${statusCode}.`
          : "Temporary push delivery error.",
    });

    if (expired) {
      await admin
        .from("user_push_subscriptions")
        .delete()
        .eq("id", subscription.id);

      return "expired";
    }

    return "failed";
  }

  const { error: markError } = await admin.rpc(
    "mark_push_notification_sent",
    { p_delivery_id: deliveryId },
  );

  if (markError) {
    // The lease will expire and permit a retry. The push provider may
    // already have accepted this notification.
    return "failed";
  }

  return "sent";
}

export async function dispatchDuePushNotifications(
  now = new Date(),
): Promise<DispatchStats> {
  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();

  if (!subject || !publicKey || !privateKey) {
    throw new Error("VAPID push credentials are not configured.");
  }

  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) {
    throw new Error("VAPID_SUBJECT must be a mailto or HTTPS contact URI.");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("user_push_subscriptions")
    .select([
      "id",
      "user_id",
      "endpoint",
      "p256dh_key",
      "auth_key",
      "time_zone",
      "enabled",
      "class_reminders_enabled",
      "calendar_reminders_enabled",
      "google_calendar_enabled",
      "task_reminders_enabled",
      "study_reminders_enabled",
      "event_reminder_minutes",
      "class_reminder_minutes",
      "all_day_event_time",
      "task_digest_time",
      "study_digest_time",
    ].join(","))
    .eq("enabled", true);

  if (error) {
    throw new Error("Push subscriptions could not be loaded.");
  }

  const subscriptions = (data ?? []) as unknown as SubscriptionRow[];
  const byUser = new Map<string, SubscriptionRow[]>();

  for (const subscription of subscriptions) {
    const group = byUser.get(subscription.user_id) ?? [];
    group.push(subscription);
    byUser.set(subscription.user_id, group);
  }

  const stats: DispatchStats = {
    subscriptions: subscriptions.length,
    users: byUser.size,
    sent: 0,
    failed: 0,
    skipped: 0,
    expired: 0,
    errors: 0,
  };

  for (const [userId, userSubscriptions] of byUser) {
    const [appResult, studyResult, googleResult] = await Promise.all([
      admin
        .from("user_app_state")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("user_study_mvp_state")
        .select("state")
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("user_google_calendar_connections")
        .select("encrypted_refresh_token,scopes")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (appResult.error || studyResult.error || googleResult.error) {
      stats.errors += 1;
      continue;
    }

    const appData = isRecord(appResult.data?.data)
      ? appResult.data.data
      : {};
    const studyState = studyResult.data?.state ?? null;
    const connection = isRecord(googleResult.data)
      ? googleResult.data
      : null;

    let googleEvents: GoogleCalendarEvent[] = [];

    if (
      connection &&
      userSubscriptions.some((subscription) =>
        subscription.google_calendar_enabled,
      )
    ) {
      try {
        googleEvents = await loadGoogleEvents(
          admin,
          userId,
          connection,
          now,
        );
      } catch {
        // A Google token or API issue must not block app calendar,
        // class, task, or Study Planner notifications.
        stats.errors += 1;
      }
    }

    for (const subscription of userSubscriptions) {
      const candidates = buildCandidates(
        subscription,
        appData,
        studyState,
        googleEvents,
        now,
      );

      for (const candidate of candidates) {
        try {
          const result = await sendCandidate(
            admin,
            subscription,
            candidate,
          );
          stats[result] += 1;
        } catch {
          stats.errors += 1;
        }
      }
    }
  }

  return stats;
}
