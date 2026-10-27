
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
} from "react";

import Button from "@/app/components/Button";
import CalendarOverview from "@/app/components/CalendarOverview";
import { addClass, getClasses, updateClassStudyUnit } from "@/lib/classStorage";
import type { ClassItem } from "@/lib/classes";
import {
  addCalendarEvent,
  addCalendarTask,
  deleteCalendarItem,
  getCalendarItems,
  setCalendarTaskOccurrenceCompleted,
  toggleCalendarTask,
  updateCalendarItem,
  type CalendarEvent,
  type CalendarItem,
  type CalendarTask,
  type EventRecurrence,
  type TaskRecurrence,
  type WeekdayName,
} from "@/lib/calendarItemStorage";
import { useCloudStudyState } from "@/lib/studyMvp/useCloudStudyState";

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
type RecurrenceFrequency = "none" | EventRecurrence["frequency"];

const recurrenceDays: WeekdayName[] = [
  "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday", "Sunday",
];
type ManagementTab = "events" | "tasks";

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

function recurrenceSignature(
  recurrence?: EventRecurrence | TaskRecurrence,
  taskStartDate?: string,
): string {
  if (!recurrence) return "none";

  return JSON.stringify({
    frequency: recurrence.frequency,
    interval: recurrence.interval,
    weekdays: [...(recurrence.weekdays ?? [])].sort(),
    until: recurrence.until ?? "",
    startDate:
      taskStartDate ??
      ("startDate" in recurrence ? recurrence.startDate : undefined) ??
      "",
  });
}

function recurrenceSummary(
  recurrence?: EventRecurrence | TaskRecurrence,
): string {
  if (!recurrence) return "";

  const unit =
    recurrence.frequency === "daily"
      ? "day"
      : recurrence.frequency === "weekly"
        ? "week"
        : "month";

  const base =
    recurrence.interval === 1
      ? `Repeats ${unit === "day" ? "daily" : unit === "week" ? "weekly" : "monthly"}`
      : `Repeats every ${recurrence.interval} ${unit}s`;

  const weekdays =
    recurrence.frequency === "weekly" && recurrence.weekdays?.length
      ? ` on ${recurrence.weekdays.join(", ")}`
      : "";

  return `${base}${weekdays}${recurrence.until ? ` · until ${formatDate(recurrence.until)}` : ""}`;
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) return `${remainder} min`;
  if (remainder === 0) return `${hours} hr`;

  return `${hours} hr ${remainder} min`;
}

export default function ClassesPage() {
  const {
    state: studyState,
    cloudSyncStatus: studyCloudSyncStatus,
    syncConflict: studySyncConflict,
  } = useCloudStudyState();

  const studyLinksReady = Boolean(
    studyState &&
    !studySyncConflict &&
    (studyCloudSyncStatus === "ready" ||
      studyCloudSyncStatus === "synced"),
  );
  const studyUnits = studyState?.units ?? [];

  const studyLinkBlockReason = studySyncConflict
    ? "Study has a browser/cloud conflict. Resolve it on the Study page before editing class links."
    : studyCloudSyncStatus === "migration"
      ? "Study cloud migration needs approval. Open Study and approve migration before creating links."
      : !studyState || !studyLinksReady
        ? `Study catalog is ${studyCloudSyncStatus}. Linking is disabled until the catalog is ready.`
        : studyUnits.length === 0
          ? "No Study Units are available yet. Create or import Units on the Study page, or leave classes unlinked."
          : "";

  function getStudyUnitLabel(studyUnitId?: string): string {
    if (!studyUnitId) return "No Study Unit linked";

    if (!studyState || !studyLinksReady) {
      return `Saved Study Unit link (${studyUnitId}); catalog not ready`;
    }

    const unit = studyState.units.find((item) => item.id === studyUnitId);
    if (!unit) return `Unavailable Study Unit (${studyUnitId})`;

    const course = studyState.courses.find(
      (item) => item.id === unit.course_id,
    );

    return `${course?.code ?? course?.name ?? "Course"} · ${unit.code} — ${unit.name}`;
  }

  const [classList, setClassList] = useState(getClasses);
  const [selectedClassOverviewDay, setSelectedClassOverviewDay] = useState("Monday");
  const [showClassForm, setShowClassForm] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState("Lecture");
  const [day, setDay] = useState("Monday");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [studyUnitId, setStudyUnitId] = useState("");
  const [classError, setClassError] = useState("");
  const [studyLinkError, setStudyLinkError] = useState("");
  const [notice, setNotice] = useState("");

  // Calendar events and tasks
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [showPlannerForm, setShowPlannerForm] = useState(false);
  const [plannerType, setPlannerType] = useState<PlannerFormType>("event");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [plannerError, setPlannerError] = useState("");
  const [managementTab, setManagementTab] = useState<ManagementTab>("events");
  const [expandedTaskTitles, setExpandedTaskTitles] = useState<Set<string>>(() => new Set());
  const [searchHighlightCalendarId, setSearchHighlightCalendarId] =
    useState<string | null>(null);
  const [searchHighlightClassId, setSearchHighlightClassId] =
    useState<number | null>(null);
  const plannerFormRef = useRef<HTMLFormElement | null>(null);
  const classFormRef = useRef<HTMLFormElement | null>(null);

  const [plannerTitle, setPlannerTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventNotes, setEventNotes] = useState("");
  const [eventRepeatFrequency, setEventRepeatFrequency] =
    useState<RecurrenceFrequency>("none");
  const [eventRepeatInterval, setEventRepeatInterval] = useState("1");
  const [eventRepeatWeekdays, setEventRepeatWeekdays] =
    useState<WeekdayName[]>([]);
  const [eventRepeatUntil, setEventRepeatUntil] = useState("");

  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskRepeatStartDate, setTaskRepeatStartDate] = useState("");
  const [taskPriority, setTaskPriority] =
    useState<CalendarTask["priority"]>("medium");
  const [taskMinutes, setTaskMinutes] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskRepeatFrequency, setTaskRepeatFrequency] =
    useState<RecurrenceFrequency>("none");
  const [taskRepeatInterval, setTaskRepeatInterval] = useState("1");
  const [taskRepeatWeekdays, setTaskRepeatWeekdays] =
    useState<WeekdayName[]>([]);
  const [taskRepeatUntil, setTaskRepeatUntil] = useState("");

  useEffect(() => {
    setCalendarItems(getCalendarItems());
    setSelectedClassOverviewDay(days[(new Date().getDay() + 6) % 7]);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const calendarTargetId = params.get("findCalendarItemId");

    if (calendarTargetId) {
      const item = calendarItems.find(
        (candidate) => candidate.id === calendarTargetId,
      );

      if (!item) return;

      setSearchHighlightCalendarId(item.id);
      setManagementTab(item.type === "event" ? "events" : "tasks");
      window.history.replaceState({}, "", "/classes");

      window.setTimeout(() => {
        document
          .getElementById(`calendar-item-${item.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
      return;
    }

    const classTargetValue = params.get("findClassId");
    if (!classTargetValue) return;

    const classTargetId = Number(classTargetValue);
    if (!Number.isFinite(classTargetId)) return;

    const classItem = classList.find(
      (candidate) => candidate.id === classTargetId,
    );
    if (!classItem) return;

    setSearchHighlightClassId(classItem.id);
    setSelectedClassOverviewDay(classItem.day);
    window.history.replaceState({}, "", "/classes");

    window.setTimeout(() => {
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      const target = document.getElementById(
        isMobile
          ? `class-record-mobile-${classItem.id}`
          : `class-record-${classItem.id}`,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [calendarItems, classList]);

  useEffect(() => {
    if (!showPlannerForm) return;

    const frame = window.requestAnimationFrame(() => {
      plannerFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [showPlannerForm, plannerType, editingId, managementTab]);

  const sortedClasses = useMemo(() => {
    return [...classList].sort(
      (a, b) =>
        days.indexOf(a.day) - days.indexOf(b.day) ||
        a.start.localeCompare(b.start),
    );
  }, [classList]);



  const activeDays = new Set(classList.map((item) => item.day)).size;

  const weeklyMinutes = classList.reduce((total, item) => {
    const [startHour, startMinute] = item.start.split(":").map(Number);
    const [endHour, endMinute] = item.end.split(":").map(Number);

    const duration =
      endHour * 60 +
      endMinute -
      (startHour * 60 + startMinute);

    return total + Math.max(0, duration);
  }, 0);


  useEffect(() => {
    let lastTrigger: HTMLElement | null = null;

    const getMenus = () =>
      Array.from(
        document.querySelectorAll<HTMLDetailsElement>(
          "details[data-smart-menu]",
        ),
      );

    const getPanel = (menu: HTMLDetailsElement): HTMLElement | null => {
      const trigger = menu.querySelector(":scope > summary");
      const panel = trigger?.nextElementSibling;

      return panel instanceof HTMLElement ? panel : null;
    };

    const clearPanelPosition = (menu: HTMLDetailsElement) => {
      getPanel(menu)?.removeAttribute("style");
    };

    const closeAllMenus = () => {
      for (const menu of getMenus()) {
        if (menu.open) menu.open = false;
        clearPanelPosition(menu);
      }
    };

    const handleToggle = (event: Event) => {
      const menu = event.target;
      if (
        !(menu instanceof HTMLDetailsElement) ||
        !menu.hasAttribute("data-smart-menu")
      ) {
        return;
      }

      if (!menu.open) {
        clearPanelPosition(menu);
        return;
      }

      for (const other of getMenus()) {
        if (other !== menu && other.open) {
          other.open = false;
          clearPanelPosition(other);
        }
      }

      const trigger = menu.querySelector(":scope > summary");
      lastTrigger = trigger instanceof HTMLElement ? trigger : null;

      clearPanelPosition(menu);
    };

    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("details[data-smart-menu]")
      ) {
        return;
      }

      closeAllMenus();
    };

    const handleMenuAction = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-smart-menu-panel] button, [data-smart-menu-panel] a")
      ) {
        // Run after the action's own click handler.
        window.setTimeout(closeAllMenus, 0);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      const hasOpenMenu = getMenus().some((menu) => menu.open);
      if (!hasOpenMenu) return;

      closeAllMenus();
      lastTrigger?.focus();
    };

    document.addEventListener("toggle", handleToggle, true);
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    document.addEventListener("click", handleMenuAction);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("toggle", handleToggle, true);
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
      document.removeEventListener("click", handleMenuAction);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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

  const resetClassForm = useCallback(() => {
    setName("");
    setType("Lecture");
    setDay("Monday");
    setStart("");
    setEnd("");
    setStudyUnitId("");
    setClassError("");
    setStudyLinkError("");
    setShowClassForm(false);
  }, []);

  function handleClassStudyUnitChange(
    classId: number,
    selectedUnitId: string,
  ) {
    setStudyLinkError("");
    setClassError("");
    setNotice("");

    if (!studyLinksReady || !studyState) {
      setStudyLinkError(
        studyLinkBlockReason ||
          "Study is not ready. No class link was changed.",
      );
      return;
    }

    if (
      selectedUnitId &&
      !studyState.units.some((unit) => unit.id === selectedUnitId)
    ) {
      setStudyLinkError(
        "That Study Unit is no longer available. Refresh Study and choose an available Unit.",
      );
      return;
    }

    try {
      const updatedClasses = updateClassStudyUnit(
        classId,
        selectedUnitId || undefined,
      );
      setClassList(updatedClasses);

      const updatedClass = updatedClasses.find(
        (item) => item.id === classId,
      );

      const selectedUnit = studyState.units.find(
        (unit) => unit.id === selectedUnitId,
      );

      setNotice(
        selectedUnit
          ? `Linked ${updatedClass?.name ?? "class"} to ${selectedUnit.name}.`
          : `Removed the Study Unit link from ${updatedClass?.name ?? "class"}.`,
      );
    } catch (error) {
      setStudyLinkError(
        error instanceof Error
          ? error.message
          : "Could not update the class link.",
      );
    }
  }

  function renderStudyUnitLinkSelect(item: ClassItem) {
    return (
      <div className="mt-2 min-w-0 space-y-1">
        {item.studyUnitId && (
          <p className="break-words text-[10px] font-semibold text-[var(--primary-dark)]">
            {getStudyUnitLabel(item.studyUnitId)}
          </p>
        )}
        <label className="block">
          <span className="sr-only">Study Unit link for {item.name}</span>
          <select
            aria-label={`Study Unit link for ${item.name}`}
            value={item.studyUnitId ?? ""}
            disabled={!studyLinksReady}
            onChange={(event) =>
              handleClassStudyUnitChange(item.id, event.target.value)
            }
            className="w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-1 py-1 text-[10px] font-semibold"
          >
            <option value="">No Study Unit linked</option>
            {item.studyUnitId &&
              !studyUnits.some((unit) => unit.id === item.studyUnitId) && (
                <option value={item.studyUnitId}>
                  Saved Unit ID — {item.studyUnitId} (unavailable)
                </option>
              )}
            {studyUnits.map((unit) => {
              const course = studyState?.courses.find(
                (candidate) => candidate.id === unit.course_id,
              );
              return (
                <option key={unit.id} value={unit.id}>
                  {course?.code ?? course?.name ?? "Course"} · {unit.code} — {unit.name}
                </option>
              );
            })}
          </select>
        </label>
      </div>
    );
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

    if (
      studyUnitId &&
      (
        !studyLinksReady ||
        !studyState ||
        !studyState.units.some((unit) => unit.id === studyUnitId)
      )
    ) {
      setClassError(
        studyLinkBlockReason ||
          "The selected Study Unit is no longer available. Choose another Unit or leave the class unlinked.",
      );
      return;
    }

    try {
      const createdClass = addClass({
        name: name.trim(),
        type,
        day,
        start,
        end,
        studyUnitId: studyUnitId || undefined,
      });

      setClassList((current) => [...current, createdClass]);
      setNotice(`${createdClass.name} has been added to your timetable.`);
      resetClassForm();
    } catch (caughtError) {
      console.error("Could not save class:", caughtError);
      setClassError("The class could not be saved. Please try again.");
    }
  }

  const resetPlannerForm = useCallback(() => {
    setShowPlannerForm(false);
    setEditingId(null);
    setPlannerError("");
    setPlannerTitle("");
    setEventDate("");
    setEventStart("");
    setEventEnd("");
    setEventLocation("");
    setEventNotes("");
    setEventRepeatFrequency("none");
    setEventRepeatInterval("1");
    setEventRepeatWeekdays([]);
    setEventRepeatUntil("");
    setTaskDueDate("");
    setTaskRepeatStartDate("");
    setTaskPriority("medium");
    setTaskMinutes("");
    setTaskNotes("");
    setTaskRepeatFrequency("none");
    setTaskRepeatInterval("1");
    setTaskRepeatWeekdays([]);
    setTaskRepeatUntil("");
  }, []);

  useEffect(() => {
    if (!showClassForm && !showPlannerForm) return;

    function closeOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        classFormRef.current?.contains(target) ||
        plannerFormRef.current?.contains(target)
      ) return;
      if (showClassForm) resetClassForm();
      if (showPlannerForm) resetPlannerForm();
    }

    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [
    showClassForm,
    showPlannerForm,
    resetClassForm,
    resetPlannerForm,
  ]);

  function switchManagementTab(tab: ManagementTab) {
    resetPlannerForm();
    setShowClassForm(false);
    setManagementTab(tab);
  }

  function openPlannerForm(
    kind: PlannerFormType,
    item?: CalendarItem,
    defaultDate?: string,
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
      setEventRepeatFrequency(item.recurrence?.frequency ?? "none");
      setEventRepeatInterval(String(item.recurrence?.interval ?? 1));
      setEventRepeatWeekdays(item.recurrence?.weekdays ?? []);
      setEventRepeatUntil(item.recurrence?.until ?? "");
    } else {
      setEventDate(defaultDate ?? localDateString());
      setEventStart("");
      setEventEnd("");
      setEventLocation("");
      setEventNotes("");
      setEventRepeatFrequency("none");
      setEventRepeatInterval("1");
      setEventRepeatWeekdays([]);
      setEventRepeatUntil("");
    }

    if (item?.type === "task") {
      setTaskDueDate(item.dueDate ?? "");
      setTaskRepeatStartDate(
        item.recurrence?.startDate ??
          item.dueDate ??
          defaultDate ??
          new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 10),
      );
      setTaskPriority(item.priority);
      setTaskMinutes(
        item.estimatedMinutes != null
          ? String(item.estimatedMinutes)
          : "",
      );
      setTaskNotes(item.notes ?? "");
      setTaskRepeatFrequency(item.recurrence?.frequency ?? "none");
      setTaskRepeatInterval(String(item.recurrence?.interval ?? 1));
      setTaskRepeatWeekdays(item.recurrence?.weekdays ?? []);
      setTaskRepeatUntil(item.recurrence?.until ?? "");
    } else {
      setTaskDueDate(defaultDate ?? "");
      setTaskRepeatStartDate(
        defaultDate ??
          new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 10),
      );
      setTaskPriority("medium");
      setTaskMinutes("");
      setTaskNotes("");
      setTaskRepeatFrequency("none");
      setTaskRepeatInterval("1");
      setTaskRepeatWeekdays([]);
      setTaskRepeatUntil("");
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

        const interval = Number(eventRepeatInterval);

        if (
          eventRepeatFrequency !== "none" &&
          (!Number.isInteger(interval) || interval < 1)
        ) {
          setPlannerError("The repeat interval must be a positive whole number.");
          return;
        }

        if (
          eventRepeatFrequency !== "none" &&
          eventRepeatUntil &&
          eventRepeatUntil < eventDate
        ) {
          setPlannerError("The repeat end date cannot be before the event date.");
          return;
        }

        const recurrence: EventRecurrence | undefined =
          eventRepeatFrequency === "none"
            ? undefined
            : {
                frequency: eventRepeatFrequency,
                interval,
                ...(eventRepeatFrequency === "weekly" &&
                eventRepeatWeekdays.length > 0
                  ? { weekdays: eventRepeatWeekdays }
                  : {}),
                ...(eventRepeatUntil ? { until: eventRepeatUntil } : {}),
              };

        const existingEvent =
          existing?.type === "event" ? existing : undefined;

        const keepEventExceptions =
          existingEvent?.date === eventDate &&
          recurrenceSignature(existingEvent?.recurrence) ===
            recurrenceSignature(recurrence);

        const eventData = {
          title: plannerTitle.trim(),
          date: eventDate,
          startTime: eventStart || undefined,
          endTime: eventEnd || undefined,
          location: eventLocation.trim() || undefined,
          notes: eventNotes.trim() || undefined,
          recurrence,
          exceptions: keepEventExceptions
            ? existingEvent?.exceptions ?? []
            : [],
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

        if (taskRepeatFrequency !== "none" && !taskRepeatStartDate) {
          setPlannerError("Choose a start date for this recurring task.");
          return;
        }

        const taskInterval = Number(taskRepeatInterval);

        if (
          taskRepeatFrequency !== "none" &&
          (!Number.isInteger(taskInterval) || taskInterval < 1)
        ) {
          setPlannerError("The repeat interval must be a positive whole number.");
          return;
        }

        if (
          taskRepeatFrequency !== "none" &&
          taskRepeatUntil &&
          taskRepeatUntil < taskRepeatStartDate
        ) {
          setPlannerError("The repeat end date cannot be before the recurrence start date.");
          return;
        }

        const recurrence: TaskRecurrence | undefined =
          taskRepeatFrequency === "none"
            ? undefined
            : {
                frequency: taskRepeatFrequency,
                interval: taskInterval,
                startDate: taskRepeatStartDate,
                ...(taskRepeatFrequency === "weekly" &&
                taskRepeatWeekdays.length > 0
                  ? { weekdays: taskRepeatWeekdays }
                  : {}),
                ...(taskRepeatUntil ? { until: taskRepeatUntil } : {}),
              };

        const existingTask =
          existing?.type === "task" ? existing : undefined;

        const existingTaskStartDate =
          existingTask?.recurrence?.startDate ?? existingTask?.dueDate;
        const keepTaskExceptions =
          existingTaskStartDate === (taskRepeatStartDate || undefined) &&
          recurrenceSignature(
            existingTask?.recurrence,
            existingTaskStartDate,
          ) === recurrenceSignature(recurrence, taskRepeatStartDate || undefined);

        const taskData = {
          title: plannerTitle.trim(),
          dueDate: taskDueDate || undefined,
          priority: taskPriority,
          estimatedMinutes: parsedMinutes,
          notes: taskNotes.trim() || undefined,
          completed: existingTask?.completed ?? false,
          recurrence,
          exceptions: keepTaskExceptions
            ? existingTask?.exceptions ?? []
            : [],
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

  function handleToggleTask(
    task: CalendarTask,
    occurrenceDate?: string,
    currentCompleted?: boolean,
  ) {
    try {
      if (task.recurrence && occurrenceDate) {
        setCalendarTaskOccurrenceCompleted(
          task.id,
          occurrenceDate,
          !(currentCompleted ?? task.completed),
        );
      } else {
        toggleCalendarTask(task.id, !task.completed);
      }

      setCalendarItems(getCalendarItems());
    } catch (caughtError) {
      console.error("Could not update task:", caughtError);
      setNotice("Could not update this task. Please try again.");
    }
  }

  return (
    <main>
      <header className="mb-5">
        <h1 className="text-3xl sm:text-4xl">Calendar</h1>
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
            Time
          </p>
          <p className="mt-2 whitespace-nowrap font-[var(--font-heading)] text-[11px] font-bold leading-tight tracking-tight text-[var(--primary-dark)] sm:text-2xl">
            {formatDuration(weeklyMinutes)}
          </p>
          <p className="text-xs font-bold text-[var(--ink-soft)]">per week</p>
        </div>
      </section>

      {studyLinkError && (
        <p
          role="alert"
          className="mb-3 rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-extrabold text-[var(--accent-dark)]"
        >
          {studyLinkError}
        </p>
      )}

      <CalendarOverview
        classes={classList}
        getStudyUnitLabel={getStudyUnitLabel}
        events={calendarEvents}
        tasks={calendarTasks}
        onAddEvent={(date) => {
          setShowClassForm(false);
          setManagementTab("events");
          openPlannerForm("event", undefined, date);
        }}
        onAddTask={(date) => {
          setShowClassForm(false);
          setManagementTab("tasks");
          openPlannerForm("task", undefined, date);
        }}
        onEditEvent={(item) => {
          setShowClassForm(false);
          setManagementTab("events");
          openPlannerForm("event", item);
        }}
        onEditTask={(item) => {
          setShowClassForm(false);
          setManagementTab("tasks");
          openPlannerForm("task", item);
        }}
        onDeleteItem={handleDeleteItem}
        onToggleTask={handleToggleTask}
      />

      {/* Calendar management: one tab visible at a time */}
      <section className="mt-7">
        <div className="mb-3">
          <p className="stat-label">Manage your plan</p>
          <h2 className="mt-1 text-xl sm:text-2xl">Classes, events & tasks</h2>
        </div>

        <details className="mb-5 overflow-hidden rounded-2xl border-2 border-[var(--primary-dark)] bg-[var(--surface)]">
          <summary className="cursor-pointer list-none bg-[var(--primary-soft)] px-4 py-3 font-bold text-[var(--primary-dark)]">
            Manage weekly classes
            <span className="mt-1 block text-sm font-normal text-[var(--ink-soft)]">
              Edit your recurring class schedule.
            </span>
          </summary>
          <div className="space-y-4 px-3 pb-4 pt-3 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="mt-1 text-lg font-semibold">Your classes</h3>
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
          ref={classFormRef}
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

            <div className="sm:col-span-2">
              <label htmlFor="calendar-class-study-unit" className="mb-1 block text-sm font-extrabold">
                Linked Study Unit (optional)
              </label>
              <select
                id="calendar-class-study-unit"
                value={studyUnitId}
                disabled={!studyLinksReady}
                onChange={(event) => {
                  setStudyUnitId(event.target.value);
                  setStudyLinkError("");
                }}
              >
                <option value="">No Study Unit linked</option>
                {studyUnitId &&
                  !studyUnits.some((unit) => unit.id === studyUnitId) && (
                    <option value={studyUnitId}>
                      Saved Unit ID — ${studyUnitId} (unavailable)
                    </option>
                  )}
                {studyUnits.map((unit) => {
                  const course = studyState?.courses.find(
                    (item) => item.id === unit.course_id,
                  );
                  return (
                    <option key={unit.id} value={unit.id}>
                      {course?.code ?? course?.name ?? "Course"} · {unit.code} — {unit.name}
                    </option>
                  );
                })}
              </select>
              <p className="mt-1 text-xs text-[var(--muted)]">
                The link uses the Study Unit ID, so renaming a Unit will not break the relationship.
              </p>
              {studyLinkBlockReason && (
                <p className="mt-2 text-sm font-semibold text-[var(--ink-soft)]">
                  {studyLinkBlockReason}
                </p>
              )}
              {studyLinkError && (
                <p role="alert" className="mt-2 rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-extrabold text-[var(--accent-dark)]">
                  {studyLinkError}
                </p>
              )}
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

          <div className="flex justify-end border-t border-[var(--border)] pt-5">
            <Button variant="primary" type="submit" className="w-full sm:w-auto">
              Save class
            </Button>
          </div>
        </form>
      )}

            {classList.length === 0 ? (
              <div className="card bg-[var(--surface)] p-6 text-center">
                <h3 className="text-lg">No classes added yet</h3>
                <p className="mt-2 text-sm text-[var(--ink-soft)]">
                  Add a recurring weekly class to start building your schedule.
                </p>
              </div>
            ) : (
              <>
              <div className="hidden grid-cols-7 gap-2 md:grid">
                {days.map((dayName) => {
                  const dayClasses = sortedClasses.filter(
                    (item) => item.day === dayName,
                  );

                  return (
                    <section
                      key={dayName}
                      className="min-w-0 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-2"
                    >
                      <header className="mb-3 border-b border-[var(--border)] pb-2 text-center">
                        <h4 className="text-sm font-extrabold">
                          {dayName.slice(0, 3)}
                        </h4>
                        <p className="mt-1 text-xs font-extrabold text-[var(--muted)]">
                          {dayClasses.length} {dayClasses.length === 1 ? "class" : "classes"}
                        </p>
                      </header>
                      <div className="space-y-2">
                        {dayClasses.map((item) => (
                          <article
                            key={item.id}
                            id={`class-record-${item.id}`}
                            className={`rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary-soft)] p-2 ${
                              searchHighlightClassId === item.id
                                ? "ring-2 ring-[var(--accent)]"
                                : ""
                            }`}
                          >
                            <p className="text-xs font-extrabold text-[var(--primary-dark)]">
                              {item.start}–{item.end}
                            </p>
                            <p className="mt-1 break-words text-xs font-extrabold text-[var(--ink)]">
                              {item.name}
                            </p>
                            <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                              {item.type}
                            </p>
                            {renderStudyUnitLinkSelect(item)}
                          </article>
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

              <div className="space-y-2 md:hidden">
                <div role="group" aria-label="Choose class day" className="grid grid-cols-7 gap-1">
                  {days.map((dayName) => {
                    const classCount = sortedClasses.filter((item) => item.day === dayName).length;
                    const selected = selectedClassOverviewDay === dayName;

                    return (
                      <button
                        key={dayName}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${dayName}, ${classCount} ${classCount === 1 ? "class" : "classes"}`}
                        onClick={() => setSelectedClassOverviewDay(dayName)}
                        className={`min-w-0 rounded-lg border px-0.5 py-1.5 text-center ${
                          selected
                            ? "border-[var(--primary-dark)] bg-[var(--primary-soft)] text-[var(--primary-dark)]"
                            : "border-[var(--border)] bg-transparent text-[var(--ink-soft)]"
                        }`}
                      >
                        <span className="block text-[10px] font-semibold">{dayName.slice(0, 3)}</span>
                        <span className={`mx-auto mt-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          classCount > 0 ? "bg-[var(--surface)]" : "opacity-60"
                        }`}>
                          {classCount}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold">{selectedClassOverviewDay}</h4>
                    <span className="text-xs text-[var(--muted)]">
                      {sortedClasses.filter((item) => item.day === selectedClassOverviewDay).length} classes
                    </span>
                  </div>

                  {sortedClasses.some((item) => item.day === selectedClassOverviewDay) ? (
                    <div>
                      {sortedClasses
                        .filter((item) => item.day === selectedClassOverviewDay)
                        .map((item) => (
                          <div
                            key={item.id}
                            id={`class-record-mobile-${item.id}`}
                            className={`flex items-center gap-3 border-b border-[var(--border)] py-2 ${
                              searchHighlightClassId === item.id
                                ? "rounded-lg bg-[var(--primary-soft)] px-2 ring-2 ring-[var(--accent)]"
                                : ""
                            }`}
                          >
                            <p className="w-24 shrink-0 text-xs font-semibold text-[var(--primary-dark)]">
                              {item.start}–{item.end}
                            </p>
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-medium text-[var(--ink)]">
                                {item.name}
                              </p>
                              <p className="mt-0.5 text-xs text-[var(--muted)]">
                                {item.type}
                              </p>
                              {renderStudyUnitLinkSelect(item)}
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="py-3 text-sm text-[var(--muted)]">
                      No scheduled classes. Room to breathe.
                    </p>
                  )}
                </div>

              </div>
                </>
            )}
          </div>
        </details>

        <div
          role="tablist"
          aria-label="Manage calendar items"
          className="mb-5 flex gap-1 rounded-full border-2 border-[var(--border)] bg-[var(--surface)] p-1"
        >
          <button
            id="calendar-tab-events"
            type="button"
            role="tab"
            aria-selected={managementTab === "events"}
            aria-controls="calendar-panel-events"
            onClick={() => switchManagementTab("events")}
            className={`calendar-management-tab flex-1 rounded-full px-3 py-1.5 text-sm font-extrabold transition sm:px-4 ${
              managementTab === "events"
                ? "bg-[var(--primary)] text-white shadow-sm"
                : "text-[var(--muted)] hover:bg-[var(--primary-soft)]"
            }`}
          >
            Events
          </button>
          <button
            id="calendar-tab-tasks"
            type="button"
            role="tab"
            aria-selected={managementTab === "tasks"}
            aria-controls="calendar-panel-tasks"
            onClick={() => switchManagementTab("tasks")}
            className={`calendar-management-tab flex-1 rounded-full px-3 py-1.5 text-sm font-extrabold transition sm:px-4 ${
              managementTab === "tasks"
                ? "bg-[var(--primary)] text-white shadow-sm"
                : "text-[var(--muted)] hover:bg-[var(--primary-soft)]"
            }`}
          >
            Tasks
          </button>
        </div>

        {managementTab === "events" && (
          <div
            id="calendar-panel-events"
            role="tabpanel"
            aria-labelledby="calendar-tab-events"
          >
{/* Events and commitments */}
      <section className="mt-3">
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
          <form ref={plannerFormRef} onSubmit={handlePlannerSubmit} className="card mb-5 scroll-mt-6 space-y-4 bg-[var(--surface)] p-5 sm:p-6">
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

            <fieldset className="space-y-3 rounded-2xl border-2 border-[var(--border)] p-4">
              <legend className="px-1 text-sm font-extrabold">
                Repeat this event
              </legend>
              <div>
                <label htmlFor="planner-event-repeat" className="mb-1 block text-sm font-extrabold">
                  Repeat pattern
                </label>
                <select
                  id="planner-event-repeat"
                  value={eventRepeatFrequency}
                  onChange={(change) =>
                    setEventRepeatFrequency(change.target.value as RecurrenceFrequency)
                  }
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {eventRepeatFrequency !== "none" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="planner-event-repeat-interval" className="mb-1 block text-sm font-extrabold">
                      Repeat every
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        id="planner-event-repeat-interval"
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={eventRepeatInterval}
                        onChange={(change) => setEventRepeatInterval(change.target.value)}
                      />
                      <span className="text-sm text-[var(--ink-soft)]">
                        {eventRepeatFrequency === "daily"
                          ? "day(s)"
                          : eventRepeatFrequency === "weekly"
                            ? "week(s)"
                            : "month(s)"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="planner-event-repeat-until" className="mb-1 block text-sm font-extrabold">
                      End date (optional)
                    </label>
                    <input
                      id="planner-event-repeat-until"
                      type="date"
                      min={eventDate}
                      value={eventRepeatUntil}
                      onChange={(change) => setEventRepeatUntil(change.target.value)}
                    />
                  </div>

                  {eventRepeatFrequency === "weekly" && (
                    <div className="space-y-2 sm:col-span-2">
                      <p className="text-sm font-extrabold">
                        Repeat on weekdays (optional)
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {recurrenceDays.map((weekday) => (
                          <label key={weekday} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={eventRepeatWeekdays.includes(weekday)}
                              onChange={(change) =>
                                setEventRepeatWeekdays((current) =>
                                  change.target.checked
                                    ? [...current, weekday]
                                    : current.filter((dayName) => dayName !== weekday),
                                )
                              }
                            />
                            {weekday}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-[var(--ink-soft)]">
                        If none are selected, it repeats on the weekday of the first event.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </fieldset>

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

            <div className="flex justify-end border-t border-[var(--border)] pt-4">
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
              <article
                key={item.id}
                id={`calendar-item-${item.id}`}
                className={`card bg-[var(--surface)] p-3 sm:p-4 ${
                  searchHighlightCalendarId === item.id
                    ? "ring-2 ring-[var(--accent)]"
                    : ""
                }`}
              >
                <div className="flex flex-row items-start justify-between gap-2 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-dark)]">
                      {formatDate(item.date)}
                    </p>
                    <h3 className="mt-1 break-words text-base font-semibold sm:text-lg">{item.title}</h3>
                    {item.recurrence && (
                      <p className="mt-1 text-xs font-extrabold text-[#684000]">
                        {recurrenceSummary(item.recurrence)}
                      </p>
                    )}
                    <p className="mt-1 text-sm font-medium text-[var(--primary)]">
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
                    <details data-smart-menu className="relative">
                      <summary
                        aria-label={`More actions for ${item.title}`}
                        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border-2 border-[var(--border)] text-xl font-extrabold"
                      >
                        <span aria-hidden="true">⋮</span>
                      </summary>
                      <div data-smart-menu-panel className="absolute right-0 z-30 mt-1 w-48 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.currentTarget.closest("details")?.removeAttribute("open");
                            openPlannerForm("event", item);
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[var(--primary-soft)]"
                        >
                          {item.recurrence ? "Edit series" : "Edit event"}
                        </button>
                        <button
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.currentTarget.closest("details")?.removeAttribute("open");
                            handleDeleteItem(item);
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--accent-dark)] hover:bg-[var(--accent-soft)]"
                        >
                          {item.recurrence ? "Delete series" : "Delete event"}
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
          </div>
        )}

        {managementTab === "tasks" && (
          <div
            id="calendar-panel-tasks"
            role="tabpanel"
            aria-labelledby="calendar-tab-tasks"
          >
{/* Flexible tasks */}
      <section className="mt-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold uppercase tracking-[0.05em] text-[var(--primary-dark)]">Tasks & to-dos</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Flexible deadlines.</p>
          </div>
          <Button variant="primary" onClick={() => openPlannerForm("task")}>
            Add task
          </Button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--primary-soft)] p-3 shadow-none">
            <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--primary)]">
              To do
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--primary-dark)]">
              {openTaskCount}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--yellow-soft)] p-3 shadow-none">
            <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--primary-dark)]">
              Completed
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--primary-dark)]">
              {calendarTasks.length - openTaskCount}
            </p>
          </div>
        </div>

        {showPlannerForm && plannerType === "task" && (
          <form ref={plannerFormRef} onSubmit={handlePlannerSubmit} className="card mb-5 scroll-mt-6 space-y-4 bg-[var(--surface)] p-5 sm:p-6">
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

            <fieldset className="space-y-3 rounded-2xl border-2 border-[var(--border)] p-4">
              <legend className="px-1 text-sm font-extrabold">
                Repeat this task
              </legend>
              <p className="text-xs text-[var(--ink-soft)]">
                Each due date is a separate task occurrence. Completing one will not complete future dates.
              </p>
              <div>
                <label htmlFor="planner-task-repeat" className="mb-1 block text-sm font-extrabold">
                  Repeat pattern
                </label>
                <select
                  id="planner-task-repeat"
                  value={taskRepeatFrequency}
                  onChange={(change) =>
                    setTaskRepeatFrequency(change.target.value as RecurrenceFrequency)
                  }
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {taskRepeatFrequency !== "none" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="planner-task-repeat-start" className="mb-1 block text-sm font-extrabold">
                      Starts on
                    </label>
                    <input
                      id="planner-task-repeat-start"
                      type="date"
                      required
                      value={taskRepeatStartDate}
                      onChange={(change) => setTaskRepeatStartDate(change.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="planner-task-repeat-interval" className="mb-1 block text-sm font-extrabold">
                      Repeat every
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        id="planner-task-repeat-interval"
                        type="number"
                        min="1"
                        step="1"
                        required
                        value={taskRepeatInterval}
                        onChange={(change) => setTaskRepeatInterval(change.target.value)}
                      />
                      <span className="text-sm text-[var(--ink-soft)]">
                        {taskRepeatFrequency === "daily"
                          ? "day(s)"
                          : taskRepeatFrequency === "weekly"
                            ? "week(s)"
                            : "month(s)"}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="planner-task-repeat-until" className="mb-1 block text-sm font-extrabold">
                      End date (optional)
                    </label>
                    <input
                      id="planner-task-repeat-until"
                      type="date"
                      min={taskRepeatStartDate || undefined}
                      value={taskRepeatUntil}
                      onChange={(change) => setTaskRepeatUntil(change.target.value)}
                    />
                  </div>

                  {taskRepeatFrequency === "weekly" && (
                    <div className="space-y-2 sm:col-span-2">
                      <p className="text-sm font-extrabold">
                        Repeat on weekdays (optional)
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {recurrenceDays.map((weekday) => (
                          <label key={weekday} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={taskRepeatWeekdays.includes(weekday)}
                              onChange={(change) =>
                                setTaskRepeatWeekdays((current) =>
                                  change.target.checked
                                    ? [...current, weekday]
                                    : current.filter((dayName) => dayName !== weekday),
                                )
                              }
                            />
                            {weekday}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-[var(--ink-soft)]">
                        If none are selected, it repeats on the weekday of the start date.
                      </p>
                    </div>
                  )}
                </div>
              )}

             </fieldset>

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

            <div className="flex justify-end border-t border-[var(--border)] pt-4">
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
                id={`calendar-item-${item.id}`}
                className={`card bg-[var(--surface)] p-3 sm:p-4 ${
                  item.completed ? "opacity-75" : ""
                } ${
                  searchHighlightCalendarId === item.id
                    ? "ring-2 ring-[var(--accent)]"
                    : ""
                }`}
              >
                <div className="flex flex-row items-start justify-between gap-2 sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {item.recurrence ? (
                        <span
                          title="Complete individual occurrences from the calendar agenda"
                          aria-label="Recurring task; completion is tracked per occurrence"
                          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[var(--accent-dark)] bg-[var(--accent-soft)] font-extrabold text-[var(--accent-dark)]"
                        >
                          ↻
                        </span>
                      ) : (
                        <input
                          type="checkbox"
                          aria-label={`Mark ${item.title} ${item.completed ? "incomplete" : "complete"}`}
                          checked={item.completed}
                          onChange={() => handleToggleTask(item)}
                          className="mt-1 !h-5 !w-5 shrink-0 accent-[var(--primary)]"
                        />
                      )}

                      <div className="min-w-0 flex-1">
                      <h3 className={`min-w-0 text-base sm:text-lg ${item.completed ? "line-through" : ""}`}>
                        <button
                          type="button"
                          className="calendar-task-title-button bg-transparent focus-visible:outline-2 focus-visible:outline-[var(--primary-dark)]"
                          aria-expanded={expandedTaskTitles.has(item.id)}
                          title={item.title}
                          onClick={() => setExpandedTaskTitles((current) => {
                            const next = new Set(current);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })}
                        >
                          <span className={expandedTaskTitles.has(item.id) ? "block whitespace-normal break-words" : "block truncate"}>
                            {item.title}
                          </span>
                        </button>
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

                  <div className="flex shrink-0 gap-2">
                    <details data-smart-menu className="relative">
                      <summary
                        aria-label={`More actions for ${item.title}`}
                        className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border-2 border-[var(--border)] text-xl font-extrabold"
                      >
                        <span aria-hidden="true">⋮</span>
                      </summary>
                      <div data-smart-menu-panel className="absolute right-0 z-30 mt-1 w-44 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
                        <button
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.currentTarget.closest("details")?.removeAttribute("open");
                            openPlannerForm("task", item);
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-[var(--primary-soft)]"
                        >
                          Edit task
                        </button>
                        <button
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.currentTarget.closest("details")?.removeAttribute("open");
                            handleDeleteItem(item);
                          }}
                          className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--accent-dark)] hover:bg-[var(--accent-soft)]"
                        >
                          Delete task
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
          </div>
        )}
      </section>
    </main>
  );
}
