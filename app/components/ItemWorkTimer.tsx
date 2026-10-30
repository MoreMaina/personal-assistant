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

type ItemTimerContextValue = {
  store: TimerStore;
  now: number;
  hydrated: boolean;
  start: (itemId: string, defaultMinutes: number) => void;
  pause: (itemId: string) => void;
  reset: (itemId: string, defaultMinutes: number) => void;
  setDuration: (itemId: string, minutes: number) => void;
};

const STORAGE_KEY = "personal-assistant-item-timers-v1";
const MAX_DURATION_MINUTES = 1440;
const MIN_DURATION_MINUTES = 1;

const EMPTY_STORE: TimerStore = {
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

export function ItemWorkTimerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [store, setStore] = useState<TimerStore>(EMPTY_STORE);
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

  const value = useMemo<ItemTimerContextValue>(
    () => ({
      store,
      now,
      hydrated,
      start,
      pause,
      reset,
      setDuration,
    }),
    [store, now, hydrated, start, pause, reset, setDuration],
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
    now,
    hydrated,
    start,
    pause,
    reset,
    setDuration,
  } = context;

  const safeDefault = validDuration(defaultMinutes)
    ? defaultMinutes
    : 25;

  const entry =
    store.entries[itemId] ?? createEntry(safeDefault);

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

  const [durationDraft, setDurationDraft] = useState(
    String(entry.durationMinutes),
  );

  useEffect(() => {
    setDurationDraft(String(entry.durationMinutes));
  }, [entry.durationMinutes]);

  function saveDuration() {
    const minutes = Number(durationDraft);

    if (validDuration(minutes)) {
      setDuration(itemId, minutes);
    } else {
      setDurationDraft(String(entry.durationMinutes));
    }
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
      className="mt-3 rounded-xl border border-[#e4dac9] bg-[#fffaf1] p-3"
      aria-label={`Timer for ${itemName}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
            Item timer
          </p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-[#23412f]">
            {hydrated ? timeLabel : "--:--"}
          </p>
          <p className="mt-1 text-xs font-bold text-stone-500">
            {isRunning
              ? "Running"
              : remainingMs === 0 && entry.completedAtMs !== null
                ? "Time complete"
                : anotherTimerRunning
                  ? "Paused · another item is running"
                  : "Ready"}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-stone-500">
              Minutes
            </span>
            <input
              type="number"
              min={MIN_DURATION_MINUTES}
              max={MAX_DURATION_MINUTES}
              step={1}
              value={durationDraft}
              disabled={!hydrated || isRunning}
              onChange={(event) =>
                setDurationDraft(event.target.value)
              }
              onBlur={saveDuration}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              className="w-20 rounded-lg border border-[#d8ccb8] bg-white px-2 py-2 text-center text-sm font-extrabold disabled:opacity-50"
            />
          </label>

          <button
            type="button"
            disabled={!hydrated}
            onClick={toggleTimer}
            className="rounded-lg bg-[#23412f] px-3 py-2 text-sm font-extrabold text-white hover:bg-[#183021] disabled:opacity-50"
          >
            {isRunning ? "Pause" : "Start"}
          </button>

          <button
            type="button"
            disabled={!hydrated}
            onClick={() => reset(itemId, safeDefault)}
            className="rounded-lg border border-[#d8ccb8] bg-white px-3 py-2 text-sm font-extrabold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs font-semibold leading-5 text-stone-500">
        Each item keeps its own duration and remaining time. Starting
        another item pauses the previous timer.
      </p>

      {remainingMs === 0 && entry.completedAtMs !== null && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs font-extrabold text-emerald-900"
        >
          Timer complete. Record your actual work separately.
        </p>
      )}
    </div>
  );
}
