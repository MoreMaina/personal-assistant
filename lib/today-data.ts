import {
  getClasses,
  getCancelledClassIds,
} from "./classStorage";

import {
  getCurrentSemester,
  getCourses,
  getDueLectures,
  getUnits,
} from "./studyStorage";

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

function getStudyDuration(
  box: number,
): number {
  if (box <= 1) {
    return 8;
  }

  if (box === 2) {
    return 8;
  }

  if (box === 3) {
    return 10;
  }

  if (box === 4) {
    return 12;
  }

  return 15;
}

function getStudyTasks(): TodayTask[] {
  const semester =
    getCurrentSemester();

  if (!semester) {
    return [];
  }

  const courses =
    getCourses().filter(
      (course) =>
        course.semesterId ===
        semester.id,
    );

  const courseById =
    new Map(
      courses.map(
        (course) => [
          course.id,
          course,
        ],
      ),
    );

  const courseIds =
    new Set(
      courses.map(
        (course) =>
          course.id,
      ),
    );

  const units =
    getUnits().filter(
      (unit) =>
        courseIds.has(
          unit.courseId,
        ),
    );

  const unitById =
    new Map(
      units.map(
        (unit) => [
          unit.id,
          unit,
        ],
      ),
    );

  return getDueLectures(
    semester.id,
  ).map((lecture) => {
    const unit =
      unitById.get(
        lecture.unitId,
      );

    const course = unit
      ? courseById.get(
          unit.courseId,
        )
      : undefined;

    return {
      id: `study-${lecture.id}`,
      title: [
        course?.name,
        unit?.name,
        lecture.name,
      ]
        .filter(Boolean)
        .join(" — "),
      type: "study",
      durationMinutes:
        getStudyDuration(
          lecture.box,
        ),
      priority:
        (lecture.box >= 4
          ? 5
          : 4) as TaskPriority,
      dueAt:
        lecture.nextReviewAt,
    };
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

export function getTodayTasks(): TodayTask[] {
  return [
    ...getStudyTasks(),
    ...getReadingTasks(),
    ...getProjectTasks(),
  ];
}

export function getTodayData(
  now = new Date(),
) {
  return {
    fixedEvents:
      getTodayFixedEvents(now),
    tasks:
      getTodayTasks(),
  };
}