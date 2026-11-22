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

function buildCurrentStudyContext(
  value: unknown,
  available: boolean,
  currentDate: string,
) {
  if (!available) {
    return {
      catalogueStatus: "unavailable" as const,
      courses: [],
      units: [],
      lectures: [],
      progressEvidence: {
        evidenceStatus: "unavailable" as const,
      },
    };
  }

  const source = isRecord(value) ? value : {};
  const rawCourses = Array.isArray(source.courses) ? source.courses : [];
  const activeCourses = rawCourses.filter(
    (course): course is RecordValue =>
      isRecord(course) &&
      !course.archived_at &&
      typeof course.id === "string" &&
      typeof course.name === "string" &&
      Boolean(course.name.trim()),
  );

  const courseById = new Map(
    activeCourses.map((course) => [
      String(course.id),
      {
        id: String(course.id),
        name: String(course.name).trim().slice(0, MAX_STRING),
        code: typeof course.code === "string"
          ? course.code.trim().slice(0, 40)
          : undefined,
      },
    ] as const),
  );

  const rawUnits = Array.isArray(source.units) ? source.units : [];
  const activeUnits = rawUnits.filter(
    (unit): unit is RecordValue =>
      isRecord(unit) &&
      typeof unit.id === "string" &&
      typeof unit.name === "string" &&
      typeof unit.course_id === "string" &&
      courseById.has(String(unit.course_id)),
  );

  const unitById = new Map(
    activeUnits.map((unit) => {
      const course = courseById.get(String(unit.course_id))!;
      return [
        String(unit.id),
        {
          id: String(unit.id),
          name: String(unit.name).trim().slice(0, MAX_STRING),
          code: typeof unit.code === "string"
            ? unit.code.trim().slice(0, 40)
            : undefined,
          courseId: course.id,
          courseName: course.name,
        },
      ] as const;
    }),
  );

  const rawTopics = Array.isArray(source.topics) ? source.topics : [];
  const activeTopics = rawTopics.filter(
    (topic): topic is RecordValue =>
      isRecord(topic) &&
      typeof topic.id === "string" &&
      typeof topic.unit_id === "string" &&
      unitById.has(String(topic.unit_id)),
  );

  const topicById = new Map(
    activeTopics.map((topic) => {
      const unit = unitById.get(String(topic.unit_id))!;
      return [
        String(topic.id),
        {
          id: String(topic.id),
          title: typeof topic.title === "string"
            ? topic.title.trim().slice(0, MAX_STRING)
            : "Untitled topic",
          unitName: unit.name,
          courseName: unit.courseName,
        },
      ] as const;
    }),
  );

  const rawLectures = Array.isArray(source.lectures) ? source.lectures : [];
  const lectures = rawLectures
    .filter((lecture): lecture is RecordValue => isRecord(lecture))
    .flatMap((lecture) => {
      const unitId =
        typeof lecture.unit_id === "string"
          ? lecture.unit_id
          : typeof lecture.topic_id === "string"
            ? activeTopics.find(
                (topic) => topic.id === lecture.topic_id,
              )?.unit_id as string | undefined
            : undefined;
      const unit = unitId ? unitById.get(unitId) : undefined;
      if (!unit) return [];

      return [{
        date: safeScalar(lecture.date),
        kind: safeScalar(lecture.kind),
        unitName: unit.name,
        courseName: unit.courseName,
      }];
    })
    .slice(0, MAX_RECORDS);

  const validCurrentDate = dateOnly(currentDate) ?? currentDate;
  const currentDayMs = Date.parse(`${validCurrentDate}T00:00:00.000Z`);
  const sevenDaysAgoMs = currentDayMs - 6 * 24 * 60 * 60 * 1000;
  const fourteenDaysAheadMs = currentDayMs + 14 * 24 * 60 * 60 * 1000;
  const thirtyDaysAheadMs = currentDayMs + 30 * 24 * 60 * 60 * 1000;

  const toFiniteNumber = (item: unknown): number | null =>
    typeof item === "number" && Number.isFinite(item)
      ? item
      : null;

  const isInLastSevenDays = (value: unknown): boolean => {
    const date = dateOnly(value);
    if (!date || !Number.isFinite(currentDayMs)) return false;
    const timestamp = Date.parse(`${date}T00:00:00.000Z`);
    return timestamp >= sevenDaysAgoMs && timestamp <= currentDayMs;
  };

  const topicStatusCounts: Record<string, number> = {};
  const needsReviewTopics: Array<{
    title: string;
    unitName: string;
    courseName: string;
  }> = [];
  const weaknessTopics: Array<{
    title: string;
    unitName: string;
    courseName: string;
  }> = [];

  for (const topic of activeTopics) {
    const status = typeof topic.status === "string"
      ? topic.status
      : "unspecified";
    topicStatusCounts[status] = (topicStatusCounts[status] ?? 0) + 1;

    const mapped = topicById.get(String(topic.id));
    if (!mapped) continue;

    const example = {
      title: mapped.title,
      unitName: mapped.unitName,
      courseName: mapped.courseName,
    };

    // Older topics without the preparation lifecycle field must not
    // be represented as Ready.
    if (
      topic.preparation_status === undefined ||
      topic.preparation_status === null
    ) {
      needsReviewTopics.push(example);
    }

    if (topic.weakness_flag === true) {
      weaknessTopics.push(example);
    }
  }

  const rawReviewEvents = Array.isArray(source.review_events)
    ? source.review_events
    : [];
  const reviewStatusCounts: Record<string, number> = {};
  const overdueReviewExamples: Array<{
    topic: string;
    dueDate: string;
    priority: string | null;
  }> = [];
  let overdueOpenReviews = 0;

  for (const review of rawReviewEvents) {
    if (!isRecord(review)) continue;

    const status = typeof review.status === "string"
      ? review.status
      : "unspecified";
    reviewStatusCounts[status] = (reviewStatusCounts[status] ?? 0) + 1;

    if (
      status !== "pending" &&
      status !== "in_progress" &&
      status !== "deferred"
    ) {
      continue;
    }

    const dueDate = dateOnly(review.current_due_date);
    if (!dueDate || dueDate >= validCurrentDate) continue;

    overdueOpenReviews += 1;
    if (overdueReviewExamples.length < 5) {
      const topic = typeof review.topic_id === "string"
        ? topicById.get(review.topic_id)
        : undefined;
      overdueReviewExamples.push({
        topic: topic?.title ?? "Topic no longer in active catalogue",
        dueDate,
        priority: typeof review.current_priority === "string"
          ? review.current_priority
          : null,
      });
    }
  }

  const rawTaskEvents = Array.isArray(source.task_events)
    ? source.task_events
    : [];
  const recentTaskEvents = rawTaskEvents.filter(
    (event): event is RecordValue =>
      isRecord(event) && isInLastSevenDays(event.logged_at),
  );
  const recentEventTypeCounts: Record<string, number> = {};
  const recentResultCounts: Record<string, number> = {};
  const recentDispositionCounts: Record<string, number> = {};

  for (const event of recentTaskEvents) {
    if (typeof event.event_type === "string") {
      recentEventTypeCounts[event.event_type] =
        (recentEventTypeCounts[event.event_type] ?? 0) + 1;
    }
    if (typeof event.result === "string") {
      recentResultCounts[event.result] =
        (recentResultCounts[event.result] ?? 0) + 1;
    }
    if (typeof event.disposition === "string") {
      recentDispositionCounts[event.disposition] =
        (recentDispositionCounts[event.disposition] ?? 0) + 1;
    }
  }

  const rawWorkSessions = Array.isArray(source.work_sessions)
    ? source.work_sessions
    : [];
  const recentSessions = rawWorkSessions.filter(
    (session): session is RecordValue =>
      isRecord(session) && isInLastSevenDays(session.logged_at),
  );
  const recentStudyDays = new Set<string>();
  let recentStudyMinutes = 0;

  for (const session of recentSessions) {
    const date = dateOnly(session.logged_at);
    const duration = toFiniteNumber(session.actual_duration_min);
    if (date) recentStudyDays.add(date);
    if (duration !== null && duration > 0) {
      recentStudyMinutes += duration;
    }
  }

  const assignments = (
    Array.isArray(source.assignments) ? source.assignments : []
  ).filter((assignment): assignment is RecordValue => {
    if (!isRecord(assignment)) return false;
    if (
      assignment.status !== "pending" &&
      assignment.status !== "in_progress"
    ) {
      return false;
    }
    const dueDate = dateOnly(assignment.due_date);
    if (!dueDate || !Number.isFinite(currentDayMs)) return false;
    const timestamp = Date.parse(`${dueDate}T00:00:00.000Z`);
    return timestamp <= fourteenDaysAheadMs;
  }).map((assignment) => ({
    title: typeof assignment.title === "string"
      ? assignment.title.trim().slice(0, MAX_STRING)
      : "Untitled assignment",
    dueDate: dateOnly(assignment.due_date),
    status: safeScalar(assignment.status),
    importance: safeScalar(assignment.importance),
  })).sort((a, b) =>
    String(a.dueDate).localeCompare(String(b.dueDate)),
  ).slice(0, 5);

  const exams = (
    Array.isArray(source.exams) ? source.exams : []
  ).filter((exam): exam is RecordValue => {
    if (!isRecord(exam)) return false;
    const date = dateOnly(exam.date);
    if (!date || !Number.isFinite(currentDayMs)) return false;
    const timestamp = Date.parse(`${date}T00:00:00.000Z`);
    return timestamp >= currentDayMs && timestamp <= thirtyDaysAheadMs;
  }).map((exam) => {
    const course = typeof exam.course_id === "string"
      ? courseById.get(exam.course_id)
      : undefined;
    return {
      courseName: course?.name ?? "Course no longer active",
      type: safeScalar(exam.type),
      date: dateOnly(exam.date),
    };
  }).sort((a, b) =>
    String(a.date).localeCompare(String(b.date)),
  ).slice(0, 5);

  const settings = isRecord(source.settings) ? source.settings : {};
  const trialStart = dateOnly(settings.trial_start_date);
  const trialEnd = dateOnly(settings.trial_end_date);
  let trialStatus: string = "not configured";
  if (trialStart && trialEnd) {
    trialStatus = validCurrentDate < trialStart
      ? "scheduled"
      : validCurrentDate <= trialEnd
        ? "active"
        : "completed";
  }

  const rawTrialPeriods = Array.isArray(source.trial_periods)
    ? source.trial_periods
    : [];
  const currentTrialId = typeof source.current_trial_id === "string"
    ? source.current_trial_id
    : null;

  const rawWeeklyMetrics = Array.isArray(source.weekly_metrics)
    ? source.weekly_metrics
    : [];
  const weeklyMetrics = rawWeeklyMetrics
    .filter((metric): metric is RecordValue =>
      isRecord(metric) &&
      dateOnly(metric.week_start) !== null &&
      dateOnly(metric.week_end) !== null,
    )
    .sort((a, b) =>
      String(a.week_start).localeCompare(String(b.week_start)),
    )
    .slice(-8)
    .map((metric) => ({
      weekNumber: toFiniteNumber(metric.week_number),
      weekStart: dateOnly(metric.week_start),
      weekEnd: dateOnly(metric.week_end),
      onTimeCompletionPct:
        toFiniteNumber(metric.overall_on_time_completion_pct),
      priorityOneToThreeOnTimePct:
        toFiniteNumber(metric.priority_1_3_on_time_completion_pct),
      deferralRatePct: toFiniteNumber(metric.deferral_rate_pct),
      overdueCriticalBacklogMinutes:
        toFiniteNumber(metric.overdue_critical_backlog_min),
      // Historical metrics without trial IDs stay explicitly unassigned.
      trialId: safeScalar(metric.trial_id),
      trialAssociation:
        typeof metric.trial_id === "string" && metric.trial_id
          ? "identified"
          : "legacy_unassigned",
    }));

  const metricsWithoutTrialId = weeklyMetrics.filter(
    (metric) => metric.trialAssociation === "legacy_unassigned",
  ).length;

  const trialHistory = rawTrialPeriods
    .filter((period): period is RecordValue =>
      isRecord(period) &&
      typeof period.id === "string" &&
      dateOnly(period.start_date) !== null &&
      dateOnly(period.end_date) !== null,
    )
    .sort((a, b) =>
      String(a.start_date).localeCompare(String(b.start_date)),
    )
    .slice(-6)
    .map((period) => {
      const startDate = dateOnly(period.start_date)!;
      const endDate = dateOnly(period.end_date)!;
      const status = validCurrentDate < startDate
        ? "scheduled"
        : validCurrentDate <= endDate
          ? "active"
          : "completed";
      const periodMetrics = weeklyMetrics
        .filter((metric) => metric.trialId === period.id)
        .map((metric) => ({
          weekNumber: metric.weekNumber,
          weekStart: metric.weekStart,
          weekEnd: metric.weekEnd,
          onTimeCompletionPct: metric.onTimeCompletionPct,
          deferralRatePct: metric.deferralRatePct,
          overdueCriticalBacklogMinutes: metric.overdueCriticalBacklogMinutes,
        }));
      return {
        id: String(period.id),
        startDate,
        endDate,
        weekFourStartDate: dateOnly(period.week4_evaluation_start),
        weekFourEndDate: dateOnly(period.week4_evaluation_end),
        source: period.source === "legacy" ? "legacy" : "user_confirmed",
        status,
        metricSnapshots: periodMetrics.slice(0, 4),
      };
    });
  const currentTrial = trialHistory.find((period) => period.id === currentTrialId) ?? null;

  return {
    catalogueStatus: "current" as const,
    courses: [...courseById.values()].slice(0, MAX_RECORDS),
    units: [...unitById.values()].slice(0, MAX_RECORDS),
    lectures,
    progressEvidence: {
      evidenceStatus: "available" as const,
      currentDate: validCurrentDate,
      recentWindow: {
        startDate: new Date(sevenDaysAgoMs).toISOString().slice(0, 10),
        endDate: validCurrentDate,
      },
      topics: {
        total: activeTopics.length,
        statusCounts: topicStatusCounts,
        legacyNeedsReviewCount: needsReviewTopics.length,
        legacyNeedsReviewExamples: needsReviewTopics.slice(0, 5),
        flaggedWeaknessCount: weaknessTopics.length,
        flaggedWeaknessExamples: weaknessTopics.slice(0, 5),
      },
      reviews: {
        totalRecorded: rawReviewEvents.length,
        statusCounts: reviewStatusCounts,
        overdueOpenCount: overdueOpenReviews,
        overdueExamples: overdueReviewExamples,
      },
      taskEvents: {
        totalRecorded: rawTaskEvents.length,
        recentSevenDayCount: recentTaskEvents.length,
        recentEventTypeCounts,
        recentResultCounts,
        recentDispositionCounts,
      },
      workSessions: {
        totalRecorded: rawWorkSessions.length,
        recentSevenDayCount: recentSessions.length,
        recentStudyMinutes: recentStudyMinutes,
        recentStudyDays: recentStudyDays.size,
      },
      upcomingCommitments: {
        assignmentsWithinFourteenDays: assignments,
        examsWithinThirtyDays: exams,
      },
      trial: {
        id: currentTrial?.id ?? null,
        status: currentTrial?.status ?? trialStatus,
        startDate: currentTrial?.startDate ?? trialStart,
        endDate: currentTrial?.endDate ?? trialEnd,
        weekFourStartDate: currentTrial?.weekFourStartDate ?? dateOnly(settings.week4_evaluation_start),
        weekFourEndDate: currentTrial?.weekFourEndDate ?? dateOnly(settings.week4_evaluation_end),
        source: currentTrial?.source ?? "legacy_settings",
      },
      trialHistory: {
        currentTrialId,
        periods: trialHistory,
        historyCount: rawTrialPeriods.length,
      },
      weeklyMetrics: {
        snapshots: weeklyMetrics,
        legacyUnassignedCount: metricsWithoutTrialId,
        trialAttributedCount: weeklyMetrics.filter((metric) => metric.trialAssociation === "identified").length,
      },
    },
  };
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
  currentStudyState: unknown = null,
  studyCatalogueAvailable = false,
) {
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
    study: buildCurrentStudyContext(
      currentStudyState,
      studyCatalogueAvailable,
      currentDate,
    ),
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

  // General advice and hypothetical scenarios should not receive personal
  // records unless the question explicitly asks about the user's own data.
  const asksForGeneralGuidance =
    /\b(?:difference between|productivity system for someone|general (?:advice|guidance)|hypothetical|in general)\b/i
      .test(question);

  const explicitlyReferencesPersonalRecords =
    /\b(?:my|mine|do i have|what do i have|what should i focus on|what needs my attention|tasks? i (?:need|have|should|must)|(?:tasks?|deadlines?|events?|classes?|projects?|books?|courses?) (?:i need|i have|i should|i must)|today|tomorrow|overdue|saved|recorded|on my calendar|assigned to me|for me)\b/i
      .test(question);

  if (asksForGeneralGuidance && !explicitlyReferencesPersonalRecords) {
    return { contextScope: "general question" };
  }

  if (isWeeklyReviewQuestion(question)) {
    // Academic program and semester are not useful in a weekly recap. More
    // importantly, do not expose those legacy fields from the old app snapshot.
    const weeklyContext = Object.fromEntries(
      Object.entries(context).filter(
        ([key]) => key !== "currentSemester" && key !== "scheduledClasses",
      ),
    );
    return { ...weeklyContext, contextScope: "full weekly review" };
  }

  const asksStudyProgressReview =
    /\b(?:review|summari[sz]e|assess|analy[sz]e)\s+(?:my\s+)?(?:study|studies|academic)\s+progress\b|\bhow am i doing\s+(?:with|in|on)\s+(?:my\s+)?(?:stud(?:y|ies)|academics)\b/i
      .test(question);

  if (asksStudyProgressReview) {
    return {
      study: context.study,
      contextScope: "study progress review",
    };
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
    if (/\bsemester\b/i.test(question) && context.currentSemester !== null) {
      selected.currentSemester = context.currentSemester;
    }
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

