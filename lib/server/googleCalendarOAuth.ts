import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { GoogleCalendarEvent } from "@/lib/googleCalendarTypes";
import {
  decryptAIProviderApiKey,
  encryptAIProviderApiKey,
} from "@/lib/server/aiProviderCrypto";

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

export const GOOGLE_CALENDAR_READONLY_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

function timingSafeStringEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createGoogleCalendarOAuthState(
  userId: string,
  clientSecret: string,
): { state: string; cookieValue: string } {
  if (!userId || userId.includes(".") || !clientSecret) {
    throw new Error("A valid user and OAuth secret are required.");
  }

  const state = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", clientSecret)
    .update(`${userId}.${state}`)
    .digest("base64url");

  return { state, cookieValue: `${userId}.${state}.${signature}` };
}

export function verifyGoogleCalendarOAuthState(
  receivedState: string,
  cookieValue: string,
  clientSecret: string,
): string | null {
  if (
    !receivedState || receivedState.length > 128 ||
    !cookieValue || cookieValue.length > 1024 ||
    !clientSecret
  ) {
    return null;
  }

  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;

  const [userId, cookieState, signature] = parts;
  if (!userId || !cookieState || !signature) return null;
  if (!timingSafeStringEqual(receivedState, cookieState)) return null;

  const expected = createHmac("sha256", clientSecret)
    .update(`${userId}.${cookieState}`)
    .digest("base64url");

  return timingSafeStringEqual(signature, expected) ? userId : null;
}

export function hasOnlyAllowedGoogleCalendarScopes(
  scopes: readonly string[],
): boolean {
  const calendarScopes = scopes.filter((scope) =>
    scope.toLowerCase().includes("calendar"),
  );
  const allowed = new Set<string>(GOOGLE_CALENDAR_READONLY_SCOPES);

  return (
    GOOGLE_CALENDAR_READONLY_SCOPES.every((scope) =>
      calendarScopes.includes(scope),
    ) &&
    calendarScopes.every((scope) => allowed.has(scope))
  );
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const MAX_CALENDARS = 50;
const MAX_PAGES_PER_CALENDAR = 5;

type JsonRecord = Record<string, unknown>;

export type GoogleCalendarOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
};

export class GoogleCalendarOAuthError extends Error {
  constructor(
    message: string,
    public readonly reauthorizationRequired = false,
  ) {
    super(message);
    this.name = "GoogleCalendarOAuthError";
  }
}

export class GoogleCalendarApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502,
  ) {
    super(message);
    this.name = "GoogleCalendarApiError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value),
  );
}

function stringValue(
  value: unknown,
  maximumLength = 4000,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maximumLength);
}

async function readJsonResponse(
  response: Response,
): Promise<JsonRecord> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  return isRecord(payload) ? payload : {};
}

export function getGoogleCalendarOAuthConfig():
  | GoogleCalendarOAuthConfig
  | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const redirectValue = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectValue) return null;

  try {
    const redirect = new URL(redirectValue);
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(
      redirect.hostname,
    );

    if (
      (redirect.protocol !== "https:" &&
        !(redirect.protocol === "http:" && localHost)) ||
      redirect.pathname !== "/api/google-calendar/callback" ||
      redirect.search ||
      redirect.hash ||
      redirect.username ||
      redirect.password
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return {
    clientId,
    clientSecret,
    redirectUri: redirectValue,
  };
}

export function encryptGoogleCalendarRefreshToken(token: string): string {
  return encryptAIProviderApiKey(token);
}

export function decryptGoogleCalendarRefreshToken(
  encryptedToken: string,
): string {
  return decryptAIProviderApiKey(encryptedToken);
}

export function buildGoogleCalendarAuthorizationUrl(
  config: GoogleCalendarOAuthConfig,
  state: string,
): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  // Ask for consent so an offline refresh token can be issued again if needed.
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function postTokenForm(
  body: URLSearchParams,
): Promise<{ response: Response; payload: JsonRecord }> {
  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GoogleCalendarOAuthError(
      "Google OAuth could not be reached. Please try again.",
    );
  }

  const payload = await readJsonResponse(response);
  return { response, payload };
}

export async function exchangeGoogleAuthorizationCode(
  config: GoogleCalendarOAuthConfig,
  code: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

  const { response, payload } = await postTokenForm(body);

  if (!response.ok) {
    throw new GoogleCalendarOAuthError(
      "Google authorization could not be completed. Please reconnect and try again.",
    );
  }

  const accessToken = stringValue(payload.access_token, 8192);
  if (!accessToken) {
    throw new GoogleCalendarOAuthError(
      "Google did not return a usable access token.",
    );
  }

  return {
    accessToken,
    refreshToken: stringValue(payload.refresh_token, 8192),
    scope: stringValue(payload.scope, 4000),
  };
}

export async function refreshGoogleCalendarAccessToken(
  config: GoogleCalendarOAuthConfig,
  refreshToken: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const { response, payload } = await postTokenForm(body);

  if (!response.ok) {
    const reauthorizationRequired = payload.error === "invalid_grant";
    throw new GoogleCalendarOAuthError(
      reauthorizationRequired
        ? "Google Calendar access was revoked or expired. Please reconnect it in Settings."
        : "Google Calendar access could not be refreshed. Please try again.",
      reauthorizationRequired,
    );
  }

  const accessToken = stringValue(payload.access_token, 8192);
  if (!accessToken) {
    throw new GoogleCalendarOAuthError(
      "Google did not return a usable access token.",
    );
  }

  return {
    accessToken,
    refreshToken: stringValue(payload.refresh_token, 8192),
    scope: stringValue(payload.scope, 4000),
  };
}

export async function getGoogleAccountEmail(
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;

    const payload = await readJsonResponse(response);
    if (payload.email_verified !== true) return null;
    const email = stringValue(payload.email, 320);
    return email && email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

export async function revokeGoogleCalendarToken(
  token: string,
): Promise<void> {
  try {
    await fetch(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // The local connection is still deleted even if Google revocation fails.
  }
}

async function fetchGoogleApiJson(
  url: string,
  accessToken: string,
): Promise<JsonRecord> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GoogleCalendarApiError(
      "Google Calendar could not be reached.",
    );
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new GoogleCalendarApiError(
      "Google Calendar could not return the requested information.",
      response.status,
    );
  }

  return payload;
}

type GoogleCalendarRef = {
  id: string;
  name: string;
  primary: boolean;
};

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function listCalendars(
  accessToken: string,
): Promise<{ calendars: GoogleCalendarRef[]; truncated: boolean }> {
  const calendars: GoogleCalendarRef[] = [];
  let pageToken: string | undefined;
  let hasMorePages = false;

  for (let page = 0; page < 5; page += 1) {
    const url = new URL(`${GOOGLE_API_BASE}/users/me/calendarList`);
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("showHidden", "true");
    url.searchParams.set(
      "fields",
      "nextPageToken,items(id,summary,primary,accessRole)",
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const payload = await fetchGoogleApiJson(url.toString(), accessToken);

    for (const item of getArray(payload.items)) {
      if (!isRecord(item)) continue;

      const id = stringValue(item.id, 2048);
      if (!id) continue;

      calendars.push({
        id,
        name: stringValue(item.summary, 250) ??
          (item.primary === true ? "Primary calendar" : "Google Calendar"),
        primary: item.primary === true,
      });
    }

    const next = stringValue(payload.nextPageToken, 4096);
    if (!next) {
      hasMorePages = false;
      break;
    }

    pageToken = next;
    hasMorePages = page === 4;
  }

  const truncated = hasMorePages || calendars.length > MAX_CALENDARS;
  return {
    calendars: calendars.slice(0, MAX_CALENDARS),
    truncated,
  };
}

function normalizeGoogleEvent(
  value: unknown,
  calendar: GoogleCalendarRef,
): GoogleCalendarEvent | null {
  if (!isRecord(value) || value.status === "cancelled") return null;

  const id = stringValue(value.id, 1024);
  const start = isRecord(value.start) ? value.start : null;
  const end = isRecord(value.end) ? value.end : null;
  if (!id || !start) return null;

  const startDate = stringValue(start.date, 10);
  const endDate = end ? stringValue(end.date, 10) : undefined;
  const startDateTime = stringValue(start.dateTime, 80);
  const endDateTime = end ? stringValue(end.dateTime, 80) : undefined;

  const allDay = Boolean(
    startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate),
  );

  if (!allDay && (!startDateTime || !Number.isFinite(Date.parse(startDateTime)))) {
    return null;
  }

  if (
    endDateTime &&
    !Number.isFinite(Date.parse(endDateTime))
  ) {
    return null;
  }

  const title = stringValue(value.summary, 500) ?? "Busy";
  const location = stringValue(value.location, 1000);
  const description = stringValue(value.description, 8000);
  const suppliedLink = stringValue(value.htmlLink, 2048);

  let htmlLink: string | undefined;
  if (suppliedLink) {
    try {
      const parsed = new URL(suppliedLink);
      if (
        parsed.protocol === "https:" &&
        parsed.hostname === "calendar.google.com"
      ) {
        htmlLink = parsed.toString();
      }
    } catch {
      // Ignore malformed links returned by the external API.
    }
  }

  return {
    id: `${calendar.id}::${id}`,
    calendarId: calendar.id,
    calendarName: calendar.name,
    title,
    startDate: allDay ? startDate ?? null : null,
    endDate: allDay ? endDate ?? null : null,
    startDateTime: allDay ? null : startDateTime ?? null,
    endDateTime: allDay ? null : endDateTime ?? null,
    allDay,
    ...(location ? { location } : {}),
    ...(description ? { description } : {}),
    ...(htmlLink ? { htmlLink } : {}),
  };
}

async function listEventsForCalendar(
  accessToken: string,
  calendar: GoogleCalendarRef,
  timeMin: string,
  timeMax: string,
): Promise<{ events: GoogleCalendarEvent[]; truncated: boolean }> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let hasMorePages = false;

  for (let page = 0; page < MAX_PAGES_PER_CALENDAR; page += 1) {
    const url = new URL(
      `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendar.id)}/events`,
    );
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set(
      "fields",
      "nextPageToken,items(id,summary,start,end,location,description,htmlLink,status,visibility)",
    );
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const payload = await fetchGoogleApiJson(url.toString(), accessToken);
    for (const item of getArray(payload.items)) {
      const event = normalizeGoogleEvent(item, calendar);
      if (event) events.push(event);
    }

    const next = stringValue(payload.nextPageToken, 4096);
    if (!next) {
      hasMorePages = false;
      break;
    }

    pageToken = next;
    hasMorePages = page === MAX_PAGES_PER_CALENDAR - 1;
  }

  return { events, truncated: hasMorePages };
}

export async function listGoogleCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<{
  events: GoogleCalendarEvent[];
  warnings: string[];
}> {
  const { calendars, truncated: calendarListTruncated } =
    await listCalendars(accessToken);

  if (calendars.length === 0) {
    return {
      events: [],
      warnings: calendarListTruncated
        ? ["Some subscribed calendars could not be listed."]
        : [],
    };
  }

  const events: GoogleCalendarEvent[] = [];
  const warnings: string[] = [];
  let failedCalendars = 0;
  let eventPagesTruncated = false;

  // Limit concurrency to avoid making a burst of requests for accounts
  // with many subscribed calendars.
  for (let index = 0; index < calendars.length; index += 6) {
    const group = calendars.slice(index, index + 6);
    const results = await Promise.all(
      group.map(async (calendar) => {
        try {
          return {
            ok: true as const,
            value: await listEventsForCalendar(
              accessToken,
              calendar,
              timeMin,
              timeMax,
            ),
          };
        } catch {
          return { ok: false as const };
        }
      }),
    );

    for (const result of results) {
      if (!result.ok) {
        failedCalendars += 1;
        continue;
      }
      events.push(...result.value.events);
      eventPagesTruncated ||= result.value.truncated;
    }
  }

  if (failedCalendars === calendars.length && calendars.length > 0) {
    throw new GoogleCalendarApiError(
      "Google Calendar could not read any of the subscribed calendars.",
    );
  }

  if (failedCalendars > 0) {
    warnings.push("Some subscribed calendars could not be read.");
  }
  if (calendarListTruncated) {
    warnings.push("Only the first 50 subscribed calendars are included.");
  }
  if (eventPagesTruncated) {
    warnings.push("Some calendars contain more events than this view can display.");
  }

  events.sort((a, b) =>
    (a.startDateTime ?? a.startDate ?? "").localeCompare(
      b.startDateTime ?? b.startDate ?? "",
    ),
  );

  return { events, warnings };
}

export function isValidCalendarTimeRange(
  timeMin: string | null,
  timeMax: string | null,
): timeMin is string {
  if (!timeMin || !timeMax) return false;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(timeMin) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(timeMax)
  ) {
    return false;
  }

  const start = Date.parse(timeMin);
  const end = Date.parse(timeMax);
  const maxRange = 93 * 24 * 60 * 60 * 1000;

  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    end - start <= maxRange
  );
}
