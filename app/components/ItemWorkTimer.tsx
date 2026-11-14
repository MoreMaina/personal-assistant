"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type TimerEntry = {
  durationMinutes: number;
  remainingMs: number;
  endsAtMs: number | null;
  completedAtMs: number | null;
};

type TimerStore = {
  entries: Record<string, TimerEntry>;
  activeItemId: string | null;
};

type StopwatchEntry = {
  elapsedMs: number;
  startedAtMs: number | null;
};

type StopwatchStore = {
  entries: Record<string, StopwatchEntry>;
  activeItemId: string | null;
};

type ItemTimerContextValue = {
  store: TimerStore;
  stopwatchStore: StopwatchStore;
  now: number;
  hydrated: boolean;
  start: (itemId: string, defaultMinutes: number) => void;
  pause: (itemId: string) => void;
  reset: (itemId: string, defaultMinutes: number) => void;
  setDuration: (itemId: string, minutes: number) => void;
  startStopwatch: (itemId: string) => void;
  pauseStopwatch: (itemId: string) => void;
  resetStopwatch: (itemId: string) => void;
};

const STORAGE_KEY = "personal-assistant-item-timers-v1";
const STOPWATCH_STORAGE_KEY = "personal-assistant-item-stopwatches-v1";
const MAX_DURATION_MINUTES = 1440;
const MIN_DURATION_MINUTES = 1;

const EMPTY_STORE: TimerStore = {
  entries: {},
  activeItemId: null,
};

const EMPTY_STOPWATCH_STORE: StopwatchStore = {
  entries: {},
  activeItemId: null,
};

const ItemTimerContext =
  createContext<ItemTimerContextValue | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validDuration(value: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= MIN_DURATION_MINUTES &&
    value <= MAX_DURATION_MINUTES
  );
}

function createEntry(minutes: number): TimerEntry {
  const safeMinutes = validDuration(minutes) ? minutes : 25;

  return {
    durationMinutes: safeMinutes,
    remainingMs: safeMinutes * 60_000,
    endsAtMs: null,
    completedAtMs: null,
  };
}

function parseStore(raw: string | null): TimerStore | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== 1 ||
      !isRecord(parsed.entries)
    ) {
      return null;
    }

    const entries: Record<string, TimerEntry> = {};

    for (const [itemId, value] of Object.entries(parsed.entries)) {
      if (!itemId || !isRecord(value)) continue;

      const durationMinutes = value.durationMinutes;
      const remainingMs = value.remainingMs;
      const endsAtMs = value.endsAtMs;
      const completedAtMs = value.completedAtMs ?? null;

      if (
        typeof durationMinutes !== "number" ||
        !validDuration(durationMinutes) ||
        typeof remainingMs !== "number" ||
        !Number.isFinite(remainingMs) ||
        remainingMs < 0 ||
        remainingMs > durationMinutes * 60_000 ||
        !(
          endsAtMs === null ||
          (
            typeof endsAtMs === "number" &&
            Number.isFinite(endsAtMs) &&
            endsAtMs > 0
          )
        ) ||
        !(
          completedAtMs === null ||
          (
            typeof completedAtMs === "number" &&
            Number.isFinite(completedAtMs) &&
            completedAtMs > 0
          )
        )
      ) {
        continue;
      }

      entries[itemId] = {
        durationMinutes,
        remainingMs,
        endsAtMs,
        completedAtMs,
      };
    }

    const candidateId =
      typeof parsed.activeItemId === "string"
        ? parsed.activeItemId
        : null;

    const activeItemId =
      candidateId &&
      entries[candidateId]?.endsAtMs !== null &&
      entries[candidateId] !== undefined
        ? candidateId
        : null;

    for (const [itemId, entry] of Object.entries(entries)) {
      if (itemId !== activeItemId) {
        entry.endsAtMs = null;
      }
    }

    return {
      entries,
      activeItemId,
    };
  } catch {
    return null;
  }
}

function parseStopwatchStore(raw: string | null): StopwatchStore | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== 1 ||
      !isRecord(parsed.entries)
    ) {
      return null;
    }

    const entries: Record<string, StopwatchEntry> = {};
    for (const [itemId, value] of Object.entries(parsed.entries)) {
      if (!itemId || !isRecord(value)) continue;

      const elapsedMs = value.elapsedMs;
      const startedAtMs = value.startedAtMs;
      if (
        typeof elapsedMs !== "number" ||
        !Number.isFinite(elapsedMs) ||
        elapsedMs < 0 ||
        !(
          startedAtMs === null ||
          (typeof startedAtMs === "number" &&
            Number.isFinite(startedAtMs) &&
            startedAtMs > 0)
        )
      ) {
        continue;
      }

      entries[itemId] = { elapsedMs, startedAtMs };
    }

    const candidateId =
      typeof parsed.activeItemId === "string"
        ? parsed.activeItemId
        : null;
    const activeItemId =
      candidateId &&
      entries[candidateId] !== undefined &&
      entries[candidateId].startedAtMs !== null
        ? candidateId
        : null;

    for (const [itemId, entry] of Object.entries(entries)) {
      if (itemId !== activeItemId) entry.startedAtMs = null;
    }

    return { entries, activeItemId };
  } catch {
    return null;
  }
}

function pauseStopwatchStore(
  current: StopwatchStore,
  currentTime: number,
): StopwatchStore {
  const activeId = current.activeItemId;
  if (!activeId) return current;

  const entry = current.entries[activeId];
  if (!entry || entry.startedAtMs === null) {
    return { ...current, activeItemId: null };
  }

  return {
    activeItemId: null,
    entries: {
      ...current.entries,
      [activeId]: {
        elapsedMs: entry.elapsedMs + Math.max(0, currentTime - entry.startedAtMs),
        startedAtMs: null,
      },
    },
  };
}

function pauseTimerStore(
  current: TimerStore,
  currentTime: number,
): TimerStore {
  const activeId = current.activeItemId;
  if (!activeId) return current;

  const entry = current.entries[activeId];
  if (!entry || entry.endsAtMs === null) {
    return { ...current, activeItemId: null };
  }

  const remainingMs = Math.max(0, entry.endsAtMs - currentTime);
  return {
    activeItemId: null,
    entries: {
      ...current.entries,
      [activeId]: {
        ...entry,
        remainingMs,
        endsAtMs: null,
        completedAtMs: remainingMs === 0 ? currentTime : entry.completedAtMs,
      },
    },
  };
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.ceil(
    Math.max(0, milliseconds) / 1000,
  );

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}

function formatStopwatchTime(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}

export function ItemWorkTimerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [store, setStore] = useState<TimerStore>(EMPTY_STORE);
  const [stopwatchStore, setStopwatchStore] = useState<StopwatchStore>(EMPTY_STOPWATCH_STORE);
  const [now, setNow] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = parseStore(
        window.localStorage.getItem(STORAGE_KEY),
      );

      if (saved) {
        setStore(saved);
      }

      const savedStopwatch = parseStopwatchStore(
        window.localStorage.getItem(STOPWATCH_STORAGE_KEY),
      );
      if (savedStopwatch) {
        setStopwatchStore(savedStopwatch);
      }
    } catch {
      // Keep the timer usable in memory if storage is unavailable.
    }

    setNow(Date.now());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          ...store,
        }),
      );
    } catch {
      // Timer controls remain usable for this page session.
    }
  }, [hydrated, store]);

  useEffect(() => {
    if (!hydrated) return;

    try {
      window.localStorage.setItem(
        STOPWATCH_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          ...stopwatchStore,
        }),
      );
    } catch {
      // Stopwatch controls remain usable in memory if storage is unavailable.
    }
  }, [hydrated, stopwatchStore]);

  useEffect(() => {
    if (!hydrated) return;

    const interval = window.setInterval(() => {
      const currentTime = Date.now();

      setNow(currentTime);

      setStore((current) => {
        const activeId = current.activeItemId;

        if (!activeId) return current;

        const activeEntry = current.entries[activeId];

        if (
          !activeEntry ||
          activeEntry.endsAtMs === null ||
          activeEntry.endsAtMs > currentTime
        ) {
          return current;
        }

        return {
          activeItemId: null,
          entries: {
            ...current.entries,
            [activeId]: {
              ...activeEntry,
              remainingMs: 0,
              endsAtMs: null,
              completedAtMs: currentTime,
            },
          },
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [hydrated]);

  const start = useCallback((
    itemId: string,
    defaultMinutes: number,
  ) => {
    const currentTime = Date.now();

    setStore((current) => {
      const entries = { ...current.entries };

      if (current.activeItemId) {
        const previous = entries[current.activeItemId];

        if (previous?.endsAtMs !== null && previous) {
          const previousRemaining = Math.max(
            0,
            previous.endsAtMs - currentTime,
          );

          entries[current.activeItemId] = {
            ...previous,
            remainingMs: previousRemaining,
            endsAtMs: null,
            completedAtMs:
              previousRemaining === 0
                ? currentTime
                : previous.completedAtMs,
          };
        }
      }

      const existing =
        entries[itemId] ?? createEntry(defaultMinutes);

      const remainingMs =
        existing.remainingMs > 0
          ? existing.remainingMs
          : existing.durationMinutes * 60_000;

      entries[itemId] = {
        ...existing,
        remainingMs,
        endsAtMs: currentTime + remainingMs,
        completedAtMs: null,
      };

      return {
        entries,
        activeItemId: itemId,
      };
    });

    setStopwatchStore((current) =>
      pauseStopwatchStore(current, currentTime),
    );
    setNow(currentTime);
  }, []);

  const pause = useCallback((itemId: string) => {
    const currentTime = Date.now();

    setStore((current) => {
      if (current.activeItemId !== itemId) {
        return current;
      }

      const entry = current.entries[itemId];

      if (!entry || entry.endsAtMs === null) {
        return {
          ...current,
          activeItemId: null,
        };
      }

      const remainingMs = Math.max(
        0,
        entry.endsAtMs - currentTime,
      );

      return {
        activeItemId: null,
        entries: {
          ...current.entries,
          [itemId]: {
            ...entry,
            remainingMs,
            endsAtMs: null,
            completedAtMs:
              remainingMs === 0
                ? currentTime
                : entry.completedAtMs,
          },
        },
      };
    });

    setNow(currentTime);
  }, []);

  const reset = useCallback((
    itemId: string,
    defaultMinutes: number,
  ) => {
    setStore((current) => {
      const existing = current.entries[itemId];
      const entry = existing ?? createEntry(defaultMinutes);

      return {
        activeItemId:
          current.activeItemId === itemId
            ? null
            : current.activeItemId,
        entries: {
          ...current.entries,
          [itemId]: {
            ...entry,
            remainingMs: entry.durationMinutes * 60_000,
            endsAtMs: null,
            completedAtMs: null,
          },
        },
      };
    });

    setNow(Date.now());
  }, []);

  const setDuration = useCallback((
    itemId: string,
    minutes: number,
  ) => {
    if (!validDuration(minutes)) return;

    setStore((current) => {
      if (current.activeItemId === itemId) {
        return current;
      }

      const existing =
        current.entries[itemId] ?? createEntry(minutes);

      return {
        ...current,
        entries: {
          ...current.entries,
          [itemId]: {
            ...existing,
            durationMinutes: minutes,
            remainingMs: minutes * 60_000,
            endsAtMs: null,
            completedAtMs: null,
          },
        },
      };
    });
  }, []);

  const startStopwatch = useCallback((itemId: string) => {
    const currentTime = Date.now();

    setStore((current) => pauseTimerStore(current, currentTime));
    setStopwatchStore((current) => {
      const paused = pauseStopwatchStore(current, currentTime);
      const existing = paused.entries[itemId] ?? {
        elapsedMs: 0,
        startedAtMs: null,
      };

      return {
        activeItemId: itemId,
        entries: {
          ...paused.entries,
          [itemId]: { ...existing, startedAtMs: currentTime },
        },
      };
    });

    setNow(currentTime);
  }, []);

  const pauseStopwatch = useCallback((itemId: string) => {
    const currentTime = Date.now();
    setStopwatchStore((current) =>
      current.activeItemId === itemId
        ? pauseStopwatchStore(current, currentTime)
        : current,
    );
    setNow(currentTime);
  }, []);

  const resetStopwatch = useCallback((itemId: string) => {
    setStopwatchStore((current) => ({
      activeItemId:
        current.activeItemId === itemId ? null : current.activeItemId,
      entries: {
        ...current.entries,
        [itemId]: { elapsedMs: 0, startedAtMs: null },
      },
    }));
    setNow(Date.now());
  }, []);

  const value = useMemo<ItemTimerContextValue>(
    () => ({
      store,
      stopwatchStore,
      now,
      hydrated,
      start,
      pause,
      reset,
      setDuration,
      startStopwatch,
      pauseStopwatch,
      resetStopwatch,
    }),
    [
      store,
      stopwatchStore,
      now,
      hydrated,
      start,
      pause,
      reset,
      setDuration,
      startStopwatch,
      pauseStopwatch,
      resetStopwatch,
    ],
  );

  return (
    <ItemTimerContext.Provider value={value}>
      {children}
    </ItemTimerContext.Provider>
  );
}

export function ItemWorkTimer({
  itemId,
  itemName,
  defaultMinutes = 25,
}: {
  itemId: string;
  itemName: string;
  defaultMinutes?: number;
}) {
  const context = useContext(ItemTimerContext);

  if (!context) {
    throw new Error(
      "ItemWorkTimer must be rendered inside ItemWorkTimerProvider.",
    );
  }

  const {
    store,
    stopwatchStore,
    now,
    hydrated,
    start,
    pause,
    reset,
    setDuration,
    startStopwatch,
    pauseStopwatch,
    resetStopwatch,
  } = context;

  const safeDefault = validDuration(defaultMinutes)
    ? defaultMinutes
    : 25;

  const entry =
    store.entries[itemId] ?? createEntry(safeDefault);

  const stopwatchEntry = stopwatchStore.entries[itemId] ?? {
    elapsedMs: 0,
    startedAtMs: null,
  };
  const stopwatchIsRunning =
    stopwatchStore.activeItemId === itemId &&
    stopwatchEntry.startedAtMs !== null;
  const anotherStopwatchRunning =
    stopwatchStore.activeItemId !== null &&
    stopwatchStore.activeItemId !== itemId;
  const stopwatchElapsedMs = stopwatchIsRunning
    ? stopwatchEntry.elapsedMs + Math.max(0, now - stopwatchEntry.startedAtMs!)
    : stopwatchEntry.elapsedMs;
  const stopwatchTimeLabel = formatStopwatchTime(stopwatchElapsedMs);

  const isRunning =
    store.activeItemId === itemId &&
    entry.endsAtMs !== null;

  const anotherTimerRunning =
    store.activeItemId !== null &&
    store.activeItemId !== itemId;

  const remainingMs = isRunning
    ? Math.max(0, entry.endsAtMs! - now)
    : entry.remainingMs;

  const timeLabel = formatTime(remainingMs);

  const [mode, setMode] = useState<"timer" | "stopwatch">("timer");
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationDraft, setDurationDraft] = useState(String(entry.durationMinutes));
  const [durationError, setDurationError] = useState("");

  useEffect(() => {
    if (!editingDuration) {
      setDurationDraft(String(entry.durationMinutes));
      setDurationError("");
    }
  }, [entry.durationMinutes, editingDuration]);

  function saveDurationEdit() {
    const minutes = Number(durationDraft);
    if (!validDuration(minutes)) {
      setDurationError("Enter a whole number from 1 to 1,440 minutes.");
      return;
    }
    if (isRunning) {
      setDurationError("Pause the timer before changing its duration.");
      return;
    }
    setDuration(itemId, minutes);
    setDurationError("");
    setEditingDuration(false);
  }

  function cancelDurationEdit() {
    setDurationDraft(String(entry.durationMinutes));
    setDurationError("");
    setEditingDuration(false);
  }

  function toggleTimer() {
    if (isRunning) {
      pause(itemId);
    } else {
      start(itemId, safeDefault);
    }
  }

  return (
    <div
      className="item-work-timer item-work-timer--compact mt-3"
      aria-label={`Work tracker for ${itemName}`}
    >
      <div className="item-work-timer__mode-row">
        <div
          className="item-work-timer__mode-group"
          role="group"
          aria-label="Choose timer or stopwatch"
        >
          <button
            type="button"
            aria-pressed={mode === "timer"}
            onClick={() => setMode("timer")}
            className={`item-work-timer__mode ${mode === "timer" ? "item-work-timer__mode--active" : ""}`}
          >
            Timer
          </button>
          <button
            type="button"
            aria-pressed={mode === "stopwatch"}
            onClick={() => setMode("stopwatch")}
            className={`item-work-timer__mode ${mode === "stopwatch" ? "item-work-timer__mode--active" : ""}`}
          >
            Stopwatch
          </button>
        </div>
      </div>

      <div className="item-work-timer__action-row">
        <div className="item-work-timer__clock-slot">
          {mode === "timer" ? (
            editingDuration ? (
              <form
                className="item-work-timer__duration-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveDurationEdit();
                }}
              >
                <label
                  className="sr-only"
                  htmlFor={`work-timer-duration-${itemId}`}
                >
                  Timer duration in minutes
                </label>
                <input
                  id={`work-timer-duration-${itemId}`}
                  autoFocus
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1440}
                  step={1}
                  value={durationDraft}
                  onChange={(event) => {
                    setDurationDraft(event.target.value);
                    setDurationError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      cancelDurationEdit();
                    }
                  }}
                  className="item-work-timer__duration-input"
                  aria-describedby={
                    durationError
                      ? `work-timer-duration-error-${itemId}`
                      : undefined
                  }
                />
                <span className="sr-only">minutes</span>
                <button type="submit" className="item-work-timer__inline-action">
                  Set
                </button>
                <button
                  type="button"
                  onClick={cancelDurationEdit}
                  className="item-work-timer__inline-action item-work-timer__inline-action--quiet"
                >
                  Cancel
                </button>
                {durationError && (
                  <p
                    id={`work-timer-duration-error-${itemId}`}
                    role="alert"
                    className="item-work-timer__duration-error"
                  >
                    {durationError}
                  </p>
                )}
              </form>
            ) : (
              <button
                type="button"
                disabled={!hydrated || isRunning}
                onClick={() => {
                  setDurationDraft(String(entry.durationMinutes));
                  setDurationError("");
                  setEditingDuration(true);
                }}
                className="item-work-timer__clock"
                aria-label={`Edit ${itemName} timer duration. ${timeLabel} remaining.`}
                title={isRunning ? "Pause the timer to edit its duration" : "Edit timer duration"}
              >
                {hydrated ? timeLabel : "--:--"}
                <span className="item-work-timer__edit-mark" aria-hidden="true">
                  ✎
                </span>
              </button>
            )
          ) : (
            <p
              className="item-work-timer__clock item-work-timer__clock--static"
              aria-label={`${stopwatchTimeLabel} elapsed`}
            >
              {hydrated ? stopwatchTimeLabel : "--:--:--"}
            </p>
          )}
        </div>

        <div className="item-work-timer__action-group">
          <button
            type="button"
            disabled={!hydrated}
            onClick={() => {
              if (mode === "timer") {
                toggleTimer();
              } else if (stopwatchIsRunning) {
                pauseStopwatch(itemId);
              } else {
                startStopwatch(itemId);
              }
            }}
            className="item-work-timer__primary-action"
            title={
              mode === "timer"
                ? anotherTimerRunning
                  ? "Starting this timer will pause the other activity"
                  : isRunning ? "Pause timer" : "Start timer"
                : anotherStopwatchRunning
                  ? "Starting this stopwatch will pause the other stopwatch"
                  : stopwatchIsRunning ? "Pause stopwatch" : "Start stopwatch"
            }
          >
            {mode === "timer"
              ? isRunning ? "Pause" : "Start"
              : stopwatchIsRunning ? "Pause" : "Start"}
          </button>

          <button
            type="button"
            disabled={!hydrated}
            onClick={() => {
              if (mode === "timer") {
                reset(itemId, safeDefault);
              } else {
                resetStopwatch(itemId);
              }
            }}
            className="item-work-timer__reset-action"
            aria-label={`Reset ${itemName} ${mode}`}
            title="Reset"
          >
            <span aria-hidden="true">↺</span>
          </button>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {mode === "timer"
          ? isRunning
            ? "Timer running"
            : remainingMs === 0 && entry.completedAtMs !== null
              ? "Timer complete"
              : anotherTimerRunning
                ? "Another activity is running"
                : "Timer ready"
          : stopwatchIsRunning
            ? "Stopwatch running"
            : anotherStopwatchRunning
              ? "Another stopwatch is running"
              : "Stopwatch ready"}
      </p>
    </div>
  );
}
