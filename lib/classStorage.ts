import { ClassItem, classes as defaultClasses } from "./classes";
import { readStoredJson } from "./storageRecovery";

const CLASSES_KEY = "personal-assistant-classes";
const CANCELLED_KEY = "cancelled-class-sessions";

function getTodayKey(
  date = new Date(),
) {
  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1,
  ).padStart(2, "0");

  const day = String(
    date.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getClasses(): ClassItem[] {
  if (typeof window === "undefined") {
    return defaultClasses;
  }

  const saved = localStorage.getItem(CLASSES_KEY);
  if (!saved) {
    return defaultClasses;
  }

  return readStoredJson<ClassItem[]>(
    CLASSES_KEY,
    saved,
    defaultClasses,
    (value) =>
      Array.isArray(value) &&
      value.every((item) => {
        if (
          item === null ||
          typeof item !== "object" ||
          Array.isArray(item)
        ) return false;

        const record = item as Record<string, unknown>;
        return (
          typeof record.id === "number" &&
          typeof record.name === "string" &&
          typeof record.day === "string" &&
          typeof record.start === "string" &&
          typeof record.end === "string" &&
          (record.studyUnitId === undefined ||
            typeof record.studyUnitId === "string")
        );
      }),
  );
}

export function saveClasses(
  classList: ClassItem[],
) {
  localStorage.setItem(
    CLASSES_KEY,
    JSON.stringify(classList),
  );
}

export function addClass(
  newClass: Omit<ClassItem, "id">,
): ClassItem {
  const current = getClasses();

  const createdClass: ClassItem = {
    ...newClass,
    id: Date.now(),
  };

  saveClasses([
    ...current,
    createdClass,
  ]);

  return createdClass;
}


/** Link or unlink a class using a stable Study Unit ID. */
export function updateClassStudyUnit(
  classId: number,
  studyUnitId?: string,
): ClassItem[] {
  const current = getClasses();
  let found = false;

  const next = current.map((item) => {
    if (item.id !== classId) return item;
    found = true;

    const updated = { ...item };
    const normalizedId = studyUnitId?.trim();

    if (normalizedId) updated.studyUnitId = normalizedId;
    else delete updated.studyUnitId;

    return updated;
  });

  if (!found) throw new Error(`Class "${classId}" was not found.`);

  saveClasses(next);
  return next;
}

function getCancelledSessions(): Record<string, number[]> {
  if (typeof window === "undefined") {
    return {};
  }

  const saved = localStorage.getItem(CANCELLED_KEY);
  if (!saved) {
    return {};
  }

  return readStoredJson<Record<string, number[]>>(
    CANCELLED_KEY,
    saved,
    {},
    (value) =>
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.values(value as Record<string, unknown>).every(
        (ids) =>
          Array.isArray(ids) &&
          ids.every((id) => typeof id === "number"),
      ),
  );
}

export function getCancelledClassIds(
  date = getTodayKey(),
): number[] {
  const sessions =
    getCancelledSessions();

  return sessions[date] ?? [];
}

export function cancelClass(
  id: number,
  date = getTodayKey(),
) {
  const sessions =
    getCancelledSessions();

  const current =
    sessions[date] ?? [];

  if (!current.includes(id)) {
    sessions[date] = [
      ...current,
      id,
    ];
  }

  localStorage.setItem(
    CANCELLED_KEY,
    JSON.stringify(sessions),
  );
}

export function restoreClass(
  id: number,
  date = getTodayKey(),
) {
  const sessions =
    getCancelledSessions();

  sessions[date] = (
    sessions[date] ?? []
  ).filter(
    (item) => item !== id,
  );

  localStorage.setItem(
    CANCELLED_KEY,
    JSON.stringify(sessions),
  );
}