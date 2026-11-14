"use client";

import { useAutoDismissMessage } from "@/lib/useAutoDismissMessage";

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
import {
  exportStudyMvpJSON,
  normalizeLegacyDailyPlanExecutions,
} from "@/lib/studyMvp/storage";
import type { StudyMvpState } from "@/lib/studyMvp/types";
import { useCloudStudyState } from "@/lib/studyMvp/useCloudStudyState";

type BackupRow = {
  id: number;
  created_at: string;
  data: unknown;
};

type StudyBackupRow = {
  id: number | string;
  created_at: string;
  revision: number | string;
  state: unknown;
};

type ImportedBackupPreview = {
  fileName: string;
  savedAt: string | null;
  exportedAt: string | null;
  snapshot: AppSnapshot;
  sections: string[];
};

type BackupDisplayLimit = 3 | 5 | 10 | 20 | 50 | "all";

function parseBackupDisplayLimit(value: string): BackupDisplayLimit {
  if (value === "all") return "all";
  const parsed = Number(value);
  return ([3, 5, 10, 20, 50] as number[]).includes(parsed)
    ? (parsed as Exclude<BackupDisplayLimit, "all">)
    : 3;
}

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
  const {
    state: studyState,
    loadingError: studyLoadingError,
    cloudSyncStatus: studyCloudSyncStatus,
    syncConflict: studySyncConflict,
  } = useCloudStudyState();
  const [studyExportMessage, setStudyExportMessage] =
    useState<string | null>(null);
  function exportStudyDataAndHistory() {
    if (!studyState || studyLoadingError || studySyncConflict) {
      setStudyExportMessage(
        "Study data is not ready to export. Resolve any loading or sync conflict first.",
      );
      return;
    }

    try {
      const date = new Date().toISOString().slice(0, 10);
      const content = exportStudyMvpJSON(studyState);
      const blob = new Blob([content], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${
        studyCloudSyncStatus === "migration"
          ? "study-mvp-recovery"
          : "study-mvp-backup"
      }-${date}.json`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setStudyExportMessage(
        "Study data and event history downloaded.",
      );
    } catch (error) {
      setStudyExportMessage(
        `Could not export Study data: ${describeError(error)}`,
      );
    }
  }
  const [backups, setBackups] =
    useState<BackupRow[]>([]);
  const [studyBackups, setStudyBackups] =
    useState<StudyBackupRow[]>([]);
  const [studyBackupDisplayLimit, setStudyBackupDisplayLimit] =
    useState<BackupDisplayLimit>(3);
  const [appBackupDisplayLimit, setAppBackupDisplayLimit] =
    useState<BackupDisplayLimit>(3);
  const [studyBackupsLoading, setStudyBackupsLoading] =
    useState(true);
  const [studyBackupsError, setStudyBackupsError] =
    useState("");
  const [recoveryCopies, setRecoveryCopies] =
    useState<LocalStorageRecoveryCopy[]>([]);
  const [filePreview, setFilePreview] =
    useState<ImportedBackupPreview | null>(null);

  const [loading, setLoading] = useState(true);
  const [working, setWorking] =
    useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useAutoDismissMessage(error, setError);

  const visibleStudyBackups =
    studyBackupDisplayLimit === "all"
      ? studyBackups
      : studyBackups.slice(0, studyBackupDisplayLimit);
  const visibleAppBackups =
    appBackupDisplayLimit === "all"
      ? backups
      : backups.slice(0, appBackupDisplayLimit);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!studyExportMessage) return;
    const timeout = window.setTimeout(() => setStudyExportMessage(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [studyExportMessage]);

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

    const refreshStudyBackups = useCallback(async () => {
    setStudyBackupsLoading(true);
    setStudyBackupsError("");

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
          "Please sign in again to view Study history.",
        );
      }

      const {
        data: backupRows,
        error: backupError,
      } = await supabase
        .from("user_study_mvp_state_backups")
        .select("id, created_at, revision, state")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);

      if (backupError) {
        throw backupError;
      }

      setStudyBackups(
        (backupRows ?? []) as StudyBackupRow[],
      );
    } catch (caughtError) {
      setStudyBackupsError(
        "Could not load Study backup history. " +
          describeError(caughtError),
      );
    } finally {
      setStudyBackupsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);

    useEffect(() => {
    void refreshStudyBackups();
  }, [refreshStudyBackups]);

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

    function downloadStudyHistoryBackup(
    backup: StudyBackupRow,
  ): void {
    try {
      const state = normalizeLegacyDailyPlanExecutions(
        backup.state as StudyMvpState,
      );

      const content = exportStudyMvpJSON(state);
      const blob = new Blob([content], {
        type: "application/json;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download =
        `study-mvp-history-revision-${backup.revision}-` +
        `${backup.created_at.slice(0, 10)}.json`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      setStudyExportMessage(
        `Study cloud backup revision ${backup.revision} downloaded.`,
      );
    } catch (caughtError) {
      setStudyExportMessage(
        "Could not download this Study backup. " +
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
          Download backups and restore earlier versions of your app data.
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
      <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5" aria-label="Study backup and history">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] marker:hidden">
          <span>
            <span className="block font-extrabold text-[var(--ink)]">Study data and history</span>
            <span className="mt-1 block text-sm font-medium text-[var(--muted)]">Export Study records or download earlier Study versions</span>
          </span>
        </summary>
        <div className="mt-4">
  <h2 className="text-lg font-extrabold text-[#23412f]">
    Export a separate Study copy
  </h2>

  <p className="mt-2 text-sm text-stone-600">
    Export Study data and history as JSON.
  </p>
  <div className="mt-4 grid gap-3 sm:grid-cols-2">
  <div className="rounded-xl bg-stone-50 p-4">
    <p className="text-sm font-extrabold text-[#23412f]">
      Storage key
    </p>
    <code className="mt-2 block break-all text-xs font-semibold text-stone-600">
      personal-assistant-study-mvp-v1
    </code>
  </div>

  <div className="rounded-xl bg-stone-50 p-4">
    <p className="text-sm font-extrabold text-[#23412f]">
      Storage location
    </p>
    <p className="mt-2 text-sm font-semibold text-stone-600">
      Cloud-backed Study state with a local recovery copy.
    </p>
  </div>
</div>

  {studyLoadingError && (
    <p className="mt-3 text-sm text-red-700" role="alert">
      Study data could not be loaded:{" "}
      {describeError(studyLoadingError)}
    </p>
  )}

  {studySyncConflict && (
    <p className="mt-3 text-sm text-amber-800" role="alert">
      Resolve the Study cloud-sync conflict before exporting.
    </p>
  )}

  {studyExportMessage && (
    <p className="mt-3 text-sm text-stone-600" role="status">
      {studyExportMessage}
    </p>
  )}

  <button
    type="button"
    onClick={exportStudyDataAndHistory}
    disabled={
      !studyState ||
      Boolean(studyLoadingError) ||
      Boolean(studySyncConflict)
    }
    className="mt-4 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
  >
    Export Study data and history
  </button>
        <div className="mt-6 border-t border-stone-200 pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-extrabold text-[#23412f]">
          Previous Study versions
        </h3>
        <p className="mt-1 text-sm text-stone-600">
          Choose how many recent versions to display.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-stone-600">
          Show
          <select
            aria-label="Study backup versions to show"
            value={String(studyBackupDisplayLimit)}
            onChange={(event) => setStudyBackupDisplayLimit(parseBackupDisplayLimit(event.target.value))}
            className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold"
          >
            <option value="3">Latest 3</option>
            <option value="5">Latest 5</option>
            <option value="10">Latest 10</option>
            <option value="20">Latest 20</option>
            <option value="50">Latest 50</option>
            <option value="all">All loaded</option>
          </select>
        </label>
        <button
        type="button"
        onClick={() => void refreshStudyBackups()}
        disabled={studyBackupsLoading || working !== null}
        className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm font-bold text-stone-700 disabled:opacity-50"
      >
        {studyBackupsLoading ? "Loading…" : "Refresh history"}
        </button>
      </div>
    </div>

    {studyBackupsError && (
      <p className="mt-3 text-sm text-red-700" role="alert">
        {studyBackupsError}
      </p>
    )}

    {studyBackupsLoading ? (
      <p className="mt-4 text-sm text-stone-600">
        Loading previous Study versions…
      </p>
    ) : studyBackups.length === 0 ? (
      <p className="mt-4 rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-600">
        No previous Study versions have been recorded yet.
        They will appear here after cloud Study data changes.
      </p>
    ) : (
      <div className="mt-4 space-y-3">
        <p className="text-xs font-semibold text-stone-500">
          Showing {visibleStudyBackups.length} of {studyBackups.length} available versions.
        </p>
        {visibleStudyBackups.map((backup) => (
          <article
            key={String(backup.id)}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4"
          >
            <div>
              <p className="font-extrabold text-[#23412f]">
                {formatDate(backup.created_at)}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                Revision {backup.revision} · Backup #{backup.id}
              </p>
            </div>

            <button
              type="button"
              disabled={working !== null}
              onClick={() => downloadStudyHistoryBackup(backup)}
              className="rounded-xl border border-emerald-800 bg-emerald-800 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Download Study copy
            </button>
          </article>
        ))}
      </div>
    )}
  </div>
        </div>
      </details>

      <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] marker:hidden">
          <span>
            <span className="block font-extrabold text-[var(--ink)]">Download or restore app data</span>
            <span className="mt-1 block text-sm font-medium text-[var(--muted)]">Download a copy or restore a file; restoring replaces cloud data</span>
          </span>
        </summary>
        <div className="mt-4">
        <p className="text-sm font-black uppercase tracking-wide text-[var(--ink-soft)]">
          Portable backup
        </p>

        <h2 className="mt-1 text-xl">
          Download your current data
        </h2>

        <p className="mt-2 text-sm font-bold text-[var(--muted)]">
          Download the current cloud snapshot as a JSON file. Keep it private.
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
            Restoring replaces cloud data on your devices. The current version is backed up first.
          </p>
        </div>
        </div>
      </details>

      <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] marker:hidden">
          <span>
            <span className="block font-extrabold text-[var(--ink)]">Local recovery copies</span>
            <span className="mt-1 block text-sm font-medium text-[var(--muted)]">Local-only raw data; download it before clearing browser storage</span>
          </span>
        </summary>
        <div className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[var(--ink-soft)]">
              Preserved browser data
            </p>

            <h2 className="mt-1 text-2xl">
              Preserved browser data
            </h2>

            <p className="mt-2 max-w-2xl text-sm font-bold text-[var(--muted)]">
              Malformed data is saved locally before fallback. These raw copies are not synced to the cloud and cannot be imported through the normal backup tool. Download them before clearing browser data.</p>
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
        </div>
      </details>

      <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] marker:hidden">
          <span>
            <span className="block font-extrabold text-[var(--ink)]">Automatic cloud history</span>
            <span className="mt-1 block text-sm font-medium text-[var(--muted)]">Browse earlier snapshots; restoring replaces current app data</span>
          </span>
        </summary>
        <div className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-[var(--ink-soft)]">
              Saved app versions
            </p>

            <h2 className="mt-1 text-2xl">
              Previous versions
            </h2>

            <p className="mt-2 text-sm font-bold text-[var(--muted)]">
              Up to 50 snapshots are kept. Changes and deletions save the previous version.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink-soft)]">
              Show
              <select
                aria-label="Automatic cloud history versions to show"
                value={String(appBackupDisplayLimit)}
                onChange={(event) => setAppBackupDisplayLimit(parseBackupDisplayLimit(event.target.value))}
                className="min-h-12 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--ink)]"
              >
                <option value="3">Latest 3</option>
                <option value="5">Latest 5</option>
                <option value="10">Latest 10</option>
                <option value="20">Latest 20</option>
                <option value="50">Latest 50</option>
                <option value="all">All loaded</option>
              </select>
            </label>
            <button
            type="button"
            onClick={() => void refreshBackups()}
            disabled={loading || working !== null}
            className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 font-extrabold text-[var(--primary)] disabled:opacity-50"
          >
            {loading ? "Loading…" : "↻ Refresh"}
            </button>
          </div>
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
              Download your current data above. Earlier versions appear as cloud data changes.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-bold text-[var(--muted)]">
              Showing {visibleAppBackups.length} of {backups.length} available versions.
            </p>
            {visibleAppBackups.map((backup) => {
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
        </div>
      </details>

      <p className="text-sm font-bold text-[var(--muted)]">
        Cloud history belongs to your account. Keep downloaded backups private.
      </p>
    </div>
  );
}
