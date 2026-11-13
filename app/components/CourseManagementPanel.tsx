"use client";

import { useState, type FormEvent } from "react";
import CardMenu, { type CardMenuAction } from "@/app/components/CardMenu";
import { defaultIdFactory } from "@/lib/studyMvp/reviewEngine";
import { assignCourseToAcademicPeriod } from "@/lib/studyMvp/academicPeriod";
import { setCourseArchivedAt } from "@/lib/studyMvp/storage";
import type { StudyMvpState } from "@/lib/studyMvp/types";

interface CourseManagementPanelProps {
  state: StudyMvpState | null;
  loadingError?: string;
  syncConflict?: boolean;
  problem?: string;
  persist: (next: StudyMvpState, successMessage?: string) => boolean;
}

export default function CourseManagementPanel({
  state,
  loadingError,
  syncConflict = false,
  problem,
  persist,
}: CourseManagementPanelProps) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [quickCourseName, setQuickCourseName] = useState("");
  const [quickCourseCode, setQuickCourseCode] = useState("");
  const [courseFilter, setCourseFilter] = useState<"current" | "unassigned" | "all">("current");
  const activeYear = state?.settings.active_academic_year ?? null;
  const activeSemester = state?.settings.active_academic_semester ?? null;
  const activePeriodLabel = activeYear && activeSemester
    ? `Year ${activeYear} · Semester ${activeSemester}`
    : "No active period selected";
  const hasActivePeriod = activeYear !== null && activeSemester !== null;
  const effectiveCourseFilter =
    courseFilter === "current" && !hasActivePeriod
      ? "unassigned"
      : courseFilter;
  const visibleCourses = (state?.courses ?? []).filter((course) => {
    const assigned = Number.isSafeInteger(course.academic_year) &&
      course.academic_year !== null && course.academic_year !== undefined &&
      (course.academic_semester === 1 || course.academic_semester === 2 || course.academic_semester === 3);
    if (effectiveCourseFilter === "all") return true;
    if (effectiveCourseFilter === "unassigned") return !assigned;
    return Boolean(
      hasActivePeriod &&
      course.academic_year === activeYear &&
      course.academic_semester === activeSemester,
    );
  });

  function archiveOrRestore(courseId: string, courseName: string, archived: boolean) {
    if (!state || loadingError || syncConflict) return;
    const action = archived ? "Restore" : "Archive";
    const effect = archived
      ? "This course will become eligible for future Study plans and Today lists."
      : "This course will be excluded from future Study plans and Today lists. Its content and study history will be retained.";
    if (!window.confirm(`${action} "${courseName}"?\n\n${effect}\n\nContinue?`)) return;

    setError("");
    setNotice("");
    try {
      const next = setCourseArchivedAt(
        state,
        courseId,
        archived ? null : new Date().toISOString(),
      );
      const message = archived ? `Restored "${courseName}".` : `Archived "${courseName}".`;
      if (persist(next, message)) setNotice(message);
      else setError("The course status could not be saved. Check Study synchronization and try again.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The course status could not be changed.");
    }
  }

  function addCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || loadingError || syncConflict) return;
    const name = quickCourseName.trim();
    const code = quickCourseCode.trim();
    if (!name) {
      setError("Enter a course name.");
      return;
    }
    const duplicate = state.courses.some((course) =>
      course.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase() ||
      (code && course.code.trim().toLocaleLowerCase() === code.toLocaleLowerCase()),
    );
    if (duplicate) {
      setError("A course with that name or code already exists. Edit the existing course instead.");
      return;
    }
    const course = {
      id: defaultIdFactory("course"),
      name,
      code,
      color: "#006D77",
      created_at: new Date().toISOString(),
      academic_year: activeYear,
      academic_semester: activeSemester,
    };
    const next = { ...state, courses: [...state.courses, course] };
    if (persist(next, `Added "${name}" to Study.`)) {
      setQuickCourseName("");
      setQuickCourseCode("");
      setError("");
      setNotice(activeYear && activeSemester
        ? `Added "${name}" to ${activePeriodLabel}.`
        : `Added "${name}" as Unassigned. Set an active period to assign it later.`);
    } else {
      setError("The course could not be saved. Check Study synchronization and try again.");
    }
  }

  function editCourse(courseId: string, courseName: string, currentCode: string) {
    if (!state || loadingError || syncConflict) return;
    const name = window.prompt("Course name", courseName);
    if (name === null) return;
    const code = window.prompt("Course code (leave blank if not used)", currentCode);
    if (code === null) return;
    if (!name.trim()) {
      setError("Course name cannot be empty.");
      return;
    }
    const duplicate = state.courses.some((course) =>
      course.id !== courseId && (
        course.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase() ||
        (code.trim() && course.code.trim().toLocaleLowerCase() === code.trim().toLocaleLowerCase())
      ),
    );
    if (duplicate) {
      setError("Another course already uses that name or code.");
      return;
    }
    const next = {
      ...state,
      courses: state.courses.map((course) => course.id === courseId
        ? { ...course, name: name.trim(), code: code.trim() }
        : course),
    };
    if (persist(next, `Updated "${name.trim()}".`)) {
      setNotice(`Updated "${name.trim()}".`);
      setError("");
    } else {
      setError("The course could not be saved. Check Study synchronization and try again.");
    }
  }

  function changeCoursePeriod(
    courseId: string,
    courseName: string,
    year: number | null,
    semester: 1 | 2 | 3 | null,
  ) {
    if (!state || loadingError || syncConflict) return;
    try {
      const next = assignCourseToAcademicPeriod(state, courseId, year, semester);
      const message = year && semester
        ? `Moved "${courseName}" to Year ${year}, Semester ${semester}.`
        : `Moved "${courseName}" to Unassigned.`;
      if (persist(next, message)) {
        setNotice(message);
        setError("");
      } else {
        setError("The course period could not be saved. Check Study synchronization and try again.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The course period could not be changed.");
    }
  }

  return (
    <section className="course-management mt-2 border-t border-[var(--border)] pt-5" aria-labelledby="course-management-heading">
      <div className="space-y-1">
        <h3 id="course-management-heading" className="font-bold">Course management</h3>
        <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
          Add, edit and organise courses by academic period. Existing courses stay Unassigned until you explicitly assign them; changing the active period never moves or deletes historical records.
        </p>
      </div>

      {loadingError && <p role="alert" className="mt-3 text-sm text-red-700">Study data could not be loaded: {loadingError}</p>}
      {syncConflict && <p role="alert" className="mt-3 text-sm text-amber-800">Resolve the Study synchronization conflict before changing courses.</p>}
      {problem && <p role="alert" className="mt-3 text-sm text-amber-800">{problem}</p>}
      {notice && <p role="status" className="mt-3 text-sm font-bold text-[var(--primary-dark)]">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-bold text-[var(--accent-dark)]">{error}</p>}

      <form onSubmit={addCourse} className="mt-4 grid gap-3 rounded-xl bg-[var(--surface-soft)] p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <label className="block space-y-1">
          <span className="text-sm font-bold">Course name</span>
          <input
            value={quickCourseName}
            onChange={(event) => setQuickCourseName(event.target.value)}
            maxLength={120}
            required
            placeholder="e.g. Pharmacology"
            disabled={!state || Boolean(loadingError) || syncConflict}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-bold">Course code</span>
          <input
            value={quickCourseCode}
            onChange={(event) => setQuickCourseCode(event.target.value)}
            maxLength={40}
            placeholder="Optional"
            disabled={!state || Boolean(loadingError) || syncConflict}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={!state || Boolean(loadingError) || syncConflict || !quickCourseName.trim()}
          className="min-h-11 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          Add course
        </button>
        <p className="text-xs text-[var(--muted)] sm:col-span-3">
          New courses inherit {activePeriodLabel}. When no active period is set, they are saved as Unassigned.
        </p>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="course-period-filter" className="text-sm font-bold">Show courses</label>
        <select
          id="course-period-filter"
          value={effectiveCourseFilter}
          onChange={(event) => setCourseFilter(event.target.value as "current" | "unassigned" | "all")}
          className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <option value="current" disabled={!hasActivePeriod}>Active period ({activePeriodLabel})</option>
          <option value="unassigned">Unassigned</option>
          <option value="all">All periods</option>
        </select>
      </div>

      {!state ? (
        <p className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3 text-sm text-[var(--muted)]">Loading your courses…</p>
      ) : visibleCourses.length === 0 ? (
        <p className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3 text-sm text-[var(--muted)]">
          {state.courses.length === 0
            ? "No courses have been added yet. Add one above or import a catalogue below."
            : effectiveCourseFilter === "current"
              ? `No courses are assigned to ${activePeriodLabel}. Existing courses may be in Unassigned or another period; they have not been moved automatically.`
              : effectiveCourseFilter === "unassigned"
                ? "No Unassigned courses."
                : "No courses match this filter."}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {visibleCourses.map((course) => {
            const archived = Boolean(course.archived_at);
            const periodLabel = course.academic_year && course.academic_semester
              ? `Year ${course.academic_year} · Semester ${course.academic_semester}`
              : "Unassigned";
            return (
              <article key={course.id} className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-extrabold text-[var(--ink)]">{course.name}{course.code ? ` (${course.code})` : ""}</p>
                  <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                    {periodLabel} · {archived ? "Archived" : "Active"}
                    {archived && course.archived_at ? ` · ${new Date(course.archived_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <CardMenu
                    title={`Actions for ${course.name}`}
                    disabled={!state || Boolean(loadingError) || syncConflict}
                    actions={[
                      {
                        label: "Edit course details",
                        onSelect: () => editCourse(course.id, course.name, course.code),
                      },
                      ...(activeYear !== null && activeSemester !== null &&
                        (course.academic_year !== activeYear || course.academic_semester !== activeSemester)
                        ? [{
                            label: "Assign to active period",
                            onSelect: () => changeCoursePeriod(course.id, course.name, activeYear, activeSemester),
                          }]
                        : []),
                      ...(course.academic_year != null || course.academic_semester != null
                        ? [{
                            label: "Move to Unassigned",
                            onSelect: () => changeCoursePeriod(course.id, course.name, null, null),
                          }]
                        : []),
                      {
                        label: archived ? "Restore course" : "Archive course",
                        onSelect: () => archiveOrRestore(course.id, course.name, archived),
                      },
                    ] satisfies CardMenuAction[]}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        Archive is reversible and keeps all records. Permanent deletion is temporarily unavailable while the server-side deletion procedure is hardened; use Archive to remove a course from active Study work without erasing its history.
      </p>
    </section>
  );
}
