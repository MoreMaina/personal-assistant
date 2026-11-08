"use client";

import { useState } from "react";
import { deleteCourseStudyData } from "@/lib/studyMvp/courseDeletion";
import {
  exportStudyMvpJSON,
  setCourseArchivedAt,
} from "@/lib/studyMvp/storage";
import type { StudyMvpState } from "@/lib/studyMvp/types";
import { unlinkClassesFromStudyUnits } from "@/lib/classStorage";

interface CourseManagementPanelProps {
  state: StudyMvpState | null;
  loadingError?: string;
  syncConflict?: boolean;
  problem?: string;
  persist: (next: StudyMvpState, successMessage?: string) => boolean;
  persistCourseDeletion: (
    next: StudyMvpState,
    courseId: string,
    successMessage?: string,
  ) => Promise<boolean>;
}

export default function CourseManagementPanel({
  state,
  loadingError,
  syncConflict = false,
  problem,
  persist,
  persistCourseDeletion,
}: CourseManagementPanelProps) {
  const [busyCourseId, setBusyCourseId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function archiveOrRestore(courseId: string, courseName: string, archived: boolean) {
    if (!state || busyCourseId || loadingError || syncConflict) return;
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

  function downloadPreDeletionBackup(courseName: string, snapshot: StudyMvpState) {
    const blob = new Blob([exportStudyMvpJSON(snapshot)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `study-backup-before-deleting-${courseName.trim().replace(/[^a-z0-9-]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function permanentlyDeleteCourse(courseId: string, courseName: string) {
    if (!state || busyCourseId || loadingError || syncConflict) return;
    const courseUnits = state.units
      .filter((unit) => unit.course_id === courseId)
      .map((unit) => unit.id);

    const warning =
      `Permanently delete "${courseName}" and erase its study history?\n\n` +
      "This removes its units, topics, retrieval questions, review schedules, assignments, exams, course-linked attempts and results, recorded topic/assignment sessions, affected weekly metric snapshots, and its items in saved daily plans. Unrelated courses and the other items in those plans are kept. Calendar classes linked to this course's units are unlinked.\n\n" +
      "Weekly metric snapshots containing deleted course events are removed as a whole because their aggregate totals cannot be safely recalculated; this can remove that week's combined summary for other courses. Daily-plan completion markers for snapshots containing deleted course items are also cleared, while other items in those plans are retained. A mixed-practice or Sampler block whose frozen question selection includes this course is removed as a whole, including its shared session record.\n\n" +
      "A downloadable backup will be created first, and the cloud database keeps its own recovery snapshot. This action cannot be undone from the app.";
    if (!window.confirm(warning)) return;

    try {
      downloadPreDeletionBackup(courseName, state);
    } catch {
      setError("The backup could not be downloaded, so the course was not deleted.");
      return;
    }

    const confirmationPhrase = `DELETE ${courseName}`;
    const typed = window.prompt(
      `A backup has been downloaded. To permanently delete this course and its history, type exactly:\n\n${confirmationPhrase}`,
    );
    if (typed !== confirmationPhrase) {
      setNotice("Deletion cancelled. The course and its history are unchanged.");
      return;
    }

    setBusyCourseId(courseId);
    setError("");
    setNotice("");
    try {
      const next = deleteCourseStudyData(state, courseId);
      const saved = await persistCourseDeletion(
        next,
        courseId,
        `Permanently deleted "${courseName}" and its associated study history.`,
      );
      if (!saved) return;

      try {
        unlinkClassesFromStudyUnits(courseUnits);
      } catch {
        setError(`"${courseName}" and its Study history were deleted, but linked calendar classes could not be updated. Review the class schedule.`);
        return;
      }
      setNotice(`Permanently deleted "${courseName}" and its associated study history.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The course could not be permanently deleted.");
    } finally {
      setBusyCourseId(null);
    }
  }

  return (
    <section className="course-management mt-2 border-t border-[var(--border)] pt-5" aria-labelledby="course-management-heading">
      <div className="space-y-1">
        <h3 id="course-management-heading" className="font-bold">Course management</h3>
        <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
          Add and organise your courses in Study. Archive a course to pause it, or permanently delete it and its associated study history.
        </p>
      </div>

      {loadingError && <p role="alert" className="mt-3 text-sm text-red-700">Study data could not be loaded: {loadingError}</p>}
      {syncConflict && <p role="alert" className="mt-3 text-sm text-amber-800">Resolve the Study synchronization conflict before changing courses.</p>}
      {problem && <p role="alert" className="mt-3 text-sm text-amber-800">{problem}</p>}
      {notice && <p role="status" className="mt-3 text-sm font-bold text-[var(--primary-dark)]">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-bold text-[var(--accent-dark)]">{error}</p>}

      {!state ? (
        <p className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3 text-sm text-[var(--muted)]">Loading your courses…</p>
      ) : state.courses.length === 0 ? (
        <p className="mt-3 rounded-xl bg-[var(--surface-soft)] p-3 text-sm text-[var(--muted)]">No courses have been added yet. Add courses through Study or import a course catalog below.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {state.courses.map((course) => {
            const archived = Boolean(course.archived_at);
            const busy = busyCourseId === course.id;
            return (
              <article key={course.id} className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-extrabold text-[var(--ink)]">{course.name}{course.code ? ` (${course.code})` : ""}</p>
                  <p className="mt-1 text-xs font-bold text-[var(--muted)]">
                    {archived ? "Archived" : "Active"}
                    {archived && course.archived_at ? ` · ${new Date(course.archived_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!state || Boolean(busyCourseId) || Boolean(loadingError) || syncConflict}
                    onClick={() => archiveOrRestore(course.id, course.name, archived)}
                    className={archived ? "course-management__restore" : "course-management__archive"}
                  >
                    {busy ? "Deleting…" : archived ? "Restore course" : "Archive course"}
                  </button>
                  <button
                    type="button"
                    disabled={!state || Boolean(busyCourseId) || Boolean(loadingError) || syncConflict}
                    onClick={() => void permanentlyDeleteCourse(course.id, course.name)}
                    className="course-management__delete"
                  >
                    {busy ? "Deleting…" : "Permanently delete"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        Archive is reversible and keeps all records. Permanent deletion first downloads a JSON backup and also creates a cloud recovery snapshot before removing the selected course&apos;s records.
      </p>
    </section>
  );
}
