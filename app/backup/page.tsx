"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
} from "react";

import { createClient } from "@/lib/supabase/client";
import {
  applySnapshot,
  normalizeSnapshot,
  readLocalSnapshot,
  saveLocalBackup,
  type AppSnapshot,
} from "@/lib/supabase/sync";

type BackupRow = {
  id: number;
  created_at: string;
  data: unknown;
};

const BACKUP_FORMAT = "personal-assistant-backup";
const BACKUP_VERSION = 1;

function describeError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(date);
}

function downloadBackupFile(
  snapshot: AppSnapshot,
  savedAt: string,
): void {
  const payload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: "Personal Assistant",
    savedAt,
    exportedAt: new Date().toISOString(),
    snapshot,
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" },
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  const filenameDate = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  link.href = url;
  link.download =
    "personal-assistant-backup-" +
    filenameDate +
    ".json";

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export default function BackupRecoveryPage() {
  const [backups, setBackups] =
    useState<BackupRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [working, setWorking] =
    useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshBackups = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const {
        data: authResult,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      const user = authResult.user;

      if (!user) {
        throw new Error(
          "Please sign in again to view your backups.",
        );
      }

      const {
        data: backupRows,
        error: backupError,
      } = await supabase
        .from("user_app_state_backups")
        .select("id, created_at, data")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);

      if (backupError) {
        throw backupError;
      }

      setBackups(
        (backupRows ?? []) as BackupRow[],
      );
    } catch (caughtError) {
      setError(
        "Could not load your backups. " +
          describeError(caughtError),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);

  async function downloadCurrentCloudBackup() {
    setWorking("download");
    setError("");
    setMessage("");

    try {
      const supabase = createClient();

      const {
        data: authResult,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      const user = authResult.user;

      if (!user) {
        throw new Error(
          "Please sign in again before downloading.",
        );
      }

      const {
        data: currentRow,
        error: currentError,
      } = await supabase
        .from("user_app_state")
        .select("data, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (currentError) {
        throw currentError;
      }

      if (!currentRow) {
        throw new Error(
          "No cloud data was found. Wait for Cloud synced and try again.",
        );
      }

      const snapshot =
        normalizeSnapshot(currentRow.data);

      if (Object.keys(snapshot).length === 0) {
        throw new Error(
          "The cloud snapshot contains no recognized app data.",
        );
      }

      downloadBackupFile(
        snapshot,
        currentRow.updated_at ??
          new Date().toISOString(),
      );

      setMessage(
        "Your current cloud data has been downloaded as a JSON backup.",
      );
    } catch (caughtError) {
      setError(
        "Download failed. " +
          describeError(caughtError),
      );
    } finally {
      setWorking(null);
    }
  }

  async function restoreSnapshot(
    input: unknown,
    label: string,
  ): Promise<void> {
    const snapshot = normalizeSnapshot(input);

    if (Object.keys(snapshot).length === 0) {
      setError(
        "This backup has no recognized app data and cannot be restored.",
      );
      return;
    }

    const confirmed = window.confirm(
      "Restore " +
        label +
        "?\n\nThis will replace your current cloud data. The previous cloud version will be saved in backup history first, and other devices will sync to the restored version.\n\nContinue?",
    );

    if (!confirmed) {
      return;
    }

    setWorking("restore");
    setError("");
    setMessage("");

    try {
      const supabase = createClient();

      const {
        data: authResult,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      const user = authResult.user;

      if (!user) {
        throw new Error(
          "Please sign in again before restoring.",
        );
      }

      // Keep an additional browser-local copy.
      saveLocalBackup(
        "personal-assistant-local-backup-before-restore",
        readLocalSnapshot(),
      );

      // Updating the existing cloud row triggers the SQL
      // backup function, which preserves the previous data.
      const replacementTimestamp = new Date().toISOString();
      const replacementData = {
        ...snapshot,
        __replace_all_keys: true,
      };

      const { data: updatedRow, error: updateError } =
        await supabase
          .from("user_app_state")
          .update({
            data: replacementData,
            updated_at: replacementTimestamp,
          })
          .eq("user_id", user.id)
          .select("user_id")
          .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      if (!updatedRow) {
        const { error: insertError } = await supabase
          .from("user_app_state")
          .insert({
            user_id: user.id,
            data: snapshot,
            updated_at: replacementTimestamp,
          });

        if (insertError) {
          throw insertError;
        }
      }

      // Align this browser with the restored cloud state.
      applySnapshot(snapshot);

      setMessage(
        "Backup restored. This device is refreshing, and your other devices will sync to this version.",
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (caughtError) {
      setError(
        "Restore failed. " +
          describeError(caughtError),
      );
      setWorking(null);
    }
  }

  async function importBackupFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    // Allow the same file to be selected again.
    event.target.value = "";

    if (!file) {
      return;
    }

    setError("");
    setMessage("");

    try {
      const parsed: unknown =
        JSON.parse(await file.text());

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          "The file does not contain a valid backup.",
        );
      }

      const payload =
        parsed as Record<string, unknown>;

      if (
        payload.format !== BACKUP_FORMAT ||
        payload.version !== BACKUP_VERSION ||
        !("snapshot" in payload)
      ) {
        throw new Error(
          "Choose a JSON backup previously downloaded from Personal Assistant.",
        );
      }

      await restoreSnapshot(
        payload.snapshot,
        "the backup file " + file.name,
      );
    } catch (caughtError) {
      setError(
        "Could not read that backup file. " +
          describeError(caughtError),
      );
    }
  }

  const restoreIsRunning = working === "restore";

  return (
    <div className="space-y-7">
      <header className="space-y-3">
        <p className="text-sm font-black uppercase tracking-[0.12em] text-[var(--accent-dark)]">
          Data safety
        </p>

        <h1 className="text-4xl">
          Backup &amp; Recovery
        </h1>

        <p className="max-w-2xl text-base font-bold text-[var(--ink-soft)]">
          Keep a separate copy of your app data, browse
          previous cloud versions, and recover an earlier
          version when something goes wrong.
        </p>
      </header>

      {message && (
        <div
          role="status"
          className="rounded-xl border-2 border-[var(--primary)] bg-[var(--primary-soft)] p-4 font-extrabold text-[var(--primary-dark)]"
        >
          {message}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border-2 border-[var(--accent-dark)] bg-[var(--accent-soft)] p-4 font-extrabold text-[var(--accent-dark)]"
        >
          {error}
        </div>
      )}

      <section className="rounded-2xl bg-[var(--surface)] p-5">
        <p className="text-sm font-black uppercase tracking-wide text-[var(--ink-soft)]">
          Portable backup
        </p>

        <h2 className="mt-1 text-xl">
          Download your current data
        </h2>

        <p className="mt-2 text-sm font-bold text-[var(--muted)]">
          Downloads the current cloud snapshot as a JSON
          file. Store it somewhere private and safe.
        </p>

        <button
          type="button"
          onClick={() =>
            void downloadCurrentCloudBackup()
          }
          disabled={working !== null}
          className="mt-4 rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-3 font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)] disabled:opacity-50"
        >
          {working === "download"
            ? "Preparing file…"
            : "↓ Download current data"}
        </button>

        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <h3 className="text-lg">
            Restore from a downloaded file
          </h3>

          <p className="mb-3 mt-2 text-sm font-bold text-[var(--muted)]">
            Choose a backup file you previously
            downloaded from this page.
          </p>

          <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border-2 border-[var(--accent-dark)] bg-[var(--accent-soft)] px-4 py-3 font-extrabold text-[var(--accent-dark)]">
            ↑ Choose backup file
            <input
              type="file"
              accept=".json,application/json"
              onChange={importBackupFile}
              disabled={working !== null}
              className="sr-only"
            />
          </label>

          <p className="mt-3 text-sm font-bold text-[var(--muted)]">
            Restoring replaces cloud data on your signed-in
            devices. The previous cloud version is saved
            first.
          </p>
        </div>
      </section>

      <section className="rounded-2xl bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[var(--ink-soft)]">
              Automatic cloud history
            </p>

            <h2 className="mt-1 text-2xl">
              Previous versions
            </h2>

            <p className="mt-2 text-sm font-bold text-[var(--muted)]">
              Up to 50 recent snapshots are retained.
              Changes and deletions preserve the prior
              cloud data automatically.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refreshBackups()}
            disabled={loading || working !== null}
            className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 font-extrabold text-[var(--primary)] disabled:opacity-50"
          >
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>

        {loading ? (
          <p className="mt-6 text-sm font-bold text-[var(--ink-soft)]">
            Loading your backup history…
          </p>
        ) : backups.length === 0 ? (
          <div className="mt-6 rounded-xl border-2 border-dashed border-[var(--border)] p-5">
            <h3 className="text-lg">
              No previous versions found
            </h3>

            <p className="mt-2 text-sm font-bold text-[var(--ink-soft)]">
              Your current data can still be downloaded
              above. Older versions appear as the saved
              cloud data changes.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {backups.map((backup) => {
              const snapshot =
                normalizeSnapshot(backup.data);

              const itemCount =
                Object.keys(snapshot).length;

              return (
                <article
                  key={backup.id}
                  className="rounded-xl border-2 border-[var(--border)] bg-[var(--background)] p-4"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-extrabold text-[var(--primary)]">
                        {formatDate(backup.created_at)}
                      </p>

                      <p className="text-sm font-bold text-[var(--muted)]">
                        Backup #{backup.id} · {itemCount} stored app items
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          itemCount === 0 ||
                          working !== null
                        }
                        onClick={() => {
                          if (itemCount === 0) {
                            setError(
                              "This backup contains no recognized app data.",
                            );
                            return;
                          }

                          setError("");
                          downloadBackupFile(
                            snapshot,
                            backup.created_at,
                          );
                          setMessage(
                            "The selected historical backup was downloaded.",
                          );
                        }}
                        className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-extrabold text-[var(--primary)] disabled:opacity-50"
                      >
                        ↓ Download
                      </button>

                      <button
                        type="button"
                        disabled={
                          itemCount === 0 ||
                          working !== null
                        }
                        onClick={() =>
                          void restoreSnapshot(
                            backup.data,
                            "backup from " +
                              formatDate(backup.created_at),
                          )
                        }
                        className="rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-3 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)] disabled:opacity-50"
                      >
                        {restoreIsRunning
                          ? "Restoring…"
                          : "Restore this version"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-sm font-bold text-[var(--muted)]">
        Backup history is associated with your signed-in
        account. Downloaded files are separate copies;
        keep them private and somewhere safe.
      </p>
    </div>
  );
}