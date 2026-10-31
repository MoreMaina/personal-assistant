import {
  getClasses,
  getCancelledClassIds,
} from "./classStorage";

import {
  getBooks,
  getEssays,
  getReadingSessions,
} from "./readingStorage";

import {
  getProjects,
} from "./projectStorage";

import type {
  EnergyLevel,
  FixedEvent,
  TaskPriority,
  TodayTask,
} from "./today-engine";

import type { StudyMvpState } from "./studyMvp/types";

function getLocalDateKey(
  date: Date,
): string {
  const year =
    date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getWeekdayName(
  date: Date,
): string {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      weekday: "long",
    },
  ).format(date);
}

function makeLocalDate(
  date: Date,
  time: string,
): Date {
  const [hours, minutes] =
    time
      .split(":")
      .map(Number);

  const result =
    new Date(date);

  result.setHours(
    hours,
    minutes,
    0,
    0,
  );

  return result;
}

export function getTodayFixedEvents(
  now = new Date(),
): FixedEvent[] {
  const today =
    getWeekdayName(now);

  const dateKey =
    getLocalDateKey(now);

  const cancelledIds =
    new Set(
      getCancelledClassIds(
        dateKey,
      ),
    );

  return getClasses()
    .filter(
      (classItem) =>
        classItem.day ===
          today &&
        !cancelledIds.has(
          classItem.id,
        ),
    )
    .map((classItem) => ({
      id: classItem.id,
      title: classItem.name,
      startAt:
        makeLocalDate(
          now,
          classItem.start,
        ),
      endAt:
        makeLocalDate(
          now,
          classItem.end,
        ),
    }));
}


function getStudyDateKey(
  now: Date,
  timezone: string,
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall back to the browser's local date.
  }

  return getLocalDateKey(now);
}

export function getStudyMvpTasks(
  state: StudyMvpState,
  now = new Date(),
): TodayTask[] {
  const today = getStudyDateKey(
    now,
    state.settings.timezone,
  );

  const topicsById = new Map(
    state.topics.map((topic) => [topic.id, topic]),
  );

  const unitsById = new Map(
    state.units.map((unit) => [unit.id, unit]),
  );

  const coursesById = new Map(
    state.courses.map((course) => [course.id, course]),
  );

  const retrievalTasksById = new Map(
    state.retrieval_tasks.map((task) => [task.id, task]),
  );

  const eligibleStatuses = new Set([
    "pending",
    "in_progress",
    "deferred",
    "missed",
  ]);

  return state.review_events.flatMap((review): TodayTask[] => {
    if (
      !eligibleStatuses.has(review.status) ||
      review.current_due_date > today
    ) {
      return [];
    }

    const topic = topicsById.get(review.topic_id);

    if (!topic) {
      return [];
    }

    const unit = unitsById.get(topic.unit_id);

    if (!unit) {
      return [];
    }

    const course = coursesById.get(unit.course_id);

    if (!course || course.archived_at) {
      return [];
    }
    const selectedTasks = review.selected_task_ids.map(
      (id) => retrievalTasksById.get(id),
    );

    if (
      review.selected_task_ids.length < 2 ||
      review.selected_task_ids.length > 3 ||
      selectedTasks.some(
        (task) => !task || task.topic_id !== review.topic_id,
      )
    ) {
      return [];
    }

    const durationMinutes = selectedTasks.reduce(
      (total, task) =>
        total + (task?.estimated_duration_min ?? 0),
      0,
    );

    if (
      !Number.isSafeInteger(durationMinutes) ||
      durationMinutes < 1
    ) {
      return [];
    }

    const unitName = [
      course?.name,
      unit?.name,
    ]
      .filter((name): name is string => Boolean(name))
      .join(" · ");

    return [
      {
        id: `study-review-${review.id}`,
        title: `Review — ${topic.title}`,
        ...(unitName ? { unitName } : {}),
        type: "study",
        durationMinutes,
        priority: review.current_priority,
        dueAt: review.current_due_date,
      },
    ];
  });
}


function getReadingTasks(): TodayTask[] {
  const tasks: TodayTask[] =
    [];

  const sessions =
    getReadingSessions();

  const latestBookSession =
    new Map<
      number,
      string
    >();

  for (const session of sessions) {
    const previous =
      latestBookSession.get(
        session.bookId,
      );

    if (
      !previous ||
      new Date(
        session.startedAt,
      ).getTime() >
        new Date(
          previous,
        ).getTime()
    ) {
      latestBookSession.set(
        session.bookId,
        session.startedAt,
      );
    }
  }

  for (const book of getBooks()) {
    if (
      book.status !==
      "Reading"
    ) {
      continue;
    }

    tasks.push({
      id: `book-${book.id}`,
      title: `Read — ${book.title}`,
      type: "reading",
      durationMinutes: 20,
      priority: 3,
      lastWorkedAt:
        latestBookSession.get(
          book.id,
        ),
      cooldownMinutes: 120,
    });
  }

  const essayDurations: Record<
    string,
    number
  > = {
    "To read": 20,
    "First pass": 15,
    "Second pass": 20,
    Reflection: 10,
  };

  for (const essay of getEssays()) {
    if (
      essay.status ===
      "Finished"
    ) {
      continue;
    }

    const essayDates = [
      essay.firstPassStartedAt,
      essay.secondPassStartedAt,
      essay.reflectionStartedAt,
    ].filter(
      (
        value,
      ): value is string =>
        Boolean(value),
    );

    const lastWorkedAt =
      essayDates.length > 0
        ? essayDates.sort(
            (a, b) =>
              new Date(
                b,
              ).getTime() -
              new Date(
                a,
              ).getTime(),
          )[0]
        : undefined;

    tasks.push({
      id: `essay-${essay.id}`,
      title: `Essay — ${essay.title} · ${essay.status}`,
      type: "reading",
      durationMinutes:
        essayDurations[
          essay.status
        ] ?? 15,
      priority: 3,
      lastWorkedAt,
      cooldownMinutes: 120,
    });
  }

  return tasks;
}

function mapEnergy(
  energy:
    | "Low"
    | "Medium"
    | "High",
): EnergyLevel {
  return energy.toLowerCase() as EnergyLevel;
}

function mapImportance(
  importance:
    | "Low"
    | "Medium"
    | "High",
): TaskPriority {
  if (
    importance === "High"
  ) {
    return 5;
  }

  if (
    importance === "Medium"
  ) {
    return 3;
  }

  return 2;
}

function getProjectTasks(): TodayTask[] {
  return getProjects()
    .filter(
      (project) =>
        project.status ===
          "Active" &&
        project.estimatedMinutes >
          0 &&
        project.nextAction.trim(),
    )
    .map((project) => ({
      id: `project-${project.id}`,
      title: `${project.name} — ${project.nextAction}`,
      type: "project",
      durationMinutes:
        project.estimatedMinutes,
      priority:
        mapImportance(
          project.importance,
        ),
      energy:
        mapEnergy(
          project.energy,
        ),
      deadlineAt:
        project.deadline,
      lastWorkedAt:
        project.lastWorkedOn,
      cooldownMinutes: 120,
    }));
}

export function getTodayTasks(
  studyState: StudyMvpState,
  now = new Date(),
): TodayTask[] {
  return [
    ...getStudyMvpTasks(studyState, now),
    ...getReadingTasks(),
    ...getProjectTasks(),
  ];
}

export function getTodayData(
  studyState: StudyMvpState,
  now = new Date(),
) {
  return {
    fixedEvents:
      getTodayFixedEvents(now),
    tasks:
      getTodayTasks(studyState, now),
  };
}
