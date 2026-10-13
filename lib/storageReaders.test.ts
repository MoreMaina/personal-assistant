import { afterEach, describe, expect, it, vi } from "vitest";

import { getClasses, getCancelledClassIds } from "./classStorage";
import { getCalendarItems } from "./calendarItemStorage";
import { getProjects } from "./projectStorage";
import { getBooks, getEssays, getReadingSessions } from "./readingStorage";
import { getStudyData } from "./studyStorage";
import { getLocalRecoveryCopies } from "./storageRecovery";

function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage = {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key: string) { return values.get(key) ?? null; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    removeItem(key: string) { values.delete(key); },
    setItem(key: string, value: string) { values.set(key, String(value)); },
  };

  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
  return values;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("storage reader recovery", () => {
  it("preserves malformed Classes data", () => {
    const raw = "{broken";
    const values = installStorage({ "personal-assistant-classes": raw });

    expect(Array.isArray(getClasses())).toBe(true);
    expect(values.get("personal-assistant-classes")).toBe(raw);
    expect(getLocalRecoveryCopies().some(
      (copy) => copy.originalKey === "personal-assistant-classes",
    )).toBe(true);
  });

  it("preserves invalid cancelled-session shapes", () => {
    const raw = "[]";
    const values = installStorage({ "cancelled-class-sessions": raw });

    expect(getCancelledClassIds("2026-10-11")).toEqual([]);
    expect(values.get("cancelled-class-sessions")).toBe(raw);
  });

  it("preserves invalid Calendar entries rather than filtering the raw record", () => {
    const raw = JSON.stringify([{ unexpected: true }]);
    const values = installStorage({ "personal-assistant-calendar-items": raw });

    expect(getCalendarItems()).toEqual([]);
    expect(values.get("personal-assistant-calendar-items")).toBe(raw);
  });

  it("preserves a malformed Projects document", () => {
    const raw = JSON.stringify({});
    const values = installStorage({ "personal-assistant-projects": raw });

    expect(getProjects()).toEqual([]);
    expect(values.get("personal-assistant-projects")).toBe(raw);
  });

  it("preserves malformed Books, Reading Sessions and Essays", () => {
    const initial = {
      "personal-assistant-books": "{broken books",
      "personal-assistant-reading-sessions": "{broken sessions",
      "personal-assistant-essays": "{broken essays",
    };
    const values = installStorage(initial);

    expect(Array.isArray(getBooks())).toBe(true);
    expect(getReadingSessions()).toEqual([]);
    expect(getEssays()).toEqual([]);

    for (const [key, raw] of Object.entries(initial)) {
      expect(values.get(key)).toBe(raw);
    }

    const recovered = getLocalRecoveryCopies().map((copy) => copy.originalKey);
    expect(recovered).toContain("personal-assistant-books");
    expect(recovered).toContain("personal-assistant-reading-sessions");
    expect(recovered).toContain("personal-assistant-essays");
  });

  it("preserves malformed Study data", () => {
    const raw = "{broken study data";
    const values = installStorage({ "personal-assistant-study-v2": raw });

    expect(getStudyData()).toEqual({
      programs: [],
      semesters: [],
      courses: [],
      units: [],
      lectures: [],
    });
    expect(values.get("personal-assistant-study-v2")).toBe(raw);
  });

  it("preserves valid JSON with an invalid Study collection shape", () => {
    const raw = JSON.stringify({ programs: "not an array" });
    const values = installStorage({ "personal-assistant-study-v2": raw });

    expect(getStudyData().programs).toEqual([]);
    expect(values.get("personal-assistant-study-v2")).toBe(raw);
    expect(getLocalRecoveryCopies().some(
      (copy) =>
        copy.originalKey === "personal-assistant-study-v2" &&
        copy.reason === "invalid-shape",
    )).toBe(true);
  });
});
