"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassItem } from "@/lib/classes";
import {
  cancelClass,
  getCancelledClassIds,
  restoreClass,
} from "@/lib/classStorage";
import type {
  CalendarEvent,
  CalendarItem,
  CalendarTask,
} from "@/lib/calendarItemStorage";
import {
  expandCalendarEvents,
  expandCalendarTasks,
  type CalendarEventOccurrence,
  type CalendarTaskOccurrence,
} from "@/lib/calendarRecurrence";

type CalendarView = "week" | "month";
type EntryKind = "class" | "event" | "task";

type CalendarAgendaEntry = {
  id: string;
  kind: EntryKind;
  date: string;
  title: string;
  startTime?: string;
  endTime?: string;
  detail?: string;
  notes?: string;
  cancelled?: boolean;
  classItem?: ClassItem;
  eventItem?: CalendarEvent;
  occurrence?: CalendarEventOccurrence;
  task?: CalendarTask;
  taskOccurrence?: CalendarTaskOccurrence;
};

type CalendarOverviewProps = {
  classes: ClassItem[];
  events: CalendarEvent[];
  tasks: CalendarTask[];
  onAddEvent: (date: string) => void;
  onAddTask: (date: string) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onEditTask: (task: CalendarTask) => void;
  onDeleteItem: (item: CalendarItem) => void;
  onToggleTask: (
    task: CalendarTask,
    occurrenceDate?: string,
    currentCompleted?: boolean,
  ) => void;
};

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SHORT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function dateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTodayKey(): string {
  return dateKey(new Date());
}

function addDays(key: string, amount: number): string {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function getWeekDates(key: string): string[] {
  const date = dateFromKey(key);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);

  const monday = dateKey(date);
  return Array.from({ length: 7 }, (_, index) =>
    addDays(monday, index),
  );
}

function getMonthGridDates(key: string): string[] {
  const selected = dateFromKey(key);
  const first = new Date(
    selected.getFullYear(),
    selected.getMonth(),
    1,
    12,
  );
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = dateKey(
    new Date(
      first.getFullYear(),
      first.getMonth(),
      1 - mondayOffset,
      12,
    ),
  );
  const daysInMonth = new Date(
    selected.getFullYear(),
    selected.getMonth() + 1,
    0,
    12,
  ).getDate();
  const totalDays = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

  return Array.from({ length: totalDays }, (_, index) =>
    addDays(start, index),
  );
}

function formatLongDate(key: string): string {
  return dateFromKey(key).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatShortDate(key: string): string {
  return dateFromKey(key).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function formatTime(entry: CalendarAgendaEntry): string {
  if (entry.startTime) {
    return `${entry.startTime}${
      entry.endTime ? `–${entry.endTime}` : ""
    }`;
  }

  return entry.kind === "task" ? "Flexible · due date" : "Time not set";
}

function entryKindLabel(entry: CalendarAgendaEntry): string {
  if (entry.kind === "class") return "Class";
  if (entry.kind === "task") return "Flexible task";
  return entry.eventItem?.recurrence ? "Recurring event" : "Event";
}

export default function CalendarOverview({
  classes,
  events,
  tasks,
  onAddEvent,
  onAddTask,
  onEditEvent,
  onEditTask,
  onDeleteItem,
  onToggleTask,
}: CalendarOverviewProps) {
  const [view, setView] = useState<CalendarView>("week");
  // Use deterministic initial values during prerendering.
  const [selectedDate, setSelectedDate] = useState("2000-01-01");
  const [today, setToday] = useState("2000-01-01");
  const [dateReady, setDateReady] = useState(false);
  const [cancelledByDate, setCancelledByDate] = useState<
    Record<string, number[]>
  >({});
  const [visibleKinds, setVisibleKinds] = useState<Record<EntryKind, boolean>>({
    class: true,
    event: true,
    task: true,
  });
  const [isMobile, setIsMobile] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAgendaOpen, setIsAgendaOpen] = useState(false);

  useEffect(() => {
    const currentDate = localTodayKey();
    setSelectedDate(currentDate);
    setToday(currentDate);
    setDateReady(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");

    const updateViewport = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      setIsExpanded(mobile && view === "month");

      if (!mobile) setIsAgendaOpen(false);
    };

    updateViewport();
    media.addEventListener("change", updateViewport);

    return () => media.removeEventListener("change", updateViewport);
  }, [view]);

  const visibleDates = useMemo(
    () =>
      view === "week"
        ? getWeekDates(selectedDate)
        : getMonthGridDates(selectedDate),
    [view, selectedDate],
  );

  const visibleDatesKey = visibleDates.join("|");

  useEffect(() => {
    if (!dateReady) return;

    const dates = visibleDatesKey.split("|").filter(Boolean);
    const next: Record<string, number[]> = {};

    for (const date of dates) {
      next[date] = getCancelledClassIds(date);
    }

    setCancelledByDate(next);
  }, [visibleDatesKey, dateReady]);

  const entries = useMemo(() => {
    const firstDate = visibleDates[0];
    const lastDate = visibleDates[visibleDates.length - 1];
    const result: CalendarAgendaEntry[] = [];

    // Weekly classes are expanded into actual dates for this view.
    for (const date of visibleDates) {
      const dateObject = dateFromKey(date);
      const weekday = WEEKDAYS[(dateObject.getDay() + 6) % 7];
      const cancelledIds = cancelledByDate[date] ?? [];

      for (const classItem of classes) {
        if (classItem.day !== weekday) continue;

        const cancelled = cancelledIds.includes(classItem.id);

        result.push({
          id: `class:${classItem.id}:${date}`,
          kind: "class",
          date,
          title: classItem.name,
          startTime: classItem.start,
          endTime: classItem.end,
          detail: classItem.type,
          cancelled,
          classItem,
        });
      }
    }

    // Expand recurring and one-off events using the tested rrule helper.
    const occurrences = expandCalendarEvents(
      events,
      firstDate,
      lastDate,
    );

    for (const occurrence of occurrences) {
      const baseEvent = events.find(
        (item) => item.id === occurrence.eventId,
      );
      if (!baseEvent) continue;

      result.push({
        id: `event:${occurrence.id}`,
        kind: "event",
        date: occurrence.date,
        title: occurrence.title,
        startTime: occurrence.startTime,
        endTime: occurrence.endTime,
        detail: occurrence.location,
        notes: occurrence.notes,
        eventItem: baseEvent,
        occurrence,
      });
    }

    // Expand due dates, keeping each recurring task occurrence independent.
    const taskOccurrences = expandCalendarTasks(
      tasks,
      firstDate,
      lastDate,
    );

    for (const occurrence of taskOccurrences) {
      result.push({
        id: `task:${occurrence.id}`,
        kind: "task",
        date: occurrence.date,
        title: occurrence.title,
        detail: `${occurrence.priority[0].toUpperCase()}${occurrence.priority.slice(1)} priority`,
        notes: occurrence.notes,
        task: occurrence.task,
        taskOccurrence: occurrence,
      });
    }

    const kindOrder: Record<EntryKind, number> = {
      class: 0,
      event: 1,
      task: 2,
    };

    return result.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime ?? "99:99").localeCompare(
          b.startTime ?? "99:99",
        ) ||
        kindOrder[a.kind] - kindOrder[b.kind] ||
        a.title.localeCompare(b.title),
    );
  }, [classes, events, tasks, visibleDates, cancelledByDate]);

  const visibleEntries = entries.filter(
    (entry) => visibleKinds[entry.kind],
  );

  const selectedEntries = visibleEntries.filter(
    (entry) => entry.date === selectedDate,
  );

  const selectedMonthKey = selectedDate.slice(0, 7);
  const heading =
    view === "month"
      ? dateFromKey(selectedDate).toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
        })
      : `${formatShortDate(visibleDates[0])} – ${dateFromKey(
          visibleDates[6],
        ).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`;

  function movePeriod(direction: number) {
    if (view === "week") {
      setSelectedDate(addDays(selectedDate, direction * 7));
      return;
    }

    const current = dateFromKey(selectedDate);
    const originalDay = current.getDate();
    const targetMonth = new Date(
      current.getFullYear(),
      current.getMonth() + direction,
      1,
      12,
    );
    const lastDay = new Date(
      targetMonth.getFullYear(),
      targetMonth.getMonth() + 1,
      0,
      12,
    ).getDate();

    targetMonth.setDate(Math.min(originalDay, lastDay));
    setSelectedDate(dateKey(targetMonth));
  }

  function renderDateCell(
    date: string,
    showWeekday: boolean,
    monthCell: boolean,
  ) {
    const dayEntries = visibleEntries.filter((entry) => entry.date === date);
    const isSelected = date === selectedDate;
    const isToday = date === today;
    const isCurrentMonth = date.slice(0, 7) === selectedMonthKey;

    // Keep weekday alignment without displaying dates outside this month.
    if (monthCell && !isCurrentMonth) {
      return (
        <div
          key={date}
          aria-hidden="true"
          className={isMobile && isExpanded ? "min-h-0 rounded-md" : "h-16 rounded-lg sm:h-28 sm:rounded-xl"}
        />
      );
    }

    return (
      <button
        key={date}
        type="button"
        aria-pressed={isSelected}
        aria-label={`${formatLongDate(date)}, ${dayEntries.length} calendar items`}
        onClick={() => {
          setSelectedDate(date);
          if (isMobile && isExpanded) setIsAgendaOpen(true);
        }}
        className={`relative flex min-w-0 flex-col overflow-hidden text-left transition ${
          monthCell
            ? isMobile && isExpanded
              ? "h-full min-h-0 rounded-md border p-1"
              : "h-16 rounded-lg border p-1 sm:h-28 sm:rounded-xl sm:border-2 sm:p-2"
            : "min-h-36 rounded-xl border-2 p-1.5 sm:p-2"
        } ${
          isSelected
            ? "border-[var(--primary-dark)] bg-[var(--primary-soft)] shadow-[0_3px_0_var(--primary-dark)]"
            : isToday
              ? "border-[var(--primary)] bg-[var(--surface)]"
              : "border-[var(--border)] bg-[var(--surface)]"
        } ${
          monthCell && !isCurrentMonth ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-1">
          <div className="min-w-0">
            {showWeekday && (
              <span className="block text-[10px] font-extrabold uppercase text-[var(--muted)] sm:text-xs">
                {dateFromKey(date).toLocaleDateString("en-GB", {
                  weekday: "short",
                })}
              </span>
            )}
            <span
              className={`inline-flex items-center justify-center rounded-full font-extrabold transition ${
                  monthCell
                    ? `h-5 min-w-0 border-0 px-0 text-xs sm:h-9 sm:min-w-9 sm:border-2 sm:px-1 sm:text-base ${
                        isToday
                          ? "text-[var(--primary-dark)] sm:border-[var(--primary-dark)] sm:bg-[var(--primary)] sm:text-white sm:shadow-sm"
                          : "text-[var(--ink)] sm:border-[var(--primary-soft)] sm:bg-[var(--primary-soft)] sm:text-[var(--primary-dark)]"
                      }`
                    : `h-6 min-w-6 border-2 px-1 text-xs sm:h-7 sm:min-w-7 sm:text-sm ${
                        isToday
                          ? "bg-[var(--primary)] text-white"
                          : "text-[var(--ink)]"
                      }`
                }`}
            >
              {dateFromKey(date).getDate()}
            </span>
          </div>
          <span
              className={`inline-flex shrink-0 items-center justify-center min-w-0 px-0 text-[9px] font-extrabold leading-none sm:min-w-6 sm:rounded-full sm:px-1.5 sm:py-0.5 sm:text-[10px] ${
                dayEntries.length > 0
                  ? "text-[var(--ink)] sm:bg-[var(--yellow-soft)]"
                  : "hidden sm:inline-flex sm:bg-[var(--surface)] sm:text-[var(--muted)]"
              } ${isMobile && isExpanded ? "hidden" : ""}`}
            >
              {dayEntries.length}
            </span>
        </div>

{monthCell ? (
            isMobile && isExpanded ? (
              <div className="mt-1 min-w-0 space-y-0.5 overflow-hidden">
                {dayEntries.slice(0, 2).map((entry) => (
                  <span
                    key={entry.id}
                    title={entry.title}
                    className={[
                      "block truncate rounded-sm px-1 py-0.5 text-[9px] font-semibold leading-tight",
                      entry.cancelled
                        ? "bg-[var(--border)] text-[var(--muted)] line-through"
                        : entry.kind === "class"
                          ? "bg-[var(--primary-soft)] text-[var(--primary-dark)]"
                          : entry.kind === "event"
                            ? "bg-[#fff0b3] text-[#684000]"
                            : "bg-[var(--accent-soft)] text-[var(--accent-dark)]",
                    ].join(" ")}
                  >
                    {entry.title}
                  </span>
                ))}
                {dayEntries.length > 2 && (
                  <span className="block truncate px-1 text-[9px] font-extrabold text-[var(--muted)]">
                    +{dayEntries.length - 2}
                  </span>
                )}
              </div>
            ) : (
            <div className="mt-1 flex min-w-0 items-center justify-center gap-1 sm:mt-1.5 sm:flex-col sm:items-start sm:justify-start sm:gap-1">
              {(["class", "event", "task"] as const).map((kind) => {
                const count = dayEntries.filter(
                  (entry) => entry.kind === kind,
                ).length;


                const label =
                  kind === "class"
                    ? "classes"
                    : kind === "event"
                      ? "events"
                      : "tasks";

                const markerColor =
                  kind === "class"
                    ? "bg-[var(--primary-dark)]"
                    : kind === "event"
                      ? "bg-[#946200]"
                      : "bg-[var(--accent-dark)]";

                const countColor =
                  kind === "class"
                    ? "text-[var(--primary-dark)]"
                    : kind === "event"
                      ? "text-[#946200]"
                      : "text-[var(--accent-dark)]";

                return (
                  <span
                    key={kind}
                    title={`${count} ${label}`}
                    className={`inline-flex h-3 shrink-0 items-center gap-0.5 ${count === 0 ? "hidden sm:inline-flex sm:opacity-30" : ""}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${markerColor}`}
                    />
                    <span className={`hidden text-[9px] font-extrabold leading-none sm:inline sm:text-[10px] ${countColor}`}>
                      {count}
                    </span>
                  </span>
                );
              })}
            </div>
            )
          ) : (
          <div className="mt-1 space-y-1">
          {dayEntries.slice(0, 4).map((entry) => (
            <div
              key={entry.id}
              className={`truncate rounded px-1 py-0.5 text-[10px] font-bold leading-snug sm:text-xs ${
                entry.cancelled
                  ? "bg-[var(--border)] text-[var(--muted)] line-through"
                  : entry.kind === "class"
                    ? "border-l-4 border-[var(--primary-dark)] bg-[var(--primary-soft)] text-[var(--primary-dark)]"
                    : entry.kind === "event"
                      ? "border-l-4 border-[#946200] bg-[#fff0b3] text-[#684000]"
                      : "border-l-4 border-[var(--accent-dark)] bg-[var(--accent-soft)] text-[var(--accent-dark)]"
              }`}
            >
              {entry.startTime ? `${entry.startTime} ` : ""}
              {entry.title}
            </div>
          ))}
          {dayEntries.length > 4 && (
            <p className="px-1 text-[10px] font-extrabold text-[var(--muted)]">
              +{dayEntries.length - 4} more
            </p>
          )}
        </div>
        )}
      </button>
    );
  }

  function changeClassCancellation(entry: CalendarAgendaEntry) {
    if (!entry.classItem) return;

    const classId = entry.classItem.id;
    const date = entry.date;

    if (entry.cancelled) {
      restoreClass(classId, date);
      setCancelledByDate((current) => ({
        ...current,
        [date]: (current[date] ?? []).filter((id) => id !== classId),
      }));
    } else {
      cancelClass(classId, date);
      setCancelledByDate((current) => ({
        ...current,
        [date]: [...new Set([...(current[date] ?? []), classId])],
      }));
    }
  }

  if (!dateReady) {
    return (
      <section
        className="card mb-8 bg-[var(--surface)] p-4 sm:p-6"
        aria-label="Loading calendar"
      >
        <p className="text-sm font-bold text-[var(--ink-soft)]">
          Preparing your calendar…
        </p>
      </section>
    );
  }

  return (
    <section
      className={
        isMobile && isExpanded
          ? "fixed inset-0 z-[70] m-0 flex h-[100dvh] min-h-0 flex-col overflow-hidden rounded-none border-0 bg-[var(--surface)] p-2"
          : "card mb-8 bg-[var(--surface)] p-4 sm:p-6"
      }
    >
      <div
        className={
          isMobile && isExpanded
            ? "flex min-h-0 flex-1 flex-col gap-1"
            : "flex flex-col gap-4"
        }
      >
        <div className={isMobile && isExpanded ? "hidden" : "flex flex-col items-start gap-2"}>
          <div className="min-w-0">
            <h2 className={isMobile && isExpanded ? "mt-0 text-lg font-extrabold" : "text-xl sm:text-2xl"}>
              Calendar overview
            </h2>
          </div>

          <div
            role="group"
            aria-label="Calendar view"
            className={["flex shrink-0 rounded-xl border-2 border-[var(--border)] p-1", isMobile && isExpanded ? "hidden" : ""].join(" ")}
          >
            {(["week", "month"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => {
                  setView(option);
                  if (isMobile) {
                    setIsExpanded(option === "month");
                    setIsAgendaOpen(false);
                  }
                }}
                className={`rounded-lg px-3 py-2 text-sm font-extrabold capitalize ${
                  view === option
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--ink-soft)]"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

        </div>

        <div className={isMobile && isExpanded ? "flex shrink-0 items-center justify-between gap-1 border-b border-[var(--border)] py-1" : "flex flex-wrap items-center justify-between gap-3 border-y border-[var(--border)] py-3"}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous week or month"
              onClick={() => movePeriod(-1)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--border)] p-0 font-extrabold"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className="flex h-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--border)] px-4 py-0 text-sm font-extrabold"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next week or month"
              onClick={() => movePeriod(1)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--border)] p-0 font-extrabold"
            >
              →
            </button>
          </div>
          <h3 className={isMobile && isExpanded ? "min-w-0 flex-1 truncate px-1 text-center text-sm font-extrabold" : "text-lg font-extrabold"}>{heading}</h3>
          {isMobile && isExpanded && !isAgendaOpen && (
            <details data-smart-menu className="relative z-40 shrink-0">
              <summary aria-label="Calendar filters" title="Calendar filters" className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--border)] text-xl font-extrabold">
                <span aria-hidden="true">⋮</span>
              </summary>
              <div data-smart-menu-panel className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                    setIsAgendaOpen(false);
                    setView("week");
                    setIsExpanded(false);
                  }}
                  className="w-full rounded-lg px-2 py-2.5 text-left text-sm font-extrabold text-[var(--primary-dark)] hover:bg-[var(--primary-soft)]"
                >
                  Switch to week view
                </button>
                <div className="my-1 border-t border-[var(--border)]" />
                <p className="px-2 py-1 text-xs font-extrabold uppercase tracking-wide text-[var(--muted)]">Show on calendar</p>
                {([
                  { kind: "class", label: "Classes", marker: "bg-[var(--primary-dark)]" },
                  { kind: "event", label: "Events", marker: "bg-[#946200]" },
                  { kind: "task", label: "Tasks", marker: "bg-[var(--accent-dark)]" },
                ] as const).map(({ kind, label, marker }) => (
                  <button key={kind} type="button" aria-pressed={visibleKinds[kind]} onClick={() => setVisibleKinds((current) => ({ ...current, [kind]: !current[kind] }))} className={["flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm font-bold transition", visibleKinds[kind] ? "bg-[var(--primary-soft)] text-[var(--primary-dark)]" : "text-[var(--muted)]"].join(" ")}>
                    <span aria-hidden="true" className={["h-2.5 w-2.5 shrink-0 rounded-full", marker, visibleKinds[kind] ? "" : "opacity-40"].join(" ")} />
                    <span className="flex-1">{label}</span>
                    <span aria-hidden="true" className="w-4 text-right">{visibleKinds[kind] ? "✓" : ""}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>

        <div
          role="group"
          aria-label="Filter calendar categories"
          className={isMobile && isExpanded ? "hidden" : "flex shrink-0 flex-wrap gap-2"}
        >
          {([
            { kind: "class", label: "Classes", marker: "bg-[var(--primary-dark)]" },
            { kind: "event", label: "Events", marker: "bg-[#946200]" },
            { kind: "task", label: "Tasks", marker: "bg-[var(--accent-dark)]" },
          ] as const).map(({ kind, label, marker }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={visibleKinds[kind]}
              onClick={() =>
                setVisibleKinds((current) => ({
                  ...current,
                  [kind]: !current[kind],
                }))
              }
              className={[
                "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold transition",
                visibleKinds[kind]
                  ? "border-[var(--primary-dark)] bg-[var(--primary-soft)] text-[var(--primary-dark)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
                className={["h-2.5 w-2.5 rounded-full", marker, visibleKinds[kind] ? "" : "opacity-40"].join(" ")}
              />
              {label}
            </button>
          ))}
        </div>

        {view === "week" ? (
          <>
            {/* Compact seven-day strip for phones. */}
            <div className="grid grid-cols-7 gap-1 md:hidden">
              {visibleDates.map((date, index) => {
                const isSelected = date === selectedDate;
                const isToday = date === today;
                const dayKinds = Array.from(new Set(
                  visibleEntries
                    .filter((entry) => entry.date === date)
                    .map((entry) => entry.kind),
                ));

                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={formatLongDate(date)}
                    onClick={() => setSelectedDate(date)}
                    className={`min-w-0 rounded-xl border-2 px-0.5 py-2 ${
                      isSelected
                        ? "border-[var(--primary-dark)] bg-[var(--primary-soft)]"
                        : "border-[var(--border)] bg-[var(--surface)]"
                    }`}
                  >
                    <span className="block text-[10px] font-extrabold text-[var(--muted)]">
                      {SHORT_WEEKDAYS[index]}
                    </span>
                    <span
                      className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold ${
                        isToday
                          ? "bg-[var(--primary)] text-white"
                          : "text-[var(--ink)]"
                      }`}
                    >
                      {dateFromKey(date).getDate()}
                    </span>
                    <span aria-hidden="true" className="mt-1 flex min-h-2 items-center justify-center gap-1">
                      {dayKinds.map((kind) => (
                        <span
                          key={kind}
                          className={`h-1.5 w-1.5 rounded-full ${
                            kind === "class"
                              ? "bg-[var(--primary-dark)]"
                              : kind === "event"
                                ? "bg-[#946200]"
                                : "bg-[var(--accent-dark)]"
                          }`}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Full week grid on desktop and tablet. */}
            <div className="hidden grid-cols-7 gap-2 md:grid">
              {visibleDates.map((date) => renderDateCell(date, true, false))}
            </div>
          </>
        ) : (
          <div
            className={isMobile && isExpanded && !isAgendaOpen ? "grid min-h-0 flex-1 grid-cols-7 gap-x-1 gap-y-1" : isMobile && isExpanded ? "hidden" : "grid grid-cols-7 gap-1 sm:gap-2"}
            style={isMobile && isExpanded && !isAgendaOpen ? { gridTemplateRows: "auto repeat(" + visibleDates.length / 7 + ", minmax(0, 1fr))" } : undefined}
          >
            {SHORT_WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className="py-1 text-center text-[10px] font-extrabold uppercase text-[var(--muted)] sm:text-xs"
              >
                {weekday}
              </div>
            ))}
            {visibleDates.map((date) => renderDateCell(date, false, true))}
          </div>
        )}




        <div className={isMobile && isExpanded && !isAgendaOpen ? "hidden" : isMobile && isExpanded ? "min-h-0 flex-1 overflow-y-auto border-t border-[var(--border)] pt-3" : "border-t border-[var(--border)] pt-4"}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="min-w-0 flex-1 break-words text-base font-extrabold sm:text-xl">
              {formatLongDate(selectedDate)}
            </h3>
            <details data-smart-menu className="relative shrink-0">
              <summary
                aria-label="Selected day actions"
                className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border-2 border-[var(--border)] text-xl font-extrabold"
              >
                <span aria-hidden="true">⋮</span>
              </summary>
              <div data-smart-menu-panel className="absolute right-0 z-30 mt-1 w-48 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                {isMobile && isExpanded && isAgendaOpen && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.currentTarget.closest("details")?.removeAttribute("open");
                      setIsAgendaOpen(false);
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-extrabold text-[var(--primary-dark)] hover:bg-[var(--primary-soft)]"
                  >
                    Back to month view
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onAddEvent(selectedDate)}
                  className="w-full rounded-lg border-l-4 border-[#946200] bg-[#fff0b3] px-3 py-2 text-left text-sm font-extrabold text-[#684000] transition hover:bg-[#ffe68a]"
                >
                  Add event
                </button>
                <button
                  type="button"
                  onClick={() => onAddTask(selectedDate)}
                  className="w-full rounded-lg border-l-4 border-[var(--accent-dark)] bg-[var(--accent-soft)] px-3 py-2 text-left text-sm font-extrabold text-[var(--accent-dark)] transition hover:brightness-95"
                >
                  Add task
                </button>
              </div>
            </details>
          </div>

          {selectedEntries.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--ink-soft)]">
              Nothing scheduled for this day. Enjoy the breathing room.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {selectedEntries.map((entry) => (
                <article
                  key={entry.id}
                  className={`rounded-xl border-2 p-3 sm:p-4 ${
                    entry.cancelled
                      ? "border-[var(--border)] bg-[var(--surface)] opacity-75"
                      : entry.kind === "class"
                        ? "border-[var(--primary-dark)] bg-[var(--primary-soft)]"
                        : entry.kind === "event"
                          ? "border-[#946200] bg-[#fff8d9]"
                          : "border-[var(--accent-dark)] bg-[var(--accent-soft)]"
                  }`}
                >
                  <div className="flex flex-row items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--muted)]">
                        {entryKindLabel(entry)} · {formatTime(entry)}
                      </p>
                      <div className="mt-1 flex min-w-0 items-start gap-2">
                        {entry.kind === "task" && entry.task && (
                          <input
                            type="checkbox"
                            aria-label={`Mark ${entry.title} ${(entry.taskOccurrence?.completed ?? entry.task.completed) ? "incomplete" : "complete"}`}
                            checked={entry.taskOccurrence?.completed ?? entry.task.completed}
                            onChange={() =>
                              onToggleTask(
                                entry.task!,
                                entry.taskOccurrence?.recurring
                                  ? entry.taskOccurrence.originalDate
                                  : undefined,
                                entry.taskOccurrence?.completed ?? entry.task!.completed,
                              )
                            }
                            className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--primary)]"
                          />
                        )}
                        <h4
                          className={`min-w-0 break-words text-base font-extrabold sm:text-lg ${
                            entry.cancelled || (entry.taskOccurrence?.completed ?? entry.task?.completed)
                              ? "line-through"
                              : ""
                          }`}
                        >
                          {entry.title}
                        </h4>
                      </div>
                      {entry.detail && (
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">
                          {entry.detail}
                        </p>
                      )}
                      {entry.notes && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
                          {entry.notes}
                        </p>
                      )}
                      {entry.cancelled && (
                        <p className="mt-2 text-xs font-extrabold text-[var(--muted)]">
                          This class session is cancelled.
                        </p>
                      )}
                      {(entry.taskOccurrence?.completed ?? entry.task?.completed) && (
                        <p className="mt-2 text-xs font-extrabold text-[var(--primary)]">
                          Completed
                        </p>
                      )}
                      {entry.kind === "event" &&
                        entry.eventItem?.recurrence && (
                          <p className="mt-2 text-xs font-extrabold text-[var(--primary)]">
                            Part of a recurring series
                          </p>
                        )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {entry.kind === "class" && entry.classItem && (
                        <details data-smart-menu className="relative">
                          <summary
                            aria-label={`More actions for ${entry.title}`}
                            className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border-2 border-[var(--border)] text-xl font-extrabold"
                          >
                            <span aria-hidden="true">⋮</span>
                          </summary>
                          <div data-smart-menu-panel className="absolute right-0 z-30 mt-1 w-48 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                            <button
                              type="button"
                              onClick={(clickEvent) => {
                                clickEvent.currentTarget.closest("details")?.removeAttribute("open");
                                changeClassCancellation(entry);
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[var(--primary-soft)]"
                            >
                              {entry.cancelled ? "Restore session" : "Cancel session"}
                            </button>
                          </div>
                        </details>
                      )}

                      {entry.kind === "event" && entry.eventItem && (
                        <details data-smart-menu className="relative">
                          <summary
                            aria-label={`More actions for ${entry.title}`}
                            className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border-2 border-[var(--border)] text-xl font-extrabold"
                          >
                            <span aria-hidden="true">⋮</span>
                          </summary>
                          <div data-smart-menu-panel className="absolute right-0 z-30 mt-1 w-48 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                            <button
                              type="button"
                              onClick={(clickEvent) => {
                                clickEvent.currentTarget.closest("details")?.removeAttribute("open");
                                onEditEvent(entry.eventItem!);
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[var(--primary-soft)]"
                            >
                              {entry.eventItem.recurrence ? "Edit series" : "Edit event"}
                            </button>
                            <button
                              type="button"
                              onClick={(clickEvent) => {
                                clickEvent.currentTarget.closest("details")?.removeAttribute("open");
                                onDeleteItem(entry.eventItem!);
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--accent-dark)] hover:bg-[var(--accent-soft)]"
                            >
                              {entry.eventItem.recurrence ? "Delete series" : "Delete event"}
                            </button>
                          </div>
                        </details>
                      )}

                      {entry.kind === "task" && entry.task && (
                        <>
                          <details data-smart-menu className="relative">
                            <summary
                              aria-label={`More actions for ${entry.title}`}
                              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border-2 border-[var(--border)] text-xl font-extrabold"
                            >
                              <span aria-hidden="true">⋮</span>
                            </summary>
                            <div data-smart-menu-panel className="absolute right-0 z-30 mt-1 w-44 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                              <button
                                type="button"
                                onClick={(clickEvent) => {
                                  clickEvent.currentTarget.closest("details")?.removeAttribute("open");
                                  onEditTask(entry.task!);
                                }}
                                className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[var(--primary-soft)]"
                              >
                                Edit task
                              </button>
                              <button
                                type="button"
                                onClick={(clickEvent) => {
                                  clickEvent.currentTarget.closest("details")?.removeAttribute("open");
                                  onDeleteItem(entry.task!);
                                }}
                                className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--accent-dark)] hover:bg-[var(--accent-soft)]"
                              >
                                Delete task
                              </button>
                            </div>
                          </details>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
