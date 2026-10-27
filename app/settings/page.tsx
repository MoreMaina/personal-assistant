"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import GoogleCalendarSettings from "@/app/components/GoogleCalendarSettings";

import {
  ensureFixedSemesters,
  getAcademicSettings,
  getCurrentSemesterId,
  getGlobalProgram,
  saveGlobalProgramName,
  saveStudyYear,
  setCurrentSemesterId,
  type Semester,
} from "@/lib/studyStorage";

export default function GeneralSettingsPage() {
  const [programName, setProgramName] = useState("");
  const [studyYear, setStudyYear] = useState("1");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState("");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const program = getGlobalProgram();
    setProgramName(program?.name ?? "");
    setStudyYear(String(getAcademicSettings().studyYear));

    if (program) {
      const fixed = ensureFixedSemesters(program.id);
      setSemesters(fixed);

      const currentId = getCurrentSemesterId();
      const currentFixed = fixed.find((semester) => semester.id === currentId);
      setSelectedSemesterId(currentFixed ? String(currentFixed.id) : "");
    }

    setReady(true);
  }, []);

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    setError("");

    const cleanYear = studyYear.trim();
    if (!/^[1-9][0-9]*$/.test(cleanYear)) {
      setError("Study year must be a positive whole number, such as 1 or 2.");
      return;
    }

    const year = Number(cleanYear);
    if (!Number.isSafeInteger(year)) {
      setError("Enter a smaller, valid whole number for the study year.");
      return;
    }

    try {
      const program = saveGlobalProgramName(programName);
      if (!program) {
        setError("Enter your program name before saving.");
        return;
      }

      if (!saveStudyYear(year)) {
        setError("The study year could not be saved.");
        return;
      }

      const fixed = ensureFixedSemesters(program.id);
      setSemesters(fixed);

      const chosen = fixed.find(
        (semester) => String(semester.id) === selectedSemesterId,
      );

      if (chosen) {
        setCurrentSemesterId(chosen.id);
      } else if (getCurrentSemesterId() === null && fixed[0]) {
        // Initialise new academic settings to Semester 1.
        setCurrentSemesterId(fixed[0].id);
        setSelectedSemesterId(String(fixed[0].id));
      } else {
        const currentId = getCurrentSemesterId();
        const currentFixed = fixed.find(
          (semester) => semester.id === currentId,
        );
        setSelectedSemesterId(currentFixed ? String(currentFixed.id) : "");
      }

      setStudyYear(String(year));
      setSaved(true);
    } catch {
      setError("Settings could not be saved. Please check browser storage and try again.");
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-1 pb-10">
      <header className="space-y-2">
        <p className="stat-label">Personal Assistant</p>
        <h1 className="text-3xl font-extrabold">General Settings</h1>
        <p className="leading-relaxed text-[var(--ink-soft)]">
          Manage your global academic details. Your course and lecture records remain in place when you update these settings.
        </p>
      </header>

      <form onSubmit={handleSave} className="space-y-6">
        <section className="space-y-4 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold">Academic details</h2>
            <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
              Keep one program name and set the study year you are currently in.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="program-name" className="block text-sm font-extrabold">
              Program name
            </label>
            <input
              id="program-name"
              value={programName}
              onChange={(event) => {
                setProgramName(event.target.value);
                setSaved(false);
              }}
              disabled={!ready}
              required
              maxLength={120}
              placeholder="Enter your program name"
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="study-year" className="block text-sm font-extrabold">
              Current study year
            </label>
            <input
              id="study-year"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={studyYear}
              onChange={(event) => {
                setStudyYear(event.target.value);
                setSaved(false);
              }}
              disabled={!ready}
              required
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base"
            />
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              Enter any positive whole number, such as 1, 2, 3, or 4.
            </p>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold">Current semester</h2>
            <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
              Choose one of the three semesters. New semester creation is not available here.
            </p>
          </div>

          <label htmlFor="current-semester" className="block text-sm font-extrabold">
            Semester
          </label>
          <select
            id="current-semester"
            value={selectedSemesterId}
            onChange={(event) => {
              setSelectedSemesterId(event.target.value);
              setSaved(false);
            }}
            disabled={!ready || semesters.length === 0}
            className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base"
          >
            <option value="">Select current semester</option>
            {semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.name}
              </option>
            ))}
          </select>

          {ready && !selectedSemesterId && semesters.length > 0 && (
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              Choose a semester and save to make it current. Any older semester records are retained.
            </p>
          )}
          {ready && semesters.length === 0 && (
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              Save your program details first to initialise the three semester choices.
            </p>
          )}
        </section>

        {error && (
          <p role="alert" className="rounded-xl bg-[var(--accent-soft)] p-3 font-bold text-[var(--accent-dark)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!ready}
            className="min-h-11 rounded-full bg-[var(--primary)] px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            Save settings
          </button>
          {saved && (
            <p role="status" className="text-sm font-semibold text-[var(--primary-dark)]">
              General settings saved on this device.
            </p>
          )}
        </div>
      </form>

      <GoogleCalendarSettings />

      <section className="flex flex-col gap-3 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="space-y-1">
          <h2 className="font-bold">AI &amp; Voice Settings</h2>
          <p className="text-sm text-[var(--ink-soft)]">
            Configure Copilot&apos;s model and speech provider.
          </p>
        </div>
        <Link
          href="/settings/ai"
          className="inline-flex min-h-11 items-center justify-center rounded-full border-2 border-[var(--primary-dark)] px-4 py-2 font-bold text-[var(--primary-dark)]"
        >
          Open AI settings
        </Link>
      </section>
    </main>
  );
}
