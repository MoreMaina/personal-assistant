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
import { loadAIPreferences } from "@/lib/assistantPreferences";
import {
  getCalendarItems,
  type CalendarEvent,
  type CalendarTask,
} from "@/lib/calendarItemStorage";
import { expandCalendarEvents } from "@/lib/calendarRecurrence";
import { validateDailyPlanAnswer } from "@/lib/dailyPlan";

function formatTime(
  date: Date | string,
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(new Date(date));
}

function formatDuration(
  minutes: number,
) {
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(
    minutes / 60,
  );

  const remainder =
    minutes % 60;

  if (remainder === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainder} min`;
}

function getTypeLabel(
  type: TodayTask["type"],
) {
  if (type === "study") {
    return "Study";
  }

  if (type === "reading") {
    return "Reading";
  }

  return "Project";
}

function getTaskHref(
  task: TodayTask,
) {
  const taskId =
    task.id.toString();

  if (task.type === "study") {
    const lectureId =
      taskId.replace(
        "study-",
        "",
      );

    return `/study?lectureId=${lectureId}`;
  }

  if (task.type === "reading") {
    if (
      taskId.startsWith(
        "book-",
      )
    ) {
      const bookId =
        taskId.replace(
          "book-",
          "",
        );

      return `/reading?bookId=${bookId}`;
    }

    if (
      taskId.startsWith(
        "essay-",
      )
    ) {
      const essayId =
        taskId.replace(
          "essay-",
          "",
        );

      return `/reading?essayId=${essayId}`;
    }

    return "/reading";
  }

  if (task.type === "project") {
    const projectId =
      taskId.replace(
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

  const [dailyPlan, setDailyPlan] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState("");

  useEffect(() => {
    function refreshToday() {
      const current =
        new Date();

      setNow(current);

      const data =
        getTodayData(current);

      setFixedEvents(
        data.fixedEvents,
      );

      setTasks(data.tasks);
    }

    refreshToday();

    const interval =
      window.setInterval(
        refreshToday,
        30_000,
      );

    function handleVisibilityChange() {
      if (
        document.visibilityState ===
        "visible"
      ) {
        refreshToday();
      }
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      window.clearInterval(
        interval,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, []);

  const freeWindows =
    useMemo(() => {
      if (!now) {
        return [];
      }

      return getFreeWindows(
        fixedEvents,
        now,
      );
    }, [
      fixedEvents,
      now,
    ]);

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

        const score =
          scoreTask(
            task,
            window,
            now,
          );

        bestScore =
          Math.max(
            bestScore,
            score,
          );
      }

      if (
        Number.isFinite(
          bestScore,
        )
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

  const dayTimeline = useMemo(() => {
    const items = [
      ...fixedEvents.map((event) => ({
        id: `class-${event.id}`,
        kind: "class" as const,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
      })),
      ...freeWindows.slice(0, 4).map((window, index) => ({
        id: `free-${window.startAt.toISOString()}-${index}`,
        kind: "free" as const,
        startAt: window.startAt,
        endAt: window.endAt,
        durationMinutes: window.durationMinutes,
      })),
    ];

    const time = (value: Date | string) =>
      value instanceof Date ? value.getTime() : Date.parse(value);

    return items.sort((a, b) => time(a.startAt) - time(b.startAt));
  }, [fixedEvents, freeWindows]);

  async function handleGenerateDailyPlan() {
    if (isPlanning) {
      return;
    }

    // Use a fresh timestamp; React state may be stale when clicked.
    const now = new Date();

    setIsPlanning(true);
    setPlanError("");
    setDailyPlan("");

    try {
      const localDate = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");

      // Tomorrow uses the real recurring class schedule. The 7 AM–10 PM
      // window is a planning default, not a claim about personal routines.
      const tomorrowStart = new Date(now);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      tomorrowStart.setHours(7, 0, 0, 0);

      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setHours(22, 0, 0, 0);


      const tomorrowDate = [
        tomorrowStart.getFullYear(),
        String(tomorrowStart.getMonth() + 1).padStart(2, "0"),
        String(tomorrowStart.getDate()).padStart(2, "0"),
      ].join("-");

      const tomorrowData = getTodayData(tomorrowStart);

      const calendarItems = getCalendarItems();
      const calendarEvents = calendarItems.filter(
        (item): item is CalendarEvent => item.type === "event",
      );
      const calendarTasks = calendarItems.filter(
        (item): item is CalendarTask =>
          item.type === "task" && !item.completed,
      );

      const expandedCalendarEvents = expandCalendarEvents(
        calendarEvents,
        localDate,
        tomorrowDate,
      );

      const parseEventTime = (
        dateKey: string,
        time: string | undefined,
      ): Date | null => {
        if (!time) return null;

        const parts = time.split(":").map(Number);
        if (
          parts.length !== 2 ||
          !parts.every(Number.isInteger) ||
          parts[0] < 0 || parts[0] > 23 ||
          parts[1] < 0 || parts[1] > 59
        ) {
          return null;
        }

        const parsed = new Date(
          `${dateKey}T${String(parts[0]).padStart(2, "0")}:${String(parts[1]).padStart(2, "0")}:00`,
        );

        return Number.isFinite(parsed.getTime()) &&
          parsed.getFullYear() === Number(dateKey.slice(0, 4)) &&
          parsed.getMonth() + 1 === Number(dateKey.slice(5, 7)) &&
          parsed.getDate() === Number(dateKey.slice(8, 10))
          ? parsed
          : null;
      };

      const calendarEventBlocks = expandedCalendarEvents.map((event) => {
        const dayStart = new Date(`${event.date}T07:00:00`);
        const dayEnd = new Date(`${event.date}T22:00:00`);
        const parsedStart = parseEventTime(event.date, event.startTime);
        const startAt = parsedStart ?? dayStart;
        const parsedEnd = parseEventTime(event.date, event.endTime);

        // Untimed, start-only, or malformed events block conservatively.
        const endAt =
          !parsedStart
            ? dayEnd
            : parsedEnd && parsedEnd > startAt
              ? parsedEnd
              : dayEnd;

        return {
          date: event.date,
          fixedEvent: {
            id: `calendar-${event.id}`,
            title: event.title,
            startAt,
            endAt,
          } as FixedEvent,
        };
      });

      const todayCalendarEvents = calendarEventBlocks
        .filter((item) => item.date === localDate)
        .map((item) => item.fixedEvent);

      const tomorrowCalendarEvents = calendarEventBlocks
        .filter((item) => item.date === tomorrowDate)
        .map((item) => item.fixedEvent);

      const planTodayEvents: FixedEvent[] = [
        ...fixedEvents,
        ...todayCalendarEvents,
      ];

      const planTomorrowEvents: FixedEvent[] = [
        ...tomorrowData.fixedEvents,
        ...tomorrowCalendarEvents,
      ];

      const tomorrowWindows = getFreeWindows(
        planTomorrowEvents,
        tomorrowStart,
        tomorrowEnd,
      );

      const eventStartMs = (event: FixedEvent) =>
        new Date(event.startAt).getTime();

      const eventEndMs = (event: FixedEvent) =>
        new Date(event.endAt).getTime();

      const sortedTodayEvents = [...planTodayEvents].sort(
        (a, b) => eventStartMs(a) - eventStartMs(b),
      );

      const todayEventsForPlan = [
        ...sortedTodayEvents.filter(
          (event) => eventEndMs(event) <= now.getTime(),
        ).slice(-1),
        ...sortedTodayEvents.filter(
          (event) => eventEndMs(event) > now.getTime(),
        ).slice(0, 2),
      ].sort((a, b) => eventStartMs(a) - eventStartMs(b));

      const compactDate = (value: Date | string | undefined) => {
        if (!value) {
          return null;
        }

        if (value instanceof Date) {
          if (!Number.isFinite(value.getTime())) {
            return null;
          }

          return [
            value.getFullYear(),
            String(value.getMonth() + 1).padStart(2, "0"),
            String(value.getDate()).padStart(2, "0"),
          ].join("-");
        }

        return value.trim().match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
      };

      const taskDueTime = (task: TodayTask) => {
        const value = task.deadlineAt ?? task.dueAt;

        if (!value) {
          return Number.POSITIVE_INFINITY;
        }

        const timestamp =
          value instanceof Date ? value.getTime() : Date.parse(value);

        return Number.isFinite(timestamp)
          ? timestamp
          : Number.POSITIVE_INFINITY;
      };

      const selectedTasks = [...tasks]
        .sort((a, b) => {
          const aDue = taskDueTime(a);
          const bDue = taskDueTime(b);

          if (aDue < bDue) return -1;
          if (aDue > bDue) return 1;

          return (b.priority ?? 3) - (a.priority ?? 3);
        })
        .slice(0, 3);

      const calendarTaskOptions = [...calendarTasks]
        .sort((a, b) =>
          (a.dueDate ?? a.recurrence?.startDate ?? "9999-12-31").localeCompare(
            b.dueDate ?? b.recurrence?.startDate ?? "9999-12-31",
          ) ||
          (b.priority === "high" ? 3 : b.priority === "medium" ? 2 : 1) -
          (a.priority === "high" ? 3 : a.priority === "medium" ? 2 : 1),
        )
        .slice(0, 3)
        .map((task) => ({
          id: `calendar:${task.id}`,
          title: task.title.trim().slice(0, 80),
          due: compactDate(task.dueDate ?? task.recurrence?.startDate),
          minutes:
            typeof task.estimatedMinutes === "number" &&
            Number.isFinite(task.estimatedMinutes) &&
            task.estimatedMinutes > 0
              ? Math.round(task.estimatedMinutes)
              : null,
          priority: task.priority,
          source: "calendar",
        }));

      const todayTaskOptions = selectedTasks.map((task) => {
        const priority = task.priority ?? 3;
        return {
          id: `today:${String(task.id)}`,
          title: task.title.trim().slice(0, 80),
          due: compactDate(task.deadlineAt ?? task.dueAt),
          minutes: task.durationMinutes,
          priority:
            priority >= 4 ? "high" : priority <= 2 ? "low" : "medium",
          source: task.type,
        };
      });

      // Reserve candidate slots for both Today recommendations and calendar
      // tasks so one source cannot crowd out the other.
      const plannerTaskOptions = [
        ...todayTaskOptions.slice(0, 3),
        ...calendarTaskOptions.slice(0, 3),
      ];

      // Exclude overnight gaps from AI planning. A gap without
      // a class is not automatically usable work time.
      const todayPlanningStart = new Date(now);
      // Give the request a little lead time and align starts to a minute.
      todayPlanningStart.setSeconds(0, 0);
      todayPlanningStart.setMinutes(todayPlanningStart.getMinutes() + 3);

      const firstPlanningTime = new Date(now);
      firstPlanningTime.setHours(7, 0, 0, 0);

      if (todayPlanningStart < firstPlanningTime) {
        todayPlanningStart.setTime(firstPlanningTime.getTime());
      }

      const todayPlanningEnd = new Date(now);
      todayPlanningEnd.setHours(22, 0, 0, 0);

      const todayPlanningWindows =
        todayPlanningStart.getTime() >= todayPlanningEnd.getTime()
          ? []
          : getFreeWindows(
              planTodayEvents,
              todayPlanningStart,
              todayPlanningEnd,
            );


      // Compact tuples keep the request below the API's existing
      // question-length limit while retaining scheduling essentials.
      const snapshot = {
        today: {
          date: localDate,
          currentTime: formatTime(now),
          events: todayEventsForPlan.map((event) => ({
            title: event.title.slice(0, 16),
            start: formatTime(event.startAt),
            end: formatTime(event.endAt),
            status:
              eventEndMs(event) <= now.getTime()
                ? "past"
                : eventStartMs(event) <= now.getTime()
                  ? "now"
                  : "next",
          })),
          freeWindows: todayPlanningWindows.slice(0, 3).map((window) => ({
            start: formatTime(window.startAt),
            end: formatTime(window.endAt),
            durationMinutes: window.durationMinutes,
          })),
        },
        tomorrow: {
          date: tomorrowDate,
          events: [...planTomorrowEvents]
            .sort((a, b) => eventStartMs(a) - eventStartMs(b))
            .slice(0, 2)
            .map((event) => ({
              title: event.title.slice(0, 16),
              start: formatTime(event.startAt),
              end: formatTime(event.endAt),
            })),
          freeWindows: tomorrowWindows.slice(0, 3).map((window) => ({
            start: formatTime(window.startAt),
            end: formatTime(window.endAt),
            durationMinutes: window.durationMinutes,
          })),
        },
        tasks: plannerTaskOptions.map((task) => ({
          id: task.id,
          title: task.title.slice(0, 42),
          dueDate: task.due,
          durationMinutes: task.minutes,
          priority: task.priority,
          source: task.source,
        })),
      };

      const question = [
        `Plan ${localDate} ${formatTime(now)} and ${tomorrowDate}.`,
        'Return ONLY JSON with "summary" and "blocks" fields.',
        "Use at most 3 blocks. Use only IDs from tasks and dates from today.date or tomorrow.date.",
        "For each block, use a free window from the matching date. Start and end must both fit inside that window.",
        "A block must be 1-90 minutes and must not exceed a numeric task durationMinutes. For null durationMinutes, use 15-90 minutes.",
        "Today's blocks must start after today.currentTime. Keep all blocks between 07:00 and 22:00 and leave 10 minutes between same-day blocks.",
        "Do not invent tasks, deadlines, dates, times, or availability. If nothing fits, return blocks as an empty array.",
        `Schedule data: ${JSON.stringify(snapshot)}`,
      ].join("\n");

      // Keep planning bounded, but allow a richer schedule than ordinary chat.
      if (question.length > 5000) {
        throw new Error(
          "The planning request exceeded the safe size limit. Please refresh and try again.",
        );
      }

      const aiPreferences = loadAIPreferences();
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "daily-plan",
          question,
          provider: "custom",
          providerProfileId: aiPreferences.reasoningConnectionId,
          model: aiPreferences.reasoningModel,
        }),
      });

      const result: {
        dailyPlan?: unknown;
        error?: unknown;
      } = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "The daily plan could not be generated. Please try again.",
        );
      }

      if (
        !result.dailyPlan ||
        typeof result.dailyPlan !== "object" ||
        Array.isArray(result.dailyPlan)
      ) {
        throw new Error(
          "The planner returned no structured schedule. Please refresh and try again.",
        );
      }

      const planJson = JSON.stringify(result.dailyPlan);

      if (typeof planJson !== "string") {
        throw new Error(
          "The planner returned an unreadable schedule. Please refresh and try again.",
        );
      }

      const validatedPlan = validateDailyPlanAnswer(planJson, {
        todayDate: localDate,
        tomorrowDate,
        // Recheck against the real time after the Gemini request completes.
        now: new Date(),
        tasks: plannerTaskOptions.map(({ id, title, minutes }) => ({
          id,
          title,
          minutes,
        })),
        windows: [
          ...todayPlanningWindows.slice(0, 3).map((window) => ({
            date: localDate,
            startAt: window.startAt,
            endAt: window.endAt,
          })),
          ...tomorrowWindows.slice(0, 3).map((window) => ({
            date: tomorrowDate,
            startAt: window.startAt,
            endAt: window.endAt,
          })),
        ],
        pointEvents: expandedCalendarEvents.flatMap((event) =>
          event.startTime
            ? [{
                date: event.date,
                time: event.startTime,
                ...(event.endTime ? { endTime: event.endTime } : {}),
                title: event.title,
              }]
            : [],
        ),
      });

      const renderedBlocks = validatedPlan.blocks.map((block) => {
        const dayLabel = new Intl.DateTimeFormat("en-KE", {
          weekday: "long",
          month: "short",
          day: "numeric",
          timeZone: "Africa/Nairobi",
        }).format(block.startAt);

        return `${dayLabel} · ${formatTime(block.startAt)}–${formatTime(block.endAt)} — ${block.title} (${block.durationMinutes} min)\n${block.reason}`;
      });

      setDailyPlan(
        renderedBlocks.length
          ? [
              "These work blocks passed local task and schedule validation:",
              ...renderedBlocks,
            ].join("\n\n")
          : "No verifiable work blocks fit the supplied schedule windows.",
      );
    } catch (error) {
      setPlanError(
        error instanceof Error
          ? error.message
          : "Something went wrong while planning your day.",
      );
    } finally {
      setIsPlanning(false);
    }
  }

  if (!now) {
    return (
      <main>
        <div className="rounded-[24px] border-2 border-[var(--primary-dark)] bg-[var(--surface)] p-8 text-center shadow-[0_4px_0_var(--primary-dark)]">
          <h1 className="text-2xl">
            Getting today ready...
          </h1>

          <p className="mt-2 text-[var(--ink-soft)]">
            Loading your schedule
            and priorities.
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

        <h1 className="mt-2 text-2xl sm:text-3xl lg:text-4xl">
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
          Focus on what&apos;s next.
        </p>
      </div>

      <section
        aria-labelledby="daily-plan-heading"
        className="card mb-6 bg-[var(--surface)] p-4 sm:p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="stat-label">AI planning</p>
            <h2 id="daily-plan-heading" className="mt-1 text-xl sm:text-2xl">
              Plan my day
            </h2>
            <p className="mt-2 text-[var(--ink-soft)]">
              Build a suggested schedule around your classes and free time. Nothing changes without your approval.
            </p>
          </div>

          <button
            type="button"
            disabled={isPlanning}
            onClick={() => void handleGenerateDailyPlan()}
            className="plan-generate-button inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-[16px] border-2 border-[var(--primary-dark)] bg-[var(--yellow-soft)] px-5 py-3 font-black text-[var(--primary-dark)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
          >
            {isPlanning
              ? "Planning your day..."
              : dailyPlan
                ? "Refresh plan"
                : "Generate plan"}
          </button>
        </div>

        {isPlanning && (
          <p role="status" className="mt-4 text-sm text-[var(--ink-soft)]">
            Reviewing your schedule and priorities...
          </p>
        )}

        {planError && (
          <p role="alert" className="mt-4 rounded-[12px] bg-[var(--accent-soft)] p-3 text-sm">
            {planError}
          </p>
        )}

        {dailyPlan && (
          <div className="mt-4 rounded-[16px] border-2 border-[var(--border)] bg-white/60 p-3 sm:p-4">
            <p className="mb-2 text-sm font-extrabold uppercase tracking-[0.06em] text-[var(--muted)]">
              Your suggested plan
            </p>
            <div className="whitespace-pre-wrap leading-7 text-[var(--ink-soft)]">
              {dailyPlan}
            </div>
          </div>
        )}
      </section>

      <section className="card bg-[var(--surface)] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="stat-label">
              Right now
            </p>

            <h2 className="mt-2 break-words text-xl sm:text-2xl">
              {recommendation
                ? recommendation.task.title
                : "Nothing urgent"}
            </h2>
            {recommendation?.task.type === "study" &&
              recommendation.task.unitName &&
              recommendation.task.unitName.trim().toLocaleLowerCase() !==
                recommendation.task.title.trim().toLocaleLowerCase() && (
                <p className="mt-1 break-words text-sm text-[var(--ink-soft)]">
                  {recommendation.task.unitName}
                </p>
              )}
          </div>

          {recommendation && (
            <span className="rounded-full border-2 border-[var(--primary-dark)] bg-[var(--yellow-soft)] px-3 py-1 text-sm font-extrabold text-[var(--primary-dark)]">
              {getTypeLabel(
                recommendation
                  .task.type,
              )}
            </span>
          )}
        </div>

        {recommendation ? (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-[12px] bg-[var(--primary-soft)] p-3">
                <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--primary)]">
                  Time
                </div>

                <div className="mt-1 font-[var(--font-heading)] text-lg font-bold text-[var(--primary)] sm:text-xl">
                  {formatDuration(
                    recommendation
                      .task
                      .durationMinutes,
                  )}
                </div>
              </div>

              <div className="rounded-[12px] bg-[var(--accent-soft)] p-3">
                <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--accent-dark)]">
                  Free time
                </div>

                <div className="mt-1 font-[var(--font-heading)] text-lg font-bold text-[var(--accent-dark)] sm:text-xl">
                  {formatDuration(
                    recommendation
                      .window
                      .durationMinutes,
                  )}
                </div>
              </div>

              <div className="rounded-[12px] bg-[var(--yellow-soft)] p-3">
                <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--primary-dark)]">
                  Starts
                </div>

                <div className="mt-1 font-[var(--font-heading)] text-lg font-bold text-[var(--primary-dark)] sm:text-xl">
                  {formatTime(
                    recommendation
                      .window
                      .startAt,
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[12px] border-2 border-[var(--border)] bg-white/60 p-3">
              <p className="text-sm font-extrabold uppercase tracking-[0.06em] text-[var(--muted)]">
                Why this?
              </p>

              <p className="mt-1 text-[var(--ink-soft)]">
                {
                  recommendation.explanation
                    .replace(/^It is\b/, "It's")
                    .replace(/\s+\+\s+/, ", and ")
                }
              </p>
            </div>

            <Link
              href={getTaskHref(
                recommendation.task,
              )}
              className="right-now-start-button mt-4 inline-flex min-h-[48px] items-center justify-center rounded-[16px] border-2 border-[var(--accent-dark)] bg-[var(--accent)] px-5 text-base font-black uppercase tracking-[0.03em] text-white shadow-[0_4px_0_var(--accent-dark)] transition hover:-translate-y-0.5 active:translate-y-[4px] active:shadow-none"
            >
              Start
            </Link>
          </>
        ) : (
          <div className="mt-4 rounded-[12px] bg-[var(--primary-soft)] p-4">
            <p className="font-semibold text-[var(--ink-soft)]">
              Nothing fits your
              current schedule.
              You are caught up
              for now.
            </p>
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3">
          <h2 className="text-lg font-extrabold uppercase tracking-[0.05em] text-[var(--primary-dark)]">
            Up next
          </h2>
        </div>

        {upNext.length > 0 ? (
          <div className="grid gap-4">
            {upNext.map(
              ({ task }) => (
                <Link
                  key={task.id}
                  href={getTaskHref(
                    task,
                  )}
                  className="card flex items-center justify-between gap-4 bg-[var(--surface)] p-4 sm:p-5 transition hover:-translate-y-1"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--muted)]">
                      {getTypeLabel(
                        task.type,
                      )}{" "}
                      ·{" "}
                      {formatDuration(
                        task.durationMinutes,
                      )}
                    </div>

                    <h3 className="mt-1 break-words text-lg sm:text-xl">
                      {task.title}
                    </h3>
                    {task.type === "study" &&
                      task.unitName &&
                      task.unitName.trim().toLocaleLowerCase() !==
                        task.title.trim().toLocaleLowerCase() && (
                      <p className="mt-1 break-words text-sm text-[var(--ink-soft)]">
                        {task.unitName}
                      </p>
                    )}
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
            today&apos;s available
            windows.
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-extrabold uppercase tracking-[0.05em] text-[var(--primary-dark)]">
              Your day
            </h2>
          </div>

          <div className="text-left sm:text-right">
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

        <div className="grid gap-2">
          {dayTimeline.map((item) =>
            item.kind === "class" ? (
              <div
                key={item.id}
                className="rounded-[12px] border-2 border-[var(--primary-dark)] bg-[var(--primary)] p-3 text-[var(--surface)] shadow-[0_3px_0_var(--primary-dark)]"
              >
                <div className="text-xs font-extrabold uppercase tracking-[0.06em] opacity-75">Class</div>
                <div className="mt-1 font-[var(--font-heading)] text-lg font-bold sm:text-xl">{item.title}</div>
                <div className="mt-1 text-sm font-bold opacity-80">
                  {formatTime(item.startAt)} — {formatTime(item.endAt)}
                </div>
              </div>
            ) : (
              <div
                key={item.id}
                className="timeline-free-slot rounded-[12px] border-2 border-dashed border-[var(--primary-dark)] bg-[var(--surface)] p-3"
              >
                <div className="text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--muted)]">Free time</div>
                <div className="mt-1 font-[var(--font-heading)] text-lg font-bold text-[var(--primary)] sm:text-xl">
                  {formatTime(item.startAt)} — {formatTime(item.endAt)}
                </div>
                <div className="mt-1 text-sm font-bold text-[var(--ink-soft)]">
                  {formatDuration(item.durationMinutes)}
                </div>
              </div>
            ),
          )}
        </div>
      </section>
    </main>
  );
}