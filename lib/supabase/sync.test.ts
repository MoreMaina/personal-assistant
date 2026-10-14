import { describe, expect, it, vi } from "vitest";

import {
  applySnapshot,
  applySnapshotWithRollback,
  normalizeSnapshot,
  readLocalSnapshot,
  SYNCED_STORAGE_KEYS,
  snapshotHasUserData,
  snapshotSignature,
  type AppSnapshot,
} from "./sync";

const CALENDAR_KEY =
  "personal-assistant-calendar-items";

const ACADEMIC_SETTINGS_KEY = "personal-assistant-academic-settings";

describe("academic settings sync", () => {
  it("registers, normalizes, and recognizes academic settings as user data", () => {
    const raw = JSON.stringify({ studyYear: 4 });
    expect(SYNCED_STORAGE_KEYS).toContain(ACADEMIC_SETTINGS_KEY);

    const snapshot = normalizeSnapshot({
      [ACADEMIC_SETTINGS_KEY]: raw,
    });

    expect(snapshot[ACADEMIC_SETTINGS_KEY]).toBe(raw);
    expect(snapshotHasUserData(snapshot)).toBe(true);
  });

  it("restores academic settings from a cloud snapshot", () => {
    const raw = JSON.stringify({ studyYear: 5 });
    const storage = new Map<string, string>();
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

    try {
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      });

      applySnapshot({ [ACADEMIC_SETTINGS_KEY]: raw });
      expect(storage.get(ACADEMIC_SETTINGS_KEY)).toBe(raw);
    } finally {
      vi.unstubAllGlobals();
      if (original) {
        Object.defineProperty(globalThis, "localStorage", original);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });
});

describe("snapshot compatibility", () => {
  it("recognizes and preserves the Calendar storage key", () => {
    const calendarData = JSON.stringify([
      {
        id: "task-1",
        type: "task",
        title: "Finish assignment",
        completed: false,
      },
    ]);

    const snapshot = normalizeSnapshot({
      [CALENDAR_KEY]: calendarData,
      "personal-assistant-classes": "[]",
      "unknown-future-key": "some data",
    });

    expect(snapshot[CALENDAR_KEY]).toBe(calendarData);
    expect(snapshot["personal-assistant-classes"]).toBe("[]");
    expect(snapshot).not.toHaveProperty("unknown-future-key");
  });

  it("rejects a registered key whose value is not a string", () => {
    expect(() =>
      normalizeSnapshot({
        [CALENDAR_KEY]: [{ id: "unexpected-object" }],
      }),
    ).toThrow(
      `Invalid app snapshot: "${CALENDAR_KEY}" must be a string.`,
    );
  });

  it("recognizes non-empty Calendar data as user data", () => {
    const snapshot: AppSnapshot = {
      [CALENDAR_KEY]: JSON.stringify([
        {
          id: "event-1",
          type: "event",
          title: "Study group",
        },
      ]),
    };

    expect(snapshotHasUserData(snapshot)).toBe(true);
  });

  it("does not treat an empty Calendar list as meaningful user data", () => {
    const snapshot: AppSnapshot = {
      [CALENDAR_KEY]: "[]",
    };

    expect(snapshotHasUserData(snapshot)).toBe(false);
  });

  it("produces the same signature when keys are in a different order", () => {
    const first: AppSnapshot = {
      [CALENDAR_KEY]: "[]",
      "personal-assistant-classes": "[]",
    };

    const second: AppSnapshot = {
      "personal-assistant-classes": "[]",
      [CALENDAR_KEY]: "[]",
    };

    expect(snapshotSignature(first)).toBe(
      snapshotSignature(second),
    );
  });
});


describe("local snapshot read safety", () => {
  it("refuses to return a partial snapshot if a storage key cannot be read", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );

    try {
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => {
          if (key === "personal-assistant-study-v2") {
            throw new Error("storage unavailable");
          }

          return null;
        },
      });

      expect(() => readLocalSnapshot()).toThrow(
        "storage unavailable",
      );
    } finally {
      vi.unstubAllGlobals();

      if (originalDescriptor) {
        Object.defineProperty(
          globalThis,
          "localStorage",
          originalDescriptor,
        );
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });
});


const CLASSES_KEY = "personal-assistant-classes";

describe("snapshot apply rollback", () => {
  const previousSnapshot: AppSnapshot = {
    [CLASSES_KEY]: "old-classes",
    [CALENDAR_KEY]: "old-calendar",
  };

  const replacementSnapshot: AppSnapshot = {
    [CLASSES_KEY]: "new-classes",
    [CALENDAR_KEY]: "new-calendar",
  };

  function runWithMockStorage(
    configure: (storage: Map<string, string>) => (key: string, value: string) => void,
  ) {
    const storage = new Map<string, string>([
      [CLASSES_KEY, "old-classes"],
      [CALENDAR_KEY, "old-calendar"],
    ]);
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );

    try {
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: configure(storage),
        removeItem: (key: string) => storage.delete(key),
      });

      const result = applySnapshotWithRollback(
        replacementSnapshot,
        previousSnapshot,
      );

      return { result, storage };
    } finally {
      vi.unstubAllGlobals();

      if (originalDescriptor) {
        Object.defineProperty(
          globalThis,
          "localStorage",
          originalDescriptor,
        );
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  }

  it("restores the previous local snapshot after a temporary write failure", () => {
    const storage = new Map<string, string>([
      [CLASSES_KEY, "old-classes"],
      [CALENDAR_KEY, "old-calendar"],
    ]);
    let failReplacementWrite = true;
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );

    try {
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => {
          if (
            key === CALENDAR_KEY &&
            value === "new-calendar" &&
            failReplacementWrite
          ) {
            failReplacementWrite = false;
            throw new Error("simulated quota failure");
          }
          storage.set(key, value);
        },
      });

      const result = applySnapshotWithRollback(
        replacementSnapshot,
        previousSnapshot,
      );

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.rollbackSucceeded).toBe(true);
      expect((result.applyError as Error).message).toBe(
        "simulated quota failure",
      );
      expect(storage.get(CLASSES_KEY)).toBe("old-classes");
      expect(storage.get(CALENDAR_KEY)).toBe("old-calendar");
    } finally {
      vi.unstubAllGlobals();
      if (originalDescriptor) {
        Object.defineProperty(globalThis, "localStorage", originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "localStorage");
      }
    }
  });

  it("reports when applying the replacement and rolling back both fail", () => {
    const { result } = runWithMockStorage((storage) => (key, value) => {
      if (key === CALENDAR_KEY && value === "new-calendar") {
        throw new Error("simulated apply failure");
      }
      if (key === CLASSES_KEY && value === "old-classes") {
        throw new Error("simulated rollback failure");
      }
      storage.set(key, value);
    });

    expect(result.success).toBe(false);
    if (result.success || result.rollbackSucceeded) return;
    expect((result.applyError as Error).message).toBe(
      "simulated apply failure",
    );
    expect((result.rollbackError as Error).message).toBe(
      "simulated rollback failure",
    );
  });
});
