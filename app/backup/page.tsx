"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
} from "react";

import { createClient } from "@/lib/supabase/client";
import {
  getLocalRecoveryCopies,
  type LocalStorageRecoveryCopy,
} from "@/lib/storageRecovery";
import {
  applySnapshotWithRollback,
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

type ImportedBackupPreview = {
  fileName: string;
  savedAt: string | null;
  exportedAt: string | null;
  snapshot: AppSnapshot;
  sections: string[];
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

function downloadRecoveryCopy(
  copy: LocalStorageRecoveryCopy,
): void {
  // This is a separate recovery format, not a normal app backup.
  // It preserves the exact raw value without automatically restoring it.
  const payload = {
    format: "personal-assistant-local-recovery-copy",
    version: 1,
    app: "Personal Assistant",
    originalKey: copy.originalKey,
    preservedAt: copy.preservedAt,
    reason: copy.reason,
    rawValue: copy.rawValue,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json" },
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeKey = copy.originalKey.replace(/[^a-z0-9-]/gi, "-");

  link.href = url;
  link.download = `personal-assistant-recovery-${safeKey}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BackupRecoveryPage() {
  const [backups, setBackups] =
    useState<BackupRow[]>([]);
  const [recoveryCopies, setRecoveryCopies] =
    useState<LocalStorageRecoveryCopy[]>([]);
  const [filePreview, setFilePreview] =
    useState<ImportedBackupPreview | null>(null);

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

  const refreshRecoveryCopies = useCallback(() => {
    try {
      setRecoveryCopies(getLocalRecoveryCopies());
    } catch (caughtError) {
      setError(
        "Could not read local recovery copies. " +
          describeError(caughtError),
      );
    }
  }, []);

  useEffect(() => {
    refreshRecoveryCopies();
  }, [refreshRecoveryCopies]);

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
    let snapshot: AppSnapshot;

    try {
      snapshot = normalizeSnapshot(input);
    } catch (caughtError) {
      setMessage("");
      setError(
        "This backup contains malformed app data and cannot be restored. " +
          describeError(caughtError),
      );
      return;
    }

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

      // Keep an additional browser-local copy and retain the
      // original snapshot in memory in case local apply fails.
      const localSnapshotBeforeRestore = readLocalSnapshot();

      saveLocalBackup(
        "personal-assistant-local-backup-before-restore",
        localSnapshotBeforeRestore,
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

      // The cloud restore succeeded above. Handle a local
      // storage failure separately so it isn't reported as a
      // failed cloud restore.
      const localApplyResult = applySnapshotWithRollback(
        snapshot,
        localSnapshotBeforeRestore,
      );

      if (!localApplyResult.success) {
        console.error(
          "Cloud restore succeeded, but local storage could not be updated:",
          localApplyResult.applyError,
        );

        if (!localApplyResult.rollbackSucceeded) {
          console.error(
            "Could not restore the previous local snapshot:",
            localApplyResult.rollbackError,
          );
        }

        setMessage(
          "The cloud backup was restored successfully, but this browser could not finish updating its local copy.",
        );

        setError(
          localApplyResult.rollbackSucceeded
            ? "This browser's previous local data was restored. Reload and resolve any Cloud Sync conflict to load the restored cloud version."
            : "This browser's local data may be partially updated. Do not overwrite the restored cloud data with this device's version. Reload and carefully resolve any Cloud Sync conflict.",
        );

        setWorking(null);
        return;
      }

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
    setFilePreview(null);

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

      const snapshot = normalizeSnapshot(payload.snapshot);
      const sections = Object.keys(snapshot).sort();

      if (sections.length === 0) {
        throw new Error(
          "This file contains no recognized app data and cannot be restored.",
        );
      }

      setFilePreview({
        fileName: file.name,
        savedAt: typeof payload.savedAt === "string"
          ? payload.savedAt
          : null,
        exportedAt: typeof payload.exportedAt === "string"
          ? payload.exportedAt
          : null,
        snapshot,
        sections,
      });

      setMessage(
        "Backup file validated. Nothing has been restored yet.",
      );
    } catch (caughtError) {
      setFilePreview(null);
      setError(
        "Could not preview that backup file. " +
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

          {filePreview && (
            <div
              className="mt-4 space-y-3 rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--background)] p-4"
              role="region"
              aria-label="Backup file preview"
            >
              <div>
                <h4 className="font-extrabold text-[var(--primary-dark)]">
                  Backup preview
                </h4>
                <p className="mt-1 break-words text-sm font-bold">
                  File: {filePreview.fileName}
                </p>
              </div>

              {filePreview.savedAt && (
                <p className="text-sm text-[var(--ink-soft)]">
                  Snapshot saved: {formatDate(filePreview.savedAt)}
                </p>
              )}

              {filePreview.exportedAt && (
                <p className="text-sm text-[var(--ink-soft)]">
                  File exported: {formatDate(filePreview.exportedAt)}
                </p>
              )}

              <div>
                <p className="text-sm font-extrabold">
                  Recognized data sections ({filePreview.sections.length})
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {filePreview.sections.map((section) => (
                    <li
                      key={section}
                      className="max-w-full break-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs font-semibold"
                    >
                      {section}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-sm font-bold text-[var(--accent-dark)]">
                Preview only. Restoring replaces your current cloud data.
                The existing restore confirmation and backup safeguards still apply.
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={working !== null}
                  onClick={() => {
                    if (!filePreview) return;
                    void restoreSnapshot(
                      filePreview.snapshot,
                      "the backup file " + filePreview.fileName,
                    );
                  }}
                  className="rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-3 font-extrabold text-white disabled:opacity-50"
                >
                  Continue to restore
                </button>

                <button
                  type="button"
                  disabled={working !== null}
                  onClick={() => {
                    setFilePreview(null);
                    setError("");
                    setMessage("Backup preview cancelled. No data was restored.");
                  }}
                  className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-4 py-3 font-extrabold disabled:opacity-50"
                >
                  Cancel preview
                </button>
              </div>
            </div>
          )}

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
              Local recovery copies
            </p>

            <h2 className="mt-1 text-2xl">
              Preserved browser data
            </h2>

            <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">
              When a storage reader detects malformed data, the original
              raw value is preserved here in this browser before a fallback
              is returned. These copies are local to this browser and are
              not synced to the cloud. Download them somewhere private and
              safe before clearing browser data. They are raw recovery
              material, not files that can be directly restored through
              the normal backup importer.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshRecoveryCopies}
            disabled={working !== null}
            className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 font-extrabold text-[var(--primary)] disabled:opacity-50"
          >
            ↻ Refresh local copies
          </button>
        </div>

        {recoveryCopies.length === 0 ? (
          <div className="mt-5 rounded-xl border-2 border-dashed border-[var(--border)] p-5">
            <h3 className="text-lg">
              No local recovery copies found
            </h3>
            <p className="mt-2 text-sm font-bold text-[var(--ink-soft)]">
              Copies will appear here if a storage reader encounters
              malformed or unexpectedly shaped saved data.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {recoveryCopies.map((copy, index) => (
              <article
                key={`${copy.originalKey}-${copy.preservedAt}-${index}`}
                className="rounded-xl border-2 border-[var(--border)] bg-[var(--background)] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="break-words font-extrabold text-[var(--primary)]">
                      {copy.originalKey}
                    </p>
                    <p className="text-sm font-bold text-[var(--muted)]">
                      Preserved: {formatDate(copy.preservedAt)}
                    </p>
                    <p className="text-sm text-[var(--ink-soft)]">
                      Reason: {copy.reason === "invalid-json"
                        ? "Invalid JSON"
                        : "Unexpected data shape"} · {copy.rawValue.length.toLocaleString()} characters
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={working !== null}
                    onClick={() => {
                      try {
                        downloadRecoveryCopy(copy);
                        setError("");
                        setMessage(
                          `Local recovery copy for ${copy.originalKey} downloaded.`,
                        );
                      } catch (caughtError) {
                        setError(
                          "Could not download the recovery copy. " +
                            describeError(caughtError),
                        );
                      }
                    }}
                    className="shrink-0 rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-3 py-2 text-sm font-extrabold text-white disabled:opacity-50"
                  >
                    ↓ Download raw copy
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
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