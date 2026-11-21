import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";


type JsonRecord = Record<string, unknown>;

function reply(body: JsonRecord, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) {
    return reply({ error: "Cross-origin requests are not allowed." }, 403);
  }

  let body: JsonRecord;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return reply({ error: "Invalid preferences request." }, 400);
    }
    body = value as JsonRecord;
  } catch {
    return reply({ error: "Invalid JSON request." }, 400);
  }

  const id = typeof body.subscriptionId === "string" ? body.subscriptionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return reply({ error: "A valid subscription ID is required." }, 400);
  }

  const columns: Record<string, string> = {
    enabled: "enabled",
    classRemindersEnabled: "class_reminders_enabled",
    calendarRemindersEnabled: "calendar_reminders_enabled",
    googleCalendarEnabled: "google_calendar_enabled",
    taskRemindersEnabled: "task_reminders_enabled",
    studyRemindersEnabled: "study_reminders_enabled",
  };

  const updates: JsonRecord = { updated_at: new Date().toISOString() };

  for (const [input, column] of Object.entries(columns)) {
    if (input in body) {
      if (typeof body[input] !== "boolean") {
        return reply({ error: `Invalid value for ${input}.` }, 400);
      }
      updates[column] = body[input];
    }
  }

  for (const input of ["eventReminderMinutes", "classReminderMinutes"] as const) {
    if (!(input in body)) continue;
    const values = body[input];
    if (
      !Array.isArray(values) ||
      values.length < 1 ||
      values.length > 3 ||
      values.some((value) => ![10, 30, 60].includes(value as number)) ||
      new Set(values).size !== values.length
    ) {
      return reply({ error: `Invalid values for ${input}.` }, 400);
    }
    updates[input === "eventReminderMinutes"
      ? "event_reminder_minutes"
      : "class_reminder_minutes"] = values;
  }

  const timeFields = {
    allDayEventTime: "all_day_event_time",
    taskDigestTime: "task_digest_time",
    studyDigestTime: "study_digest_time",
  } as const;

  for (const [input, column] of Object.entries(timeFields)) {
    if (!(input in body)) continue;
    const value = body[input];
    if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      return reply({ error: `Invalid time for ${input}.` }, 400);
    }
    updates[column] = value;
  }

  if (Object.keys(updates).length === 1) {
    return reply({ error: "No preferences were supplied." }, 400);
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return reply({ error: "Please sign in first." }, 401);
  }

  const { data, error } = await supabase
    .from("user_push_subscriptions")
    .update(updates)
    .eq("id", id)
    .eq("user_id", authData.user.id)
    .select("id,enabled,class_reminders_enabled,calendar_reminders_enabled,google_calendar_enabled,task_reminders_enabled,study_reminders_enabled,event_reminder_minutes,class_reminder_minutes,all_day_event_time,task_digest_time,study_digest_time")
    .maybeSingle();

  if (error || !data) {
    return reply({ error: "Notification preferences could not be saved." }, 400);
  }

  return reply({ subscription: data });
}
