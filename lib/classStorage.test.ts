import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getClasses, saveClasses, updateClassStudyUnit } from "./classStorage";
import type { ClassItem } from "./classes";

const CLASSES_KEY = "personal-assistant-classes";
const values = new Map<string, string>();

const fakeStorage = {
  getItem(key: string) {
    return values.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    values.set(key, String(value));
  },
  removeItem(key: string) {
    values.delete(key);
  },
  clear() {
    values.clear();
  },
};

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function restoreProperty(
  key: "window" | "localStorage",
  descriptor?: PropertyDescriptor,
) {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor);
  } else {
    Reflect.deleteProperty(globalThis, key);
  }
}

function makeClass(
  id: number,
  name: string,
  studyUnitId?: string,
): ClassItem {
  return {
    id,
    name,
    type: "Lecture",
    day: "Monday",
    start: "10:00",
    end: "11:00",
    ...(studyUnitId ? { studyUnitId } : {}),
  };
}

beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: fakeStorage,
  });
});

afterEach(() => {
  restoreProperty("window", originalWindow);
  restoreProperty("localStorage", originalStorage);
});

describe("Class–Study Unit links", () => {
  it("keeps legacy timetable records without a Unit link valid", () => {
    const legacy = makeClass(1, "Economics");
    saveClasses([legacy]);

    expect(getClasses()).toEqual([legacy]);
    expect(getClasses()[0].studyUnitId).toBeUndefined();
  });

  it("links a class by stable Unit ID without changing other records", () => {
    const economics = makeClass(1, "Economics");
    const mathematics = makeClass(2, "Mathematics", "unit-existing");
    saveClasses([economics, mathematics]);

    const updated = updateClassStudyUnit(1, "unit-economics");

    expect(updated).toEqual([
      { ...economics, studyUnitId: "unit-economics" },
      mathematics,
    ]);
    expect(JSON.parse(values.get(CLASSES_KEY) ?? "[]")).toEqual(updated);
  });

  it("unlinks a class without deleting its timetable record", () => {
    saveClasses([makeClass(1, "Economics", "unit-economics")]);

    const updated = updateClassStudyUnit(1);

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      id: 1,
      name: "Economics",
      day: "Monday",
      start: "10:00",
      end: "11:00",
    });
    expect(Object.hasOwn(updated[0], "studyUnitId")).toBe(false);
  });

  it("does not save when the requested class ID is missing", () => {
    saveClasses([makeClass(1, "Economics")]);
    const before = values.get(CLASSES_KEY);

    expect(() => updateClassStudyUnit(99, "unit-missing")).toThrow(/was not found/i);
    expect(values.get(CLASSES_KEY)).toBe(before);
  });
});
