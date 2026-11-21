"use client";

import { useEffect, useState } from "react";

type PushSettings = {
  id: string;
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

type ApiResponse = {
  subscription?: PushSettings;
  publicKey?: string;
  error?: string;
};

type Phase = "checking" | "off" | "on";

function decodeVapidKey(value: string): Uint8Array {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(base64);

  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function readResponse(response: Response): Promise<ApiResponse> {
  const value: unknown = await response.json().catch(() => ({}));

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as ApiResponse;
}

export default function PushNotificationSettings() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [permission, setPermission] = useState("default");
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setSupported(false);
      setPhase("off");
      return;
    }

    setPermission(Notification.permission);

    let cancelled = false;

    async function checkExistingSubscription() {
      try {
        const registration =
          await navigator.serviceWorker.getRegistration("/");

        const browserSubscription =
          await registration?.pushManager.getSubscription();

        if (!browserSubscription) {
          if (!cancelled) setPhase("off");
          return;
        }

        const response = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            subscription: browserSubscription.toJSON(),
            timeZone:
              Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            deviceName: navigator.userAgent.slice(0, 120),
          }),
        });

        const body = await readResponse(response);

        if (!response.ok || !body.subscription) {
          throw new Error(
            body.error || "Could not load this device's notification settings.",
          );
        }

        if (cancelled) return;

        setSettings(body.subscription);
        setPhase(body.subscription.enabled ? "on" : "off");
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not check notification status.",
        );
        setPhase("off");
      }
    }

    void checkExistingSubscription();

    return () => {
      cancelled = true;
    };
  }, []);

  async function enableDevice() {
    if (busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        throw new Error("This browser does not support web push notifications.");
      }

      let currentPermission = Notification.permission;

      if (currentPermission === "default") {
        currentPermission = await Notification.requestPermission();
      }

      setPermission(currentPermission);

      if (currentPermission !== "granted") {
        throw new Error(
          "Notifications are not permitted. Allow notifications for this site in Chrome settings, then try again.",
        );
      }

      const keyResponse = await fetch("/api/push/public-key", {
        cache: "no-store",
      });
      const keyBody = await readResponse(keyResponse);

      if (!keyResponse.ok || !keyBody.publicKey) {
        throw new Error(
          keyBody.error || "Push notifications are not configured on the server.",
        );
      }

      const registration = await navigator.serviceWorker.register(
        "/push-sw.js",
        { scope: "/" },
      );

      await navigator.serviceWorker.ready;

      let browserSubscription =
        await registration.pushManager.getSubscription();

      if (!browserSubscription) {
        browserSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(keyBody.publicKey) as BufferSource,
        });
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          subscription: browserSubscription.toJSON(),
          timeZone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          deviceName: navigator.userAgent.slice(0, 120),
        }),
      });

      const body = await readResponse(response);

      if (!response.ok || !body.subscription) {
        throw new Error(
          body.error || "This device could not be registered.",
        );
      }

      let activeSubscription = body.subscription;

      if (!activeSubscription.enabled) {
        const preferenceResponse = await fetch("/api/push/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            subscriptionId: activeSubscription.id,
            enabled: true,
          }),
        });

        const preferenceBody = await readResponse(preferenceResponse);

        if (!preferenceResponse.ok || !preferenceBody.subscription) {
          throw new Error(
            preferenceBody.error || "This device could not be enabled.",
          );
        }

        activeSubscription = preferenceBody.subscription;
      }

      setSettings(activeSubscription);
      setPhase(activeSubscription.enabled ? "on" : "off");
      setMessage("This device is registered for push notifications.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not enable push notifications.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePreference(changes: Record<string, unknown>) {
    if (!settings || busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/push/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          subscriptionId: settings.id,
          ...changes,
        }),
      });

      const body = await readResponse(response);

      if (!response.ok || !body.subscription) {
        throw new Error(
          body.error || "Notification preferences could not be saved.",
        );
      }

      setSettings(body.subscription);
      setPhase(body.subscription.enabled ? "on" : "off");
      setMessage("Notification preferences saved.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Notification preferences could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleReminderMinute(
    field: "event_reminder_minutes" | "class_reminder_minutes",
    minute: number,
    checked: boolean,
  ) {
    if (!settings) return;

    const current = settings[field];
    const next = checked
      ? [...current, minute].sort((a, b) => b - a)
      : current.filter((value) => value !== minute);

    if (next.length === 0) {
      setError("Keep at least one reminder time selected.");
      return;
    }

    void savePreference({
      [field === "event_reminder_minutes"
        ? "eventReminderMinutes"
        : "classReminderMinutes"]: next,
    });
  }

  return (
    <section className="space-y-5">

      {!supported && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          This browser does not support the required push notification features.
          Use a current version of Chrome on Android.
        </p>
      )}

      {supported && phase === "checking" && (
        <p className="text-sm text-[var(--ink-soft)]" role="status">
          Checking this device…
        </p>
      )}

      {supported && phase !== "checking" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
          <div className="space-y-1">
            <p className="font-bold">
              {phase === "on" ? "This device is enabled" : "This device is off"}
            </p>
            <p className="text-xs text-[var(--muted)]">
              Browser permission: {permission}
            </p>
          </div>

          {phase === "on" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void savePreference({ enabled: false })}
              className="min-h-10 rounded-full border-2 border-[var(--border)] px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              {busy ? "Saving…" : "Turn off on this device"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !supported}
              onClick={() => void enableDevice()}
              className="min-h-10 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "Enabling…" : "Enable on this device"}
            </button>
          )}
        </div>
      )}

      {settings && (
        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="font-bold">Notification categories</h3>

            {([
              ["class_reminders_enabled", "classRemindersEnabled", "Classes", "Weekly lectures, tutorials and practicals. Off by default."],
              ["calendar_reminders_enabled", "calendarRemindersEnabled", "Other calendar events", "Events saved in this app's calendar."],
              ["google_calendar_enabled", "googleCalendarEnabled", "Google Calendar", "Read-only events from your connected Google account."],
              ["task_reminders_enabled", "taskRemindersEnabled", "Tasks and deadlines", "A daily summary of tasks due today and overdue."],
              ["study_reminders_enabled", "studyRemindersEnabled", "Study plan", "A daily summary of unfinished sections in your saved Study Plan."],
            ] as const).map(([field, apiField, label, description]) => (
              <label
                key={field}
                className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-3"
              >
                <input
                  type="checkbox"
                  checked={settings[field]}
                  disabled={busy || !settings.enabled}
                  onChange={(event) =>
                    void savePreference({ [apiField]: event.target.checked })
                  }
                  className="mt-1 h-5 w-5 accent-[var(--primary)]"
                />
                <span className="min-w-0 space-y-1">
                  <span className="block text-sm font-bold">{label}</span>
                  <span className="block text-xs text-[var(--muted)]">
                    {description}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="font-bold">Reminder timing</h3>
            <p className="text-xs text-[var(--muted)]">
              Choose one or more reminder times before an event.
            </p>

            <div className="flex flex-wrap gap-4">
              {[10, 30, 60].map((minute) => (
                <label key={minute} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.event_reminder_minutes.includes(minute)}
                    disabled={busy || !settings.enabled || !settings.calendar_reminders_enabled}
                    onChange={(event) =>
                      toggleReminderMinute("event_reminder_minutes", minute, event.target.checked)
                    }
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  {minute} min
                </label>
              ))}
            </div>

            {settings.class_reminders_enabled && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Class reminder lead time</p>
                <div className="flex flex-wrap gap-4">
                  {[10, 30, 60].map((minute) => (
                    <label key={minute} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.class_reminder_minutes.includes(minute)}
                        disabled={busy || !settings.enabled}
                        onChange={(event) =>
                          toggleReminderMinute("class_reminder_minutes", minute, event.target.checked)
                        }
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      {minute} min
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="font-bold">Daily summary times</h3>
            <p className="text-xs text-[var(--muted)]">
              Times use this device's saved time zone.
            </p>

            {([
              ["all_day_event_time", "allDayEventTime", "All-day events"],
              ["task_digest_time", "taskDigestTime", "Tasks and deadlines"],
              ["study_digest_time", "studyDigestTime", "Study plan"],
            ] as const).map(([field, apiField, label]) => (
              <label key={field} className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{label}</span>
                <input
                  type="time"
                  value={settings[field]}
                  disabled={busy || !settings.enabled}
                  onChange={(event) =>
                    void savePreference({ [apiField]: event.target.value })
                  }
                  className="min-h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {message && (
        <p className="rounded-xl bg-[var(--primary-soft)] p-3 text-sm font-semibold text-[var(--primary-dark)]" role="status">
          {message}
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-semibold text-[var(--accent-dark)]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
