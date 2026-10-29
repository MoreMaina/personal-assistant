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

import { defaultIdFactory } from "@/lib/studyMvp/reviewEngine";
import {
  exportTopicCatalogCsv,
  importTopicCatalogText,
  type TopicImportDiagnostic,
} from "@/lib/studyMvp/csvImport";
import { useCloudStudyState } from "@/lib/studyMvp/useCloudStudyState";

export default function GeneralSettingsPage() {
  const [programName, setProgramName] = useState("");
  const [studyYear, setStudyYear] = useState("1");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState("");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const {
    state: studyState,
    loadingError: studyLoadingError,
    syncConflict: studySyncConflict,
    persist: persistStudyState,
  } = useCloudStudyState();

  const [catalogImportText, setCatalogImportText] = useState("");
  const [catalogImportDiagnostics, setCatalogImportDiagnostics] =
    useState<TopicImportDiagnostic[]>([]);
  const [catalogImportCounts, setCatalogImportCounts] =
    useState<string[]>([]);
  const [catalogImportPreviewReady, setCatalogImportPreviewReady] =
    useState(false);
  const [catalogImportMessage, setCatalogImportMessage] = useState("");
  const [catalogImportError, setCatalogImportError] = useState("");

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

  function catalogImportCountLabels(
    counts: ReturnType<typeof importTopicCatalogText>["counts"],
  ): string[] {
    return [
      `Courses created: ${counts.courses_created}`,
      `Units created: ${counts.units_created}`,
      `Topics created: ${counts.topics_created}`,
      `Existing topics reused: ${counts.existing_topics_reused}`,
      `Tasks created: ${counts.tasks_created}`,
      `Duplicate tasks skipped: ${counts.duplicate_tasks_skipped}`,
    ];
  }

  function importCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!studyState) {
      setCatalogImportError("Study data is not ready.");
      return;
    }

    if (studyLoadingError || studySyncConflict) {
      setCatalogImportError(
        "Resolve the Study loading or sync issue before importing.",
      );
      return;
    }

    setCatalogImportDiagnostics([]);
    setCatalogImportCounts([]);
    setCatalogImportPreviewReady(false);
    setCatalogImportError("");
    setCatalogImportMessage("");

    try {
      const result = importTopicCatalogText(
        studyState,
        catalogImportText,
        {
          now: new Date().toISOString(),
          idFactory: defaultIdFactory,
        },
      );

      setCatalogImportDiagnostics(result.diagnostics);

      if (!result.ok) {
        setCatalogImportError(
          "Import rejected. No catalog changes were saved.",
        );
        return;
      }

      setCatalogImportCounts(
        catalogImportCountLabels(result.counts),
      );
      setCatalogImportPreviewReady(true);
      setCatalogImportMessage(
        "Preview ready. No catalog changes have been saved yet.",
      );
    } catch (error) {
      setCatalogImportError(
        error instanceof Error
          ? error.message
          : "The catalog preview failed.",
      );
    }
  }

  function applyCatalogImport() {
    if (
      !studyState ||
      !catalogImportText.trim() ||
      !catalogImportPreviewReady
    ) {
      return;
    }

    if (studyLoadingError || studySyncConflict) {
      setCatalogImportError(
        "Resolve the Study loading or sync issue before importing.",
      );
      return;
    }

    setCatalogImportError("");
    setCatalogImportMessage("");

    try {
      // Revalidate against the latest Study state.
      // Preview itself never saves changes.
      const result = importTopicCatalogText(
        studyState,
        catalogImportText,
        {
          now: new Date().toISOString(),
          idFactory: defaultIdFactory,
        },
      );

      setCatalogImportDiagnostics(result.diagnostics);

      if (!result.ok) {
        setCatalogImportCounts([]);
        setCatalogImportPreviewReady(false);
        setCatalogImportError(
          "The import is no longer valid against the current Study state. " +
          "No changes were saved. Review the diagnostics and create a new preview.",
        );
        return;
      }

      const saved = persistStudyState(
        result.state,
        "Catalog imported successfully.",
      );

      if (saved) {
        setCatalogImportCounts(
          catalogImportCountLabels(result.counts),
        );
        setCatalogImportPreviewReady(false);
        setCatalogImportMessage(
          "Catalog imported successfully.",
        );
      }
    } catch (error) {
      setCatalogImportPreviewReady(false);
      setCatalogImportError(
        error instanceof Error
          ? error.message
          : "The catalog import failed. No changes were applied by this handler.",
      );
    }
  }

  function cancelCatalogImport() {
    setCatalogImportText("");
    setCatalogImportDiagnostics([]);
    setCatalogImportCounts([]);
    setCatalogImportPreviewReady(false);
    setCatalogImportMessage("");
    setCatalogImportError("");
  }

  function handleCatalogFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    void file.text()
      .then((text) => {
        setCatalogImportText(text);
        setCatalogImportDiagnostics([]);
        setCatalogImportCounts([]);
        setCatalogImportPreviewReady(false);
        setCatalogImportMessage("");
        setCatalogImportError("");
      })
      .catch(() => {
        setCatalogImportError(
          "Could not read the selected catalog file.",
        );
      });
  }

  function downloadCatalogCsv() {
    if (!studyState || studyLoadingError || studySyncConflict) {
      setCatalogImportError(
        "Study data is not ready. Resolve any loading or sync conflict first.",
      );
      return;
    }

    try {
      const csv = exportTopicCatalogCsv(studyState);
      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `study-topic-catalog-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setCatalogImportError("");
      setCatalogImportMessage("Topic catalog CSV downloaded.");
    } catch (error) {
      setCatalogImportError(
        error instanceof Error
          ? error.message
          : "Could not export the topic catalog.",
      );
    }
  }

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
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
  <h2 className="text-xl font-extrabold">
    Study catalog
  </h2>

  <p className="mt-2 text-sm font-semibold text-[var(--ink-soft)]">
    Import courses, units, topics and tasks. Preview validates
    the catalog without saving changes. Applying an import
    validates it again against the latest Study data.
  </p>

  {studyLoadingError && (
    <p role="alert" className="mt-3 text-sm text-red-700">
      Study data could not be loaded:{" "}
      {String(studyLoadingError)}
    </p>
  )}

  {studySyncConflict && (
    <p role="alert" className="mt-3 text-sm text-amber-800">
      Resolve the Study synchronization conflict before importing.
    </p>
  )}

  {catalogImportMessage && (
    <p role="status" className="mt-3 text-sm font-bold text-green-800">
      {catalogImportMessage}
    </p>
  )}

  {catalogImportError && (
    <p role="alert" className="mt-3 text-sm font-bold text-red-700">
      {catalogImportError}
    </p>
  )}

  <form onSubmit={importCatalog} className="mt-4 space-y-4">
    <label className="block space-y-2">
      <span className="text-sm font-bold">
        Choose a catalog file
      </span>
      <input
        type="file"
        accept=".csv,.txt,.json,text/csv,text/plain,application/json"
        onChange={handleCatalogFileChange}
        disabled={!studyState || Boolean(studyLoadingError) || Boolean(studySyncConflict)}
        className="block w-full text-sm"
      />
    </label>

    <label className="block space-y-2">
      <span className="text-sm font-bold">
        Or paste catalog content
      </span>
      <textarea
        value={catalogImportText}
        onChange={(event) => {
          setCatalogImportText(event.target.value);
          setCatalogImportPreviewReady(false);
          setCatalogImportDiagnostics([]);
          setCatalogImportCounts([]);
          setCatalogImportMessage("");
          setCatalogImportError("");
        }}
        rows={8}
        placeholder="Paste your catalog CSV or supported text format here…"
        className="w-full rounded-xl border border-[var(--border)] bg-white p-3 text-sm"
      />
    </label>

    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        disabled={
          !studyState ||
          Boolean(studyLoadingError) ||
          Boolean(studySyncConflict) ||
          !catalogImportText.trim()
        }
        className="rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        Preview import
      </button>

      <button
        type="button"
        onClick={cancelCatalogImport}
        className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold"
      >
        Cancel
      </button>

      <button
        type="button"
        onClick={downloadCatalogCsv}
        disabled={!studyState || Boolean(studyLoadingError) || Boolean(studySyncConflict)}
        className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold disabled:opacity-50"
      >
        Export catalog CSV
      </button>
    </div>
  </form>

  {catalogImportCounts.length > 0 && (
    <ul className="mt-4 space-y-1 rounded-xl bg-stone-50 p-4 text-sm">
      {catalogImportCounts.map((count) => (
        <li key={count}>{count}</li>
      ))}
    </ul>
  )}

  {catalogImportDiagnostics.length > 0 && (
    <div className="mt-4 space-y-2">
      <h3 className="font-bold">Import diagnostics</h3>
      {catalogImportDiagnostics.map((diagnostic, index) => (
        <pre
          key={index}
          className="overflow-x-auto rounded-lg bg-stone-50 p-3 text-xs whitespace-pre-wrap"
        >
          {JSON.stringify(diagnostic, null, 2)}
        </pre>
      ))}
    </div>
  )}

  {catalogImportPreviewReady && (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-bold text-emerald-900">
        Preview is ready. No catalog changes have been saved yet.
      </p>
      <button
        type="button"
        onClick={applyCatalogImport}
        disabled={!studyState || Boolean(studyLoadingError) || Boolean(studySyncConflict)}
        className="mt-3 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        Apply import
      </button>
    </div>
  )}
</section>

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
