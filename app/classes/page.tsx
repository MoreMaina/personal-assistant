
"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import Button from "@/app/components/Button";
import { addClass, getClasses } from "@/lib/classStorage";
import {
  addCalendarEvent,
  addCalendarTask,
  deleteCalendarItem,
  getCalendarItems,
  toggleCalendarTask,
  updateCalendarItem,
  type CalendarEvent,
  type CalendarItem,
  type CalendarTask,
} from "@/lib/calendarItemStorage";

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const types = [
  "Lecture",
  "Tutorial",
  "Practical",
  "Seminar",
  "Other",
];

type PlannerFormType = "event" | "task";

function localDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value?: string) {
  if (!value) return "No due date";

  const [year, month, day] = value.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const monthIndex = Number(month) - 1;

  if (
    !year ||
    !day ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    !Number.isFinite(Number(day))
  ) {
    return value;
  }

  return `${Number(day)} ${monthNames[monthIndex]} ${year}`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${remainder} min`;
  if (remainder === 0) return `${hours} hr`;

  return `${hours} hr ${remainder} min`;
}

export default function ClassesPage() {
  const [classList, setClassList] = useState(getClasses);
  const [showClassForm, setShowClassForm] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState("Lecture");
  const [day, setDay] = useState("Monday");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [classError, setClassError] = useState("");
  const [notice, setNotice] = useState("");

  const [todayName, setTodayName] = useState<string | null>(null);

  // Calendar events and tasks
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [showPlannerForm, setShowPlannerForm] = useState(false);
  const [plannerType, setPlannerType] = useState<PlannerFormType>("event");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [plannerError, setPlannerError] = useState("");

  const [plannerTitle, setPlannerTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventNotes, setEventNotes] = useState("");

  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] =
    useState<CalendarTask["priority"]>("medium");
  const [taskMinutes, setTaskMinutes] = useState("");
  const [taskNotes, setTaskNotes] = useState("");

  useEffect(() => {
    setCalendarItems(getCalendarItems());

    const today = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "Africa/Nairobi",
    }).format(new Date());

    setTodayName(today);
  }, []);

  const sortedClasses = useMemo(() => {
    return [...classList].sort(
      (a, b) =>
        days.indexOf(a.day) - days.indexOf(b.day) ||
        a.start.localeCompare(b.start),
    );
  }, [classList]);

  const classesByDay = useMemo(() => {
    return Object.fromEntries(
      days.map((dayName) => [
        dayName,
        sortedClasses.filter((item) => item.day === dayName),
      ]),
    ) as Record<string, typeof sortedClasses>;
  }, [sortedClasses]);

  const activeDays = days.filter(
    (dayName) => classesByDay[dayName].length > 0,
  ).length;

  const weeklyMinutes = classList.reduce((total, item) => {
    const [startHour, startMinute] = item.start.split(":").map(Number);
    const [endHour, endMinute] = item.end.split(":").map(Number);

    const duration =
      endHour * 60 +
      endMinute -
      (startHour * 60 + startMinute);

    return total + Math.max(0, duration);
  }, 0);

  const calendarEvents = useMemo(() => {
    return calendarItems
      .filter((item): item is CalendarEvent => item.type === "event")
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.startTime ?? "").localeCompare(b.startTime ?? ""),
      );
  }, [calendarItems]);

  const calendarTasks = useMemo(() => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };

    return calendarItems
      .filter((item): item is CalendarTask => item.type === "task")
      .sort(
        (a, b) =>
          Number(a.completed) - Number(b.completed) ||
          (a.dueDate || "9999-12-31").localeCompare(
            b.dueDate || "9999-12-31",
          ) ||
          priorityOrder[a.priority] - priorityOrder[b.priority],
      );
  }, [calendarItems]);

  const openTaskCount = calendarTasks.filter(
    (task) => !task.completed,
  ).length;

  function resetClassForm() {
    setName("");
    setType("Lecture");
    setDay("Monday");
    setStart("");
    setEnd("");
    setClassError("");
    setShowClassForm(false);
  }

  function handleClassSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClassError("");
    setNotice("");

    if (!name.trim()) {
      setClassError("Please enter a class name.");
      return;
    }

    if (!start || !end) {
      setClassError("Please enter both a start and end time.");
      return;
    }

    if (end <= start) {
      setClassError("The end time must be later than the start time.");
      return;
    }

    try {
      const createdClass = addClass({
        name: name.trim(),
        type,
        day,
        start,
        end,
      });

      setClassList((current) => [...current, createdClass]);
      setNotice(`${createdClass.name} has been added to your timetable.`);
      resetClassForm();
    } catch (caughtError) {
      console.error("Could not save class:", caughtError);
      setClassError("The class could not be saved. Please try again.");
    }
  }

  function resetPlannerForm() {
    setShowPlannerForm(false);
    setEditingId(null);
    setPlannerError("");
    setPlannerTitle("");
    setEventDate("");
    setEventStart("");
    setEventEnd("");
    setEventLocation("");
    setEventNotes("");
    setTaskDueDate("");
    setTaskPriority("medium");
    setTaskMinutes("");
    setTaskNotes("");
  }

  function openPlannerForm(
    kind: PlannerFormType,
    item?: CalendarItem,
  ) {
    setPlannerType(kind);
    setEditingId(item?.id ?? null);
    setPlannerError("");
    setNotice("");

    setPlannerTitle(item?.title ?? "");

    if (item?.type === "event") {
      setEventDate(item.date);
      setEventStart(item.startTime ?? "");
      setEventEnd(item.endTime ?? "");
      setEventLocation(item.location ?? "");
      setEventNotes(item.notes ?? "");
    } else {
      setEventDate(localDateString());
      setEventStart("");
      setEventEnd("");
      setEventLocation("");
      setEventNotes("");
    }

    if (item?.type === "task") {
      setTaskDueDate(item.dueDate ?? "");
      setTaskPriority(item.priority);
      setTaskMinutes(
        item.estimatedMinutes != null
          ? String(item.estimatedMinutes)
          : "",
      );
      setTaskNotes(item.notes ?? "");
    } else {
      setTaskDueDate("");
      setTaskPriority("medium");
      setTaskMinutes("");
      setTaskNotes("");
    }

    setShowPlannerForm(true);
  }

  function handlePlannerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlannerError("");
    setNotice("");

    if (!plannerTitle.trim()) {
      setPlannerError("Please enter a title.");
      return;
    }

    const existing = editingId
      ? calendarItems.find((item) => item.id === editingId)
      : undefined;

    try {
      if (plannerType === "event") {
        if (!eventDate) {
          setPlannerError("Please choose an event date.");
          return;
        }

        if (Boolean(eventStart) !== Boolean(eventEnd)) {
          setPlannerError(
            "Enter both a start time and an end time, or leave both blank.",
          );
          return;
        }

        if (eventStart && eventEnd && eventEnd <= eventStart) {
          setPlannerError("The end time must be later than the start time.");
          return;
        }

        const eventData = {
          title: plannerTitle.trim(),
          date: eventDate,
          startTime: eventStart || undefined,
          endTime: eventEnd || undefined,
          location: eventLocation.trim() || undefined,
          notes: eventNotes.trim() || undefined,
        };

        if (existing?.type === "event") {
          updateCalendarItem({
            ...existing,
            ...eventData,
          });
          setCalendarItems(getCalendarItems());
          setNotice("Event updated successfully.");
        } else {
          const created = addCalendarEvent(eventData);
          setCalendarItems((current) => [...current, created]);
          setNotice("Event added to your calendar.");
        }
      } else {
        const parsedMinutes = taskMinutes.trim()
          ? Number(taskMinutes)
          : undefined;

        if (
          parsedMinutes !== undefined &&
          (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0)
        ) {
          setPlannerError(
            "Estimated minutes must be a positive number.",
          );
          return;
        }

        const taskData = {
          title: plannerTitle.trim(),
          dueDate: taskDueDate || undefined,
          priority: taskPriority,
          estimatedMinutes: parsedMinutes,
          notes: taskNotes.trim() || undefined,
          completed: existing?.type === "task"
            ? existing.completed
            : false,
        };

        if (existing?.type === "task") {
          updateCalendarItem({
            ...existing,
            ...taskData,
          });
          setCalendarItems(getCalendarItems());
          setNotice("Task updated successfully.");
        } else {
          const created = addCalendarTask(taskData);
          setCalendarItems((current) => [...current, created]);
          setNotice("Task added to your list.");
        }
      }

      resetPlannerForm();
    } catch (caughtError) {
      console.error("Could not save calendar item:", caughtError);
      setPlannerError("Could not save this item. Please try again.");
    }
  }

  function handleDeleteItem(item: CalendarItem) {
    const kind = item.type === "event" ? "event" : "task";

    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      deleteCalendarItem(item.id);
      setCalendarItems((current) =>
        current.filter((entry) => entry.id !== item.id),
      );

      if (editingId === item.id) {
        resetPlannerForm();
      }

      setNotice(`${kind === "event" ? "Event" : "Task"} deleted.`);
    } catch (caughtError) {
      console.error("Could not delete calendar item:", caughtError);
      setNotice("Could not delete this item. Please try again.");
    }
  }

  function handleToggleTask(task: CalendarTask) {
    try {
      toggleCalendarTask(task.id, !task.completed);
      setCalendarItems(getCalendarItems());
    } catch (caughtError) {
      console.error("Could not update task:", caughtError);
      setNotice("Could not update this task. Please try again.");
    }
  }

  function ClassEntry({
    item,
    compact = false,
  }: {
    item: (typeof sortedClasses)[number];
    compact?: boolean;
  }) {
    return (
      <div
        className={`rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--surface)] ${
          compact ? "p-2" : "p-3"
        }`}
      >
        <p className="text-xs font-extrabold text-[var(--primary)]">
          {item.start}–{item.end}
        </p>

        <p
          className={`mt-1 break-words font-extrabold text-[var(--ink)] ${
            compact ? "text-xs leading-snug" : "text-base"
          }`}
        >
          {item.name}
        </p>

        <p className="mt-1 text-xs font-bold text-[var(--muted)]">
          {item.type}
        </p>
      </div>
    );
  }

  return (
    <main>
      <header className="mb-7">
        <p className="stat-label">Your time, in one place</p>

        <h1 className="mt-2 text-4xl sm:text-5xl">Calendar</h1>

        <p className="mt-3 max-w-2xl text-[var(--ink-soft)]">
          Plan your recurring classes, one-off commitments and flexible
          tasks in one place.
        </p>
      </header>

      {notice && (
        <div
          role="status"
          className="mb-5 rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary-soft)] p-4 font-extrabold text-[var(--primary-dark)]"
        >
          {notice}
        </div>
      )}

      {/* Weekly class summary */}
      <section className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-2xl border-2 border-[var(--primary-dark)] bg-[var(--surface)] p-3 shadow-[0_3px_0_var(--primary-dark)] sm:p-4">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--muted)]">
            Classes
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-2xl font-bold text-[var(--primary)] sm:text-3xl">
            {classList.length}
          </p>
          <p className="text-xs font-bold text-[var(--ink-soft)]">per week</p>
        </div>

        <div className="rounded-2xl border-2 border-[var(--primary-dark)] bg-[var(--primary-soft)] p-3 shadow-[0_3px_0_var(--primary-dark)] sm:p-4">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--primary)]">
            Busy days
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-2xl font-bold text-[var(--primary)] sm:text-3xl">
            {activeDays}
          </p>
          <p className="text-xs font-bold text-[var(--ink-soft)]">out of 7</p>
        </div>

        <div className="rounded-2xl border-2 border-[var(--primary-dark)] bg-[var(--yellow-soft)] p-3 shadow-[0_3px_0_var(--primary-dark)] sm:p-4">
          <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--primary-dark)]">
            Class time
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-xl font-bold text-[var(--primary-dark)] sm:text-3xl">
            {formatDuration(weeklyMinutes)}
          </p>
          <p className="text-xs font-bold text-[var(--ink-soft)]">per week</p>
        </div>
      </section>

      {/* Weekly timetable */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl">Weekly timetable</h2>
          <p className="mt-1 text-sm font-bold text-[var(--muted)]">
            {todayName
              ? `${todayName} is highlighted`
              : "Preparing your weekly timetable…"}
          </p>
        </div>

        {!showClassForm && (
          <Button
            variant="primary"
            onClick={() => {
              setClassError("");
              setNotice("");
              setShowClassForm(true);
            }}
          >
            + Add class
          </Button>
        )}
      </div>

      {showClassForm && (
        <form
          onSubmit={handleClassSubmit}
          className="card mb-6 space-y-5 bg-[var(--surface)] p-5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl">Add a class</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                Add one of your recurring weekly classes.
              </p>
            </div>

            <Button
              variant="icon"
              aria-label="Close class form"
              onClick={resetClassForm}
            >
              <span aria-hidden="true">✕</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="calendar-class-name" className="mb-1 block text-sm font-extrabold">
                Class name
              </label>
              <input
                id="calendar-class-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Economics"
                required
              />
            </div>

            <div>
              <label htmlFor="calendar-class-type" className="mb-1 block text-sm font-extrabold">
                Type
              </label>
              <select
                id="calendar-class-type"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                {types.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="calendar-class-day" className="mb-1 block text-sm font-extrabold">
                Day
              </label>
              <select
                id="calendar-class-day"
                value={day}
                onChange={(event) => setDay(event.target.value)}
              >
                {days.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="calendar-class-start" className="mb-1 block text-sm font-extrabold">
                Start time
              </label>
              <input
                id="calendar-class-start"
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </div>

            <div>
              <label htmlFor="calendar-class-end" className="mb-1 block text-sm font-extrabold">
                End time
              </label>
              <input
                id="calendar-class-end"
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
              />
            </div>
          </div>

          {classError && (
            <p role="alert" className="rounded-xl bg-[var(--accent-soft)] p-3 font-extrabold text-[var(--accent-dark)]">
              {classError}
            </p>
          )}

          <div className="grid grid-cols-[1fr_2fr] gap-3 border-t border-[var(--border)] pt-5">
            <Button variant="secondary" className="w-full" onClick={resetClassForm}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" className="w-full">
              Save class
            </Button>
          </div>
        </form>
      )}

      {classList.length === 0 ? (
        <section className="card bg-[var(--surface)] p-8 text-center">
          <h2 className="text-2xl">Your week starts here</h2>
          <p className="mt-3 text-[var(--ink-soft)]">
            Add your first recurring class to start building your timetable.
          </p>
          {!showClassForm && (
            <Button
              variant="primary"
              className="mt-5"
              onClick={() => setShowClassForm(true)}
            >
              Add your first class
            </Button>
          )}
        </section>
      ) : (
        <>
          {/* Desktop and tablet: seven-day timetable */}
          <div className="hidden grid-cols-7 gap-2 md:grid">
            {days.map((dayName) => {
              const dayClasses = classesByDay[dayName];
              const isToday = todayName !== null && dayName === todayName;

              return (
                <section
                  key={dayName}
                  className={`min-w-0 rounded-2xl border-2 p-2 ${
                    isToday
                      ? "border-[var(--primary-dark)] bg-[var(--primary-soft)] shadow-[0_4px_0_var(--primary-dark)]"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  <header className="mb-3 border-b border-[var(--border)] pb-2 text-center">
                    <h3 className="text-sm">{dayName.slice(0, 3)}</h3>
                    <p className="mt-1 text-xs font-extrabold text-[var(--muted)]">
                      {dayClasses.length}
                    </p>
                  </header>

                  <div className="space-y-2">
                    {dayClasses.map((item) => (
                      <ClassEntry key={item.id} item={item} compact />
                    ))}
                    {dayClasses.length === 0 && (
                      <p className="py-3 text-center text-xs font-bold text-[var(--muted)]">
                        Free
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Phone: agenda grouped by day */}
          <div className="space-y-3 md:hidden">
            {days.map((dayName) => {
              const dayClasses = classesByDay[dayName];
              const isToday = todayName !== null && dayName === todayName;

              return (
                <section
                  key={dayName}
                  className={`rounded-2xl border-2 p-4 ${
                    isToday
                      ? "border-[var(--primary-dark)] bg-[var(--primary-soft)] shadow-[0_4px_0_var(--primary-dark)]"
                      : "border-[var(--border)] bg-[var(--surface)]"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-xl">{dayName}</h3>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-extrabold ${
                        isToday
                          ? "border-[var(--primary-dark)] bg-[var(--primary)] text-white"
                          : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-soft)]"
                      }`}
                    >
                      {isToday ? "Today · " : ""}
                      {dayClasses.length} {dayClasses.length === 1 ? "class" : "classes"}
                    </span>
                  </div>

                  {dayClasses.length > 0 ? (
                    <div className="space-y-2">
                      {dayClasses.map((item) => (
                        <div key={item.id} className="flex items-stretch gap-3">
                          <div className="flex w-[88px] shrink-0 flex-col justify-center">
                            <p className="text-xs font-extrabold text-[var(--primary)]">
                              {item.start}
                            </p>
                            <p className="text-xs font-bold text-[var(--muted)]">
                              {item.end}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1">
                            <ClassEntry item={item} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-[var(--muted)]">
                      No scheduled classes. Room to breathe.
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* Events and commitments */}
      <section className="mt-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="stat-label">Fixed dates and times</p>
            <h2 className="mt-1 text-2xl">Events & commitments</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Appointments, exams, meetings and other things you need to show up for.
            </p>
          </div>
          <Button variant="primary" onClick={() => openPlannerForm("event")}>
            + Add event
          </Button>
        </div>

        {showPlannerForm && plannerType === "event" && (
          <form onSubmit={handlePlannerSubmit} className="card mb-5 space-y-4 bg-[var(--surface)] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl">{editingId ? "Edit event" : "Add an event"}</h3>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Times are optional for all-day commitments.
                </p>
              </div>
              <Button variant="icon" aria-label="Close event form" onClick={resetPlannerForm}>
                ✕
              </Button>
            </div>

            <div>
              <label htmlFor="planner-event-title" className="mb-1 block text-sm font-extrabold">
                Event title
              </label>
              <input
                id="planner-event-title"
                value={plannerTitle}
                onChange={(event) => setPlannerTitle(event.target.value)}
                placeholder="e.g. Economics exam"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="planner-event-date" className="mb-1 block text-sm font-extrabold">
                  Date
                </label>
                <input
                  id="planner-event-date"
                  type="date"
                  value={eventDate}
                  onChange={(event) => setEventDate(event.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="planner-event-location" className="mb-1 block text-sm font-extrabold">
                  Location (optional)
                </label>
                <input
                  id="planner-event-location"
                  value={eventLocation}
                  onChange={(event) => setEventLocation(event.target.value)}
                  placeholder="e.g. Main campus"
                />
              </div>
              <div>
                <label htmlFor="planner-event-start" className="mb-1 block text-sm font-extrabold">
                  Start time (optional)
                </label>
                <input
                  id="planner-event-start"
                  type="time"
                  value={eventStart}
                  onChange={(event) => setEventStart(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="planner-event-end" className="mb-1 block text-sm font-extrabold">
                  End time (optional)
                </label>
                <input
                  id="planner-event-end"
                  type="time"
                  value={eventEnd}
                  onChange={(event) => setEventEnd(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="planner-event-notes" className="mb-1 block text-sm font-extrabold">
                Notes (optional)
              </label>
              <textarea
                id="planner-event-notes"
                value={eventNotes}
                onChange={(event) => setEventNotes(event.target.value)}
                placeholder="Anything you need to remember..."
                rows={3}
              />
            </div>

            {plannerError && (
              <p role="alert" className="rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-extrabold text-[var(--accent-dark)]">
                {plannerError}
              </p>
            )}

            <div className="grid grid-cols-[1fr_2fr] gap-3 border-t border-[var(--border)] pt-4">
              <Button variant="secondary" onClick={resetPlannerForm}>Cancel</Button>
              <Button variant="primary" type="submit">
                {editingId ? "Save changes" : "Save event"}
              </Button>
            </div>
          </form>
        )}

        {calendarEvents.length === 0 ? (
          <div className="card bg-[var(--surface)] p-6 text-center">
            <h3 className="text-lg">Nothing on the events list yet</h3>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Add an exam, appointment, meeting or another commitment.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {calendarEvents.map((item) => (
              <article key={item.id} className="card bg-[var(--surface)] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--accent-dark)]">
                      {formatDate(item.date)}
                    </p>
                    <h3 className="mt-1 break-words text-xl">{item.title}</h3>
                    <p className="mt-1 text-sm font-bold text-[var(--primary)]">
                      {item.startTime
                        ? `${item.startTime}${item.endTime ? `–${item.endTime}` : ""}`
                        : "Time not set"}
                    </p>
                    {item.location && (
                      <p className="mt-2 text-sm text-[var(--ink-soft)]">
                        <strong>Location:</strong> {item.location}
                      </p>
                    )}
                    {item.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
                        {item.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" onClick={() => openPlannerForm("event", item)}>
                      Edit
                    </Button>
                    <Button variant="destructive" onClick={() => handleDeleteItem(item)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Flexible tasks */}
      <section className="mt-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="stat-label">Work around your schedule</p>
            <h2 className="mt-1 text-2xl">Tasks & to-dos</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Flexible work with deadlines and priorities, not fixed calendar slots.
            </p>
          </div>
          <Button variant="primary" onClick={() => openPlannerForm("task")}>
            + Add task
          </Button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border-2 border-[var(--primary-dark)] bg-[var(--primary-soft)] p-3 shadow-[0_3px_0_var(--primary-dark)]">
            <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--primary)]">
              To do
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--primary-dark)]">
              {openTaskCount}
            </p>
          </div>
          <div className="rounded-2xl border-2 border-[var(--primary-dark)] bg-[var(--yellow-soft)] p-3 shadow-[0_3px_0_var(--primary-dark)]">
            <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--primary-dark)]">
              Completed
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--primary-dark)]">
              {calendarTasks.length - openTaskCount}
            </p>
          </div>
        </div>

        {showPlannerForm && plannerType === "task" && (
          <form onSubmit={handlePlannerSubmit} className="card mb-5 space-y-4 bg-[var(--surface)] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl">{editingId ? "Edit task" : "Add a task"}</h3>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  Add a deadline if there is one. You can leave it blank for flexible tasks.
                </p>
              </div>
              <Button variant="icon" aria-label="Close task form" onClick={resetPlannerForm}>
                ✕
              </Button>
            </div>

            <div>
              <label htmlFor="planner-task-title" className="mb-1 block text-sm font-extrabold">
                Task title
              </label>
              <input
                id="planner-task-title"
                value={plannerTitle}
                onChange={(event) => setPlannerTitle(event.target.value)}
                placeholder="e.g. Finish Economics assignment"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="planner-task-due" className="mb-1 block text-sm font-extrabold">
                  Due date (optional)
                </label>
                <input
                  id="planner-task-due"
                  type="date"
                  value={taskDueDate}
                  onChange={(event) => setTaskDueDate(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="planner-task-priority" className="mb-1 block text-sm font-extrabold">
                  Priority
                </label>
                <select
                  id="planner-task-priority"
                  value={taskPriority}
                  onChange={(event) => setTaskPriority(event.target.value as CalendarTask["priority"])}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="planner-task-minutes" className="mb-1 block text-sm font-extrabold">
                  Estimated minutes (optional)
                </label>
                <input
                  id="planner-task-minutes"
                  type="number"
                  min="1"
                  step="5"
                  value={taskMinutes}
                  onChange={(event) => setTaskMinutes(event.target.value)}
                  placeholder="e.g. 45"
                />
              </div>
            </div>

            <div>
              <label htmlFor="planner-task-notes" className="mb-1 block text-sm font-extrabold">
                Notes (optional)
              </label>
              <textarea
                id="planner-task-notes"
                value={taskNotes}
                onChange={(event) => setTaskNotes(event.target.value)}
                placeholder="Steps, details or reminders..."
                rows={3}
              />
            </div>

            {plannerError && (
              <p role="alert" className="rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-extrabold text-[var(--accent-dark)]">
                {plannerError}
              </p>
            )}

            <div className="grid grid-cols-[1fr_2fr] gap-3 border-t border-[var(--border)] pt-4">
              <Button variant="secondary" onClick={resetPlannerForm}>Cancel</Button>
              <Button variant="primary" type="submit">
                {editingId ? "Save changes" : "Save task"}
              </Button>
            </div>
          </form>
        )}

        {calendarTasks.length === 0 ? (
          <div className="card bg-[var(--surface)] p-6 text-center">
            <h3 className="text-lg">A little room for your to-dos</h3>
            <p className="mt-2 text-sm text-[var(--ink-soft)]">
              Add an assignment, revision task, errand or anything else you need to finish.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {calendarTasks.map((item) => (
              <article
                key={item.id}
                className={`card bg-[var(--surface)] p-4 sm:p-5 ${
                  item.completed ? "opacity-75" : ""
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Mark ${item.title} ${item.completed ? "incomplete" : "complete"}`}
                      checked={item.completed}
                      onChange={() => handleToggleTask(item)}
                      className="mt-1 h-5 w-5 shrink-0 accent-[var(--primary)]"
                    />

                    <div className="min-w-0 flex-1">
                      <h3 className={`break-words text-lg ${item.completed ? "line-through" : ""}`}>
                        {item.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-extrabold">
                        <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[var(--ink-soft)]">
                          {item.dueDate ? `Due ${formatDate(item.dueDate)}` : "No due date"}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-1 ${
                            item.priority === "high"
                              ? "border-[var(--accent-dark)] bg-[var(--accent-soft)] text-[var(--accent-dark)]"
                              : item.priority === "medium"
                                ? "border-[var(--primary-dark)] bg-[var(--primary-soft)] text-[var(--primary-dark)]"
                                : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-soft)]"
                          }`}
                        >
                          {item.priority[0].toUpperCase() + item.priority.slice(1)} priority
                        </span>
                        {item.estimatedMinutes != null && (
                          <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[var(--ink-soft)]">
                            {formatDuration(item.estimatedMinutes)}
                          </span>
                        )}
                        {item.completed && (
                          <span className="rounded-full border border-[var(--primary-dark)] bg-[var(--primary-soft)] px-2 py-1 text-[var(--primary-dark)]">
                            Completed
                          </span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">
                          {item.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2 pl-8 sm:pl-0">
                    <Button variant="secondary" onClick={() => openPlannerForm("task", item)}>
                      Edit
                    </Button>
                    <Button variant="destructive" onClick={() => handleDeleteItem(item)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
