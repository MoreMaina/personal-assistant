"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

import {
  applySnapshot,
  normalizeSnapshot,
  readLocalSnapshot,
  saveLocalBackup,
  snapshotHasUserData,
  snapshotSignature,
  type AppSnapshot,
} from "@/lib/supabase/sync";

type SyncStatus =
  | "connecting"
  | "synced"
  | "waiting"
  | "error"
  | "hidden";

type SyncConflict = {
  localSnapshot: AppSnapshot;
  cloudSnapshot: AppSnapshot;
};

type SyncControl = {
  initialized: boolean;
  userId: string | null;
  localSignature: string;
  cloudSignature: string;
  remoteExists: boolean;
  conflicting: boolean;
};

const initialControl: SyncControl = {
  initialized: false,
  userId: null,
  localSignature: "",
  cloudSignature: "",
  remoteExists: false,
  conflicting: false,
};

export default function CloudSync() {
  const pathname = usePathname();

  const controlRef =
    useRef<SyncControl>({
      ...initialControl,
    });

  const [status, setStatus] =
    useState<SyncStatus>("connecting");

  const [conflict, setConflict] =
    useState<SyncConflict | null>(null);

  const [resolving, setResolving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  useEffect(() => {
    if (pathname === "/login") {
      setStatus("hidden");
      return;
    }

    let stopped = false;
    let busy = false;

    const supabase = createClient();

    const control = controlRef.current;

    async function writeCloudSnapshot(
      userId: string,
      snapshot: AppSnapshot,
    ) {
      const signature =
        snapshotSignature(snapshot);

      const { error } = await supabase
        .from("user_app_state")
        .upsert(
          {
            user_id: userId,
            data: snapshot,
            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          },
        );

      if (error) {
        throw error;
      }

      control.initialized = true;
      control.userId = userId;
      control.localSignature = signature;
      control.cloudSignature = signature;
      control.remoteExists = true;
      control.conflicting = false;

      setConflict(null);
      setErrorMessage("");
      setStatus("synced");
    }

    function pullCloudSnapshot(
      localSnapshot: AppSnapshot,
      cloudSnapshot: AppSnapshot,
    ) {
      const localSignature =
        snapshotSignature(localSnapshot);

      const cloudSignature =
        snapshotSignature(cloudSnapshot);

      if (
        localSignature !== cloudSignature &&
        Object.keys(localSnapshot).length > 0
      ) {
        saveLocalBackup(
          "personal-assistant-local-backup-before-cloud-sync",
          localSnapshot,
        );
      }

      applySnapshot(cloudSnapshot);

      control.initialized = true;
      control.localSignature = cloudSignature;
      control.cloudSignature = cloudSignature;
      control.remoteExists = true;
      control.conflicting = false;

      setConflict(null);
      setErrorMessage("");
      setStatus("synced");

      if (localSignature !== cloudSignature) {
        window.location.reload();
      }
    }

    function raiseConflict(
      localSnapshot: AppSnapshot,
      cloudSnapshot: AppSnapshot,
      userId: string,
    ) {
      control.initialized = true;
      control.userId = userId;
      control.localSignature =
        snapshotSignature(localSnapshot);
      control.cloudSignature =
        snapshotSignature(cloudSnapshot);
      control.remoteExists = true;
      control.conflicting = true;

      setConflict({
        localSnapshot,
        cloudSnapshot,
      });

      setStatus("error");
      setErrorMessage("");
    }

    async function syncNow() {
      if (
        stopped ||
        busy ||
        control.conflicting
      ) {
        return;
      }

      busy = true;

      try {
        const {
          data: userResult,
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          throw userError;
        }

        const user = userResult.user;

        if (!user) {
          setStatus("hidden");
          return;
        }

        if (
          control.userId &&
          control.userId !== user.id
        ) {
          Object.assign(
            control,
            initialControl,
            {
              userId: user.id,
            },
          );

          setConflict(null);
        }

        control.userId = user.id;

        const localSnapshot =
          readLocalSnapshot();

        const localSignature =
          snapshotSignature(localSnapshot);

        const {
          data: cloudRow,
          error: cloudError,
        } = await supabase
          .from("user_app_state")
          .select("data")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cloudError) {
          throw cloudError;
        }

        const cloudExists =
          cloudRow !== null;

        const cloudSnapshot =
          normalizeSnapshot(
            cloudRow?.data,
          );

        const cloudSignature =
          snapshotSignature(
            cloudSnapshot,
          );

        const hasLocalData =
          snapshotHasUserData(
            localSnapshot,
          );

        const hasCloudData =
          snapshotHasUserData(
            cloudSnapshot,
          );

        if (!control.initialized) {
          if (cloudExists) {
            if (
              hasLocalData &&
              hasCloudData &&
              localSignature !==
                cloudSignature
            ) {
              raiseConflict(
                localSnapshot,
                cloudSnapshot,
                user.id,
              );

              return;
            }

            if (
              hasLocalData &&
              !hasCloudData
            ) {
              await writeCloudSnapshot(
                user.id,
                localSnapshot,
              );

              return;
            }

            pullCloudSnapshot(
              localSnapshot,
              cloudSnapshot,
            );

            return;
          }

          if (hasLocalData) {
            await writeCloudSnapshot(
              user.id,
              localSnapshot,
            );

            return;
          }

          control.initialized = true;
          control.localSignature =
            localSignature;
          control.cloudSignature = "";
          control.remoteExists = false;

          setStatus("waiting");

          return;
        }

        const localChanged =
          localSignature !==
          control.localSignature;

        const cloudChanged =
          cloudExists &&
          (
            !control.remoteExists ||
            cloudSignature !==
              control.cloudSignature
          );

        if (!cloudExists) {
          if (
            hasLocalData &&
            (
              localChanged ||
              !control.remoteExists
            )
          ) {
            await writeCloudSnapshot(
              user.id,
              localSnapshot,
            );
          } else {
            control.localSignature =
              localSignature;

            control.remoteExists = false;

            setStatus("waiting");
          }

          return;
        }

        if (
          localSignature ===
          cloudSignature
        ) {
          const bothChanged =
            localChanged &&
            cloudChanged;

          control.initialized = true;
          control.localSignature =
            localSignature;
          control.cloudSignature =
            cloudSignature;
          control.remoteExists = true;

          setStatus("synced");

          if (bothChanged) {
            window.location.reload();
          }

          return;
        }

        if (
          localChanged &&
          cloudChanged &&
          hasLocalData &&
          hasCloudData
        ) {
          raiseConflict(
            localSnapshot,
            cloudSnapshot,
            user.id,
          );

          return;
        }

        if (
          localChanged &&
          hasLocalData &&
          (
            !cloudChanged ||
            !hasCloudData
          )
        ) {
          await writeCloudSnapshot(
            user.id,
            localSnapshot,
          );

          return;
        }

        if (hasCloudData) {
          pullCloudSnapshot(
            localSnapshot,
            cloudSnapshot,
          );

          return;
        }

        if (hasLocalData) {
          await writeCloudSnapshot(
            user.id,
            localSnapshot,
          );

          return;
        }

        pullCloudSnapshot(
          localSnapshot,
          cloudSnapshot,
        );
      } catch (error) {
        console.error(
          "Cloud sync failed:",
          error,
        );

        if (!stopped) {
          setStatus("error");
          setErrorMessage(
            "Cloud sync failed. Your local data has not been intentionally cleared.",
          );
        }
      } finally {
        busy = false;
      }
    }

    void syncNow();

    const interval = window.setInterval(
      () => {
        void syncNow();
      },
      8000,
    );

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [pathname]);

  async function useCloudVersion() {
    if (!conflict || resolving) {
      return;
    }

    setResolving(true);

    try {
      saveLocalBackup(
        "personal-assistant-local-backup-before-cloud-sync",
        conflict.localSnapshot,
      );

      applySnapshot(
        conflict.cloudSnapshot,
      );

      const signature =
        snapshotSignature(
          conflict.cloudSnapshot,
        );

      Object.assign(
        controlRef.current,
        {
          initialized: true,
          localSignature: signature,
          cloudSignature: signature,
          remoteExists: true,
          conflicting: false,
        },
      );

      setConflict(null);
      setStatus("synced");

      window.location.reload();
    } catch (error) {
      console.error(error);

      setErrorMessage(
        "Could not apply cloud data. Your local copy has been preserved.",
      );
    } finally {
      setResolving(false);
    }
  }

  async function useThisDeviceVersion() {
    if (!conflict || resolving) {
      return;
    }

    setResolving(true);

    try {
      saveLocalBackup(
        "personal-assistant-cloud-backup-before-overwrite",
        conflict.cloudSnapshot,
      );

      const supabase = createClient();

      const userId =
        controlRef.current.userId;

      if (!userId) {
        throw new Error(
          "No signed-in user was found.",
        );
      }

      const signature =
        snapshotSignature(
          conflict.localSnapshot,
        );

      const { error } = await supabase
        .from("user_app_state")
        .upsert(
          {
            user_id: userId,
            data: conflict.localSnapshot,
            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          },
        );

      if (error) {
        throw error;
      }

      Object.assign(
        controlRef.current,
        {
          initialized: true,
          localSignature: signature,
          cloudSignature: signature,
          remoteExists: true,
          conflicting: false,
        },
      );

      setConflict(null);
      setStatus("synced");
      setErrorMessage("");
    } catch (error) {
      console.error(error);

      setErrorMessage(
        "Could not upload this device's data. The conflict has been kept for you to resolve.",
      );
    } finally {
      setResolving(false);
    }
  }

  if (status === "hidden") {
    return null;
  }

  return (
    <>
      <div
        aria-live="polite"
        className={`fixed bottom-24 right-3 z-40 rounded-full border px-3 py-2 text-xs font-extrabold shadow-sm sm:bottom-4 ${
          status === "synced"
            ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-dark)]"
            : status === "error"
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-dark)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-soft)]"
        }`}
        title={errorMessage || undefined}
      >
        {conflict
          ? "Sync needs attention"
          : status === "synced"
            ? "Cloud synced"
            : status === "waiting"
              ? "Waiting for data"
              : status === "error"
                ? "Sync issue"
                : "Connecting to cloud…"}
      </div>

      {conflict && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-conflict-title"
            className="w-full max-w-lg rounded-[24px] border-2 border-[var(--primary-dark)] bg-[var(--surface)] p-6 shadow-[0_5px_0_var(--primary-dark)]"
          >
            <p className="text-sm font-extrabold uppercase tracking-wide text-[var(--accent-dark)]">
              Data conflict
            </p>

            <h2
              id="sync-conflict-title"
              className="mt-2 text-2xl"
            >
              Which copy should we keep?
            </h2>

            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              This device and the cloud both contain
              data, but the copies differ. We paused
              synchronization to avoid silently
              replacing either copy.
            </p>

            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              The copy you don't choose will be saved
              as a backup in this browser.
            </p>

            {errorMessage && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-bold text-[var(--accent-dark)]"
              >
                {errorMessage}
              </p>
            )}

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={useCloudVersion}
                disabled={resolving}
                className="rounded-[14px] border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-3 font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)] disabled:opacity-50"
              >
                {resolving
                  ? "Working…"
                  : "Use cloud copy"}
              </button>

              <button
                type="button"
                onClick={useThisDeviceVersion}
                disabled={resolving}
                className="rounded-[14px] border-2 border-[var(--accent-dark)] bg-[var(--accent)] px-4 py-3 font-extrabold text-white shadow-[0_3px_0_var(--accent-dark)] disabled:opacity-50"
              >
                {resolving
                  ? "Working…"
                  : "Use this device's copy"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}