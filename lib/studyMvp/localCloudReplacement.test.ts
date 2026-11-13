import { describe, expect, it } from "vitest";
import {
  createEmptyStudyState,
  replaceStudyMvpStateWithRecovery,
  STUDY_MVP_STORAGE_KEY,
} from "./storage";

class TestStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

describe("Study local recovery before cloud replacement", () => {
  it("preserves the exact previous browser value before replacing it", () => {
    const storage = new TestStorage();
    const oldValue = '{"example":"existing-browser-data"}';
    const replacement = createEmptyStudyState();

    storage.setItem(STUDY_MVP_STORAGE_KEY, oldValue);

    replaceStudyMvpStateWithRecovery(replacement, storage);

    expect(
      JSON.parse(storage.getItem(STUDY_MVP_STORAGE_KEY) ?? "null"),
    ).toEqual(replacement);

    const recoveryKey = Array.from(
      { length: storage.length },
      (_, index) => storage.key(index),
    ).find((key) =>
      key?.startsWith(`${STUDY_MVP_STORAGE_KEY}.recovery.`),
    );

    expect(recoveryKey).toBeTruthy();

    const recovery = JSON.parse(
      storage.getItem(recoveryKey!) ?? "null",
    );

    expect(recovery.format).toBe(
      "personal-assistant-study-mvp-local-recovery",
    );
    expect(recovery.raw_value).toBe(oldValue);
    expect(recovery.original_storage_key).toBe(
      STUDY_MVP_STORAGE_KEY,
    );
  });

  it("does not replace the browser data if recovery storage fails", () => {
    const storage = new TestStorage();
    const oldValue = '{"example":"keep-this"}';

    storage.setItem(STUDY_MVP_STORAGE_KEY, oldValue);

    const failingStorage = {
      getItem: (key: string) => storage.getItem(key),
      setItem: (key: string, value: string) => {
        if (key !== STUDY_MVP_STORAGE_KEY) {
          throw new Error("Simulated recovery failure");
        }

        storage.setItem(key, value);
      },
      removeItem: (key: string) => storage.removeItem(key),
    };

    expect(() =>
      replaceStudyMvpStateWithRecovery(
        createEmptyStudyState(),
        failingStorage as unknown as Storage,
      ),
    ).toThrow("Simulated recovery failure");

    expect(storage.getItem(STUDY_MVP_STORAGE_KEY)).toBe(oldValue);
  });
});
