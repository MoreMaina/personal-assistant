"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

import {
  Course,
  Lecture,
  Program,
  Semester,
  Unit,
  addCoursesBulk,
  addLecturesBulk,
  addProgram,
  addSemester,
  addUnitsBulk,
  deleteCourse,
  deleteLecture,
  deleteUnit,
  getCourses,
  getCurrentSemester,
  getLectures,
  getPrograms,
  getSemesters,
  getUnits,
  setCurrentSemesterId,
  updateCourse,
  updateLecture,
  updateUnit,
} from "@/lib/studyStorage";

export default function StudyManagePage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>(
    [],
  );
  const [currentSemester, setCurrentSemester] =
    useState<Semester | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>(
    [],
  );

  const [showSemesterSettings, setShowSemesterSettings] =
    useState(false);

  const [newProgramName, setNewProgramName] =
    useState("");

  const [newSemesterName, setNewSemesterName] =
    useState("");

  const [newSemesterProgramId, setNewSemesterProgramId] =
    useState<number | null>(null);

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

  function refresh() {
    const refreshedPrograms = getPrograms();
    const refreshedSemesters = getSemesters();
    const refreshedCurrentSemester =
      getCurrentSemester();

    setPrograms(refreshedPrograms);
    setSemesters(refreshedSemesters);
    setCurrentSemester(refreshedCurrentSemester);
    setCourses(getCourses());
    setUnits(getUnits());
    setLectures(getLectures());

    if (
      newSemesterProgramId === null &&
      refreshedPrograms.length > 0
    ) {
      setNewSemesterProgramId(
        refreshedCurrentSemester?.programId ??
          refreshedPrograms[0].id,
      );
    }
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

  function handleAddProgram(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const program = addProgram(newProgramName);

    if (!program) {
      return;
    }

    setNewProgramName("");
    setNewSemesterProgramId(program.id);
    refresh();
  }

  function handleAddSemester(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      newSemesterProgramId === null ||
      !newSemesterName.trim()
    ) {
      return;
    }

    addSemester(
      newSemesterProgramId,
      newSemesterName,
    );

    setNewSemesterName("");
    refresh();
  }

  function handleSemesterChange(
    semesterId: number,
  ) {
    setCurrentSemesterId(semesterId);
    refresh();
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
            Set up your semester and manage courses,
            units, and lectures.
          </p>
        </div>

        <Link
          href="/study"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to Study
        </Link>
      </div>

      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Current semester
            </p>

            <p className="mt-1 font-medium text-slate-900">
              {currentSemester?.name ??
                "No semester selected"}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setShowSemesterSettings(
                (current) => !current,
              )
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
          >
            {showSemesterSettings
              ? "Close"
              : "Semester settings"}
          </button>
        </div>

        {showSemesterSettings && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Choose semester
                </h2>

                <div className="mt-3 space-y-2">
                  {semesters.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No semesters yet.
                    </p>
                  ) : (
                    semesters.map((semester) => (
                      <button
                        key={semester.id}
                        type="button"
                        onClick={() =>
                          handleSemesterChange(
                            semester.id,
                          )
                        }
                        className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition ${
                          currentSemester?.id ===
                          semester.id
                            ? "border-slate-900 bg-slate-50 text-slate-900"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {semester.name}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Add program
                  </h2>

                  <form
                    onSubmit={handleAddProgram}
                    className="mt-3 flex gap-2"
                  >
                    <input
                      value={newProgramName}
                      onChange={(event) =>
                        setNewProgramName(
                          event.target.value,
                        )
                      }
                      placeholder="Pharmacy"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />

                    <button
                      type="submit"
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                    >
                      Add
                    </button>
                  </form>
                </div>

                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Add semester
                  </h2>

                  <form
                    onSubmit={handleAddSemester}
                    className="mt-3 space-y-2"
                  >
                    <select
                      value={
                        newSemesterProgramId ?? ""
                      }
                      onChange={(event) =>
                        setNewSemesterProgramId(
                          event.target.value
                            ? Number(
                                event.target.value,
                              )
                            : null,
                        )
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="">
                        Choose program
                      </option>

                      {programs.map((program) => (
                        <option
                          key={program.id}
                          value={program.id}
                        >
                          {program.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex gap-2">
                      <input
                        value={newSemesterName}
                        onChange={(event) =>
                          setNewSemesterName(
                            event.target.value,
                          )
                        }
                        placeholder="Semester 4"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />

                      <button
                        type="submit"
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                      >
                        Add
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {!currentSemester ? (
        <section className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            Create or select a semester
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Open Semester settings above to create
            your first program and semester.
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
                    className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        toggleCourse(course.id)
                      }
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
                    >
                      <div>
                        <div className="font-medium text-slate-900">
                          {course.name}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {courseUnits.length}{" "}
                          {courseUnits.length === 1
                            ? "unit"
                            : "units"}{" "}
                          · {courseLectures.length}{" "}
                          {courseLectures.length === 1
                            ? "lecture"
                            : "lectures"}
                        </div>
                      </div>

                      <span className="text-lg text-slate-400">
                        {isExpanded ? "−" : "+"}
                      </span>
                    </button>

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
                            <div className="mb-5 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  startEditingCourse(
                                    course,
                                  )
                                }
                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                              >
                                Edit course
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  removeCourse(course)
                                }
                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                              >
                                Delete course
                              </button>
                            </div>

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
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
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
                                        className="rounded-lg border border-slate-200"
                                      >
                                        <div className="flex items-center gap-3 px-4 py-3">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              toggleUnit(
                                                unit.id,
                                              )
                                            }
                                            className="min-w-0 flex-1 text-left"
                                          >
                                            <div className="text-sm font-medium text-slate-900">
                                              {unit.name}
                                            </div>

                                            <div className="mt-1 text-xs text-slate-500">
                                              {
                                                unitLectures.length
                                              }{" "}
                                              {unitLectures.length ===
                                              1
                                                ? "lecture"
                                                : "lectures"}
                                            </div>
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

                                          <button
                                            type="button"
                                            onClick={() =>
                                              startEditingUnit(
                                                unit,
                                              )
                                            }
                                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                                          >
                                            Edit
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() =>
                                              removeUnit(
                                                unit,
                                              )
                                            }
                                            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                                          >
                                            Delete
                                          </button>

                                          <span className="text-sm text-slate-400">
                                            {isExpanded
                                              ? "−"
                                              : "+"}
                                          </span>
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
                                                        className="rounded-lg border border-slate-200 p-3"
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
                                                              <button
                                                                type="button"
                                                                onClick={() =>
                                                                  startEditingLecture(
                                                                    lecture,
                                                                  )
                                                                }
                                                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700"
                                                              >
                                                                Edit
                                                              </button>

                                                              <button
                                                                type="button"
                                                                onClick={() =>
                                                                  removeLecture(
                                                                    lecture,
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