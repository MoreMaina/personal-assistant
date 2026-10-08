"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  getFreeWindows,
  getTodayRecommendation,
  scoreTask,
  type FixedEvent,
  type TodayTask,
} from "@/lib/today-engine";

import { getTodayData } from "@/lib/today-data";

function formatTime(date: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (remainder === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainder} min`;
}

function getTypeLabel(type: TodayTask["type"]) {
  if (type === "study") {
    return "Study";
  }

  if (type === "reading") {
    return "Reading";
  }

  return "Project";
}

function getTaskHref(task: TodayTask) {
  const taskId = task.id.toString();

  if (task.type === "study") {
    const lectureId = taskId.replace(
      "study-",
      "",
    );

    return `/study?lectureId=${lectureId}`;
  }

  if (task.type === "reading") {
    if (taskId.startsWith("book-")) {
      const bookId = taskId.replace(
        "book-",
        "",
      );

      return `/reading?bookId=${bookId}`;
    }

    if (taskId.startsWith("essay-")) {
      const essayId = taskId.replace(
        "essay-",
        "",
      );

      return `/reading?essayId=${essayId}`;
    }

    return "/reading";
  }

  if (task.type === "project") {
    const projectId = taskId.replace(
      "project-",
      "",
    );

    return `/projects?projectId=${projectId}`;
  }

  return "/";
}

export default function TodayPage() {
  const [now, setNow] =
    useState<Date | null>(null);

  const [fixedEvents, setFixedEvents] =
    useState<FixedEvent[]>([]);

  const [tasks, setTasks] =
    useState<TodayTask[]>([]);

  useEffect(() => {
    const current = new Date();

    setNow(current);

    const data =
      getTodayData(current);

    setFixedEvents(
      data.fixedEvents,
    );

    setTasks(data.tasks);
  }, []);

  const freeWindows = useMemo(() => {
    if (!now) {
      return [];
    }

    return getFreeWindows(
      fixedEvents,
      now,
    );
  }, [fixedEvents, now]);

  const recommendation =
    useMemo(() => {
      if (!now) {
        return null;
      }

      return getTodayRecommendation(
        fixedEvents,
        tasks,
        now,
      );
    }, [
      fixedEvents,
      tasks,
      now,
    ]);

  const upNext = useMemo(() => {
    if (!now) {
      return [];
    }

    const candidates: Array<{
      task: TodayTask;
      score: number;
    }> = [];

    for (const task of tasks) {
      if (
        recommendation &&
        task.id ===
          recommendation.task.id
      ) {
        continue;
      }

      let bestScore =
        Number.NEGATIVE_INFINITY;

      for (const window of freeWindows) {
        if (
          task.durationMinutes >
          window.durationMinutes
        ) {
          continue;
        }

        const score = scoreTask(
          task,
          window,
          now,
        );

        bestScore = Math.max(
          bestScore,
          score,
        );
      }

      if (
        Number.isFinite(bestScore)
      ) {
        candidates.push({
          task,
          score: bestScore,
        });
      }
    }

    return candidates
      .sort(
        (a, b) =>
          b.score - a.score,
      )
      .slice(0, 3);
  }, [
    tasks,
    freeWindows,
    recommendation,
    now,
  ]);

  const totalFreeMinutes =
    freeWindows.reduce(
      (total, window) =>
        total +
        window.durationMinutes,
      0,
    );

  if (!now) {
    return (
      <main>
        <div className="rounded-[24px] border-2 border-[var(--primary-dark)] bg-[var(--surface)] p-8 text-center shadow-[0_4px_0_var(--primary-dark)]">
          <h1 className="text-2xl">
            Getting today ready...
          </h1>

          <p className="mt-2 text-[var(--ink-soft)]">
            Loading your schedule and
            priorities.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="mb-8">
        <p className="text-sm font-extrabold uppercase tracking-[0.08em] text-[var(--muted)]">
          Today
        </p>

        <h1 className="mt-2 text-4xl sm:text-5xl">
          {new Intl.DateTimeFormat(
            "en-US",
            {
              weekday: "long",
              month: "long",
              day: "numeric",
            },
          ).format(now)}
        </h1>

        <p className="mt-3 text-[var(--ink-soft)]">
          Your day, reduced to the next
          useful thing.
        </p>
      </div>

      <section className="card bg-[var(--surface)] p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="stat-label">
              Right now
            </p>

            <h2 className="mt-2 text-2xl sm:text-3xl">
              {recommendation
                ? recommendation.task.title
                : "Nothing urgent"}
            </h2>
          </div>

          {recommendation && (
            <span className="rounded-full border-2 border-[var(--primary-dark)] bg-[var(--yellow-soft)] px-3 py-1 text-sm font-extrabold text-[var(--primary-dark)]">
              {getTypeLabel(
                recommendation.task.type,
              )}
            </span>
          )}
        </div>

        {recommendation ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[16px] bg-[var(--primary-soft)] p-4">
                <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--primary)]">
                  Time
                </div>

                <div className="mt-1 font-[var(--font-heading)] text-xl font-bold text-[var(--primary)]">
                  {formatDuration(
                    recommendation
                      .task
                      .durationMinutes,
                  )}
                </div>
              </div>

              <div className="rounded-[16px] bg-[var(--accent-soft)] p-4">
                <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--accent-dark)]">
                  Window
                </div>

                <div className="mt-1 font-[var(--font-heading)] text-xl font-bold text-[var(--accent-dark)]">
                  {formatDuration(
                    recommendation
                      .window
                      .durationMinutes,
                  )}
                </div>
              </div>

              <div className="rounded-[16px] bg-[var(--yellow-soft)] p-4">
                <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--primary-dark)]">
                  Start
                </div>

                <div className="mt-1 font-[var(--font-heading)] text-xl font-bold text-[var(--primary-dark)]">
                  {formatTime(
                    recommendation
                      .window
                      .startAt,
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-[16px] border-2 border-[var(--border)] bg-white/60 p-4">
              <p className="text-sm font-extrabold uppercase tracking-[0.06em] text-[var(--muted)]">
                Why this?
              </p>

              <p className="mt-1 text-[var(--ink-soft)]">
                {
                  recommendation.explanation
                }
              </p>
            </div>

            <Link
              href={getTaskHref(
                recommendation.task,
              )}
              className="mt-6 inline-flex min-h-[52px] items-center justify-center rounded-[16px] border-2 border-[var(--accent-dark)] bg-[var(--accent)] px-6 text-base font-black uppercase tracking-[0.03em] text-white shadow-[0_4px_0_var(--accent-dark)] transition hover:-translate-y-0.5 active:translate-y-[4px] active:shadow-none"
            >
              Start
            </Link>
          </>
        ) : (
          <div className="mt-6 rounded-[16px] bg-[var(--primary-soft)] p-5">
            <p className="font-semibold text-[var(--ink-soft)]">
              Nothing fits your current
              schedule. You are caught up
              for now.
            </p>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-4">
          <p className="stat-label">
            Up next
          </p>

          <h2 className="mt-1 text-2xl">
            Other good options
          </h2>
        </div>

        {upNext.length > 0 ? (
          <div className="grid gap-4">
            {upNext.map(
              ({ task }) => (
                <Link
                  key={task.id}
                  href={getTaskHref(task)}
                  className="card flex items-center justify-between gap-4 bg-[var(--surface)] p-5 transition hover:-translate-y-1"
                >
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--muted)]">
                      {getTypeLabel(
                        task.type,
                      )}{" "}
                      ·{" "}
                      {formatDuration(
                        task.durationMinutes,
                      )}
                    </div>

                    <h3 className="mt-1 text-xl">
                      {task.title}
                    </h3>
                  </div>

                  <span className="shrink-0 text-2xl text-[var(--primary)]">
                    →
                  </span>
                </Link>
              ),
            )}
          </div>
        ) : (
          <div className="rounded-[16px] bg-[var(--surface-soft)] p-5 text-[var(--ink-soft)]">
            Nothing else fits into
            today's available
            windows.
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="stat-label">
              Your day
            </p>

            <h2 className="mt-1 text-2xl">
              What the day looks like
            </h2>
          </div>

          <div className="text-right">
            <div className="font-[var(--font-heading)] text-2xl font-bold text-[var(--primary)]">
              {formatDuration(
                totalFreeMinutes,
              )}
            </div>

            <div className="text-xs font-bold text-[var(--muted)]">
              available today
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          {fixedEvents.map(
            (event) => (
              <div
                key={event.id}
                className="rounded-[16px] border-2 border-[var(--primary-dark)] bg-[var(--primary)] p-4 text-[var(--surface)] shadow-[0_3px_0_var(--primary-dark)]"
              >
                <div className="text-xs font-extrabold uppercase tracking-[0.06em] opacity-75">
                  Class
                </div>

                <div className="mt-1 font-[var(--font-heading)] text-xl font-bold">
                  {event.title}
                </div>

                <div className="mt-1 text-sm font-bold opacity-80">
                  {formatTime(
                    event.startAt,
                  )}{" "}
                  —{" "}
                  {formatTime(
                    event.endAt,
                  )}
                </div>
              </div>
            ),
          )}

          {freeWindows
            .slice(0, 4)
            .map(
              (window, index) => (
                <div
                  key={`${window.startAt.toISOString()}-${index}`}
                  className="rounded-[16px] border-2 border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--muted)]">
                    Free
                  </div>

                  <div className="mt-1 font-[var(--font-heading)] text-xl font-bold text-[var(--primary)]">
                    {formatTime(
                      window.startAt,
                    )}{" "}
                    —{" "}
                    {formatTime(
                      window.endAt,
                    )}
                  </div>

                  <div className="mt-1 text-sm font-bold text-[var(--ink-soft)]">
                    {formatDuration(
                      window.durationMinutes,
                    )}
                  </div>
                </div>
              ),
            )}
        </div>
      </section>
    </main>
  );
}