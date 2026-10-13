"use client";

import { FormEvent, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import CardMenu from "@/app/components/CardMenu";

import {
  Course,
  Lecture,
  Semester,
  Unit,
  addCoursesBulk,
  addLecturesBulk,
  addUnitsBulk,
  deleteCourse,
  deleteLecture,
  deleteUnit,
  getCourses,
  getCurrentSemester,
  getLectures,
  getUnits,
  setCurrentSemesterId,
  updateCourse,
  updateLecture,
  updateUnit,
} from "@/lib/studyStorage";

export default function StudyManagePage() {
  const [currentSemester, setCurrentSemester] =
    useState<Semester | null>(null);

  const [highlightedLectureId, setHighlightedLectureId] =
    useState<number | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>(
    [],
  );





  const [expandedCourses, setExpandedCourses] =
    useState<Record<number, boolean>>({});

  const [expandedUnits, setExpandedUnits] =
    useState<Record<number, boolean>>({});

  const [showAddCourses, setShowAddCourses] =
    useState(false);

  const [bulkCourses, setBulkCourses] =
    useState("");

  const [addingUnitsToCourseId, setAddingUnitsToCourseId] =
    useState<number | null>(null);

  const [bulkUnits, setBulkUnits] = useState("");

  const [addingLecturesToUnitId, setAddingLecturesToUnitId] =
    useState<number | null>(null);

  const [bulkLectures, setBulkLectures] =
    useState("");

  const [editingCourseId, setEditingCourseId] =
    useState<number | null>(null);

  const [editingCourseName, setEditingCourseName] =
    useState("");

  const [editingUnitId, setEditingUnitId] =
    useState<number | null>(null);

  const [editingUnitName, setEditingUnitName] =
    useState("");

  const [editingLectureId, setEditingLectureId] =
    useState<number | null>(null);

  const [editingLectureName, setEditingLectureName] =
    useState("");

  const refresh = useCallback(() => {
    setCurrentSemester(getCurrentSemester());
    setCourses(getCourses());
    setUnits(getUnits());
    setLectures(getLectures());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const rawId = new URLSearchParams(window.location.search)
      .get("findLectureId");

    if (!rawId || lectures.length === 0) return;

    const id = Number(rawId);
    if (!Number.isFinite(id)) return;

    const lecture = lectures.find((item) => item.id === id);
    if (!lecture) return;

    const unit = units.find((item) => item.id === lecture.unitId);
    const course = unit
      ? courses.find((item) => item.id === unit.courseId)
      : undefined;

    if (!unit || !course) return;

    setCurrentSemesterId(course.semesterId);
    if (currentSemester?.id !== course.semesterId) {
      refresh();
    }

    setExpandedCourses((current) => ({
      ...current,
      [course.id]: true,
    }));
    setExpandedUnits((current) => ({
      ...current,
      [unit.id]: true,
    }));
    setHighlightedLectureId(lecture.id);

    window.history.replaceState({}, "", "/study/manage");
  }, [lectures, units, courses, currentSemester, refresh]);

  useEffect(() => {
    if (highlightedLectureId === null) return;

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`study-lecture-${highlightedLectureId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlightedLectureId, expandedCourses, expandedUnits]);

  const semesterCourses = currentSemester
    ? courses.filter(
        (course) =>
          course.semesterId === currentSemester.id,
      )
    : [];

  function toggleCourse(courseId: number) {
    setExpandedCourses((current) => ({
      ...current,
      [courseId]: !current[courseId],
    }));
  }

  function toggleUnit(unitId: number) {
    setExpandedUnits((current) => ({
      ...current,
      [unitId]: !current[unitId],
    }));
  }

  function handleAddCourses(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!currentSemester) {
      return;
    }

    const names = bulkCourses
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean);

    if (names.length === 0) {
      return;
    }

    addCoursesBulk(
      currentSemester.id,
      names,
    );

    setBulkCourses("");
    setShowAddCourses(false);
    refresh();
  }

  function startAddingUnits(courseId: number) {
    setAddingUnitsToCourseId(courseId);
    setBulkUnits("");
  }

  function cancelAddingUnits() {
    setAddingUnitsToCourseId(null);
    setBulkUnits("");
  }

  function handleAddUnits(
    event: FormEvent<HTMLFormElement>,
    courseId: number,
  ) {
    event.preventDefault();

    const names = bulkUnits
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean);

    if (names.length === 0) {
      return;
    }

    addUnitsBulk(courseId, names);

    setBulkUnits("");
    setAddingUnitsToCourseId(null);
    refresh();
  }

  function startAddingLectures(unitId: number) {
    setAddingLecturesToUnitId(unitId);
    setBulkLectures("");
    setExpandedUnits((current) => ({
      ...current,
      [unitId]: true,
    }));
  }

  function cancelAddingLectures() {
    setAddingLecturesToUnitId(null);
    setBulkLectures("");
  }

  function handleAddLectures(
    event: FormEvent<HTMLFormElement>,
    unitId: number,
  ) {
    event.preventDefault();

    const names = bulkLectures
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean);

    if (names.length === 0) {
      return;
    }

    addLecturesBulk(unitId, names);

    setBulkLectures("");
    setAddingLecturesToUnitId(null);
    refresh();
  }

  function startEditingCourse(course: Course) {
    setEditingCourseId(course.id);
    setEditingCourseName(course.name);
  }

  function saveCourse(courseId: number) {
    const name = editingCourseName.trim();

    if (!name) {
      return;
    }

    updateCourse(courseId, { name });

    setEditingCourseId(null);
    setEditingCourseName("");
    refresh();
  }

  function cancelEditingCourse() {
    setEditingCourseId(null);
    setEditingCourseName("");
  }

  function startEditingUnit(unit: Unit) {
    setEditingUnitId(unit.id);
    setEditingUnitName(unit.name);
  }

  function saveUnit(unitId: number) {
    const name = editingUnitName.trim();

    if (!name) {
      return;
    }

    updateUnit(unitId, { name });

    setEditingUnitId(null);
    setEditingUnitName("");
    refresh();
  }

  function cancelEditingUnit() {
    setEditingUnitId(null);
    setEditingUnitName("");
  }

  function startEditingLecture(
    lecture: Lecture,
  ) {
    setEditingLectureId(lecture.id);
    setEditingLectureName(lecture.name);
  }

  function saveLecture(lectureId: number) {
    const name = editingLectureName.trim();

    if (!name) {
      return;
    }

    updateLecture(lectureId, { name });

    setEditingLectureId(null);
    setEditingLectureName("");
    refresh();
  }

  function cancelEditingLecture() {
    setEditingLectureId(null);
    setEditingLectureName("");
  }

  function removeCourse(course: Course) {
    const confirmed = window.confirm(
      `Delete "${course.name}" and everything inside it?`,
    );

    if (!confirmed) {
      return;
    }

    deleteCourse(course.id);

    setExpandedCourses((current) => {
      const next = { ...current };
      delete next[course.id];
      return next;
    });

    refresh();
  }

  function removeUnit(unit: Unit) {
    const confirmed = window.confirm(
      `Delete "${unit.name}" and its lectures?`,
    );

    if (!confirmed) {
      return;
    }

    deleteUnit(unit.id);

    setExpandedUnits((current) => {
      const next = { ...current };
      delete next[unit.id];
      return next;
    });

    refresh();
  }

  function removeLecture(lecture: Lecture) {
    const confirmed = window.confirm(
      `Delete "${lecture.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    deleteLecture(lecture.id);
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
            Manage courses, units, and lectures for your selected semester.
          </p>
        </div>

        <Link
          href="/study"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to Study
        </Link>
      </div>

      <section className="mb-8 flex flex-col gap-3 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--muted)]">
            Current semester
          </p>
          <p className="mt-1 text-lg font-extrabold text-[var(--ink)]">
            {currentSemester?.name ?? "No semester selected"}
          </p>
        </div>
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-[var(--primary-dark)] px-4 py-2 text-sm font-extrabold text-[var(--primary-dark)] hover:bg-[var(--primary-soft)]"
        >
          Academic settings
        </Link>
      </section>

      {!currentSemester ? (
        <section className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            Choose your current semester
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Open General Settings to set your program and choose Semester 1, 2, or 3.
          </p>
        </section>
      ) : (
        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Courses
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {semesterCourses.length}{" "}
                {semesterCourses.length === 1
                  ? "course"
                  : "courses"}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setShowAddCourses((current) => !current)
              }
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              {showAddCourses
                ? "Close"
                : "Add courses"}
            </button>
          </div>

          {showAddCourses && (
            <form
              onSubmit={handleAddCourses}
              className="mb-4 rounded-xl border border-slate-200 bg-white p-5"
            >
              <h3 className="font-medium text-slate-900">
                Add courses in bulk
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Enter one course per line.
              </p>

              <textarea
                value={bulkCourses}
                onChange={(event) =>
                  setBulkCourses(event.target.value)
                }
                placeholder={
                  "Pharmacology\nPharmaceutics\nMedicinal Chemistry\nClinical Pharmacy"
                }
                rows={6}
                autoFocus
                className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Add courses
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddCourses(false);
                    setBulkCourses("");
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {semesterCourses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No courses yet.
            </div>
          ) : (
            <div className="space-y-2">
              {semesterCourses.map((course) => {
                const courseUnits = units.filter(
                  (unit) =>
                    unit.courseId === course.id,
                );

                const courseLectures =
                  lectures.filter((lecture) =>
                    courseUnits.some(
                      (unit) =>
                        unit.id === lecture.unitId,
                    ),
                  );

                const isExpanded =
                  expandedCourses[course.id] ?? false;

                const isEditingCourse =
                  editingCourseId === course.id;

                const isAddingUnits =
                  addingUnitsToCourseId ===
                  course.id;

                return (
                  <div
                    key={course.id}
                    className="overflow-hidden rounded-[20px] border-2 border-[var(--border)] bg-[var(--surface)]"
                  >
                    <div className="flex items-center gap-2 px-3 py-3 transition hover:bg-[var(--surface-soft)] sm:px-5 sm:py-4">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleCourse(course.id)}
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-extrabold text-[var(--ink)]">
                            {course.name}
                          </div>
                          <div className="mt-1 text-xs text-[var(--muted)]">
                            {courseUnits.length} {courseUnits.length === 1 ? "unit" : "units"}
                            {" · "}
                            {courseLectures.length} {courseLectures.length === 1 ? "lecture" : "lectures"}
                          </div>
                        </div>
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className={`h-5 w-5 shrink-0 text-[var(--muted)] transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </button>
                      <CardMenu
                        title={`Actions for ${course.name}`}
                        actions={[
                          {
                            label: "Edit course",
                            onSelect: () => startEditingCourse(course),
                          },
                          {
                            label: "Delete course",
                            destructive: true,
                            onSelect: () => removeCourse(course),
                          },
                        ]}
                      />
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 px-5 py-5">
                        {isEditingCourse ? (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                              Course name
                            </label>

                            <input
                              value={editingCourseName}
                              onChange={(event) =>
                                setEditingCourseName(
                                  event.target
                                    .value,
                                )
                              }
                              autoFocus
                              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                            />

                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  saveCourse(
                                    course.id,
                                  )
                                }
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                              >
                                Save
                              </button>

                              <button
                                type="button"
                                onClick={
                                  cancelEditingCourse
                                }
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>


                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <h3 className="text-sm font-semibold text-slate-900">
                                  Units
                                </h3>

                                <p className="mt-1 text-xs text-slate-500">
                                  Expand a unit to manage
                                  its lectures.
                                </p>
                              </div>

                              {!isAddingUnits && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    startAddingUnits(
                                      course.id,
                                    )
                                  }
                                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] px-3 py-2 text-xs font-extrabold text-[var(--primary-dark)] hover:bg-[var(--primary-soft)]"
                                >
                                  + Add units
                                </button>
                              )}
                            </div>

                            {isAddingUnits && (
                              <form
                                onSubmit={(event) =>
                                  handleAddUnits(
                                    event,
                                    course.id,
                                  )
                                }
                                className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
                              >
                                <p className="text-sm font-medium text-slate-900">
                                  Add units to{" "}
                                  {course.name}
                                </p>

                                <p className="mt-1 text-xs text-slate-500">
                                  Enter one unit per line.
                                </p>

                                <textarea
                                  value={bulkUnits}
                                  onChange={(event) =>
                                    setBulkUnits(
                                      event.target
                                        .value,
                                    )
                                  }
                                  placeholder={
                                    "Unit 1\nUnit 2\nUnit 3"
                                  }
                                  rows={5}
                                  autoFocus
                                  className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                />

                                <div className="mt-3 flex gap-2">
                                  <button
                                    type="submit"
                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                                  >
                                    Add units
                                  </button>

                                  <button
                                    type="button"
                                    onClick={
                                      cancelAddingUnits
                                    }
                                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            )}

                            {courseUnits.length === 0 ? (
                              <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                                No units yet.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {courseUnits.map(
                                  (unit) => {
                                    const unitLectures =
                                      lectures.filter(
                                        (lecture) =>
                                          lecture.unitId ===
                                          unit.id,
                                      );

                                    const isExpanded =
                                      expandedUnits[
                                        unit.id
                                      ] ?? false;

                                    const isEditingUnit =
                                      editingUnitId ===
                                      unit.id;

                                    const isAddingLectures =
                                      addingLecturesToUnitId ===
                                      unit.id;

                                    return (
                                      <div
                                        key={unit.id}
                                        className="rounded-[16px] border-2 border-[var(--border)] bg-[var(--surface)]"
                                      >
                                        <div className="flex items-center gap-3 px-4 py-3">
                                          <button
                                            type="button"
                                            aria-expanded={isExpanded}
                                            onClick={() => toggleUnit(unit.id)}
                                            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-left"
                                          >
                                            <div className="min-w-0 flex-1">
                                              <div className="truncate text-sm font-extrabold text-[var(--ink)]">
                                                {unit.name}
                                              </div>
                                              <div className="mt-1 text-xs text-[var(--muted)]">
                                                {unitLectures.length}{" "}
                                                {unitLectures.length === 1 ? "lecture" : "lectures"}
                                              </div>
                                            </div>
                                            <svg
                                              aria-hidden="true"
                                              viewBox="0 0 24 24"
                                              className={`h-4 w-4 shrink-0 text-[var(--muted)] transition-transform ${
                                                isExpanded ? "rotate-180" : ""
                                              }`}
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            >
                                              <path d="m6 9 6 6 6-6" />
                                            </svg>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              startAddingLectures(
                                                unit.id,
                                              )
                                            }
                                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                                          >
                                            + Lectures
                                          </button>

                                          <CardMenu
                                            title={`Actions for ${unit.name}`}
                                            actions={[
                                              {
                                                label: "Edit unit",
                                                onSelect: () => startEditingUnit(unit),
                                              },
                                              {
                                                label: "Delete unit",
                                                destructive: true,
                                                onSelect: () => removeUnit(unit),
                                              },
                                            ]}
                                          />


                                        </div>

                                        {isEditingUnit && (
                                          <div className="border-t border-slate-200 bg-slate-50 p-4">
                                            <input
                                              value={
                                                editingUnitName
                                              }
                                              onChange={(
                                                event,
                                              ) =>
                                                setEditingUnitName(
                                                  event
                                                    .target
                                                    .value,
                                                )
                                              }
                                              autoFocus
                                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                            />

                                            <div className="mt-3 flex gap-2">
                                              <button
                                                type="button"
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
                                                type="button"
                                                onClick={
                                                  cancelEditingUnit
                                                }
                                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {isExpanded && (
                                          <div className="border-t border-slate-200 px-4 py-4">
                                            {isAddingLectures && (
                                              <form
                                                onSubmit={(
                                                  event,
                                                ) =>
                                                  handleAddLectures(
                                                    event,
                                                    unit.id,
                                                  )
                                                }
                                                className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
                                              >
                                                <p className="text-sm font-medium text-slate-900">
                                                  Add lectures
                                                </p>

                                                <p className="mt-1 text-xs text-slate-500">
                                                  Enter one
                                                  lecture/topic
                                                  per line.
                                                </p>

                                                <textarea
                                                  value={
                                                    bulkLectures
                                                  }
                                                  onChange={(
                                                    event,
                                                  ) =>
                                                    setBulkLectures(
                                                      event
                                                        .target
                                                        .value,
                                                    )
                                                  }
                                                  placeholder={
                                                    "Lecture 1\nLecture 2\nLecture 3"
                                                  }
                                                  rows={5}
                                                  autoFocus
                                                  className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                                />

                                                <div className="mt-3 flex gap-2">
                                                  <button
                                                    type="submit"
                                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                                                  >
                                                    Add lectures
                                                  </button>

                                                  <button
                                                    type="button"
                                                    onClick={
                                                      cancelAddingLectures
                                                    }
                                                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                                                  >
                                                    Cancel
                                                  </button>
                                                </div>
                                              </form>
                                            )}

                                            {unitLectures.length ===
                                            0 ? (
                                              <div className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
                                                No lectures yet.
                                              </div>
                                            ) : (
                                              <div className="space-y-2">
                                                {unitLectures.map(
                                                  (
                                                    lecture,
                                                  ) => {
                                                    const isEditingLecture =
                                                      editingLectureId ===
                                                      lecture.id;

                                                    return (
                                                      <div
                                                        key={
                                                          lecture.id
                                                        }
                                                        id={`study-lecture-${lecture.id}`}
                                                        className={`rounded-lg border border-slate-200 p-3 ${
                                                          highlightedLectureId === lecture.id
                                                            ? "ring-2 ring-[var(--accent)]"
                                                            : ""
                                                        }`}
                                                      >
                                                        {isEditingLecture ? (
                                                          <>
                                                            <input
                                                              value={
                                                                editingLectureName
                                                              }
                                                              onChange={(
                                                                event,
                                                              ) =>
                                                                setEditingLectureName(
                                                                  event
                                                                    .target
                                                                    .value,
                                                                )
                                                              }
                                                              autoFocus
                                                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                                            />

                                                            <div className="mt-3 flex gap-2">
                                                              <button
                                                                type="button"
                                                                onClick={() =>
                                                                  saveLecture(
                                                                    lecture.id,
                                                                  )
                                                                }
                                                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                                                              >
                                                                Save
                                                              </button>

                                                              <button
                                                                type="button"
                                                                onClick={
                                                                  cancelEditingLecture
                                                                }
                                                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                                                              >
                                                                Cancel
                                                              </button>
                                                            </div>
                                                          </>
                                                        ) : (
                                                          <div className="flex items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                              <div className="truncate text-sm text-slate-900">
                                                                {
                                                                  lecture.name
                                                                }
                                                              </div>

                                                              <div className="mt-1 text-xs text-slate-500">
                                                                Box{" "}
                                                                {
                                                                  lecture.box
                                                                }{" "}
                                                                ·{" "}
                                                                {
                                                                  lecture.reviewCount
                                                                }{" "}
                                                                reviews
                                                              </div>
                                                            </div>

                                                            <div className="flex shrink-0 gap-2">
                                                              <CardMenu
                                                                title={`Actions for ${lecture.name}`}
                                                                actions={[
                                                                  {
                                                                    label: "Edit lecture",
                                                                    onSelect: () => startEditingLecture(lecture),
                                                                  },
                                                                  {
                                                                    label: "Delete lecture",
                                                                    destructive: true,
                                                                    onSelect: () => removeLecture(lecture),
                                                                  },
                                                                ]}
                                                              />
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    );
                                                  },
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  },
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}