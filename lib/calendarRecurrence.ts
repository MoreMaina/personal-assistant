
import { RRule } from "rrule";
import type {
  CalendarEvent,
  CalendarEventException,
  WeekdayName,
} from "./calendarItemStorage";

export type CalendarEventOccurrence = {
  /** Stable ID for this particular occurrence, even if it is moved. */
  id: string;
  eventId: string;
  /** The date the occurrence originally belonged to. */
  originalDate: string;
  /** The date it should appear on after applying an exception. */
  date: string;
  title: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  notes?: string;
  timeZone?: string;
  recurring: boolean;
};

type RecurrenceContext = {
  rule: RRule;
  startDateKey: string;
  untilDateKey?: string;
};

const FREQUENCY_TO_RULE = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
} as const;

const WEEKDAY_TO_RULE = {
  Monday: RRule.MO,
  Tuesday: RRule.TU,
  Wednesday: RRule.WE,
  Thursday: RRule.TH,
  Friday: RRule.FR,
  Saturday: RRule.SA,
  Sunday: RRule.SU,
} satisfies Record<WeekdayName, typeof RRule.MO>;

const VALID_WEEKDAY_NAMES = Object.keys(
  WEEKDAY_TO_RULE,
) as WeekdayName[];

/**
 * Parse a YYYY-MM-DD date as UTC midnight.
 *
 * Using UTC here prevents a date-only event from shifting to the previous
 * or next calendar day because of the device's local timezone.
 */
function parseDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateKey(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isWithinRange(
  date: string,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  return date >= rangeStart && date <= rangeEnd;
}

function buildRecurrenceContext(
  event: CalendarEvent,
): RecurrenceContext | null {
  const recurrence = event.recurrence;
  const startDate = parseDateKey(event.date);

  if (!recurrence || !startDate) {
    return null;
  }

  if (
    !Number.isInteger(recurrence.interval) ||
    recurrence.interval < 1
  ) {
    return null;
  }

  const frequency = FREQUENCY_TO_RULE[recurrence.frequency];

  if (frequency === undefined) {
    return null;
  }

  let untilDate: Date | undefined;

  if (recurrence.until !== undefined) {
    const parsedUntil = parseDateKey(recurrence.until);

    if (!parsedUntil || recurrence.until < event.date) {
      return null;
    }

    untilDate = parsedUntil;
  }

  const requestedWeekdays = (recurrence.weekdays ?? []).filter(
    (day) => VALID_WEEKDAY_NAMES.includes(day),
  );

  const byweekday = [...new Set(requestedWeekdays)].map(
    (day) => WEEKDAY_TO_RULE[day],
  );

  try {
    const rule = new RRule({
      freq: frequency,
      interval: recurrence.interval,
      dtstart: startDate,
      wkst: RRule.MO,
      ...(untilDate ? { until: untilDate } : {}),
      ...(recurrence.frequency === "weekly" && byweekday.length > 0
        ? { byweekday }
        : {}),
    });

    return {
      rule,
      startDateKey: event.date,
      ...(recurrence.until !== undefined
        ? { untilDateKey: recurrence.until }
        : {}),
    };
  } catch {
    // Malformed stored recurrence data should not crash Calendar.
    return null;
  }
}

/**
 * The first event date is always a valid occurrence, even if selected
 * weekdays don't include that date. Subsequent dates must match the rule.
 */
function isRuleOccurrence(
  context: RecurrenceContext,
  dateKey: string,
): boolean {
  if (dateKey < context.startDateKey) {
    return false;
  }

  if (
    context.untilDateKey !== undefined &&
    dateKey > context.untilDateKey
  ) {
    return false;
  }

  if (dateKey === context.startDateKey) {
    return true;
  }

  const date = parseDateKey(dateKey);

  if (!date) {
    return false;
  }

  try {
    return context.rule
      .between(date, date, true)
      .some((occurrence) => formatDateKey(occurrence) === dateKey);
  } catch {
    return false;
  }
}

/**
 * An undefined override means "inherit the original value".
 * A null override means "explicitly clear the original value".
 */
function resolveOptionalValue(
  original: string | undefined,
  override: string | null | undefined,
): string | undefined {
  if (override === undefined) {
    return original;
  }

  return override === null ? undefined : override;
}

function makeOccurrence(
  event: CalendarEvent,
  originalDate: string,
  exception?: CalendarEventException,
): CalendarEventOccurrence {
  const override = exception?.override;

  const date =
    override?.date && parseDateKey(override.date)
      ? override.date
      : originalDate;

  const startTime = resolveOptionalValue(
    event.startTime,
    override?.startTime,
  );
  const endTime = resolveOptionalValue(
    event.endTime,
    override?.endTime,
  );
  const location = resolveOptionalValue(
    event.location,
    override?.location,
  );
  const notes = resolveOptionalValue(event.notes, override?.notes);

  return {
    id: `${event.id}@${originalDate}`,
    eventId: event.id,
    originalDate,
    date,
    title: override?.title ?? event.title,
    ...(startTime !== undefined ? { startTime } : {}),
    ...(endTime !== undefined ? { endTime } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(event.timeZone !== undefined ? { timeZone: event.timeZone } : {}),
    recurring: Boolean(event.recurrence),
  };
}

/**
 * Expands events within an inclusive YYYY-MM-DD date range.
 *
 * Supports one-off events, recurrence intervals, selected weekly weekdays,
 * inclusive end dates, cancelled occurrences, and moved/edited occurrences.
 */
export function expandCalendarEvents(
  events: CalendarEvent[],
  rangeStart: string,
  rangeEnd: string,
): CalendarEventOccurrence[] {
  const startDate = parseDateKey(rangeStart);
  const endDate = parseDateKey(rangeEnd);

  if (
    !startDate ||
    !endDate ||
    rangeStart > rangeEnd
  ) {
    return [];
  }

  const results = new Map<string, CalendarEventOccurrence>();

  for (const event of events) {
    if (!event.recurrence) {
      if (
        parseDateKey(event.date) &&
        isWithinRange(event.date, rangeStart, rangeEnd)
      ) {
        const occurrence = makeOccurrence(event, event.date);
        results.set(occurrence.id, occurrence);
      }

      continue;
    }

    const context = buildRecurrenceContext(event);

    if (!context) {
      continue;
    }

    const exceptions = new Map<string, CalendarEventException>();

    for (const exception of event.exceptions ?? []) {
      if (parseDateKey(exception.occurrenceDate)) {
        // If duplicate entries exist, the last one takes precedence.
        exceptions.set(exception.occurrenceDate, exception);
      }
    }

    let candidateDates: string[];

    try {
      candidateDates = context.rule
        .between(startDate, endDate, true)
        .map(formatDateKey);
    } catch {
      continue;
    }

    const candidateSet = new Set(candidateDates);

    // Preserve DTSTART even when the rule's weekday selection doesn't match it.
    if (
      isWithinRange(event.date, rangeStart, rangeEnd) &&
      isRuleOccurrence(context, event.date)
    ) {
      candidateSet.add(event.date);
    }

    // Normal occurrences whose original dates are in the requested range.
    for (const originalDate of [...candidateSet].sort()) {
      if (!isRuleOccurrence(context, originalDate)) {
        continue;
      }

      const exception = exceptions.get(originalDate);

      if (exception?.cancelled) {
        continue;
      }

      const occurrence = makeOccurrence(
        event,
        originalDate,
        exception,
      );

      if (isWithinRange(occurrence.date, rangeStart, rangeEnd)) {
        results.set(occurrence.id, occurrence);
      }
    }

    // Also include occurrences originally outside the requested range that
    // have been moved into it. Only valid dates in the recurrence can move.
    for (const [originalDate, exception] of exceptions) {
      const movedDate = exception.override?.date;

      if (
        exception.cancelled ||
        !movedDate ||
        !parseDateKey(movedDate) ||
        !isWithinRange(movedDate, rangeStart, rangeEnd) ||
        isWithinRange(originalDate, rangeStart, rangeEnd) ||
        !isRuleOccurrence(context, originalDate)
      ) {
        continue;
      }

      const occurrence = makeOccurrence(
        event,
        originalDate,
        exception,
      );

      results.set(occurrence.id, occurrence);
    }
  }

  return [...results.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
}
