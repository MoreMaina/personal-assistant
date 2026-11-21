import { createHash } from "node:crypto";
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

async function authenticatedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return reply({ error: "Cross-origin requests are not allowed." }, 403);
  }

  let body: JsonRecord;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return reply({ error: "Invalid subscription request." }, 400);
    }
    body = value as JsonRecord;
  } catch {
    return reply({ error: "Invalid JSON request." }, 400);
  }

  const subscription = body.subscription;
  if (!subscription || typeof subscription !== "object" || Array.isArray(subscription)) {
    return reply({ error: "A browser push subscription is required." }, 400);
  }

  const record = subscription as JsonRecord;
  const keys = record.keys;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
    return reply({ error: "The browser subscription keys are missing." }, 400);
  }

  const keyRecord = keys as JsonRecord;
  const endpoint = typeof record.endpoint === "string" ? record.endpoint : "";
  const p256dh = typeof keyRecord.p256dh === "string" ? keyRecord.p256dh : "";
  const auth = typeof keyRecord.auth === "string" ? keyRecord.auth : "";

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    return reply({ error: "The push endpoint is invalid." }, 400);
  }

  if (
    parsedEndpoint.protocol !== "https:" ||
    parsedEndpoint.hostname !== "fcm.googleapis.com" ||
    endpoint.length > 2048 ||
    !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) ||
    !/^[A-Za-z0-9_-]{20,30}$/.test(auth)
  ) {
    return reply({ error: "This browser push subscription is not supported." }, 400);
  }

  const timeZone = typeof body.timeZone === "string" ? body.timeZone : "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    return reply({ error: "The device time zone is invalid." }, 400);
  }

  const { supabase, user } = await authenticatedClient();
  if (!user) return reply({ error: "Please sign in first." }, 401);

  const endpointHash = createHash("sha256").update(endpoint).digest("hex");
  const deviceName = typeof body.deviceName === "string"
    ? body.deviceName.slice(0, 120)
    : "Browser device";

  const { data, error } = await supabase
    .from("user_push_subscriptions")
    .upsert({
      user_id: user.id,
      endpoint,
      endpoint_hash: endpointHash,
      p256dh_key: p256dh,
      auth_key: auth,
      device_name: deviceName,
      time_zone: timeZone,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint_hash" })
    .select([
      "id", "enabled", "class_reminders_enabled",
      "calendar_reminders_enabled", "google_calendar_enabled",
      "task_reminders_enabled", "study_reminders_enabled",
      "event_reminder_minutes", "class_reminder_minutes",
      "all_day_event_time", "task_digest_time", "study_digest_time",
    ].join(","))
    .single();

  if (error || !data) {
    return reply({
      error: error?.code === "23505"
        ? "This browser subscription is already associated with another account. Turn it off there first."
        : "The device subscription could not be saved.",
    }, 400);
  }

  return reply({ subscription: data });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return reply({ error: "Cross-origin requests are not allowed." }, 403);
  }

  let body: JsonRecord;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return reply({ error: "Invalid request." }, 400);
    }
    body = value as JsonRecord;
  } catch {
    return reply({ error: "Invalid JSON request." }, 400);
  }

  const id = typeof body.subscriptionId === "string" ? body.subscriptionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return reply({ error: "A valid subscription ID is required." }, 400);
  }

  const { supabase, user } = await authenticatedClient();
  if (!user) return reply({ error: "Please sign in first." }, 401);

  const { error } = await supabase
    .from("user_push_subscriptions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return reply({ error: "The device could not be removed." }, 400);
  return reply({ ok: true });
}
