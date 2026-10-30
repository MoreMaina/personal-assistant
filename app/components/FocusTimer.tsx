"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type TimerPhase = "focus" | "short_break" | "long_break";

type TimerState = {
  schemaVersion: 1;
  phase: TimerPhase;
  completedFocusSessions: number;
  remainingMs: number;
  endsAtMs: number | null;
};

const STORAGE_KEY = "personal-assistant-pomodoro-v1";

const PHASE_DURATIONS: Record<TimerPhase, number> = {
  focus: 25 * 60 * 1000,
  short_break: 5 * 60 * 1000,
  long_break: 15 * 60 * 1000,
};

const PHASE_LABELS: Record<TimerPhase, string> = {
  focus: "Focus",
  short_break: "Short break",
  long_break: "Long break",
};

function createInitialState(): TimerState {
  return {
    schemaVersion: 1,
    phase: "focus",
    completedFocusSessions: 0,
    remainingMs: PHASE_DURATIONS.focus,
    endsAtMs: null,
  };
}

function isTimerPhase(value: unknown): value is TimerPhase {
  return (
    value === "focus" ||
    value === "short_break" ||
    value === "long_break"
  );
}

function parseTimerState(raw: string | null): TimerState | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Record<string, unknown>;

    if (
      value.schemaVersion !== 1 ||
      !isTimerPhase(value.phase) ||
      !Number.isSafeInteger(value.completedFocusSessions) ||
      (value.completedFocusSessions as number) < 0 ||
      !Number.isSafeInteger(value.remainingMs) ||
      (value.remainingMs as number) < 0 ||
      (value.remainingMs as number) > PHASE_DURATIONS[value.phase] ||
      !(
        value.endsAtMs === null ||
        (
          typeof value.endsAtMs === "number" &&
          Number.isFinite(value.endsAtMs) &&
          value.endsAtMs > 0
        )
      )
    ) {
      return null;
    }

    return {
      schemaVersion: 1,
      phase: value.phase,
      completedFocusSessions: value.completedFocusSessions as number,
      remainingMs: value.remainingMs as number,
      endsAtMs: value.endsAtMs as number | null,
    };
  } catch {
    return null;
  }
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );
}

function completePhase(current: TimerState): {
  state: TimerState;
  message: string;
} {
  if (current.phase === "focus") {
    const completedFocusSessions =
      current.completedFocusSessions + 1;
    const nextPhase: TimerPhase =
      completedFocusSessions % 4 === 0
        ? "long_break"
        : "short_break";

    return {
      state: {
        schemaVersion: 1,
        phase: nextPhase,
        completedFocusSessions,
        remainingMs: PHASE_DURATIONS[nextPhase],
        endsAtMs: null,
      },
      message:
        "Focus session complete. " +
        (nextPhase === "long_break"
          ? "Take a long break."
          : "Take a short break."),
    };
  }

  return {
    state: {
      schemaVersion: 1,
      phase: "focus",
      completedFocusSessions: current.completedFocusSessions,
      remainingMs: PHASE_DURATIONS.focus,
      endsAtMs: null,
    },
    message: "Break complete. You are ready for another focus session.",
  };
}

export default function FocusTimer() {
  const pathname = usePathname();
  const [timer, setTimer] = useState<TimerState>(createInitialState);
  const [clock, setClock] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");

  useEffect(() => {
    try {
      const saved = parseTimerState(
        window.localStorage.getItem(STORAGE_KEY),
      );

      if (saved) {
        setTimer(saved);
      }
    } catch {
      // The timer remains usable in memory when browser storage is unavailable.
    }

    setClock(Date.now());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(timer),
      );
    } catch {
      // Timer controls continue to work for this page session.
    }
  }, [hydrated, timer]);

  useEffect(() => {
    if (!hydrated) return;

    const interval = window.setInterval(() => {
      setClock(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [hydrated]);

  useEffect(() => {
    if (
      !hydrated ||
      timer.endsAtMs === null ||
      timer.endsAtMs > clock
    ) {
      return;
    }

    const completed = completePhase(timer);
    setTimer(completed.state);
    setCompletionMessage(completed.message);
  }, [
    clock,
    hydrated,
    timer.endsAtMs,
    timer.phase,
    timer.completedFocusSessions,
  ]);

  if (!hydrated || pathname === "/login") {
    return null;
  }

  const remainingMs =
    timer.endsAtMs === null
      ? timer.remainingMs
      : Math.max(0, timer.endsAtMs - clock);

  const isRunning = timer.endsAtMs !== null;
  const timeLabel = formatTime(remainingMs);
  const phaseLabel = PHASE_LABELS[timer.phase];

  function toggleTimer() {
    const now = Date.now();

    if (timer.endsAtMs !== null) {
      if (timer.endsAtMs <= now) {
        const completed = completePhase(timer);
        setTimer(completed.state);
        setCompletionMessage(completed.message);
      } else {
        setTimer({
          ...timer,
          remainingMs: timer.endsAtMs - now,
          endsAtMs: null,
        });
      }

      setClock(now);
      return;
    }

    setCompletionMessage("");
    setTimer({
      ...timer,
      endsAtMs: now + timer.remainingMs,
    });
    setClock(now);
  }

  function resetTimer() {
    setTimer({
      ...timer,
      remainingMs: PHASE_DURATIONS[timer.phase],
      endsAtMs: null,
    });
    setCompletionMessage("");
    setClock(Date.now());
  }

  return (
    <div className="fixed bottom-24 right-3 z-[80] sm:bottom-6 sm:right-6">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open shared Pomodoro timer"
          aria-expanded="false"
          className="flex min-h-12 items-center gap-3 rounded-full border border-[#d8ccb8] bg-[#23412f] px-4 py-3 text-sm font-extrabold text-white shadow-xl transition hover:bg-[#183021] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#557c61]"
        >
          <span aria-hidden="true">◷</span>
          <span>{isRunning ? timeLabel : "Focus timer"}</span>
          {isRunning && (
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
          )}
        </button>
      ) : (
        <section
          aria-label="Shared Pomodoro timer"
          className="w-[min(21rem,calc(100vw-1.5rem))] rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 text-[#26352a] shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-stone-500">
                Shared Pomodoro
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-[#23412f]">
                {phaseLabel}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close focus timer"
              className="rounded-full px-3 py-1 text-xl font-bold text-stone-500 hover:bg-stone-100"
            >
              ×
            </button>
          </div>

          <p
            className="my-5 text-center text-5xl font-extrabold tabular-nums tracking-tight text-[#23412f]"
            aria-label={timeLabel + " remaining"}
          >
            {timeLabel}
          </p>

          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={toggleTimer}
              className="min-w-28 rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#183021]"
            >
              {isRunning ? "Pause" : "Start"}
            </button>

            <button
              type="button"
              onClick={resetTimer}
              className="rounded-xl border border-[#d8ccb8] bg-white px-4 py-3 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
            >
              Reset
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-[#efe8db] px-3 py-2 text-xs font-bold text-stone-600">
            <span>Completed focus sessions</span>
            <span className="tabular-nums">
              {timer.completedFocusSessions}
            </span>
          </div>

          <p className="mt-3 text-xs font-semibold leading-5 text-stone-500">
            25-minute focus sessions, 5-minute short breaks, and a
            15-minute long break after every four completed focus sessions.
            The timer continues across app pages and browser reloads on this
            device. It does not mark Study, Reading, or Project work complete.
          </p>

          {completionMessage && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900"
            >
              {completionMessage}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
