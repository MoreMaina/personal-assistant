"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  addCoursesBulk,
  addLecture,
  addProgram,
  addSemester,
  addUnit,
  getCourses,
  getCurrentSemester,
  getLectures,
  getPrograms,
  getSemesters,
  getUnits,
  Lecture,
  Program,
  Semester,
  Course,
  Unit,
  scheduleReview,
  ReviewRating,
} from "@/lib/studyStorage";

export default function StudyPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [currentSemester, setCurrentSemester] =
    useState<Semester | null>(null);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);

  const [programName, setProgramName] = useState("");
  const [semesterName, setSemesterName] = useState("");
  const [semesterProgramId, setSemesterProgramId] = useState("");

  const [courseName, setCourseName] = useState("");

  const [unitName, setUnitName] = useState("");
  const [unitCourseId, setUnitCourseId] = useState("");

  const [lectureName, setLectureName] = useState("");
  const [lecturePrompt, setLecturePrompt] = useState("");
  const [lectureAnswer, setLectureAnswer] = useState("");
  const [lectureUnitId, setLectureUnitId] = useState("");

  const [currentLectureId, setCurrentLectureId] =
    useState<number | null>(null);

  const [revealed, setRevealed] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setPrograms(getPrograms());
    setSemesters(getSemesters());
    setCourses(getCourses());
    setUnits(getUnits());
    setLectures(getLectures());
    setCurrentSemester(getCurrentSemester());

    setNow(Date.now());
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (programs.length > 0 && !semesterProgramId) {
      setSemesterProgramId(String(programs[0].id));
    }
  }, [programs, semesterProgramId]);

  useEffect(() => {
    if (courses.length > 0 && !unitCourseId) {
      setUnitCourseId(String(courses[0].id));
    }
  }, [courses, unitCourseId]);

  useEffect(() => {
    if (units.length > 0 && !lectureUnitId) {
      setLectureUnitId(String(units[0].id));
    }
  }, [units, lectureUnitId]);

  const dueLectures = useMemo(() => {
    if (now === null) {
      return [];
    }

    return lectures.filter(
      (lecture) =>
        new Date(lecture.nextReviewAt).getTime() <= now,
    );
  }, [lectures, now]);

  const currentLecture = useMemo(() => {
    if (currentLectureId === null) {
      return dueLectures[0] ?? null;
    }

    return (
      lectures.find(
        (lecture) => lecture.id === currentLectureId,
      ) ?? null
    );
  }, [currentLectureId, dueLectures, lectures]);

  const upcomingCount =
    now === null
      ? 0
      : lectures.filter(
          (lecture) =>
            new Date(lecture.nextReviewAt).getTime() > now,
        ).length;

  function refreshStudyData() {
    setPrograms(getPrograms());
    setSemesters(getSemesters());
    setCourses(getCourses());
    setUnits(getUnits());
    setLectures(getLectures());
    setCurrentSemester(getCurrentSemester());
  }

  function handleAddProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!programName.trim()) {
      return;
    }

    addProgram(programName);
    setProgramName("");
    refreshStudyData();
  }

  function handleAddSemester(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!semesterName.trim() || !semesterProgramId) {
      return;
    }

    addSemester(
      Number(semesterProgramId),
      semesterName,
    );

    setSemesterName("");
    refreshStudyData();
  }

  function handleAddUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!unitName.trim() || !unitCourseId) {
      return;
    }

    addUnit(Number(unitCourseId), unitName);

    setUnitName("");
    refreshStudyData();
  }

  function handleAddLecture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !lectureName.trim() ||
      !lecturePrompt.trim() ||
      !lectureAnswer.trim() ||
      !lectureUnitId
    ) {
      return;
    }

    addLecture(
      Number(lectureUnitId),
      lectureName,
      lecturePrompt,
      lectureAnswer,
    );

    setLectureName("");
    setLecturePrompt("");
    setLectureAnswer("");
    refreshStudyData();
  }

  function handleReview(rating: ReviewRating) {
    if (!currentLecture) {
      return;
    }

    const reviewedLectureId = currentLecture.id;
    const reviewedCourseId =
      getLectureCourseId(currentLecture);

    const updatedLecture = scheduleReview(
      currentLecture,
      rating,
    );

    const updatedLectures = lectures.map((lecture) =>
      lecture.id === updatedLecture.id
        ? updatedLecture
        : lecture,
    );

    setLectures(updatedLectures);

    const remainingDueLectures = updatedLectures.filter(
      (lecture) =>
        lecture.id !== reviewedLectureId &&
        new Date(lecture.nextReviewAt).getTime() <=
          Date.now(),
    );

    const differentCourseLecture =
      remainingDueLectures.find(
        (lecture) =>
          getLectureCourseId(lecture) !==
          reviewedCourseId,
      );

    const nextLecture =
      differentCourseLecture ??
      remainingDueLectures[0] ??
      null;

    setCurrentLectureId(nextLecture?.id ?? null);
    setRevealed(false);
  }

  function getCourseName(courseId: number) {
    return (
      courses.find((course) => course.id === courseId)?.name ??
      "Unknown course"
    );
  }

  function getUnitName(unitId: number) {
    return (
      units.find((unit) => unit.id === unitId)?.name ??
      "Unknown unit"
    );
  }

  function getLectureCourseId(lecture: Lecture) {
    const unit = units.find(
      (unit) => unit.id === lecture.unitId,
    );

    return unit?.courseId ?? null;
  }

  function formatReviewDate(dateString: string) {
    const date = new Date(dateString);

    return date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-slate-500">
          Study
        </p>

        <h1 className="mt-1 text-3xl font-semibold text-slate-900">
          Your academic structure
        </h1>

        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Program → Semester → Course → Unit → Lecture.
        </p>
      </div>

      <section className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Reviews due</p>

          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {dueLectures.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Upcoming</p>

          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {upcomingCount}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Lectures</p>

          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {lectures.length}
          </p>
        </div>
      </section>

      <section className="mb-10 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Academic setup
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Set up the semester once, then add courses and units with
            as little friction as possible.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <form
            onSubmit={handleAddProgram}
            className="rounded-xl border border-slate-200 p-4"
          >
            <h3 className="font-medium text-slate-900">
              1. Program
            </h3>

            <input
              value={programName}
              onChange={(event) =>
                setProgramName(event.target.value)
              }
              placeholder="e.g. Bachelor of Medicine"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />

            <button className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Add program
            </button>
          </form>

          <form
            onSubmit={handleAddSemester}
            className="rounded-xl border border-slate-200 p-4"
          >
            <h3 className="font-medium text-slate-900">
              2. New semester
            </h3>

            <select
              value={semesterProgramId}
              onChange={(event) =>
                setSemesterProgramId(event.target.value)
              }
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={programs.length === 0}
            >
              <option value="">
                Select program
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

            <input
              value={semesterName}
              onChange={(event) =>
                setSemesterName(event.target.value)
              }
              placeholder="e.g. Semester 2 2026"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <button
              disabled={programs.length === 0}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start semester
            </button>
          </form>

          <form
            onSubmit={(event) => {
              event.preventDefault();

              if (!currentSemester) {
                return;
              }

              const names = courseName
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

              setCourseName("");
              refreshStudyData();
            }}
            className="rounded-xl border border-slate-200 p-4"
          >
            <h3 className="font-medium text-slate-900">
              3. Courses
            </h3>

            <p className="mt-1 text-xs text-slate-500">
              {currentSemester
                ? `Adding to ${currentSemester.name}`
                : "Create a semester first"}
            </p>

            <textarea
              value={courseName}
              onChange={(event) =>
                setCourseName(event.target.value)
              }
              placeholder={
                "One course per line\nAnatomy\nPhysiology\nBiochemistry\nPharmacology"
              }
              rows={6}
              disabled={!currentSemester}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
            />

            <p className="mt-2 text-xs text-slate-400">
              Enter one course per line.
            </p>

            <button
              disabled={!currentSemester}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add courses
            </button>
          </form>

          <form
            onSubmit={handleAddUnit}
            className="rounded-xl border border-slate-200 p-4"
          >
            <h3 className="font-medium text-slate-900">
              4. Units
            </h3>

            <select
              value={unitCourseId}
              onChange={(event) =>
                setUnitCourseId(event.target.value)
              }
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={courses.length === 0}
            >
              <option value="">
                Select course
              </option>

              {courses.map((course) => (
                <option
                  key={course.id}
                  value={course.id}
                >
                  {course.name}
                </option>
              ))}
            </select>

            <input
              value={unitName}
              onChange={(event) =>
                setUnitName(event.target.value)
              }
              placeholder="e.g. Unit 1 — Cells"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <button
              disabled={courses.length === 0}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add unit
            </button>
          </form>

          <form
            onSubmit={handleAddLecture}
            className="rounded-xl border border-slate-200 p-4 lg:col-span-2"
          >
            <h3 className="font-medium text-slate-900">
              5. Lecture
            </h3>

            <select
              value={lectureUnitId}
              onChange={(event) =>
                setLectureUnitId(event.target.value)
              }
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              disabled={units.length === 0}
            >
              <option value="">
                Select unit
              </option>

              {units.map((unit) => (
                <option
                  key={unit.id}
                  value={unit.id}
                >
                  {getCourseName(unit.courseId)} — {unit.name}
                </option>
              ))}
            </select>

            <input
              value={lectureName}
              onChange={(event) =>
                setLectureName(event.target.value)
              }
              placeholder="Lecture title"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <textarea
              value={lecturePrompt}
              onChange={(event) =>
                setLecturePrompt(event.target.value)
              }
              placeholder="Recall prompt"
              rows={3}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <textarea
              value={lectureAnswer}
              onChange={(event) =>
                setLectureAnswer(event.target.value)
              }
              placeholder="Answer"
              rows={4}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />

            <button
              disabled={units.length === 0}
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add lecture
            </button>
          </form>
        </div>
      </section>

      <section className="mb-10">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            Academic structure
          </h2>
        </div>

        {programs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            Add your program to start building your study structure.
          </div>
        ) : (
          <div className="space-y-5">
            {programs.map((program) => {
              const programSemesters = semesters.filter(
                (semester) =>
                  semester.programId === program.id,
              );

              return (
                <div
                  key={program.id}
                  className="rounded-2xl border border-slate-200 bg-white p-6"
                >
                  <h3 className="text-lg font-semibold text-slate-900">
                    {program.name}
                  </h3>

                  <div className="mt-5 space-y-5">
                    {programSemesters.map((semester) => {
                      const semesterCourses =
                        courses.filter(
                          (course) =>
                            course.semesterId === semester.id,
                        );

                      return (
                        <div
                          key={semester.id}
                          className="border-l-2 border-slate-200 pl-5"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-medium text-slate-800">
                              {semester.name}
                            </h4>

                            {currentSemester?.id === semester.id && (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                                Current
                              </span>
                            )}
                          </div>

                          <div className="mt-4 space-y-4">
                            {semesterCourses.map((course) => {
                              const courseUnits =
                                units.filter(
                                  (unit) =>
                                    unit.courseId === course.id,
                                );

                              return (
                                <div
                                  key={course.id}
                                  className="rounded-xl bg-slate-50 p-4"
                                >
                                  <p className="font-medium text-slate-900">
                                    {course.name}
                                  </p>

                                  <div className="mt-3 space-y-3">
                                    {courseUnits.map((unit) => {
                                      const unitLectures =
                                        lectures.filter(
                                          (lecture) =>
                                            lecture.unitId ===
                                            unit.id,
                                        );

                                      return (
                                        <div
                                          key={unit.id}
                                          className="rounded-lg border border-slate-200 bg-white p-3"
                                        >
                                          <p className="text-sm font-medium text-slate-800">
                                            {unit.name}
                                          </p>

                                          {unitLectures.length ===
                                          0 ? (
                                            <p className="mt-2 text-xs text-slate-400">
                                              No lectures yet.
                                            </p>
                                          ) : (
                                            <div className="mt-2 space-y-2">
                                              {unitLectures.map(
                                                (lecture) => (
                                                  <div
                                                    key={lecture.id}
                                                    className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                                                  >
                                                    <p className="text-sm font-medium text-slate-800">
                                                      {lecture.name}
                                                    </p>

                                                    <div className="mt-2 space-y-1 text-xs text-slate-500">
                                                      <p>
                                                        {lecture.reviewCount ===
                                                        0
                                                          ? "Not reviewed yet"
                                                          : `${lecture.reviewCount} review${
                                                              lecture.reviewCount ===
                                                              1
                                                                ? ""
                                                                : "s"
                                                            }`}
                                                      </p>

                                                      <p>
                                                        Next review:{" "}
                                                        {formatReviewDate(
                                                          lecture.nextReviewAt,
                                                        )}
                                                      </p>
                                                    </div>
                                                  </div>
                                                ),
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-slate-900">
            Review
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Your review system now works on individual lectures.
          </p>
        </div>

        {!currentLecture ? (
          <div className="rounded-xl bg-slate-50 p-6 text-sm text-slate-500">
            {lectures.length === 0
              ? "Add a lecture first."
              : "Nothing is due right now."}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 p-6">
            <div className="mb-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {getCourseName(
                  units.find(
                    (unit) =>
                      unit.id === currentLecture.unitId,
                  )?.courseId ?? 0,
                )}
              </p>

              <h3 className="mt-1 text-xl font-semibold text-slate-900">
                {currentLecture.name}
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                {getUnitName(currentLecture.unitId)}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Recall
              </p>

              <p className="mt-2 text-base text-slate-900">
                {currentLecture.prompt}
              </p>

              {revealed && (
                <div className="mt-5 border-t border-slate-200 pt-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Answer
                  </p>

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {currentLecture.answer}
                  </p>
                </div>
              )}
            </div>

            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                Reveal answer
              </button>
            ) : (
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => handleReview("Hard")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800"
                >
                  Hard
                </button>

                <button
                  onClick={() => handleReview("Okay")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800"
                >
                  Okay
                </button>

                <button
                  onClick={() => handleReview("Easy")}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Easy
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}