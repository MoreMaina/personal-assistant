import type { AppSnapshot } from "./supabase/sync";

type RecordValue = Record<string, unknown>;

const MAX_RECORDS = 15;
const MAX_FIELDS = 12;
const MAX_STRING = 140;

const SAFE_FIELDS = [
  "id", "name", "title", "description", "summary",
  "status", "priority", "type", "category",
  "startDate", "dueDate", "endDate", "targetDate",
  "startTime", "endTime", "date", "time",
  "day", "dayOfWeek", "days", "completed", "isCompleted",
  "progress", "progressPercent", "author", "genre",
  "bookId", "currentPage", "totalPages", "pageCount",
  "courseId", "courseName", "unitId", "unitName",
  "semesterId", "semesterName", "programId", "programName",
  "frequency", "recurrence", "recurrenceRule",
  "location", "durationMinutes", "pagesRead",
  "scheduledAt", "examDate", "isActive",
] as const;

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseJson(raw: string | undefined): unknown {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function safeScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") {
    const result = value.trim().slice(0, MAX_STRING);
    return result || undefined;
  }
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function safeRecord(value: unknown): RecordValue | undefined {
  if (!isRecord(value)) return undefined;
  const result: RecordValue = {};

  for (const field of SAFE_FIELDS) {
    const raw = value[field];
    let cleaned: unknown = safeScalar(raw);

    if (Array.isArray(raw)) {
      cleaned = raw.slice(0, 6)
        .map(safeScalar)
        .filter((item) => item !== undefined);
      if ((cleaned as unknown[]).length === 0) cleaned = undefined;
    }

    if (cleaned !== undefined) result[field] = cleaned;
    if (Object.keys(result).length >= MAX_FIELDS) break;
  }

  return Object.keys(result).length ? result : undefined;
}

function recordArray(
  snapshot: AppSnapshot,
  key: string,
  limit = MAX_RECORDS,
) {
  const value = parseJson(snapshot[key]);
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit)
    .map(safeRecord)
    .filter((item): item is RecordValue => item !== undefined);
}

function studyArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_RECORDS)
    .map(safeRecord)
    .filter((item): item is RecordValue => item !== undefined);
}


function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/);
  if (!match) return null;

  const date = match[1];
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10) === date
    ? date
    : null;
}

function taskPriorityRank(value: unknown): number {
  if (value === "high") return 0;
  if (value === "medium") return 1;
  if (value === "low") return 2;
  return 3;
}

type PrioritizedTask = RecordValue & {
  urgency: string;
  daysUntilDue: number | null;
};

function rankIncompleteTasks(
  records: RecordValue[],
  currentDate: string,
): PrioritizedTask[] {
  const today = Date.parse(`${currentDate}T00:00:00Z`);
  if (!Number.isFinite(today)) return [];

  return records
    .map((record, index) => {
      // Events are excluded; use the actual CalendarTask discriminator.
      if (record.type !== "task" || record.completed === true) return null;

      const dueDate = dateOnly(record.dueDate);
      const dueTimestamp = dueDate
        ? Date.parse(`${dueDate}T00:00:00Z`)
        : Number.NaN;
      const daysUntilDue = Number.isFinite(dueTimestamp)
        ? Math.round((dueTimestamp - today) / 86_400_000)
        : null;

      const urgencyRank =
        daysUntilDue === null ? 4 :
        daysUntilDue < 0 ? 0 :
        daysUntilDue === 0 ? 1 :
        daysUntilDue <= 7 ? 2 : 3;

      const urgency =
        urgencyRank === 0 ? "overdue" :
        urgencyRank === 1 ? "due today" :
        urgencyRank === 2 ? "due within 7 days" :
        urgencyRank === 3 ? "future due date" : "no due date";

      return {
        record,
        index,
        urgencyRank,
        dueTimestamp: Number.isFinite(dueTimestamp)
          ? dueTimestamp
          : Number.MAX_SAFE_INTEGER,
        priorityRank: taskPriorityRank(record.priority),
        urgency,
        daysUntilDue,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) =>
      a.urgencyRank - b.urgencyRank ||
      a.dueTimestamp - b.dueTimestamp ||
      a.priorityRank - b.priorityRank ||
      a.index - b.index
    )
    .slice(0, 8)
    .map(({ record, urgency, daysUntilDue }) => ({
      ...record,
      urgency,
      daysUntilDue,
    }));
}


function taskLabel(record: RecordValue): string | undefined {
  for (const field of ["title", "name", "label"] as const) {
    const value = record[field];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 80);
    }
  }
  return undefined;
}

function summarizeTasks(
  records: RecordValue[],
  currentDate: string,
  sourceCalendarItemCount: number,
) {
  const tasks = records.filter((record) => record.type === "task");
  const completed = tasks.filter((task) => task.completed === true);
  const incomplete = tasks.filter((task) => task.completed !== true);
  const todayTimestamp = Date.parse(`${currentDate}T00:00:00Z`);

  const urgency = {
    overdue: 0,
    dueToday: 0,
    dueWithin7Days: 0,
    futureDueDate: 0,
    noDueDate: 0,
    unclassified: 0,
  };

  for (const task of incomplete) {
    const dueDate = dateOnly(task.dueDate);

    if (!dueDate) {
      const rawDueDate = task.dueDate;
      if (typeof rawDueDate !== "string" || !rawDueDate.trim()) {
        urgency.noDueDate += 1;
      } else {
        urgency.unclassified += 1;
      }
      continue;
    }

    if (!Number.isFinite(todayTimestamp)) {
      urgency.unclassified += 1;
      continue;
    }

    const dueTimestamp = Date.parse(`${dueDate}T00:00:00Z`);
    if (!Number.isFinite(dueTimestamp)) {
      urgency.unclassified += 1;
      continue;
    }

    const daysUntilDue = Math.round(
      (dueTimestamp - todayTimestamp) / 86_400_000,
    );

    if (daysUntilDue < 0) urgency.overdue += 1;
    else if (daysUntilDue === 0) urgency.dueToday += 1;
    else if (daysUntilDue <= 7) urgency.dueWithin7Days += 1;
    else urgency.futureDueDate += 1;
  }

  return {
    taskRecordsExamined: tasks.length,
    completedTasks: completed.length,
    incompleteTasks: incomplete.length,
    incompleteTaskUrgency: urgency,
    completedTaskExamples: completed
      .map(taskLabel)
      .filter((label): label is string => Boolean(label))
      .slice(0, 5),
    calendarRecordsExamined: records.length,
    sourceCalendarItemCount,
    recordScanLimit: 200,
    mayBeTruncated: sourceCalendarItemCount > 200,
  };
}

export function buildAssistantContext(
  snapshot: AppSnapshot,
  currentDate = new Date().toISOString().slice(0, 10),
) {
  const rawStudy = parseJson(snapshot["personal-assistant-study-v2"]);
  const studySource = isRecord(rawStudy) ? rawStudy : {};
  const currentSemesterRaw = snapshot["personal-assistant-current-semester"];
  const parsedSemester = parseJson(currentSemesterRaw);
  const currentSemester =
    safeScalar(parsedSemester) ??
    (currentSemesterRaw && parsedSemester === undefined
      ? currentSemesterRaw.trim().slice(0, MAX_STRING)
      : null);

  // Inspect more calendar records for ranking, but send only a small
  // selection of ordinary calendar items to the model.
  const parsedCalendarItems = parseJson(
    snapshot["personal-assistant-calendar-items"],
  );
  const sourceCalendarItemCount = Array.isArray(parsedCalendarItems)
    ? parsedCalendarItems.length
    : 0;

  const rawCalendarItems = recordArray(
    snapshot,
    "personal-assistant-calendar-items",
    200,
  );

  const context = {
    currentSemester,
    projects: recordArray(snapshot, "personal-assistant-projects"),
    calendarItems: rawCalendarItems.slice(0, MAX_RECORDS),
    scheduledClasses: recordArray(snapshot, "personal-assistant-classes"),
    books: recordArray(snapshot, "personal-assistant-books"),
    readingSessions: recordArray(snapshot, "personal-assistant-reading-sessions"),
    essays: recordArray(snapshot, "personal-assistant-essays"),
    study: {
      programs: studyArray(studySource.programs),
      semesters: studyArray(studySource.semesters),
      courses: studyArray(studySource.courses),
      units: studyArray(studySource.units),
      lectures: studyArray(studySource.lectures),
    },
  };

  return {
    ...context,
    taskSummary: summarizeTasks(
      rawCalendarItems,
      currentDate,
      sourceCalendarItemCount,
    ),
    prioritizedTasks: rankIncompleteTasks(rawCalendarItems, currentDate),
  };
}

/**
 * Detect explicit weekly-review requests. Ordinary questions mentioning
 * a day or a deadline should not trigger the full productivity review.
 */
export function isWeeklyReviewQuestion(question: string): boolean {
  return /\b(?:weekly review|review my week|summari[sz]e my week|week(?:ly)? recap|review (?:the )?(?:past|last) week|last week'?s review|what did i (?:do|accomplish|complete) (?:this|last) week)\b/i
    .test(question);
}

/**
 * Keep context narrow for everyday questions. The full snapshot is retained
 * only for an explicit weekly review or a clearly broad personal overview.
 */
export function selectRelevantAssistantContext(
  context: ReturnType<typeof buildAssistantContext>,
  question: string,
): Record<string, unknown> {
  const normalized = question.toLowerCase();

  if (isWeeklyReviewQuestion(question)) {
    return { ...context, contextScope: "full weekly review" };
  }

  const asksBroadOverview =
    /\b(?:full overview|overall progress|summari[sz]e my progress|review my progress|how am i doing overall|all areas|everything i've been working on)\b/i
      .test(question);

  if (asksBroadOverview) {
    return { ...context, contextScope: "broad personal overview" };
  }

  const needsTasks =
    /\b(?:tasks?|to[- ]?dos?|deadlines?|overdue|focus on|priorit(?:y|ies|ize|ise|izing|ising|ization|isation)|what should i do|what needs my attention)\b/i
      .test(normalized);

  const needsStudy =
    /\b(?:study|studying|courses?|units?|lectures?|semesters?|exams?|classes?|academic program|academic progress|revision)\b/i
      .test(normalized);

  const needsReading =
    /\b(?:reading|books?|pages read|reading sessions?|reading progress)\b/i
      .test(normalized);

  const needsProjects =
    /\b(?:projects?|essays?|dissertation|milestones?|project status)\b/i
      .test(normalized);

  const needsCalendar =
    /\b(?:calendar|schedules?|events?|appointments?|free time|availability|available slots|when am i free|agenda|my day|what's happening today|what is happening today|what do i have today|what do i have tomorrow|daily schedule|today's schedule|tomorrow's schedule)\b/i
      .test(normalized);

  const asksTaskTotals =
    /\b(?:how many|number of|count|counts|total|totals|completion rate)\b/i
      .test(normalized);

  const selected: Record<string, unknown> = {};
  const scopes: string[] = [];

  if (needsTasks) {
    selected.prioritizedTasks = context.prioritizedTasks;
    scopes.push("tasks");

    if (asksTaskTotals) {
      selected.taskSummary = context.taskSummary;
    }
  }

  if (needsStudy) {
    selected.currentSemester = context.currentSemester;
    selected.scheduledClasses = context.scheduledClasses;
    selected.study = context.study;
    scopes.push("study");
  }

  if (needsReading) {
    selected.books = context.books;
    selected.readingSessions = context.readingSessions;
    scopes.push("reading");
  }

  if (needsProjects) {
    selected.projects = context.projects;
    selected.essays = context.essays;
    scopes.push("projects");
  }

  if (needsCalendar) {
    selected.calendarItems = context.calendarItems;

    if (!needsStudy) {
      selected.scheduledClasses = context.scheduledClasses;
    }

    scopes.push("calendar");
  }

  selected.contextScope = scopes.length
    ? scopes.join(", ")
    : "general question";

  return selected;
}

