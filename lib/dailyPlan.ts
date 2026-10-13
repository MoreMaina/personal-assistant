export type DailyPlanTaskOption = {
  id: string;
  title: string;
  minutes: number | null;
};

export type DailyPlanWindowOption = {
  date: string;
  startAt: Date;
  endAt: Date;
};

export type DailyPlanPointEvent = {
  date: string;
  time: string;
  endTime?: string;
  title: string;
};

export type DailyPlanValidationInput = {
  todayDate: string;
  tomorrowDate: string;
  now: Date;
  tasks: DailyPlanTaskOption[];
  windows: DailyPlanWindowOption[];
  pointEvents?: DailyPlanPointEvent[];
};

export type ValidatedDailyPlanBlock = {
  date: string;
  start: string;
  end: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  title: string;
  reason: string;
};

export type ValidatedDailyPlan = {
  blocks: ValidatedDailyPlanBlock[];
};

function parseLocalDateTime(
  date: string,
  time: string,
): Date | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
  ) {
    return null;
  }

  const parsed = new Date(`${date}T${time}:00`);

  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  const actualDate = [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");

  const actualTime = [
    String(parsed.getHours()).padStart(2, "0"),
    String(parsed.getMinutes()).padStart(2, "0"),
  ].join(":");

  return actualDate === date && actualTime === time
    ? parsed
    : null;
}

/**
 * Parses and validates Gemini's proposed work blocks.
 * Task titles are always taken from trusted local task options.
 * Any invalid block rejects the whole schedule.
 */
export function validateDailyPlanAnswer(
  answer: string,
  input: DailyPlanValidationInput,
): ValidatedDailyPlan {
  let parsed: unknown;

  try {
    parsed = JSON.parse(answer);
  } catch {
    throw new Error(
      "The planner did not return a verifiable schedule. No plan was shown; refresh and try again.",
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("The planner returned an invalid schedule structure.");
  }

  const plan = parsed as Record<string, unknown>;

  if (
    typeof plan.summary !== "string" ||
    !Array.isArray(plan.blocks) ||
    plan.blocks.length > 3
  ) {
    throw new Error("The planner returned an invalid schedule structure.");
  }

  const tasksById = new Map(
    input.tasks.map((task) => [task.id, task] as const),
  );

  const blocks: ValidatedDailyPlanBlock[] = [];

  for (const candidate of plan.blocks) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      throw new Error("A suggested work block was malformed.");
    }

    const block = candidate as Record<string, unknown>;

    if (
      typeof block.date !== "string" ||
      typeof block.taskId !== "string" ||
      typeof block.start !== "string" ||
      typeof block.end !== "string" ||
      typeof block.reason !== "string" ||
      (
        block.date !== input.todayDate &&
        block.date !== input.tomorrowDate
      )
    ) {
      throw new Error(
        "A work block had an invalid date or missing fields.",
      );
    }

    const task = tasksById.get(block.taskId);

    if (!task) {
      throw new Error(
        "A work block referenced a task that could not be verified. No plan was shown; refresh and try again.",
      );
    }

    const startAt = parseLocalDateTime(block.date, block.start);
    const endAt = parseLocalDateTime(block.date, block.end);

    if (!startAt || !endAt || endAt <= startAt) {
      throw new Error("A work block had an invalid time.");
    }

    const dayStart = parseLocalDateTime(block.date, "07:00");
    const dayEnd = parseLocalDateTime(block.date, "22:00");

    if (!dayStart || !dayEnd) {
      throw new Error("The planning date could not be interpreted.");
    }

    const durationMs = endAt.getTime() - startAt.getTime();
    const durationMinutes = durationMs / 60_000;

    if (
      durationMinutes <= 0 ||
      durationMinutes > 90 ||
      startAt < dayStart ||
      endAt > dayEnd ||
      (
        task.minutes !== null &&
        durationMinutes > task.minutes
      ) ||
      (
        task.minutes === null &&
        durationMinutes < 15
      )
    ) {
      throw new Error(
        "A work block exceeded the allowed hours or duration. No plan was shown; refresh and try again.",
      );
    }

    if (
      block.date === input.todayDate &&
      startAt < input.now
    ) {
      throw new Error(
        "A work block started in the past. No plan was shown; refresh and try again.",
      );
    }

    const fitsRealWindow = input.windows.some(
      (window) =>
        window.date === block.date &&
        startAt >= window.startAt &&
        endAt <= window.endAt,
    );

    if (!fitsRealWindow) {
      throw new Error(
        "A work block did not fit an actual free window. No plan was shown; refresh and try again.",
      );
    }

    for (const event of input.pointEvents ?? []) {
      if (event.date !== block.date) {
        continue;
      }

      const eventAt = parseLocalDateTime(event.date, event.time);
      const eventEndAt = event.endTime
        ? parseLocalDateTime(event.date, event.endTime)
        : null;

      let conflictsWithBlock = false;

      if (eventAt) {
        if (eventEndAt && eventEndAt > eventAt) {
          // Treat timed events as half-open intervals:
          // touching endpoints do not count as an overlap.
          conflictsWithBlock =
            eventAt < endAt && eventEndAt > startAt;
        } else {
          // Preserve the existing point-event behavior when no valid
          // end time is available.
          conflictsWithBlock =
            eventAt >= startAt && eventAt < endAt;
        }
      }

      if (conflictsWithBlock) {
        throw new Error(
          `A work block conflicts with the timed event "${event.title}". No plan was shown; refresh and try again.`,
        );
      }
    }

    blocks.push({
      date: block.date,
      start: block.start,
      end: block.end,
      startAt,
      endAt,
      durationMinutes,
      title: task.title,
      reason: block.reason.trim().slice(0, 200),
    });
  }

  blocks.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startAt.getTime() - b.startAt.getTime(),
  );

  for (let index = 1; index < blocks.length; index += 1) {
    const previous = blocks[index - 1];
    const current = blocks[index];

    if (
      previous.date === current.date &&
      current.startAt.getTime() <
        previous.endAt.getTime() + 10 * 60_000
    ) {
      throw new Error(
        "Work blocks overlap or leave less than 10 minutes for a break. No plan was shown; refresh and try again.",
      );
    }
  }

  return { blocks };
}
