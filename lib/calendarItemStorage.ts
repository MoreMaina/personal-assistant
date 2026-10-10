export type WeekdayName =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type EventRecurrence = {
  frequency: "daily" | "weekly" | "monthly";

  // 1 = every period; 2 = every other week/month, etc.
  interval: number;

  // Used for weekly patterns. If omitted, use the
  // weekday of the event's original date.
  weekdays?: WeekdayName[];

  // Inclusive final date, in YYYY-MM-DD format.
  // Omit for a series with no planned end date.
  until?: string;
};

export type EventOccurrenceOverride = {
  // New date if this occurrence is moved.
  date?: string;

  title?: string;

  // null explicitly clears a time or optional field.
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  notes?: string | null;
};

export type CalendarEventException = {
  // The original scheduled date, not the moved date.
  // One occurrence per series per date is supported.
  occurrenceDate: string;

  cancelled?: boolean;
  override?: EventOccurrenceOverride;
};

export type CalendarEvent = {
  id: string;
  type: "event";
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  notes?: string;

  // Optional additions preserve compatibility with
  // existing one-off event records.
  timeZone?: string;
  recurrence?: EventRecurrence;
  exceptions?: CalendarEventException[];

  createdAt: string;
  updatedAt: string;
};

export type CalendarTask = {
  id: string;
  type: "task";
  title: string;
  dueDate?: string;
  priority: "low" | "medium" | "high";
  estimatedMinutes?: number;
  completed: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type CalendarItem = CalendarEvent | CalendarTask;

export const CALENDAR_ITEMS_KEY =
  "personal-assistant-calendar-items";

export function getCalendarItems(): CalendarItem[] {
  if (typeof window === "undefined") return [];

  try {
    const saved = localStorage.getItem(CALENDAR_ITEMS_KEY);
    if (!saved) return [];

    const parsed: unknown = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is CalendarItem =>
        item !== null &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        (item.type === "event" || item.type === "task"),
    );
  } catch {
    return [];
  }
}

export function saveCalendarItems(
  items: CalendarItem[],
): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(
    CALENDAR_ITEMS_KEY,
    JSON.stringify(items),
  );
}

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `calendar-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function addCalendarEvent(
  event: Omit<
    CalendarEvent,
    "id" | "type" | "createdAt" | "updatedAt"
  >,
): CalendarEvent {
  const now = new Date().toISOString();

  const newEvent: CalendarEvent = {
    ...event,
    id: createId(),
    type: "event",
    createdAt: now,
    updatedAt: now,
  };

  saveCalendarItems([...getCalendarItems(), newEvent]);
  return newEvent;
}

export function addCalendarTask(
  task: Omit<
    CalendarTask,
    "id" | "type" | "createdAt" | "updatedAt"
  >,
): CalendarTask {
  const now = new Date().toISOString();

  const newTask: CalendarTask = {
    ...task,
    id: createId(),
    type: "task",
    createdAt: now,
    updatedAt: now,
  };

  saveCalendarItems([...getCalendarItems(), newTask]);
  return newTask;
}

export function updateCalendarItem(
  updatedItem: CalendarItem,
): void {
  const items = getCalendarItems();

  saveCalendarItems(
    items.map((item) =>
      item.id === updatedItem.id
        ? {
            ...updatedItem,
            updatedAt: new Date().toISOString(),
          }
        : item,
    ),
  );
}

export function deleteCalendarItem(id: string): void {
  saveCalendarItems(
    getCalendarItems().filter((item) => item.id !== id),
  );
}

export function toggleCalendarTask(
  id: string,
  completed: boolean,
): void {
  const item = getCalendarItems().find(
    (entry) => entry.id === id,
  );

  if (!item || item.type !== "task") return;

  updateCalendarItem({ ...item, completed });
}