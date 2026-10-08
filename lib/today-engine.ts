export type TodayTaskType =
  | "study"
  | "reading"
  | "project";

export type TaskPriority = 1 | 2 | 3 | 4 | 5;

export type EnergyLevel =
  | "low"
  | "medium"
  | "high";

export type DateLike = Date | string;

export interface FixedEvent {
  id: string | number;
  title: string;
  startAt: DateLike;
  endAt: DateLike;
  cancelled?: boolean;
}

export interface FreeWindow {
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
}

export interface TodayTask {
  id: string | number;
  title: string;
  type: TodayTaskType;
  durationMinutes: number;

  priority?: TaskPriority;
  energy?: EnergyLevel;

  dueAt?: DateLike;
  deadlineAt?: DateLike;
  availableFrom?: DateLike;

  /**
   * The last time this task was worked on.
   * Used to prevent Today from repeatedly
   * recommending the same item immediately.
   */
  lastWorkedAt?: DateLike;

  /**
   * How long Today should gently prefer
   * other work after this task was touched.
   */
  cooldownMinutes?: number;
}

export interface Recommendation {
  task: TodayTask;
  window: FreeWindow;
  score: number;
  explanation: string;
}

function toDate(value: DateLike): Date {
  return value instanceof Date
    ? new Date(value.getTime())
    : new Date(value);
}

function minutesBetween(
  start: Date,
  end: Date,
): number {
  return Math.max(
    0,
    Math.round(
      (end.getTime() - start.getTime()) /
        60000,
    ),
  );
}

function endOfToday(date: Date): Date {
  const end = new Date(date);

  end.setHours(
    23,
    59,
    59,
    999,
  );

  return end;
}

export function getFreeWindows(
  fixedEvents: FixedEvent[],
  now = new Date(),
  dayEnd = endOfToday(now),
): FreeWindow[] {
  const start = new Date(now);

  const events = fixedEvents
    .filter(
      (event) => !event.cancelled,
    )
    .map((event) => ({
      startAt: toDate(
        event.startAt,
      ),
      endAt: toDate(
        event.endAt,
      ),
    }))
    .filter(
      (event) =>
        event.endAt > start &&
        event.startAt < dayEnd,
    )
    .sort(
      (a, b) =>
        a.startAt.getTime() -
        b.startAt.getTime(),
    );

  const windows: FreeWindow[] = [];

  let cursor = start;

  for (const event of events) {
    const eventStart =
      event.startAt > start
        ? event.startAt
        : start;

    const eventEnd =
      event.endAt < dayEnd
        ? event.endAt
        : dayEnd;

    if (eventStart > cursor) {
      windows.push({
        startAt: new Date(cursor),
        endAt: new Date(
          eventStart,
        ),
        durationMinutes:
          minutesBetween(
            cursor,
            eventStart,
          ),
      });
    }

    if (eventEnd > cursor) {
      cursor = eventEnd;
    }

    if (cursor >= dayEnd) {
      break;
    }
  }

  if (cursor < dayEnd) {
    windows.push({
      startAt: new Date(cursor),
      endAt: new Date(dayEnd),
      durationMinutes:
        minutesBetween(
          cursor,
          dayEnd,
        ),
    });
  }

  return windows.filter(
    (window) =>
      window.durationMinutes > 0,
  );
}

export function getEligibleTasks(
  tasks: TodayTask[],
  window: FreeWindow,
): TodayTask[] {
  return tasks.filter((task) => {
    if (
      !Number.isFinite(
        task.durationMinutes,
      ) ||
      task.durationMinutes <= 0
    ) {
      return false;
    }

    if (
      task.durationMinutes >
      window.durationMinutes
    ) {
      return false;
    }

    if (task.availableFrom) {
      const availableFrom =
        toDate(
          task.availableFrom,
        );

      const earliestStart =
        availableFrom >
        window.startAt
          ? availableFrom
          : window.startAt;

      if (
        earliestStart.getTime() +
          task.durationMinutes *
            60000 >
        window.endAt.getTime()
      ) {
        return false;
      }
    }

    if (task.deadlineAt) {
      const deadline =
        toDate(
          task.deadlineAt,
        );

      const latestFinish =
        window.startAt.getTime() +
        task.durationMinutes *
          60000;

      if (
        latestFinish >
        deadline.getTime()
      ) {
        return false;
      }
    }

    return true;
  });
}

export function scoreTask(
  task: TodayTask,
  window: FreeWindow,
  now = new Date(),
): number {
  let score = 0;

  const currentTime =
    now.getTime();

  score +=
    (task.priority ?? 3) * 60;

  if (task.dueAt) {
    const dueAt = toDate(
      task.dueAt,
    );

    const difference =
      dueAt.getTime() -
      currentTime;

    if (difference <= 0) {
      const overdueHours =
        Math.min(
          24,
          Math.max(
            0,
            -difference /
              3600000,
          ),
        );

      score += 500;

      score += Math.round(
        overdueHours * 10,
      );
    } else if (
      difference <=
      24 * 3600000
    ) {
      score += 350;
    } else if (
      difference <=
      3 * 24 * 3600000
    ) {
      score += 150;
    }
  }

  if (task.deadlineAt) {
    const deadline =
      toDate(
        task.deadlineAt,
      );

    const difference =
      deadline.getTime() -
      currentTime;

    if (difference <= 0) {
      score += 600;
    } else if (
      difference <=
      24 * 3600000
    ) {
      score += 400;
    } else if (
      difference <=
      3 * 24 * 3600000
    ) {
      score += 200;
    }
  }

  /*
   * Recently worked-on items get a temporary
   * cooldown. This is deliberately a soft
   * penalty, not a hard block.
   */
  if (task.lastWorkedAt) {
    const lastWorked =
      toDate(
        task.lastWorkedAt,
      );

    const elapsedMinutes =
      Math.max(
        0,
        (currentTime -
          lastWorked.getTime()) /
          60000,
      );

    const cooldownMinutes =
      task.cooldownMinutes ??
      120;

    if (
      elapsedMinutes <
      cooldownMinutes
    ) {
      const remainingRatio =
        1 -
        elapsedMinutes /
          cooldownMinutes;

      score -= Math.round(
        300 *
          remainingRatio,
      );
    }
  }

  const slack =
    window.durationMinutes -
    task.durationMinutes;

  if (slack <= 10) {
    score += 40;
  } else if (slack <= 20) {
    score += 25;
  }

  const minutesUntilWindow =
    Math.max(
      0,
      Math.round(
        (window.startAt.getTime() -
          currentTime) /
          60000,
      ),
    );

  score += Math.max(
    0,
    60 -
      minutesUntilWindow,
  );

  return score;
}

function formatDuration(
  minutes: number,
): string {
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

function buildExplanation(
  task: TodayTask,
  window: FreeWindow,
  fixedEvents: FixedEvent[],
  now: Date,
): string {
  const reasons: string[] = [];

  if (task.dueAt) {
    const dueAt = toDate(
      task.dueAt,
    );

    if (dueAt <= now) {
      reasons.push(
        "It is due now",
      );
    } else if (
      dueAt.toDateString() ===
      now.toDateString()
    ) {
      reasons.push(
        "It is due today",
      );
    }
  }

  if (task.deadlineAt) {
    const deadline =
      toDate(
        task.deadlineAt,
      );

    if (
      deadline.toDateString() ===
      now.toDateString()
    ) {
      reasons.push(
        "The deadline is today",
      );
    }
  }

  reasons.push(
    `you have ${formatDuration(
      window.durationMinutes,
    )} available`,
  );

  const nextEvent =
    fixedEvents
      .filter(
        (event) =>
          !event.cancelled &&
          toDate(
            event.startAt,
          ) >
            window.startAt,
      )
      .sort(
        (a, b) =>
          toDate(
            a.startAt,
          ).getTime() -
          toDate(
            b.startAt,
          ).getTime(),
      )[0];

  if (nextEvent) {
    reasons[
      reasons.length - 1
    ] += ` before ${nextEvent.title}`;
  }

  if (reasons.length === 1) {
    reasons.unshift(
      `It fits your ${formatDuration(
        window.durationMinutes,
      )} window`,
    );
  }

  return `${reasons.join(
    " + ",
  )}.`;
}

export function getTodayRecommendation(
  fixedEvents: FixedEvent[],
  tasks: TodayTask[],
  now = new Date(),
): Recommendation | null {
  const windows =
    getFreeWindows(
      fixedEvents,
      now,
    );

  let bestRecommendation:
    | Recommendation
    | null = null;

  for (const window of windows) {
    const eligibleTasks =
      getEligibleTasks(
        tasks,
        window,
      );

    for (const task of eligibleTasks) {
      const score =
        scoreTask(
          task,
          window,
          now,
        );

      const recommendation:
        Recommendation = {
          task,
          window,
          score,
          explanation:
            buildExplanation(
              task,
              window,
              fixedEvents,
              now,
            ),
        };

      if (
        !bestRecommendation ||
        score >
          bestRecommendation.score
      ) {
        bestRecommendation =
          recommendation;
      }
    }
  }

  return bestRecommendation;
}