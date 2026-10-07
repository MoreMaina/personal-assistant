"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  Course,
  Lecture,
  Semester,
  Unit,
  getCourses,
  getCurrentSemester,
  getDueLectures,
  getLectures,
  getReviewIntervalDays,
  getUnits,
  scheduleReview,
  ReviewRating,
} from "@/lib/studyStorage";

const SESSION_OPTIONS = [
  { minutes: 15, lectures: 2 },
  { minutes: 30, lectures: 4 },
  { minutes: 45, lectures: 6 },
  { minutes: 60, lectures: 8 },
];

export default function StudyPage() {
  const [currentSemester, setCurrentSemester] =
    useState<Semester | null>(null);

  const [courses, setCourses] = useState<Course[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);

  const [currentLectureId, setCurrentLectureId] =
    useState<number | null>(null);

  const [sessionReviewedIds, setSessionReviewedIds] =
    useState<number[]>([]);

  const [sessionTargetCount, setSessionTargetCount] =
    useState(0);

  const [sessionActive, setSessionActive] =
    useState(false);

  const [selectedMinutes, setSelectedMinutes] =
    useState(30);

  function refresh() {
    setCurrentSemester(getCurrentSemester());
    setCourses(getCourses());
    setUnits(getUnits());
    setLectures(getLectures());
  }

  useEffect(() => {
    refresh();
  }, []);

  const currentLecture = lectures.find(
    (lecture) => lecture.id === currentLectureId,
  );

  const unitById = useMemo(
    () =>
      new Map(
        units.map((unit) => [unit.id, unit]),
      ),
    [units],
  );

  const courseById = useMemo(
    () =>
      new Map(
        courses.map((course) => [course.id, course]),
      ),
    [courses],
  );

  function getCourseIdForLecture(
    lecture: Lecture,
  ) {
    return (
      unitById.get(lecture.unitId)?.courseId ?? null
    );
  }

  const semesterCourseIds = useMemo(
    () =>
      currentSemester
        ? new Set(
            courses
              .filter(
                (course) =>
                  course.semesterId ===
                  currentSemester.id,
              )
              .map((course) => course.id),
          )
        : new Set<number>(),
    [courses, currentSemester],
  );

  const semesterUnitIds = useMemo(
    () =>
      new Set(
        units
          .filter((unit) =>
            semesterCourseIds.has(unit.courseId),
          )
          .map((unit) => unit.id),
      ),
    [units, semesterCourseIds],
  );

  const semesterLectures = useMemo(
    () =>
      lectures.filter((lecture) =>
        semesterUnitIds.has(lecture.unitId),
      ),
    [lectures, semesterUnitIds],
  );

  const dueLectures = useMemo(
    () =>
      currentSemester
        ? getDueLectures(currentSemester.id)
        : [],
    [currentSemester, lectures],
  );

  const newCount = semesterLectures.filter(
    (lecture) =>
      lecture.box === 1 &&
      lecture.reviewCount === 0,
  ).length;

  const remainingSessionCount = Math.max(
    0,
    sessionTargetCount - sessionReviewedIds.length,
  );

  const progressCount = Math.min(
    sessionReviewedIds.length,
    sessionTargetCount,
  );

  function chooseNextLecture(
    sourceLectures: Lecture[],
    previousCourseId: number | null,
    reviewedIds: number[],
  ) {
    const remaining = sourceLectures.filter(
      (lecture) =>
        !reviewedIds.includes(lecture.id),
    );

    if (remaining.length === 0) {
      return null;
    }

    const sorted = [...remaining].sort((a, b) => {
      const aTime = new Date(
        a.nextReviewAt,
      ).getTime();

      const bTime = new Date(
        b.nextReviewAt,
      ).getTime();

      return aTime - bTime;
    });

    if (previousCourseId !== null) {
      const differentCourse = sorted.find(
        (lecture) =>
          getCourseIdForLecture(lecture) !==
          previousCourseId,
      );

      if (differentCourse) {
        return differentCourse;
      }
    }

    return sorted[0];
  }

  function startSession() {
    if (!currentSemester) {
      return;
    }

    const currentDue = getDueLectures(
      currentSemester.id,
    );

    if (currentDue.length === 0) {
      return;
    }

    const selectedOption =
      SESSION_OPTIONS.find(
        (option) =>
          option.minutes === selectedMinutes,
      ) ?? SESSION_OPTIONS[1];

    const targetCount = Math.min(
      selectedOption.lectures,
      currentDue.length,
    );

    const nextLecture = chooseNextLecture(
      currentDue,
      null,
      [],
    );

    setSessionReviewedIds([]);
    setSessionTargetCount(targetCount);
    setCurrentLectureId(
      nextLecture?.id ?? null,
    );
    setSessionActive(Boolean(nextLecture));
  }

  function finishSession() {
    setCurrentLectureId(null);
    setSessionActive(false);
    setSessionReviewedIds([]);
    setSessionTargetCount(0);
  }

  function handleReview(
    rating: ReviewRating,
  ) {
    if (!currentLecture || !currentSemester) {
      return;
    }

    const previousCourseId =
      getCourseIdForLecture(currentLecture);

    const updatedLecture = scheduleReview(
      currentLecture,
      rating,
    );

    const updatedLectures = lectures.map(
      (lecture) =>
        lecture.id === updatedLecture.id
          ? updatedLecture
          : lecture,
    );

    const nextReviewedIds = [
      ...sessionReviewedIds,
      currentLecture.id,
    ];

    setLectures(updatedLectures);
    setSessionReviewedIds(nextReviewedIds);

    const sessionFinished =
      nextReviewedIds.length >= sessionTargetCount;

    if (sessionFinished) {
      setCurrentLectureId(null);
      return;
    }

    const remainingDue = getDueLectures(
      currentSemester.id,
    );

    const nextLecture = chooseNextLecture(
      remainingDue,
      previousCourseId,
      nextReviewedIds,
    );

    setCurrentLectureId(
      nextLecture?.id ?? null,
    );
  }

  function getNextBox(
    rating: ReviewRating,
    box: number,
  ) {
    if (rating === "Again") {
      return Math.max(1, box - 1);
    }

    if (rating === "Good") {
      return Math.min(5, box + 1);
    }

    return Math.min(5, box + 2);
  }

  const courseName = currentLecture
    ? courseById.get(
        getCourseIdForLecture(currentLecture) ??
          -1,
      )?.name
    : null;

  const unitName = currentLecture
    ? unitById.get(currentLecture.unitId)?.name
    : null;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">
            Study
          </p>

          <h1 className="mt-1 text-3xl font-semibold text-slate-900">
            {currentSemester
              ? currentSemester.name
              : "Study"}
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Work through what is due, with spacing and
            interleaving handled automatically.
          </p>
        </div>

        <Link
          href="/study/manage"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Manage
        </Link>
      </div>

      {!currentSemester ? (
        <section className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            Set up your semester first
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Your academic setup is managed separately.
          </p>

          <Link
            href="/study/manage"
            className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Open Study Manager
          </Link>
        </section>
      ) : (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-sm text-slate-500">
                Due now
              </div>

              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {dueLectures.length}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-sm text-slate-500">
                New lectures
              </div>

              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {newCount}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-sm text-slate-500">
                Courses
              </div>

              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {semesterCourseIds.size}
              </div>
            </div>
          </section>

          {!sessionActive ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-8">
              {dueLectures.length === 0 ? (
                <div className="text-center">
                  <h2 className="text-xl font-semibold text-slate-900">
                    Nothing is due right now
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    You’re caught up for this semester.
                  </p>

                  <Link
                    href="/study/manage"
                    className="mt-5 inline-flex rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    Manage lectures
                  </Link>
                </div>
              ) : (
                <div className="text-center">
                  <h2 className="text-2xl font-semibold text-slate-900">
                    Ready to study?
                  </h2>

                  <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                    You have {dueLectures.length}{" "}
                    {dueLectures.length === 1
                      ? "lecture"
                      : "lectures"}{" "}
                    due. Choose how much time you have,
                    and the system will size the session
                    for you.
                  </p>

                  <div className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
                    {SESSION_OPTIONS.map((option) => (
                      <button
                        key={option.minutes}
                        type="button"
                        onClick={() =>
                          setSelectedMinutes(
                            option.minutes,
                          )
                        }
                        className={`rounded-lg border px-3 py-3 text-sm transition ${
                          selectedMinutes ===
                          option.minutes
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="font-medium">
                          {option.minutes} min
                        </div>

                        <div
                          className={`mt-1 text-xs ${
                            selectedMinutes ===
                            option.minutes
                              ? "text-slate-300"
                              : "text-slate-400"
                          }`}
                        >
                          ~{option.lectures} lectures
                        </div>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={startSession}
                    className="mt-6 rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white"
                  >
                    Start studying
                  </button>
                </div>
              )}
            </section>
          ) : currentLecture ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
              <div className="mb-8 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">
                    {courseName ?? "Course"}
                  </p>

                  <p className="mt-1 text-sm text-slate-400">
                    {unitName ?? "Unit"}
                  </p>
                </div>

                <div className="text-right">
                  <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                    Box {currentLecture.box} / 5
                  </div>

                  <p className="mt-2 text-xs text-slate-400">
                    {progressCount} /{" "}
                    {sessionTargetCount}
                  </p>
                </div>
              </div>

              <h2 className="text-2xl font-semibold text-slate-900">
                {currentLecture.name}
              </h2>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">
                Study this lecture from your normal
                learning material. When you are finished,
                rate how well you know it.
              </p>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {(
                  ["Again", "Good", "Easy"] as ReviewRating[]
                ).map((rating) => {
                  const nextBox = getNextBox(
                    rating,
                    currentLecture.box,
                  );

                  const intervalDays =
                    getReviewIntervalDays(nextBox);

                  return (
                    <button
                      key={rating}
                      type="button"
                      onClick={() =>
                        handleReview(rating)
                      }
                      className="rounded-xl border border-slate-300 px-4 py-4 text-left transition hover:border-slate-500 hover:bg-slate-50"
                    >
                      <div className="font-medium text-slate-900">
                        {rating}
                      </div>

                      <div className="mt-1 text-xs text-slate-500">
                        Box {nextBox} ·{" "}
                        {intervalDays}{" "}
                        {intervalDays === 1
                          ? "day"
                          : "days"}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <div className="text-xs text-slate-400">
                  {remainingSessionCount} remaining in
                  this session
                </div>

                <button
                  type="button"
                  onClick={finishSession}
                  className="text-sm font-medium text-slate-500 hover:text-slate-900"
                >
                  Finish session
                </button>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <h2 className="text-xl font-semibold text-slate-900">
                Session complete
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                You completed {progressCount}{" "}
                {progressCount === 1
                  ? "lecture"
                  : "lectures"}{" "}
                in this session.
              </p>

              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {dueLectures.length > 0 && (
                  <button
                    type="button"
                    onClick={startSession}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Start another {selectedMinutes} min
                  </button>
                )}

                <button
                  type="button"
                  onClick={finishSession}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Finish
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}