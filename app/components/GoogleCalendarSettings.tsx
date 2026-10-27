"use client";

import { useCallback, useEffect, useState } from "react";

type Connection = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const callbackMessages: Record<string, string> = {
  connected: "Google Calendar connected successfully.",
  denied: "Google Calendar access was not granted.",
  failed: "Google Calendar could not be connected. Please try again.",
  "state-error": "The Google authorization check expired or was invalid. Start again.",
  "not-configured": "Google OAuth is not configured on the server yet.",
  "signed-out": "Please sign in again before connecting Google Calendar.",
  "account-changed": "Your app account changed during Google authorization. Start the connection again.",
  "identity-error": "Google did not return a verified email address. Check your Google account permissions and retry.",
  "scope-error": "Google did not grant the required read-only permissions. Try connecting again.",
  "refresh-token-missing": "Google did not provide offline access. Reconnect and approve the requested permissions.",
  "database-error": "The connection could not be saved. Confirm the Supabase migration has been applied.",
};

export default function GoogleCalendarSettings() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshConnection = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/google-calendar/connection", {
        cache: "no-store",
        signal,
      });
      const raw: unknown = await response.json().catch(() => ({}));
      const body = isRecord(raw) ? raw : {};

      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Google Calendar connection status is unavailable.",
        );
      }

      setConnection({
        configured: body.configured === true,
        connected: body.connected === true,
        email: typeof body.email === "string" ? body.email : null,
        connectedAt:
          typeof body.connectedAt === "string" ? body.connectedAt : null,
      });
    } catch (caught) {
      if (signal?.aborted) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Google Calendar connection status is unavailable.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const result = new URLSearchParams(window.location.search).get("googleCalendar");

    if (result && callbackMessages[result]) {
      setNotice(callbackMessages[result]);
    }

    void refreshConnection(controller.signal);
    return () => controller.abort();
  }, [refreshConnection]);

  async function disconnect() {
    if (disconnecting) return;
    if (!window.confirm(
      "Disconnect Google Calendar? Its events will no longer appear in this app.",
    )) return;

    setDisconnecting(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/google-calendar/connection", {
        method: "DELETE",
        cache: "no-store",
      });
      const raw: unknown = await response.json().catch(() => ({}));
      const body = isRecord(raw) ? raw : {};

      if (!response.ok) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Google Calendar could not be disconnected.",
        );
      }

      setConnection((current) => current
        ? { ...current, connected: false, email: null, connectedAt: null }
        : current);
      setNotice("Google Calendar has been disconnected.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Google Calendar could not be disconnected.",
      );
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Google Calendar</h2>
        <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
          View events already saved in Google Calendar alongside your classes,
          personal events and tasks. This connection is read-only: this app will
          not create, edit or delete Google events.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-[var(--ink-soft)]" role="status">
          Checking Google Calendar connection…
        </p>
      )}

      {!loading && connection?.connected && (
        <div className="space-y-2 rounded-xl border border-[var(--border)] p-3">
          <p className="font-bold text-[var(--primary-dark)]">Connected</p>
          <p className="text-sm text-[var(--ink-soft)]">
            {connection.email ?? "Google account connected"}
          </p>
          {connection.connectedAt && (
            <p className="text-xs text-[var(--muted)]">
              Connected {new Date(connection.connectedAt).toLocaleDateString(
                "en-GB",
                { day: "numeric", month: "short", year: "numeric" },
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href="/classes"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white"
            >
              View calendar
            </a>
            <a
              href="/api/google-calendar/connect"
              className="inline-flex min-h-10 items-center justify-center rounded-full border-2 border-[var(--border)] px-4 py-2 text-sm font-bold"
            >
              Reconnect
            </a>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={disconnecting}
              className="inline-flex min-h-10 items-center justify-center rounded-full border-2 border-[var(--border)] px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      )}

      {!loading && connection && !connection.connected && (
        <div className="space-y-3">
          {connection.configured ? (
            <a
              href="/api/google-calendar/connect"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--primary)] px-5 py-3 font-bold text-white"
            >
              Connect Google Calendar
            </a>
          ) : (
            <div className="space-y-2 rounded-xl border border-dashed border-[var(--border)] p-3">
              <p className="font-bold">Server setup required</p>
              <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
                Configure these server-side environment variables:
              </p>
              <code className="block break-words text-xs">GOOGLE_CALENDAR_CLIENT_ID</code>
              <code className="block break-words text-xs">GOOGLE_CALENDAR_CLIENT_SECRET</code>
              <code className="block break-words text-xs">GOOGLE_CALENDAR_REDIRECT_URI</code>
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                The redirect URI must match your deployed application and end
                with /api/google-calendar/callback. Apply the Google Calendar
                Supabase migration before connecting.
              </p>
            </div>
          )}
        </div>
      )}

      {notice && (
        <p
          className="rounded-xl bg-[var(--primary-soft)] p-3 text-sm font-semibold text-[var(--primary-dark)]"
          role="status"
        >
          {notice}
        </p>
      )}
      {error && (
        <div className="space-y-2" role="alert">
          <p className="rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-semibold text-[var(--accent-dark)]">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void refreshConnection()}
            disabled={loading}
            className="text-sm font-bold text-[var(--primary-dark)] underline disabled:opacity-50"
          >
            Retry connection check
          </button>
        </div>
      )}
    </section>
  );
}
