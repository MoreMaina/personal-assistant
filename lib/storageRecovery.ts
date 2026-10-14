export type StorageRecoveryReason =
  | "invalid-json"
  | "invalid-shape";

export type LocalStorageRecoveryCopy = {
  originalKey: string;
  preservedAt: string;
  reason: StorageRecoveryReason;
  rawValue: string;
};

export const LOCAL_RECOVERY_COPY_PREFIX =
  "personal-assistant-recovery-copy-";

function fingerprint(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

/**
 * Preserve an unreadable value separately before a caller falls
 * back to defaults. If preservation fails, let the error propagate
 * so a subsequent read-modify-write cannot silently replace it.
 */
export function preserveStoredValue(
  originalKey: string,
  rawValue: string,
  reason: StorageRecoveryReason,
): void {
  if (typeof window === "undefined") {
    throw new Error(
      "Cannot preserve browser storage during server rendering.",
    );
  }

  const recoveryKey =
    LOCAL_RECOVERY_COPY_PREFIX +
    encodeURIComponent(originalKey) +
    "-" +
    fingerprint(originalKey + "\n" + rawValue);

  // Identical corrupt values only need one recovery copy.
  if (window.localStorage.getItem(recoveryKey) !== null) {
    return;
  }

  const copy: LocalStorageRecoveryCopy = {
    originalKey,
    preservedAt: new Date().toISOString(),
    reason,
    rawValue,
  };

  window.localStorage.setItem(
    recoveryKey,
    JSON.stringify(copy),
  );
}

/**
 * Parse and validate stored JSON. Invalid values are preserved
 * before the fallback is returned. A failed preservation throws.
 */
export function readStoredJson<T>(
  originalKey: string,
  rawValue: string,
  fallback: T,
  isValid: (value: unknown) => boolean,
): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    preserveStoredValue(
      originalKey,
      rawValue,
      "invalid-json",
    );

    return fallback;
  }

  if (!isValid(parsed)) {
    preserveStoredValue(
      originalKey,
      rawValue,
      "invalid-shape",
    );

    return fallback;
  }

  return parsed as T;
}

export function getLocalRecoveryCopies():
  LocalStorageRecoveryCopy[] {
  if (typeof window === "undefined") {
    return [];
  }

  const copies: LocalStorageRecoveryCopy[] = [];
  const storage = window.localStorage;

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);

    if (!key?.startsWith(LOCAL_RECOVERY_COPY_PREFIX)) {
      continue;
    }

    const raw = storage.getItem(key);

    if (raw === null) {
      continue;
    }

    try {
      const value: unknown = JSON.parse(raw);

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        const candidate =
          value as Partial<LocalStorageRecoveryCopy>;

        if (
          typeof candidate.originalKey === "string" &&
          typeof candidate.preservedAt === "string" &&
          typeof candidate.rawValue === "string" &&
          (
            candidate.reason === "invalid-json" ||
            candidate.reason === "invalid-shape"
          )
        ) {
          copies.push(candidate as LocalStorageRecoveryCopy);
        }
      }
    } catch {
      // Ignore a malformed recovery index entry; do not modify it.
    }
  }

  return copies.sort(
    (a, b) =>
      b.preservedAt.localeCompare(a.preservedAt),
  );
}
