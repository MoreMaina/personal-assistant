import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildGoogleCalendarAuthorizationUrl,
  createGoogleCalendarOAuthState,
  getGoogleCalendarOAuthConfig,
} from "@/lib/server/googleCalendarOAuth";

const STATE_COOKIE = "google_calendar_oauth_state";

export async function GET(request: Request) {
  const config = getGoogleCalendarOAuthConfig();
  const requestUrl = new URL(request.url);

  if (!config) {
    return NextResponse.redirect(
      new URL("/settings?googleCalendar=not-configured", requestUrl.origin),
    );
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.redirect(new URL("/login", requestUrl.origin));
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login", requestUrl.origin));
  }

  const { state, cookieValue } = createGoogleCalendarOAuthState(
    data.user.id,
    config.clientSecret,
  );
  const response = NextResponse.redirect(
    buildGoogleCalendarAuthorizationUrl(config, state),
  );

  response.cookies.set(STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google-calendar/callback",
    maxAge: 10 * 60,
  });

  return response;
}
