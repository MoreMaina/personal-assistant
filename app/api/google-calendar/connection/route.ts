import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  decryptGoogleCalendarRefreshToken,
  getGoogleCalendarOAuthConfig,
  revokeGoogleCalendarToken,
} from "@/lib/server/googleCalendarOAuth";

type RecordValue = Record<string, unknown>;

function reply(body: RecordValue, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function GET() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return reply({ error: "Account authentication is unavailable." }, 503);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return reply({ error: "Please sign in to manage Google Calendar." }, 401);
  }

  const { data, error } = await supabase.rpc(
    "get_my_google_calendar_connection",
  );

  if (error) {
    return reply({
      error: "Google Calendar connection storage is unavailable. Apply the Google Calendar database migration.",
    }, 503);
  }

  const row = Array.isArray(data) ? data[0] as RecordValue | undefined : undefined;

  return reply({
    configured: Boolean(getGoogleCalendarOAuthConfig()),
    connected: Boolean(row),
    email: typeof row?.google_email === "string" ? row.google_email : null,
    connectedAt: typeof row?.connected_at === "string" ? row.connected_at : null,
  });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return reply({ error: "Cross-origin changes are not allowed." }, 403);
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return reply({ error: "Account authentication is unavailable." }, 503);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return reply({ error: "Please sign in to disconnect Google Calendar." }, 401);
  }

  // Best-effort revocation at Google. Local disconnection proceeds even if
  // the token has expired or Google cannot be reached.
  const { data: storedData } = await supabase.rpc(
    "get_my_google_calendar_refresh_token",
  );
  const stored = Array.isArray(storedData)
    ? storedData[0] as RecordValue | undefined
    : undefined;

  if (typeof stored?.encrypted_refresh_token === "string") {
    try {
      const refreshToken = decryptGoogleCalendarRefreshToken(
        stored.encrypted_refresh_token,
      );
      await revokeGoogleCalendarToken(refreshToken);
    } catch {
      // The local connection should still be deleted if decryption fails.
    }
  }

  const { error } = await supabase.rpc(
    "delete_my_google_calendar_connection",
  );

  if (error) {
    return reply({
      error: "The Google Calendar connection could not be removed. Confirm the database migration is applied.",
    }, 503);
  }

  return reply({ connected: false });
}
