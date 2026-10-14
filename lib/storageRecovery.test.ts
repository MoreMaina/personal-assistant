import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLocalRecoveryCopies,
  readStoredJson,
} from "./storageRecovery";

function makeStorage() {
  const values = new Map<string, string>();

  return {
    values,
    storage: {
      get length() {
        return values.size;
      },
      clear() {
        values.clear();
      },
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      key(index: number) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key: string) {
        values.delete(key);
      },
      setItem(key: string, value: string) {
        values.set(key, String(value));
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local storage recovery", () => {
  it("preserves malformed JSON before returning the fallback", () => {
    const { values, storage } = makeStorage();
    const rawValue = "{this is not valid JSON";
    values.set("personal-assistant-books", rawValue);

    vi.stubGlobal("window", { localStorage: storage });

    const result = readStoredJson(
      "personal-assistant-books",
      rawValue,
      [],
      Array.isArray,
    );

    expect(result).toEqual([]);
    expect(values.get("personal-assistant-books")).toBe(rawValue);

    const copies = getLocalRecoveryCopies();
    expect(copies).toHaveLength(1);
    expect(copies[0].originalKey).toBe("personal-assistant-books");
    expect(copies[0].rawValue).toBe(rawValue);
    expect(copies[0].reason).toBe("invalid-json");
  });

  it("preserves valid JSON with an invalid top-level shape", () => {
    const { values, storage } = makeStorage();
    const rawValue = JSON.stringify({ unexpected: true });
    values.set("personal-assistant-projects", rawValue);

    vi.stubGlobal("window", { localStorage: storage });

    const result = readStoredJson(
      "personal-assistant-projects",
      rawValue,
      [],
      Array.isArray,
    );

    expect(result).toEqual([]);
    expect(values.get("personal-assistant-projects")).toBe(rawValue);
    expect(getLocalRecoveryCopies()[0].reason).toBe("invalid-shape");
  });

  it("does not create recovery copies for valid data", () => {
    const { storage } = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });

    expect(
      readStoredJson("personal-assistant-projects", "[]", [], Array.isArray),
    ).toEqual([]);

    expect(getLocalRecoveryCopies()).toEqual([]);
  });

  it("throws when a corrupt value cannot be preserved", () => {
    const rawValue = "{broken";
    const storage = {
      get length() {
        return 1;
      },
      key() {
        return "personal-assistant-books";
      },
      getItem(key: string) {
        return key === "personal-assistant-books" ? rawValue : null;
      },
      setItem() {
        throw new Error("storage quota exceeded");
      },
      removeItem() {},
      clear() {},
    };

    vi.stubGlobal("window", { localStorage: storage });

    expect(() =>
      readStoredJson(
        "personal-assistant-books",
        rawValue,
        [],
        Array.isArray,
      ),
    ).toThrow("storage quota exceeded");
  });
});
