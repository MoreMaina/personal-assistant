"use client";

import { useAutoDismissMessage } from "@/lib/useAutoDismissMessage";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import GoogleCalendarSettings from "@/app/components/GoogleCalendarSettings";
import PushNotificationSettings from "@/app/components/PushNotificationSettings";
import CourseManagementPanel from "@/app/components/CourseManagementPanel";
import { ThemePreferenceControl } from "@/app/components/Navigation";

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

import { defaultIdFactory, localDateOfTimestamp } from "@/lib/studyMvp/reviewEngine";
import { setActiveAcademicPeriod } from "@/lib/studyMvp/academicPeriod";
import {
  TOPIC_CSV_HEADERS,
  exportTopicCatalogCsv,
  importTopicCatalogText,
  type TopicImportDiagnostic,
} from "@/lib/studyMvp/csvImport";
import { applyStudySettingsChange } from "@/lib/studyMvp/storage";
import { useCloudStudyState } from "@/lib/studyMvp/useCloudStudyState";

export default function GeneralSettingsPage() {
  const [programName, setProgramName] = useState("");
  const [studyYear, setStudyYear] = useState("1");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [selectedSemesterId, setSelectedSemesterId] = useState("");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedAcademicDraft, setSavedAcademicDraft] = useState<{
    programName: string;
    studyYear: string;
    selectedSemesterId: string;
  } | null>(null);
  const [error, setError] = useState("");
  useAutoDismissMessage(error, setError);
  const {
    state: studyState,
    loadingError: studyLoadingError,
    syncConflict: studySyncConflict,
    problem: studyProblem,
    persist: persistStudyState,
    persistCourseDeletion,
  } = useCloudStudyState();

  const [studyDailyBudgetDraft, setStudyDailyBudgetDraft] = useState("180");
  const [studyReviewReserveDraft, setStudyReviewReserveDraft] = useState("30");
  const [studyRepairCapDraft, setStudyRepairCapDraft] = useState("30");
  const [studyGateThresholdDraft, setStudyGateThresholdDraft] = useState("60");
  const [studyDeferLimitDraft, setStudyDeferLimitDraft] = useState("3");
  const [studyIntervalsDraft, setStudyIntervalsDraft] = useState<
    [string, string, string, string, string]
  >(["1", "3", "7", "14", "30"]);
  const [studyLastFinalDateDraft, setStudyLastFinalDateDraft] = useState("");
  const [studySettingsReason, setStudySettingsReason] = useState(
    "Configure Study System MVP v1.2 before starting the four-week trial.",
  );
  const [studySettingsMessage, setStudySettingsMessage] = useState("");
  const [studySettingsError, setStudySettingsError] = useState("");

  useEffect(() => {
    if (!studyState) return;

    const settings = studyState.settings;
    setStudyDailyBudgetDraft(String(settings.daily_budget_min));
    setStudyReviewReserveDraft(String(settings.review_reserve_min));
    setStudyRepairCapDraft(String(settings.repair_recovery_cap_min));
    setStudyGateThresholdDraft(String(settings.gate_threshold_pct));
    setStudyDeferLimitDraft(String(settings.defer_limit));
    setStudyIntervalsDraft(settings.intervals_days.map(String) as [
      string, string, string, string, string,
    ]);
    setStudyLastFinalDateDraft(settings.last_final_exam_date ?? "");
  }, [studyState]);

  const academicDetailsDirty =
    savedAcademicDraft !== null &&
    (
      programName.trim() !== savedAcademicDraft.programName ||
      studyYear.trim() !== savedAcademicDraft.studyYear ||
      selectedSemesterId !== savedAcademicDraft.selectedSemesterId
    );

  const [catalogImportText, setCatalogImportText] = useState("");
  const [catalogImportDiagnostics, setCatalogImportDiagnostics] =
    useState<TopicImportDiagnostic[]>([]);
  const [catalogImportCounts, setCatalogImportCounts] =
    useState<string[]>([]);
  const [catalogImportPreviewReady, setCatalogImportPreviewReady] =
    useState(false);
  const [catalogImportMessage, setCatalogImportMessage] = useState("");
  const [catalogImportError, setCatalogImportError] = useState("");
  useAutoDismissMessage(catalogImportError, setCatalogImportError);

  useEffect(() => {
    if (!saved) return;
    const timeout = window.setTimeout(() => setSaved(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [saved]);

  useEffect(() => {
    if (!catalogImportMessage) return;
    const timeout = window.setTimeout(() => setCatalogImportMessage(""), 5500);
    return () => window.clearTimeout(timeout);
  }, [catalogImportMessage]);

  useEffect(() => {
    const program = getGlobalProgram();
    const loadedProgramName = program?.name ?? "";
    const loadedStudyYear = String(getAcademicSettings().studyYear);
    let loadedSemesterId = "";

    setProgramName(loadedProgramName);
    setStudyYear(loadedStudyYear);

    if (program) {
      const fixed = ensureFixedSemesters(program.id);
      setSemesters(fixed);

      const currentId = getCurrentSemesterId();
      const currentFixed = fixed.find((semester) => semester.id === currentId);
      loadedSemesterId = currentFixed ? String(currentFixed.id) : "";
      setSelectedSemesterId(loadedSemesterId);
    }

    setSavedAcademicDraft({
      programName: loadedProgramName.trim(),
      studyYear: loadedStudyYear,
      selectedSemesterId: loadedSemesterId,
    });
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

  function downloadCatalogTemplate() {
    const csv = `${TOPIC_CSV_HEADERS.join(",")}\r\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "study-topic-catalog-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setCatalogImportError("");
    setCatalogImportMessage("Blank topic-catalog template downloaded.");
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

      if (!studyState || studyLoadingError || studySyncConflict) {
        setError("Study data is not ready. Resolve the loading or sync issue before changing the active period.");
        return;
      }

      const activeSemester =
        chosen ?? (getCurrentSemesterId() === null
          ? fixed[0]
          : fixed.find((semester) => semester.id === getCurrentSemesterId()));
      const semesterNumber = activeSemester?.name.match(/^semester\s*([1-3])$/i);
      if (!semesterNumber) {
        setError("Choose Semester 1, 2, or 3 before saving the active period.");
        return;
      }

      const nextStudyState = setActiveAcademicPeriod(
        studyState,
        year,
        Number(semesterNumber[1]) as 1 | 2 | 3,
        new Date().toISOString(),
      );
      if (!persistStudyState(nextStudyState, `Active academic period set to Year ${year}, Semester ${semesterNumber[1]}.`)) {
        setError("The active academic period could not be saved to Study cloud storage.");
        return;
      }

      setStudyYear(String(year));
      setSavedAcademicDraft({
        programName: programName.trim(),
        studyYear: String(year),
        selectedSemesterId: activeSemester
          ? String(activeSemester.id)
          : "",
      });
      setSaved(true);
    } catch {
      setError("Settings could not be saved. Please check browser storage and try again.");
    }
  }

  const studySettingsToday = studyState
    ? localDateOfTimestamp(
        new Date().toISOString(),
        studyState.settings.timezone,
      )
    : "";

  const studyTrialActive = Boolean(
    studyState?.settings.trial_start_date &&
    studyState.settings.trial_end_date &&
    studySettingsToday >= studyState.settings.trial_start_date &&
    studySettingsToday <= studyState.settings.trial_end_date,
  );

  const studySettingsDisabled = Boolean(
    !studyState ||
    studyLoadingError ||
    studySyncConflict ||
    studyTrialActive,
  );

  function saveStudyEngineSettings() {
    setStudySettingsError("");
    setStudySettingsMessage("");

    if (!studyState || studyLoadingError || studySyncConflict) {
      setStudySettingsError(
        "Study data is not ready. Resolve the loading or sync issue before saving.",
      );
      return;
    }

    if (studyTrialActive) {
      setStudySettingsError(
        "Study engine settings are frozen during the four-week trial.",
      );
      return;
    }

    try {
      function wholeNumber(
        raw: string,
        label: string,
        minimum: number,
      ): number {
        const value = raw.trim();
        if (!/^\d+$/.test(value)) {
          throw new Error(`${label} must be a whole number.`);
        }

        const parsed = Number(value);
        if (!Number.isSafeInteger(parsed) || parsed < minimum) {
          throw new Error(
            `${label} must be at least ${minimum}.`,
          );
        }
        return parsed;
      }

      const dailyBudget = wholeNumber(
        studyDailyBudgetDraft,
        "Daily study budget",
        1,
      );
      const reviewReserve = wholeNumber(
        studyReviewReserveDraft,
        "Review reserve",
        0,
      );
      const repairCap = wholeNumber(
        studyRepairCapDraft,
        "Repair and recovery cap",
        0,
      );
      const gateThreshold = wholeNumber(
        studyGateThresholdDraft,
        "Gate threshold",
        60,
      );
      const deferLimit = wholeNumber(
        studyDeferLimitDraft,
        "Defer limit",
        1,
      );

      if (reviewReserve > dailyBudget) {
        throw new Error(
          "Review reserve cannot exceed the daily study budget.",
        );
      }
      if (repairCap > dailyBudget) {
        throw new Error(
          "Repair and recovery cap cannot exceed the daily study budget.",
        );
      }
      if (gateThreshold > 100) {
        throw new Error("Gate threshold cannot exceed 100%.");
      }

      if (
        studyIntervalsDraft.some(
          (value) => !/^\d+$/.test(value.trim()),
        )
      ) {
        throw new Error(
          "Enter all five review intervals as whole numbers of days.",
        );
      }

      const parsedIntervals = studyIntervalsDraft.map(Number);

      if (
        parsedIntervals.some(
          (days) => !Number.isSafeInteger(days) || days < 1,
        ) ||
        parsedIntervals.some(
          (days, index) =>
            index > 0 && days <= (parsedIntervals[index - 1] ?? 0),
        )
      ) {
        throw new Error(
          "Review intervals must be positive and increase from left to right.",
        );
      }

      const intervals = parsedIntervals as [
        number, number, number, number, number,
      ];

      const reason = studySettingsReason.trim();
      if (!reason) {
        throw new Error("Enter a reason for this settings change.");
      }

      const nextState = applyStudySettingsChange(
        studyState,
        {
          daily_budget_min: dailyBudget,
          review_reserve_min: reviewReserve,
          repair_recovery_cap_min: repairCap,
          gate_threshold_pct: gateThreshold,
          defer_limit: deferLimit,
          intervals_days: intervals,
          last_final_exam_date: studyLastFinalDateDraft.trim() || null,
        },
        reason,
        {
          now: new Date().toISOString(),
          idFactory: defaultIdFactory,
        },
      );

      if (nextState === studyState) {
        setStudySettingsMessage("No Study settings have changed.");
        return;
      }

      const persisted = persistStudyState(
        nextState,
        "Study engine settings saved with an audit record.",
      );

      if (!persisted) {
        setStudySettingsError(
          "The settings could not be saved. Check the Study sync status and try again.",
        );
        return;
      }

      setStudySettingsMessage(
        "Study settings saved locally and queued for cloud synchronization. The change has been added to the audit history.",
      );
    } catch (error) {
      setStudySettingsError(
        error instanceof Error
          ? error.message
          : "Study settings could not be saved.",
      );
    }
  }

  return (
    <main className="general-settings-page mx-auto w-full max-w-3xl space-y-6 px-1 pb-10">
      <header className="space-y-2">
        <p className="stat-label">Personal Assistant</p>
        <h1 className="text-3xl font-extrabold">General Settings</h1>
        <p className="leading-relaxed text-[var(--ink-soft)]">
          Manage your program, study year and current semester. Your courses and lectures stay unchanged.
        </p>
      </header>

      <section className="settings-appearance-section rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <ThemePreferenceControl />
      </section>

      <details className="settings-section group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5" open>
        <summary className="settings-section__summary">
          <span className="settings-section-title">Academic details</span>
        </summary>
        <form onSubmit={handleSave} className="mt-4 space-y-6">
          <div className="space-y-5">
            <section className="space-y-4">
              <div className="space-y-1">
                <h3 className="font-bold">Program and current study year</h3>
                <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
                  Set your program and current study year.
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
                  Use a positive whole number.
                </p>
              </div>
            </section>

            <section className="space-y-4 border-t border-[var(--border)] pt-4">
              <div className="space-y-1">
                <h3 className="font-bold">Current semester</h3>
                <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
                  This is the global active period for new and imported courses. Existing courses stay Unassigned or in their saved period until you change them in Course Management.
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
                  Choose and save the current semester. Older records are kept.
                </p>
              )}
              {ready && semesters.length === 0 && (
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  Save your program details first to initialise the three semester choices.
                </p>
              )}
            </section>


          </div>

        {error && (
          <p role="alert" className="rounded-xl bg-[var(--accent-soft)] p-3 font-bold text-[var(--accent-dark)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {academicDetailsDirty && (
            <button
              type="submit"
              disabled={!ready}
              className="min-h-11 rounded-full bg-[var(--primary)] px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              Save settings
            </button>
          )}
          {saved && !academicDetailsDirty && (
            <p role="status" className="text-sm font-semibold text-[var(--primary-dark)]">
              General settings saved on this device.
            </p>
          )}
        </div>
        </form>
      </details>

      <details className="group rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="settings-section-title text-[var(--ink)]">
                Study System settings
              </span>
              {studyTrialActive ? (
                <span className="max-w-full rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold leading-tight text-amber-900">
                  Active · locked
                </span>
              ) : (!studyState || studyLoadingError || studySyncConflict || studyProblem) ? (
                <span className="max-w-full rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold leading-tight text-stone-700">
                  Needs attention
                </span>
              ) : studyState?.settings.trial_start_date &&
                  studyState.settings.trial_end_date &&
                  studySettingsToday < studyState.settings.trial_start_date ? (
                <span className="max-w-full rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold leading-tight text-sky-900">
                  Scheduled
                </span>
              ) : studyState?.settings.trial_start_date &&
                  studyState.settings.trial_end_date &&
                  studySettingsToday > studyState.settings.trial_end_date ? (
                <span className="max-w-full rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold leading-tight text-stone-700">
                  Complete
                </span>
              ) : studyState?.settings.trial_start_date ? (
                <span className="max-w-full rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold leading-tight text-amber-900">
                  Dates set
                </span>
              ) : (
                <span className="max-w-full rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold leading-tight text-emerald-900">
                  Setup
                </span>
              )}
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-[var(--ink-soft)]">
              Configure study limits, review intervals and the final-exam cutoff.
            </span>
          </span>
        </summary>

        <div className="mt-5 space-y-5 border-t border-[var(--border)] pt-5">

        {studyTrialActive && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            The four-week trial is active. Engine settings are locked until
            the trial period ends.
          </p>
        )}

        {studyLoadingError && (
          <p role="alert" className="text-sm text-red-700">
            Study data could not be loaded: {studyLoadingError}
          </p>
        )}

        {studySyncConflict && (
          <p role="alert" className="text-sm text-amber-800">
            Resolve the Study browser/cloud conflict before changing these settings.
          </p>
        )}

        {studyProblem && (
          <p role="alert" className="text-sm text-amber-800">
            {studyProblem}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="block text-sm font-bold">
              Daily study budget (minutes)
            </span>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={studyDailyBudgetDraft}
              onChange={(event) => {
                setStudyDailyBudgetDraft(event.target.value);
                setStudySettingsMessage("");
              }}
              disabled={studySettingsDisabled}
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base disabled:opacity-60"
            />
            <span className="block text-xs text-[var(--muted)]">
              One shared limit for all planned study work.
            </span>
          </label>

          <label className="space-y-1">
            <span className="block text-sm font-bold">
              Review reserve (minutes)
            </span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={studyReviewReserveDraft}
              onChange={(event) => {
                setStudyReviewReserveDraft(event.target.value);
                setStudySettingsMessage("");
              }}
              disabled={studySettingsDisabled}
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base disabled:opacity-60"
            />
            <span className="block text-xs text-[var(--muted)]">
              Capacity reserved for priority 1–3 reviews, within the daily budget.
            </span>
          </label>

          <label className="space-y-1">
            <span className="block text-sm font-bold">
              Repair and recovery cap (minutes)
            </span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={studyRepairCapDraft}
              onChange={(event) => {
                setStudyRepairCapDraft(event.target.value);
                setStudySettingsMessage("");
              }}
              disabled={studySettingsDisabled}
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base disabled:opacity-60"
            />
            <span className="block text-xs text-[var(--muted)]">
              Corrective work and backlog recovery share this cap.
            </span>
          </label>

          <label className="space-y-1">
            <span className="block text-sm font-bold">
              Gate pass threshold (% Green)
            </span>
            <input
              type="number"
              min="60"
              max="100"
              step="1"
              inputMode="numeric"
              value={studyGateThresholdDraft}
              onChange={(event) => {
                setStudyGateThresholdDraft(event.target.value);
                setStudySettingsMessage("");
              }}
              disabled={studySettingsDisabled}
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base disabled:opacity-60"
            />
            <span className="block text-xs text-[var(--muted)]">
              At least 60% Green is required by the locked specification.
            </span>
          </label>

          <label className="space-y-1">
            <span className="block text-sm font-bold">
              Maximum deferrals before a forced decision
            </span>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={studyDeferLimitDraft}
              onChange={(event) => {
                setStudyDeferLimitDraft(event.target.value);
                setStudySettingsMessage("");
              }}
              disabled={studySettingsDisabled}
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base disabled:opacity-60"
            />
            <span className="block text-xs text-[var(--muted)]">
              The default is three deferrals.
            </span>
          </label>

          <label className="space-y-1">
            <span className="block text-sm font-bold">
              Last final exam date
            </span>
            <input
              type="date"
              value={studyLastFinalDateDraft}
              onChange={(event) => {
                setStudyLastFinalDateDraft(event.target.value);
                setStudySettingsMessage("");
              }}
              disabled={studySettingsDisabled}
              className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base disabled:opacity-60"
            />
            <span className="block text-xs text-[var(--muted)]">
              Leave blank to use the latest final exam in your exam register.
            </span>
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">
            Review intervals (days after the previous successful review)
          </legend>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Enter five positive whole numbers in increasing order. Defaults:
            1, 3, 7, 14, 30.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {studyIntervalsDraft.map((value, index) => (
              <label key={index} className="space-y-1">
                <span className="block text-xs font-semibold text-[var(--ink-soft)]">
                  Stage {index + 1}
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => {
                    setStudyIntervalsDraft((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ) as [string, string, string, string, string],
                    );
                    setStudySettingsMessage("");
                  }}
                  disabled={studySettingsDisabled}
                  className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base disabled:opacity-60"
                />
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="block text-sm font-bold">
            Reason for this settings change
          </span>
          <textarea
            rows={2}
            value={studySettingsReason}
            onChange={(event) => {
              setStudySettingsReason(event.target.value);
              setStudySettingsMessage("");
            }}
            disabled={studySettingsDisabled}
            className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-3 py-3 text-base disabled:opacity-60"
          />
          <span className="block text-xs text-[var(--muted)]">
            This reason, the old values and the new values are saved in the audit history.
          </span>
        </label>

        {studySettingsError && (
          <p role="alert" className="rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-semibold text-[var(--accent-dark)]">
            {studySettingsError}
          </p>
        )}

        {studySettingsMessage && (
          <p role="status" className="rounded-xl bg-[var(--surface)] p-3 text-sm font-semibold text-[var(--primary-dark)]">
            {studySettingsMessage}
          </p>
        )}

        <button
          type="button"
          onClick={saveStudyEngineSettings}
          disabled={studySettingsDisabled}
          className="min-h-11 rounded-full bg-[var(--primary)] px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          Save Study settings
        </button>

        <div className="border-t border-[var(--border)] pt-4">
          <h3 className="font-bold">Recent Study settings changes</h3>
          {!studyState || studyState.settings_change_history.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              No Study settings changes have been recorded.
            </p>
          ) : (
            <ol className="mt-3 space-y-3">
              {studyState.settings_change_history
                .slice()
                .reverse()
                .slice(0, 5)
                .map((record) => (
                  <li
                    key={record.id}
                    className="rounded-xl border border-[var(--border)] p-3"
                  >
                    <p className="text-xs text-[var(--muted)]">
                      {new Date(record.changed_at).toLocaleString()}
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      {record.reason}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-[var(--ink-soft)]">
                      {record.changed_fields.map((field) => {
                        const previous = (
                          record.previous_values as Record<string, unknown>
                        )[field];
                        const next = (
                          record.new_values as Record<string, unknown>
                        )[field];
                        const display = (value: unknown) =>
                          Array.isArray(value)
                            ? value.join(", ")
                            : value === null || value === undefined
                              ? "Not set"
                              : String(value);

                        return (
                          <li key={field}>
                            {field.replaceAll("_", " ")}: {display(previous)}
                            {" → "}{display(next)}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
            </ol>
          )}
        </div>
        </div>
      </details>

      <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] marker:hidden">
          <span>
            <span className="settings-section-title block text-[var(--ink)]">Manage courses</span>
            <span className="mt-1 block text-sm font-medium text-[var(--muted)]">Add, edit and organise courses by academic period</span>
          </span>
        </summary>
        <div className="mt-3">
          <CourseManagementPanel
            state={studyState}
            loadingError={studyLoadingError || undefined}
            syncConflict={Boolean(studySyncConflict)}
            problem={studyProblem || undefined}
            persist={persistStudyState}
            persistCourseDeletion={persistCourseDeletion}
          />
        </div>
      </details>

      <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] marker:hidden">
          <span>
            <span className="settings-section-title block text-[var(--ink)]">Calendar connection</span>
            <span className="mt-1 block text-sm font-medium text-[var(--muted)]">Connect or manage read-only Google Calendar access</span>
          </span>
        </summary>
        <div className="mt-3">
          <GoogleCalendarSettings />
        </div>
      </details>
      <details className="group rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5" aria-label="Push notifications">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] marker:hidden [&::-webkit-details-marker]:hidden">
          <span>
            <span className="settings-section-title block text-[var(--ink)]">Push notifications</span>
            <span className="mt-1 block text-sm font-medium text-[var(--muted)]">
              Manage external reminders sent to this device.
            </span>
          </span>
        </summary>
        <div className="mt-4">
          <PushNotificationSettings />
        </div>
      </details>

      <details className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5" aria-label="Study catalog import and export">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] marker:hidden">
          <span>
            <span className="settings-section-title block text-[var(--ink)]">Study catalog</span>
            <span className="mt-1 block text-sm font-medium text-[var(--muted)]">Import or export courses, units, topics and retrieval tasks</span>
          </span>
        </summary>
        <div className="mt-4">
  <h2 className="text-xl font-extrabold">
    Import and export your catalogue
  </h2>


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
        onClick={downloadCatalogTemplate}
        className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold"
      >
        Download blank CSV template
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
        </div>
      </details>

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
