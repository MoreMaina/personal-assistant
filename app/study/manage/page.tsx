"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

import {
  Course,
  Semester,
  Unit,
  getCourses,
  getCurrentSemester,
  getUnits,
  updateCourse,
  deleteCourse,
  updateUnit,
  deleteUnit,
  addUnitsBulk,
} from "@/lib/studyStorage";

export default function StudyManagePage() {
  const [currentSemester, setCurrentSemester] =
    useState<Semester | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);

  const [selectedCourseId, setSelectedCourseId] =
    useState<number | null>(null);

  const [bulkUnits, setBulkUnits] = useState("");

  const [editingCourseId, setEditingCourseId] =
    useState<number | null>(null);

  const [editingCourseName, setEditingCourseName] =
    useState("");

  const [editingUnitId, setEditingUnitId] =
    useState<number | null>(null);

  const [editingUnitName, setEditingUnitName] =
    useState("");

  function refresh() {
    setCurrentSemester(getCurrentSemester());

    setCourses(getCourses());
    setUnits(getUnits());
  }

  useEffect(() => {
    refresh();
  }, []);

  const semesterCourses = currentSemester
    ? courses.filter(
        (course) =>
          course.semesterId === currentSemester.id,
      )
    : [];

  function handleBulkUnits(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selectedCourseId) {
      return;
    }

    const names = bulkUnits
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean);

    if (names.length === 0) {
      return;
    }

    addUnitsBulk(
      selectedCourseId,
      names,
    );

    setBulkUnits("");
    refresh();
  }

  function saveCourse(courseId: number) {
    if (!editingCourseName.trim()) {
      return;
    }

    updateCourse(courseId, {
      name: editingCourseName,
    });

    setEditingCourseId(null);
    setEditingCourseName("");
    refresh();
  }

  function saveUnit(unitId: number) {
    if (!editingUnitName.trim()) {
      return;
    }

    updateUnit(unitId, {
      name: editingUnitName,
    });

    setEditingUnitId(null);
    setEditingUnitName("");
    refresh();
  }

  function removeCourse(course: Course) {
    const confirmed = window.confirm(
      `Delete "${course.name}" and everything inside it?`,
    );

    if (!confirmed) {
      return;
    }

    deleteCourse(course.id);

    if (selectedCourseId === course.id) {
      setSelectedCourseId(null);
    }

    refresh();
  }

  function removeUnit(unit: Unit) {
    const confirmed = window.confirm(
      `Delete "${unit.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    deleteUnit(unit.id);
    refresh();
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Study
          </p>

          <h1 className="mt-1 text-3xl font-semibold text-slate-900">
            Manage
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Change your courses and units without touching
            the normal study workflow.
          </p>
        </div>

        <Link
          href="/study"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
        >
          Back to Study
        </Link>
      </div>

      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Current semester
        </p>

        <h2 className="mt-1 text-xl font-semibold text-slate-900">
          {currentSemester?.name ??
            "No current semester"}
        </h2>
      </section>

      {!currentSemester ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          Create a semester first.
        </div>
      ) : (
        <>
          <section className="mb-8">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">
                Courses
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Edit or remove courses for this semester.
              </p>
            </div>

            <div className="space-y-3">
              {semesterCourses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                  No courses yet.
                </div>
              ) : (
                semesterCourses.map((course) => {
                  const courseUnits = units.filter(
                    (unit) =>
                      unit.courseId === course.id,
                  );

                  const isEditing =
                    editingCourseId === course.id;

                  return (
                    <div
                      key={course.id}
                      className="rounded-xl border border-slate-200 bg-white p-4"
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input
                            value={editingCourseName}
                            onChange={(event) =>
                              setEditingCourseName(
                                event.target.value,
                              )
                            }
                            autoFocus
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />

                          <button
                            onClick={() =>
                              saveCourse(course.id)
                            }
                            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                          >
                            Save
                          </button>

                          <button
                            onClick={() => {
                              setEditingCourseId(null);
                              setEditingCourseName("");
                            }}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="font-medium text-slate-900">
                              {course.name}
                            </h3>

                            <p className="mt-1 text-xs text-slate-500">
                              {courseUnits.length}{" "}
                              {courseUnits.length === 1
                                ? "unit"
                                : "units"}
                            </p>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingCourseId(
                                  course.id,
                                );
                                setEditingCourseName(
                                  course.name,
                                );
                              }}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                removeCourse(course)
                              }
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">
                Add units in bulk
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Pick a course once, then paste one unit per line.
              </p>
            </div>

            <select
              value={selectedCourseId ?? ""}
              onChange={(event) =>
                setSelectedCourseId(
                  event.target.value
                    ? Number(event.target.value)
                    : null,
                )
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">
                Select course
              </option>

              {semesterCourses.map((course) => (
                <option
                  key={course.id}
                  value={course.id}
                >
                  {course.name}
                </option>
              ))}
            </select>

            <form
              onSubmit={handleBulkUnits}
              className="mt-4"
            >
              <textarea
                value={bulkUnits}
                onChange={(event) =>
                  setBulkUnits(
                    event.target.value,
                  )
                }
                placeholder={
                  "One unit per line\nCells\nTissues\nGenetics"
                }
                rows={7}
                disabled={!selectedCourseId}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              />

              <button
                disabled={!selectedCourseId}
                className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add units
              </button>
            </form>
          </section>

          <section>
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-slate-900">
                Units
              </h2>
            </div>

            <div className="space-y-4">
              {semesterCourses.map((course) => {
                const courseUnits = units.filter(
                  (unit) =>
                    unit.courseId === course.id,
                );

                return (
                  <div
                    key={course.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5"
                  >
                    <h3 className="font-semibold text-slate-900">
                      {course.name}
                    </h3>

                    {courseUnits.length === 0 ? (
                      <p className="mt-3 text-sm text-slate-400">
                        No units yet.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {courseUnits.map((unit) => {
                          const isEditing =
                            editingUnitId ===
                            unit.id;

                          return (
                            <div
                              key={unit.id}
                              className="rounded-lg border border-slate-200 p-3"
                            >
                              {isEditing ? (
                                <div className="flex flex-col gap-3 sm:flex-row">
                                  <input
                                    value={
                                      editingUnitName
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      setEditingUnitName(
                                        event.target
                                          .value,
                                      )
                                    }
                                    autoFocus
                                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                  />

                                  <button
                                    onClick={() =>
                                      saveUnit(
                                        unit.id,
                                      )
                                    }
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                                  >
                                    Save
                                  </button>

                                  <button
                                    onClick={() => {
                                      setEditingUnitId(
                                        null,
                                      );
                                      setEditingUnitName(
                                        "",
                                      );
                                    }}
                                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <p className="text-sm text-slate-800">
                                    {unit.name}
                                  </p>

                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => {
                                        setEditingUnitId(
                                          unit.id,
                                        );
                                        setEditingUnitName(
                                          unit.name,
                                        );
                                      }}
                                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                                    >
                                      Edit
                                    </button>

                                    <button
                                      onClick={() =>
                                        removeUnit(
                                          unit,
                                        )
                                      }
                                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}