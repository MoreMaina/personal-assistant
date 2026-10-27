import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleCalendarAuthorizationUrl,
  createGoogleCalendarOAuthState,
  getGoogleAccountEmail,
  hasOnlyAllowedGoogleCalendarScopes,
  verifyGoogleCalendarOAuthState,
  isValidCalendarTimeRange,
  listGoogleCalendarEvents,
  GOOGLE_CALENDAR_SCOPES,
} from "@/lib/server/googleCalendarOAuth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google Calendar OAuth permissions", () => {
  it("requests read-only calendar scopes and an authorization code", () => {
    const url = new URL(buildGoogleCalendarAuthorizationUrl({
      clientId: "test-client",
      clientSecret: "test-secret",
      redirectUri: "https://example.com/api/google-calendar/callback",
    }, "test-state"));

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("test-state");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.has("include_granted_scopes")).toBe(false);
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([
      ...GOOGLE_CALENDAR_SCOPES,
    ]);

    const scopes = url.searchParams.get("scope") ?? "";
    expect(scopes).toContain("calendar.events.readonly");
    expect(scopes).toContain("calendar.calendarlist.readonly");
    expect(scopes).not.toContain("calendar.events ");
  });
});

describe("Google Calendar OAuth state integrity", () => {
  it("binds state to the initiating user and secret", () => {
    const secret = "test-oauth-client-secret";
    const created = createGoogleCalendarOAuthState("user-123", secret);

    expect(
      verifyGoogleCalendarOAuthState(
        created.state, created.cookieValue, secret,
      ),
    ).toBe("user-123");

    expect(
      verifyGoogleCalendarOAuthState(
        "different-state", created.cookieValue, secret,
      ),
    ).toBeNull();

    expect(
      verifyGoogleCalendarOAuthState(
        created.state,
        created.cookieValue.replace("user-123", "other-user"),
        secret,
      ),
    ).toBeNull();

    expect(
      verifyGoogleCalendarOAuthState(
        created.state, created.cookieValue, "wrong-secret",
      ),
    ).toBeNull();
  });
});

describe("Google Calendar scope validation", () => {
  it("accepts requested read-only scopes but rejects additional Calendar scopes", () => {
    expect(hasOnlyAllowedGoogleCalendarScopes(GOOGLE_CALENDAR_SCOPES))
      .toBe(true);

    expect(hasOnlyAllowedGoogleCalendarScopes([
      ...GOOGLE_CALENDAR_SCOPES,
      "https://www.googleapis.com/auth/calendar.events",
    ])).toBe(false);

    expect(hasOnlyAllowedGoogleCalendarScopes([
      ...GOOGLE_CALENDAR_SCOPES,
      "https://www.googleapis.com/auth/calendar.readonly",
    ])).toBe(false);
  });
});

describe("Google account email verification", () => {
  it("accepts only email addresses marked verified by Google", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        email: "student@example.com",
        email_verified: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    await expect(getGoogleAccountEmail("test-token"))
      .resolves.toBe("student@example.com");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({
        email: "student@example.com",
        email_verified: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    await expect(getGoogleAccountEmail("test-token")).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ email: "student@example.com" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )));
    await expect(getGoogleAccountEmail("test-token")).resolves.toBeNull();
  });
});

describe("Google Calendar time-range validation", () => {
  it("accepts a valid UTC range", () => {
    expect(isValidCalendarTimeRange(
      "2026-10-27T00:00:00.000Z",
      "2026-10-28T00:00:00.000Z",
    )).toBe(true);
  });

  it("accepts a range of exactly 93 days", () => {
    expect(isValidCalendarTimeRange(
      "2026-01-01T00:00:00.000Z",
      "2026-04-04T00:00:00.000Z",
    )).toBe(true);
  });

  it.each([
    [null, "2026-10-28T00:00:00.000Z"],
    ["2026-10-27T00:00:00.000Z", null],
    ["2026-10-28T00:00:00.000Z", "2026-10-27T00:00:00.000Z"],
    ["2026-10-27T00:00:00", "2026-10-28T00:00:00Z"],
    ["not-a-date", "2026-10-28T00:00:00.000Z"],
    ["2026-01-01T00:00:00.000Z", "2026-04-05T00:00:00.000Z"],
  ])("rejects invalid range %j to %j", (start, end) => {
    expect(isValidCalendarTimeRange(start, end)).toBe(false);
  });
});

describe("Google Calendar event listing", () => {
  it("normalizes timed and all-day events and ignores cancelled or malformed rows", async () => {
    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const inputUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(inputUrl);
      expect(init?.method ?? "GET").toBe("GET");

      if (url.pathname.endsWith("/users/me/calendarList")) {
        return new Response(JSON.stringify({
          items: [{
            id: "primary",
            summary: "Personal",
            primary: true,
          }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname.endsWith("/calendars/primary/events")) {
        return new Response(JSON.stringify({
          items: [
            {
              id: "timed-1",
              summary: "Study group",
              start: { dateTime: "2026-10-27T14:00:00+03:00" },
              end: { dateTime: "2026-10-27T15:30:00+03:00" },
              location: "Library",
              description: "Review notes",
              htmlLink: "https://calendar.google.com/calendar/event?eid=abc",
              status: "confirmed",
            },
            {
              id: "all-day-1",
              summary: "Holiday",
              start: { date: "2026-10-28" },
              end: { date: "2026-10-30" },
              status: "confirmed",
            },
            {
              id: "cancelled-1",
              summary: "Cancelled meeting",
              start: { dateTime: "2026-10-27T16:00:00Z" },
              end: { dateTime: "2026-10-27T16:30:00Z" },
              status: "cancelled",
            },
            {
              id: "bad-1",
              summary: "Malformed event",
              start: {},
              status: "confirmed",
            },
            {
              id: "untitled-1",
              start: { dateTime: "2026-10-27T17:00:00Z" },
              end: { dateTime: "2026-10-27T17:30:00Z" },
              status: "confirmed",
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await listGoogleCalendarEvents(
      "test-access-token",
      "2026-10-27T00:00:00.000Z",
      "2026-10-31T00:00:00.000Z",
    );

    expect(result.warnings).toEqual([]);
    expect(result.events).toHaveLength(3);

    expect(result.events).toContainEqual(expect.objectContaining({
      id: "primary::timed-1",
      calendarName: "Personal",
      title: "Study group",
      startDateTime: "2026-10-27T14:00:00+03:00",
      endDateTime: "2026-10-27T15:30:00+03:00",
      allDay: false,
      location: "Library",
      description: "Review notes",
      htmlLink: "https://calendar.google.com/calendar/event?eid=abc",
    }));

    expect(result.events).toContainEqual(expect.objectContaining({
      id: "primary::all-day-1",
      title: "Holiday",
      startDate: "2026-10-28",
      endDate: "2026-10-30",
      startDateTime: null,
      endDateTime: null,
      allDay: true,
    }));

    expect(result.events).toContainEqual(expect.objectContaining({
      id: "primary::untitled-1",
      title: "Busy",
    }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [input, init] of fetchMock.mock.calls) {
      expect(init?.method ?? "GET").toBe("GET");
      const url = new URL(
        input instanceof Request ? input.url : String(input),
      );
      expect(url.pathname).not.toMatch(/\/events\/[^/]+$/);
    }
  });
});
