"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import AppIcon from "@/app/components/AppIcon";
import GlobalSearch, {
  OPEN_GLOBAL_SEARCH_EVENT,
} from "@/app/components/GlobalSearch";
import SignOutButton from "@/app/components/SignOutButton";

type SyncStatus =
  | "connecting"
  | "synced"
  | "waiting"
  | "error"
  | "conflict"
  | "hidden";

type SyncStatusDetail = {
  status?: string;
  message?: string;
};

const SYNC_STATUS_EVENT = "personal-assistant:cloud-sync-status";
const REQUEST_SYNC_STATUS_EVENT = "personal-assistant:request-cloud-sync-status";

const STATUS_LABELS: Record<SyncStatus, string> = {
  connecting: "Connecting to cloud…",
  synced: "Cloud synced",
  waiting: "Waiting for data",
  error: "Sync needs attention",
  conflict: "Data conflict needs attention",
  hidden: "Cloud sync unavailable",
};

export default function AppUtilitiesMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [syncMessage, setSyncMessage] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleSyncStatus(event: Event) {
      const detail = (event as CustomEvent<SyncStatusDetail>).detail;
      const value = detail?.status;

      const allowed: SyncStatus[] = [
        "connecting",
        "synced",
        "waiting",
        "error",
        "conflict",
        "hidden",
      ];

      if (value && allowed.includes(value as SyncStatus)) {
        setSyncStatus(value as SyncStatus);
      }

      setSyncMessage(
        typeof detail?.message === "string" ? detail.message : "",
      );
    }

    window.addEventListener(SYNC_STATUS_EVENT, handleSyncStatus);
    window.dispatchEvent(new Event(REQUEST_SYNC_STATUS_EVENT));

    return () => {
      window.removeEventListener(SYNC_STATUS_EVENT, handleSyncStatus);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function openSearch() {
    setOpen(false);
    window.dispatchEvent(new Event(OPEN_GLOBAL_SEARCH_EVENT));
  }

  if (pathname === "/login") {
    return <GlobalSearch showTrigger={false} />;
  }

  return (
    <div className="app-utilities" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="app-utilities__trigger"
        aria-label="Open utilities menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="app-utilities-menu"
        title="Utilities"
        onClick={() => setOpen((current) => !current)}
      >
        <AppIcon name="more" size={23} />
      </button>

      {open && (
        <div
          id="app-utilities-menu"
          className="app-utilities__panel"
          role="menu"
          aria-label="App utilities"
        >
          <p className="app-utilities__heading">Utilities</p>

          <button
            type="button"
            role="menuitem"
            className="app-utilities__action"
            onClick={openSearch}
          >
            <AppIcon name="search" size={18} />
            <span>Search records</span>
            <span className="app-utilities__shortcut">Ctrl/⌘ K</span>
          </button>

          <Link
            href="/backup"
            role="menuitem"
            className="app-utilities__action"
            onClick={() => setOpen(false)}
          >
            <AppIcon name="backup" size={18} />
            <span>Backup & recovery</span>
          </Link>

          <Link
            href="/settings"
            role="menuitem"
            className="app-utilities__action"
            onClick={() => setOpen(false)}
          >
            <AppIcon name="settings" size={18} />
            <span>General settings</span>
          </Link>

          <Link
            href="/settings/ai"
            role="menuitem"
            className="app-utilities__action"
            onClick={() => setOpen(false)}
          >
            <AppIcon name="settings" size={18} />
            <span>AI settings</span>
          </Link>

          <div
            className={`app-utilities__sync app-utilities__sync--${syncStatus}`}
            role="status"
            aria-live="polite"
            title={syncMessage || undefined}
          >
            <AppIcon name="cloud" size={18} />
            <span>{STATUS_LABELS[syncStatus]}</span>
          </div>

          {syncMessage && (
            <p className="app-utilities__sync-message">{syncMessage}</p>
          )}

          <div className="app-utilities__divider" />

          <SignOutButton variant="menu" />
        </div>
      )}

      <GlobalSearch showTrigger={false} />
    </div>
  );
}
