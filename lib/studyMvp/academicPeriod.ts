import { defaultIdFactory } from "./reviewEngine";
import type {
  AcademicSemester,
  EntityId,
  StudyMvpState,
} from "./types";

function isValidPeriod(year: number | null, semester: AcademicSemester | null): boolean {
  return year === null
    ? semester === null
    : Number.isSafeInteger(year) && year >= 1 &&
      (semester === 1 || semester === 2 || semester === 3);
}

/** Update the user's single global active academic period. */
export function setActiveAcademicPeriod(
  state: StudyMvpState,
  year: number | null,
  semester: AcademicSemester | null,
  changedAt = new Date().toISOString(),
): StudyMvpState {
  if (!isValidPeriod(year, semester)) {
    throw new Error("Choose both a positive study year and Semester 1, 2, or 3, or clear both values.");
  }
  if (!Number.isFinite(Date.parse(changedAt))) {
    throw new Error("The academic-period change timestamp is invalid.");
  }

  const previousYear = state.settings.active_academic_year ?? null;
  const previousSemester = state.settings.active_academic_semester ?? null;
  const periodChanged = previousYear !== year || previousSemester !== semester;
  const courses = state.courses.map((course) =>
    course.academic_year === undefined && course.academic_semester === undefined
      ? { ...course, academic_year: null, academic_semester: null }
      : course,
  );
  const coursesMigrated = courses.some(
    (course, index) => course !== state.courses[index],
  );
  if (!periodChanged && !coursesMigrated) return state;

  return {
    ...state,
    courses,
    settings: periodChanged
      ? {
          ...state.settings,
          active_academic_year: year,
          active_academic_semester: semester,
        }
      : state.settings,
    settings_change_history: periodChanged
      ? [
          ...state.settings_change_history,
          {
            id: defaultIdFactory("settings-change"),
            changed_at: changedAt,
            reason: "Updated the global active academic period",
            changed_fields: ["active_academic_year", "active_academic_semester"],
            previous_values: {
              active_academic_year: previousYear,
              active_academic_semester: previousSemester,
            },
            new_values: {
              active_academic_year: year,
              active_academic_semester: semester,
            },
          },
        ]
      : state.settings_change_history,
  };
}

/** Assign or unassign one course without changing any study history. */
export function assignCourseToAcademicPeriod(
  state: StudyMvpState,
  courseId: EntityId,
  year: number | null,
  semester: AcademicSemester | null,
): StudyMvpState {
  if (!isValidPeriod(year, semester)) {
    throw new Error("A course must be assigned to both a valid year and semester, or Unassigned.");
  }
  if (!state.courses.some((course) => course.id === courseId)) {
    throw new Error(`Course "${courseId}" was not found.`);
  }

  return {
    ...state,
    courses: state.courses.map((course) =>
      course.id === courseId
        ? { ...course, academic_year: year, academic_semester: semester }
        : course,
    ),
  };
}
