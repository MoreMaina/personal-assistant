"use client";

import { useEffect } from "react";

/**
 * Clears temporary feedback after it has been announced and displayed.
 * Persistent loading, sync-conflict and field-validation states should not
 * use this hook.
 */
export function useAutoDismissMessage(
  message: string | null | undefined,
  clearMessage: (value: string) => void,
  durationMs = 8000,
): void {
  useEffect(() => {
    if (!message) return;

    const timeout = window.setTimeout(
      () => clearMessage(""),
      durationMs,
    );

    return () => window.clearTimeout(timeout);
  }, [message, clearMessage, durationMs]);
}
