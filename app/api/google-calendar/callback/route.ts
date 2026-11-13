import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  decryptGoogleCalendarRefreshToken,
  encryptGoogleCalendarRefreshToken,
  exchangeGoogleAuthorizationCode,
  getGoogleAccountEmail,
  getGoogleCalendarOAuthConfig,
  GOOGLE_CALENDAR_SCOPES,
  hasOnlyAllowedGoogleCalendarScopes,
  verifyGoogleCalendarOAuthState,
} from "@/lib/server/googleCalendarOAuth";

const STATE_COOKIE = "google_calendar_oauth_state";

function settingsRedirect(origin: string, result: string) {
  const response = NextResponse.redirect(
    new URL(`/settings?googleCalendar=${encodeURIComponent(result)}`, origin),
  );
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google-calendar/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const config = getGoogleCalendarOAuthConfig();
  const requestUrl = new URL(request.url);
  const origin = config
    ? new URL(config.redirectUri).origin
    : requestUrl.origin;

  if (!config) {
    return settingsRedirect(origin, "not-configured");
  }

  const receivedState = requestUrl.searchParams.get("state") ?? "";
  const cookieState = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const stateUserId = verifyGoogleCalendarOAuthState(
    receivedState,
    cookieState,
    config.clientSecret,
  );
  if (!stateUserId) {
    return settingsRedirect(origin, "state-error");
  }

  if (requestUrl.searchParams.has("error")) {
    return settingsRedirect(origin, "denied");
  }

  const code = requestUrl.searchParams.get("code");
  if (!code || code.length > 4096) {
    return settingsRedirect(origin, "failed");
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return settingsRedirect(origin, "failed");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return settingsRedirect(origin, "signed-out");
  }
  if (authData.user.id !== stateUserId) {
    return settingsRedirect(origin, "account-changed");
  }

  try {
    const token = await exchangeGoogleAuthorizationCode(config, code);
    const email = await getGoogleAccountEmail(token.accessToken);
    if (!email) {
      return settingsRedirect(origin, "identity-error");
    }
    const grantedScopes = (
      token.scope ?? GOOGLE_CALENDAR_SCOPES.join(" ")
    ).split(/\s+/).filter(Boolean);

    if (!hasOnlyAllowedGoogleCalendarScopes(grantedScopes)) {
      return settingsRedirect(origin, "scope-error");
    }

    // Google may omit refresh_token when an account has already granted
    // access. In that case preserve the existing encrypted token.
    let encryptedRefreshToken: string | null = null;

    if (token.refreshToken) {
      encryptedRefreshToken =
        encryptGoogleCalendarRefreshToken(token.refreshToken);
    } else {
      const { data: previousData, error: previousError } = await supabase
        .rpc("get_my_google_calendar_refresh_token");

      const previousRow = Array.isArray(previousData)
        ? previousData[0]
        : null;

      if (
        !previousError &&
        previousRow &&
        typeof previousRow.encrypted_refresh_token === "string" &&
        typeof previousRow.google_email === "string" &&
        email &&
        previousRow.google_email.toLowerCase() === email.toLowerCase()
      ) {
        // Only preserve an existing refresh token for the same verified account.
        decryptGoogleCalendarRefreshToken(
          previousRow.encrypted_refresh_token,
        );
        encryptedRefreshToken = previousRow.encrypted_refresh_token;
      }
    }

    if (!encryptedRefreshToken) {
      return settingsRedirect(origin, "refresh-token-missing");
    }

    const { error: saveError } = await supabase.rpc(
      "save_my_google_calendar_connection",
      {
        p_encrypted_refresh_token: encryptedRefreshToken,
        p_google_email: email,
        p_scopes: grantedScopes,
      },
    );

    if (saveError) {
      return settingsRedirect(origin, "database-error");
    }

    return settingsRedirect(origin, "connected");
  } catch {
    // Do not place provider responses, tokens, or credentials in the URL.
    return settingsRedirect(origin, "failed");
  }
}
