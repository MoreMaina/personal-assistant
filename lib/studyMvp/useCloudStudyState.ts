"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadStudyMvpState,
  replaceStudyMvpStateWithRecovery,
  saveStudyMvpState,
  STUDY_MVP_STORAGE_KEY,
  exportStudyMvpJSON,
} from "./storage";
import {
  loadStudyMvpCloudState,
  saveStudyMvpCloudState,
  StudyMvpCloudConflictError,
  type StudyMvpCloudRecord,
} from "./cloudStorage";
import type { StudyMvpState } from "./types";

export type CloudSyncStatus =
  | "loading"
  | "ready"
  | "migration"
  | "synced"
  | "syncing"
  | "conflict"
  | "error";

export interface StudySyncConflict {
  localState: StudyMvpState;
  cloudState: StudyMvpState;
  cloudRevision: number;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function useCloudStudyState() {
  const [state, setState] = useState<StudyMvpState | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<CloudSyncStatus>("loading");
  const [syncConflict, setSyncConflict] =
    useState<StudySyncConflict | null>(null);

  const statusRef = useRef<CloudSyncStatus>("loading");
  const revisionRef = useRef<number | null>(null);
  const currentStateRef = useRef<StudyMvpState | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const markStatus = useCallback((status: CloudSyncStatus) => {
    statusRef.current = status;
    setCloudSyncStatus(status);
  }, []);

  const acceptCloudState = useCallback((
    next: StudyMvpState,
    revision: number,
    message: string,
  ) => {
    currentStateRef.current = next;
    revisionRef.current = revision;
    setState(next);
    setSyncConflict(null);
    markStatus("synced");
    setNotice(message);
    setProblem("");
    setLoadingError("");
  }, [markStatus]);

  const showConflict = useCallback((
    localState: StudyMvpState,
    remote: StudyMvpCloudRecord,
  ) => {
    currentStateRef.current = localState;
    revisionRef.current = remote.revision;
    setState(localState);
    setSyncConflict({
      localState,
      cloudState: remote.state,
      cloudRevision: remote.revision,
    });
    markStatus("conflict");
    setNotice("");
    setProblem(
      "Browser and cloud Study data differ. Neither copy has been overwritten.",
    );
    setLoadingError("");
  }, [markStatus]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      let localState: StudyMvpState | null = null;

      try {
        const hasLocalData =
          window.localStorage.getItem(STUDY_MVP_STORAGE_KEY) !== null;

        if (hasLocalData) {
          localState = loadStudyMvpState();
        }

        const remote = await loadStudyMvpCloudState();
        if (cancelled) return;

        if (!remote && !localState) {
          // Do not create an empty remote record merely because a new
          // browser opens Study. A real save will create revision 1.
          const initial = loadStudyMvpState();

          if (cancelled) return;

          currentStateRef.current = initial;
          revisionRef.current = 0;
          setState(initial);
          setSyncConflict(null);
          markStatus("ready");
          setNotice(
            "Study is ready. Cloud storage will be created when you first save.",
          );
          setProblem("");
          setLoadingError("");
          return;
        }

        if (!remote) {
          if (!localState) {
            throw new Error("Study state initialization needs to be retried.");
          }

          // Never upload an existing browser copy without explicit approval.
          currentStateRef.current = localState;
          revisionRef.current = 0;
          setState(localState);
          setSyncConflict(null);
          markStatus("migration");
          setNotice(
            "Existing browser Study data was found. Download a copy and explicitly approve migration to cloud storage.",
          );
          setProblem("");
          setLoadingError("");
          return;
        }

        if (localState) {
          if (stableJson(localState) !== stableJson(remote.state)) {
            showConflict(localState, remote);
            return;
          }

          acceptCloudState(
            remote.state,
            remote.revision,
            "Study data is synced with your account.",
          );
          return;
        }

        // Only seed an empty browser after validating the cloud state.
        saveStudyMvpState(remote.state);
        if (cancelled) return;

        acceptCloudState(
          remote.state,
          remote.revision,
          "Loaded Study data from your account.",
        );
      } catch (error) {
        if (cancelled) return;

        markStatus("error");
        const detail = error instanceof Error
          ? error.message
          : "Check your connection and Study storage configuration.";

        if (localState) {
          currentStateRef.current = localState;
          setState(localState);
          setProblem(
            `Cloud initialization failed. Your browser copy remains available. ${detail}`,
          );
        } else {
          setLoadingError(
            `Could not safely initialize cloud-backed Study storage. ${detail}`,
          );
        }
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [acceptCloudState, markStatus, showConflict]);

  const persist = useCallback((
    next: StudyMvpState,
    successMessage = "Saved locally; syncing to cloud.",
  ): boolean => {
    if (statusRef.current === "migration") {
      setProblem("Approve migration of the existing browser state before making new Study changes.");
      return false;
    }

    if (statusRef.current === "conflict") {
      setProblem("Resolve the browser/cloud conflict before making more changes.");
      return false;
    }

    if (revisionRef.current === null) {
      setProblem("Cloud storage is not ready. No Study changes were accepted.");
      return false;
    }

    try {
      // Preserve the latest change locally before attempting a cloud write.
      saveStudyMvpState(next);
      currentStateRef.current = next;
      setState(next);
      setNotice(successMessage);
      setProblem("");
      setLoadingError("");

      queueRef.current = queueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (statusRef.current === "conflict") return;

          const expectedRevision = revisionRef.current;
          if (expectedRevision === null) {
            markStatus("error");
            setProblem("The cloud revision is unknown. The browser copy is retained.");
            return;
          }

          markStatus("syncing");

          try {
            const revision = await saveStudyMvpCloudState(
              next,
              expectedRevision,
            );

            revisionRef.current = revision;
            markStatus("synced");

            if (
              currentStateRef.current &&
              stableJson(currentStateRef.current) === stableJson(next)
            ) {
              setNotice("Saved to cloud.");
              setProblem("");
            }
          } catch (error) {
            if (error instanceof StudyMvpCloudConflictError) {
              const latest = await loadStudyMvpCloudState();

              if (latest) {
                const current = currentStateRef.current ?? next;
                const remoteJson = stableJson(latest.state);

                // A response can be lost after the server has committed.
                // Recognize that case without creating a false conflict.
                if (
                  remoteJson === stableJson(next) ||
                  remoteJson === stableJson(current)
                ) {
                  revisionRef.current = latest.revision;
                  markStatus("synced");
                  return;
                }

                showConflict(current, latest);
                return;
              }
            }

            markStatus("error");
            setProblem(
              "The change remains in this browser, but cloud saving failed. " +
              (error instanceof Error ? error.message : "Check your connection."),
            );
          }
        });

      return true;
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not save the Study state locally.",
      );
      return false;
    }
  }, [markStatus, showConflict]);

  const migrateLocalToCloud = useCallback(async () => {
    const localState = currentStateRef.current;

    if (
      !localState ||
      statusRef.current !== "migration" ||
      revisionRef.current !== 0
    ) {
      return;
    }

    if (!window.confirm(
      "Upload this browser's existing Study state to your cloud account? This only proceeds if no cloud state already exists. Download a recovery copy first if you have not already done so.\n\nContinue?",
    )) {
      return;
    }

    markStatus("syncing");

    try {
      const revision = await saveStudyMvpCloudState(localState, 0);

      acceptCloudState(
        localState,
        revision,
        "Existing browser Study data has been migrated to cloud storage.",
      );
    } catch (error) {
      if (error instanceof StudyMvpCloudConflictError) {
        try {
          const latest = await loadStudyMvpCloudState();

          if (latest) {
            if (stableJson(localState) === stableJson(latest.state)) {
              acceptCloudState(
                latest.state,
                latest.revision,
                "The Study state is already present in cloud storage.",
              );
            } else {
              showConflict(localState, latest);
            }
            return;
          }
        } catch {
          // Keep the browser state and ask the user to retry later.
        }
      }

      markStatus("migration");
      setProblem(
        "Migration did not complete. The browser copy has been preserved. " +
        (error instanceof Error ? error.message : "Please retry after checking the connection."),
      );
    }
  }, [acceptCloudState, markStatus, showConflict]);

  const chooseCloudVersion = useCallback(async () => {
    const conflict = syncConflict;
    if (!conflict) return;

    try {
      await queueRef.current.catch(() => undefined);

      // Preserve the existing browser value before replacing it.
      replaceStudyMvpStateWithRecovery(conflict.cloudState);

      acceptCloudState(
        conflict.cloudState,
        conflict.cloudRevision,
        "Cloud state selected. The old browser value was preserved for recovery.",
      );
    } catch (error) {
      markStatus("conflict");
      setProblem(
        "Could not preserve a recovery copy, so the browser state was not replaced. " +
        (error instanceof Error ? error.message : "Check browser storage capacity."),
      );
    }
  }, [acceptCloudState, markStatus, syncConflict]);

  const chooseBrowserVersion = useCallback(async () => {
    const conflict = syncConflict;
    if (!conflict) return;

    if (!window.confirm(
      "Save the browser Study state to the cloud? The existing cloud state will be backed up first. The database may reject changes that rewrite protected history. Download both copies first if unsure.\n\nContinue?",
    )) return;

    try {
      await queueRef.current.catch(() => undefined);
      markStatus("syncing");

      const revision = await saveStudyMvpCloudState(
        conflict.localState,
        conflict.cloudRevision,
      );

      acceptCloudState(
        conflict.localState,
        revision,
        "Browser Study state saved to cloud.",
      );
    } catch (error) {
      try {
        const latest = await loadStudyMvpCloudState();
        if (latest) showConflict(conflict.localState, latest);
        else markStatus("conflict");
      } catch {
        markStatus("conflict");
      }

      setProblem(
        "Cloud storage did not accept the browser copy. Both copies remain available. " +
        (error instanceof Error ? error.message : "The save failed."),
      );
    }
  }, [acceptCloudState, markStatus, showConflict, syncConflict]);

  const downloadConflictCopy = useCallback((
    label: "browser" | "cloud",
    value: StudyMvpState,
  ) => {
    const blob = new Blob([exportStudyMvpJSON(value)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      `study-mvp-${label}-conflict-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  return {
    state,
    loadingError,
    notice,
    setNotice,
    problem,
    setProblem,
    cloudSyncStatus,
    syncConflict,
    persist,
    migrateLocalToCloud,
    chooseCloudVersion,
    chooseBrowserVersion,
    downloadConflictCopy,
  };
}
