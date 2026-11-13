import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  decryptGoogleCalendarRefreshToken,
  encryptGoogleCalendarRefreshToken,
  getGoogleCalendarOAuthConfig,
  GoogleCalendarApiError,
  GoogleCalendarOAuthError,
  isValidCalendarTimeRange,
  listGoogleCalendarEvents,
  refreshGoogleCalendarAccessToken,
} from "@/lib/server/googleCalendarOAuth";

type RecordValue = Record<string, unknown>;

function reply(body: RecordValue, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const config = getGoogleCalendarOAuthConfig();
  if (!config) {
    return reply({
      connected: false,
      error: "Google Calendar OAuth is not configured.",
    }, 503);
  }

  const url = new URL(request.url);
  const timeMin = url.searchParams.get("timeMin");
  const timeMax = url.searchParams.get("timeMax");

  if (!isValidCalendarTimeRange(timeMin, timeMax)) {
    return reply({
      error: "Provide a valid ISO UTC time range of no more than 93 days.",
    }, 400);
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return reply({ error: "Account authentication is unavailable." }, 503);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return reply({ error: "Please sign in to view Google Calendar." }, 401);
  }

  const { data, error } = await supabase.rpc(
    "get_my_google_calendar_refresh_token",
  );

  if (error) {
    return reply({
      error: "Google Calendar connection storage is unavailable. Apply the Google Calendar database migration.",
    }, 503);
  }

  const row = Array.isArray(data) ? data[0] as RecordValue | undefined : undefined;
  if (!row || typeof row.encrypted_refresh_token !== "string") {
    return reply({ connected: false, events: [], warnings: [] });
  }

  let refreshToken: string;
  try {
    refreshToken = decryptGoogleCalendarRefreshToken(
      row.encrypted_refresh_token,
    );
  } catch {
    return reply({
      connected: true,
      error: "The saved Google Calendar credential could not be decrypted. Reconnect it in Settings.",
      reauthorize: true,
    }, 503);
  }

  try {
    const token = await refreshGoogleCalendarAccessToken(config, refreshToken);

    if (token.refreshToken) {
      const encrypted = encryptGoogleCalendarRefreshToken(token.refreshToken);
      const scopes = Array.isArray(row.scopes)
        ? row.scopes.filter((value): value is string => typeof value === "string")
        : [];

      // Preserve a rotated refresh token if Google issues one.
      const { error: persistError } = await supabase.rpc(
        "save_my_google_calendar_connection",
        {
          p_encrypted_refresh_token: encrypted,
          p_google_email:
            typeof row.google_email === "string" ? row.google_email : null,
          p_scopes: scopes,
        },
      );
      if (persistError) {
        return reply({
          connected: true,
          error: "Google Calendar credentials could not be updated. Please retry.",
        }, 503);
      }
    }

    const result = await listGoogleCalendarEvents(
      token.accessToken,
      timeMin!,
      timeMax!,
    );

    return reply({
      connected: true,
      events: result.events,
      warnings: result.warnings,
    });
  } catch (error) {
    if (error instanceof GoogleCalendarOAuthError) {
      return reply({
        connected: true,
        error: error.message,
        reauthorize: error.reauthorizationRequired,
      }, error.reauthorizationRequired ? 401 : 502);
    }

    if (error instanceof GoogleCalendarApiError) {
      return reply({
        connected: true,
        error: error.message,
      }, 502);
    }

    return reply({
      connected: true,
      error: "Google Calendar events could not be loaded. Please try again.",
    }, 502);
  }
}
