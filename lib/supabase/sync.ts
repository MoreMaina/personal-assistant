export const SYNCED_STORAGE_KEYS = [
  "personal-assistant-classes",
  "cancelled-class-sessions",
  "personal-assistant-study-v2",
  "personal-assistant-current-semester",
  "personal-assistant-books",
  "personal-assistant-reading-sessions",
  "personal-assistant-essays",
  "personal-assistant-projects",
] as const;

export type AppSnapshot = Record<string, string>;

export function readLocalSnapshot(): AppSnapshot {
  const snapshot: AppSnapshot = {};

  for (const key of SYNCED_STORAGE_KEYS) {
    try {
      const value = localStorage.getItem(key);

      if (value !== null) {
        snapshot[key] = value;
      }
    } catch {
      // Keep the snapshot limited to readable values.
    }
  }

  return snapshot;
}

export function normalizeSnapshot(
  value: unknown,
): AppSnapshot {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const snapshot: AppSnapshot = {};

  for (const key of SYNCED_STORAGE_KEYS) {
    if (typeof source[key] === "string") {
      snapshot[key] = source[key] as string;
    }
  }

  return snapshot;
}

export function snapshotSignature(
  snapshot: AppSnapshot,
): string {
  const sorted: AppSnapshot = {};

  for (
    const key of Object.keys(snapshot).sort()
  ) {
    sorted[key] = snapshot[key];
  }

  return JSON.stringify(sorted);
}

function parseStoredValue(
  raw: string,
): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Returns true only when the snapshot contains
 * meaningful existing app data.
 *
 * Malformed non-empty values are treated as data
 * so that a sync cannot silently discard them.
 */
export function snapshotHasUserData(
  snapshot: AppSnapshot,
): boolean {
  for (const [key, raw] of Object.entries(snapshot)) {
    const value = parseStoredValue(raw);

    if (value === undefined) {
      if (raw.trim()) {
        return true;
      }

      continue;
    }

    if (
      key === "personal-assistant-current-semester"
    ) {
      if (raw.trim()) {
        return true;
      }

      continue;
    }

    if (
      key === "personal-assistant-study-v2"
    ) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        const study = value as Record<
          string,
          unknown
        >;

        const collections = [
          study.programs,
          study.semesters,
          study.courses,
          study.units,
          study.lectures,
        ];

        if (
          collections.some(
            (collection) =>
              Array.isArray(collection) &&
              collection.length > 0,
          )
        ) {
          return true;
        }
      }

      continue;
    }

    if (key === "cancelled-class-sessions") {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.values(
          value as Record<string, unknown>,
        ).some(
          (ids) =>
            Array.isArray(ids) &&
            ids.length > 0,
        )
      ) {
        return true;
      }

      continue;
    }

    if (Array.isArray(value) && value.length > 0) {
      return true;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    ) {
      return true;
    }
  }

  return false;
}

export function applySnapshot(
  snapshot: AppSnapshot,
): void {
  for (const key of SYNCED_STORAGE_KEYS) {
    const value = snapshot[key];

    if (value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  }
}

export function saveLocalBackup(
  label: string,
  snapshot: AppSnapshot,
): void {
  localStorage.setItem(
    label,
    JSON.stringify({
      savedAt: new Date().toISOString(),
      snapshot,
    }),
  );
}