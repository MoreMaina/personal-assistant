#!/usr/bin/env python3
"""Apply the coordinated Personal Assistant UI refinements safely."""
from pathlib import Path
import subprocess
import sys

ROOT = Path.cwd()
EXPECTED_BRANCH = "study-roadmap-preview"
EXPECTED_HEAD_PREFIX = "9f34b14"
SCRIPT_NAME = "apply_ui_refinements.py"


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one anchor for {label}; found {count}.")
    return source.replace(old, new, 1)


def main() -> int:
    if not (ROOT / ".git").exists():
        print("Stop: run this script from the personal-assistant repository root.")
        return 2

    branch = git("branch", "--show-current")
    head = git("rev-parse", "HEAD")
    if branch != EXPECTED_BRANCH:
        print(f"Stop: expected branch {EXPECTED_BRANCH}, found {branch or '(detached HEAD)'}.")
        return 2
    if not head.startswith(EXPECTED_HEAD_PREFIX):
        print(f"Stop: expected HEAD {EXPECTED_HEAD_PREFIX}…, found {head}.")
        return 2

    # The patch script may be saved in the repository root. Ignore only that
    # exact untracked file; every pre-existing change still blocks the patch.
    status = git("status", "--porcelain", "--untracked-files=all")
    dirty = []
    for line in status.splitlines():
        path = line[3:] if len(line) > 3 else ""
        if path == SCRIPT_NAME or path.endswith(" -> " + SCRIPT_NAME):
            continue
        dirty.append(line)
    if dirty:
        print("Stop: working tree contains existing changes. Preserve/review them before applying this patch:")
        print("\n".join(dirty))
        return 2

    paths = [
        "app/components/ItemWorkTimer.tsx",
        "app/reading/book/[id]/page.tsx",
        "app/reading/essay/[id]/page.tsx",
        "lib/studyMvp/useCloudStudyState.ts",
        "app/study/page.tsx",
        "app/study/GuidedPracticeRunner.tsx",
        "app/globals.css",
    ]
    sources = {}
    for relative in paths:
        path = ROOT / relative
        if not path.is_file():
            print(f"Stop: required file is missing: {relative}")
            return 2
        sources[relative] = path.read_text(encoding="utf-8")

    updated = dict(sources)

    # 1) Timer/stopwatch: show only one selected mode at a time.
    p = "app/components/ItemWorkTimer.tsx"
    s = updated[p]
    s = replace_once(
        s,
        "  const [durationDraft, setDurationDraft] = useState(\n    String(entry.durationMinutes),\n  );",
        "  const [durationDraft, setDurationDraft] = useState(\n    String(entry.durationMinutes),\n  );\n  const [mode, setMode] = useState<\"timer\" | \"stopwatch\">(\"timer\");",
        "timer mode state",
    )
    start = '  return (\n    <div\n      className="mt-3 rounded-xl border border-[#e4dac9] bg-[#fffaf1] p-3"'
    a = s.find(start)
    b = s.rfind("\n  );\n}")
    if a < 0 or b < a:
        raise RuntimeError("Could not locate the ItemWorkTimer render block safely.")
    new_render = '''  return (
    <div
      className="mt-3 rounded-xl border border-[#e4dac9] bg-[#fffaf1] p-3"
      aria-label={`Work tracker for ${itemName}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
            Work tracker
          </p>
          <p className="mt-1 text-xs font-semibold text-stone-500">
            Choose how you want to track this activity.
          </p>
        </div>
        <div
          className="inline-flex rounded-xl border border-[#d8ccb8] bg-white p-1"
          role="group"
          aria-label="Choose timer or stopwatch"
        >
          <button
            type="button"
            aria-pressed={mode === "timer"}
            onClick={() => setMode("timer")}
            className={`item-work-tracker__mode ${mode === "timer" ? "item-work-tracker__mode--active" : ""}`}
          >
            Timer
          </button>
          <button
            type="button"
            aria-pressed={mode === "stopwatch"}
            onClick={() => setMode("stopwatch")}
            className={`item-work-tracker__mode ${mode === "stopwatch" ? "item-work-tracker__mode--active" : ""}`}
          >
            Stopwatch
          </button>
        </div>
      </div>

      {mode === "timer" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-2xl font-extrabold tabular-nums text-[#23412f]">
                {hydrated ? timeLabel : "--:--"}
              </p>
              <p className="mt-1 text-xs font-bold text-stone-500">
                {isRunning
                  ? "Running"
                  : remainingMs === 0 && entry.completedAtMs !== null
                    ? "Time complete"
                    : anotherTimerRunning
                      ? "Paused · another item is running"
                      : "Ready"}
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-stone-500">
                  Minutes
                </span>
                <input
                  type="number"
                  min={MIN_DURATION_MINUTES}
                  max={MAX_DURATION_MINUTES}
                  step={1}
                  value={durationDraft}
                  disabled={!hydrated || isRunning}
                  onChange={(event) => setDurationDraft(event.target.value)}
                  onBlur={saveDuration}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className="w-20 rounded-lg border border-[#d8ccb8] bg-white px-2 py-2 text-center text-sm font-extrabold disabled:opacity-50"
                />
              </label>
              <button
                type="button"
                disabled={!hydrated}
                onClick={toggleTimer}
                className="rounded-lg bg-[#23412f] px-3 py-2 text-sm font-extrabold text-white hover:bg-[#183021] disabled:opacity-50"
              >
                {isRunning ? "Pause" : "Start"}
              </button>
              <button
                type="button"
                disabled={!hydrated}
                onClick={() => reset(itemId, safeDefault)}
                className="rounded-lg border border-[#d8ccb8] bg-white px-3 py-2 text-sm font-extrabold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Reset
              </button>
            </div>
          </div>
          {remainingMs === 0 && entry.completedAtMs !== null && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs font-extrabold text-emerald-900"
            >
              Timer complete. Record your actual work separately.
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-2xl font-extrabold tabular-nums text-[#23412f]">
              {hydrated ? stopwatchTimeLabel : "--:--:--"}
            </p>
            <p className="mt-1 text-xs font-bold text-stone-500">
              {stopwatchIsRunning
                ? "Running"
                : anotherStopwatchRunning
                  ? "Paused · another item is running"
                  : "Ready"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!hydrated}
              onClick={() =>
                stopwatchIsRunning
                  ? pauseStopwatch(itemId)
                  : startStopwatch(itemId)
              }
              className="rounded-lg bg-[#23412f] px-3 py-2 text-sm font-extrabold text-white hover:bg-[#183021] disabled:opacity-50"
            >
              {stopwatchIsRunning ? "Pause" : "Start"}
            </button>
            <button
              type="button"
              disabled={!hydrated}
              onClick={() => resetStopwatch(itemId)}
              className="rounded-lg border border-[#d8ccb8] bg-white px-3 py-2 text-sm font-extrabold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );'''
    s = s[:a] + new_render + s[b + len("\n  );"):]
    updated[p] = s

    # 2) Book notes: provide a single Notes panel with editable saved fields.
    p = "app/reading/book/[id]/page.tsx"
    s = updated[p]
    s = replace_once(
        s,
        '  const [feedback, setFeedback] = useState("");',
        '  const [feedback, setFeedback] = useState("");\n  const [showNotes, setShowNotes] = useState(false);\n  const [chapterNotesDraft, setChapterNotesDraft] = useState<Record<string, { centralPoint: string; development: string; questions: string }>>({});',
        "book notes state",
    )
    s = replace_once(
        s,
        '    setDecisionDraft(found?.readingDecision ?? "");\n    setLoaded(true);\n  }, [params.id]);',
        '''    setDecisionDraft(found?.readingDecision ?? "");
    setChapterNotesDraft(
      Object.fromEntries(
        (found?.chapterReflections ?? []).map((reflection) => [
          reflection.id,
          {
            centralPoint: reflection.centralPoint,
            development: reflection.development,
            questions: reflection.questions,
          },
        ]),
      ),
    );
    setLoaded(true);
  }, [params.id]);''',
        "initialize editable chapter notes",
    )
    s = replace_once(
        s,
        "  function persistBook(updated: Book, message: string) {",
        '''  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  function persistBook(updated: Book, message: string) {''',
        "book feedback auto-dismiss",
    )
    s = replace_once(
        s,
        "  function startReading() {",
        '''  function saveAllNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book) return;

    const chapterReflections = (book.chapterReflections ?? []).map((reflection) => ({
      ...reflection,
      ...(chapterNotesDraft[reflection.id] ?? {}),
      updatedAt: new Date().toISOString(),
    }));
    const reconstructionHasContent = Object.values(reconstructionDraft).some(
      (value) => typeof value === "string" && value.trim(),
    );
    const applicationHasContent = Object.values(applicationDraft).some(
      (value) => typeof value === "string" && value.trim(),
    );

    persistBook(
      {
        ...book,
        readingPurpose: purposeDraft.trim() || undefined,
        readingMethod: methodDraft,
        chapterReflections,
        wholeBookReconstruction: reconstructionHasContent
          ? { ...reconstructionDraft, updatedAt: new Date().toISOString() }
          : undefined,
        secondPassSections: (book.secondPassSections ?? []).map((section) => ({
          ...section,
          notes: secondPassNotesDraft[section.id] ?? section.notes,
          updatedAt: new Date().toISOString(),
        })),
        readingApplication: applicationHasContent
          ? { ...applicationDraft, updatedAt: new Date().toISOString() }
          : undefined,
      },
      "Reading notes saved.",
    );
  }

  function startReading() {''',
        "book save all notes handler",
    )
    s = replace_once(
        s,
        '      `Restart "${book.title}" from page zero? Your existing reading-session history will be kept.`,',
        '      `Restart "${book.title}" from page zero and clear its saved notes and workflow progress? Reading-session history will be kept. This cannot be undone.`,',
        "book restart confirmation",
    )
    s = replace_once(
        s,
        '''      currentPage: 0,
      status: "Reading",
    };''',
        '''      currentPage: 0,
      status: "Reading",
      readingPurpose: undefined,
      readingMethod: undefined,
      chapterReflections: [],
      wholeBookReconstruction: undefined,
      secondPassSections: [],
      readingApplication: undefined,
      readingDecision: undefined,
      workflowCompletedSteps: [],
      workflowSkippedSteps: [],
    };''',
        "book restart clears notes",
    )
    s = replace_once(
        s,
        '    setPageValue("0");\n    persistBook(updated, "First-pass progress reset. Previous reading sessions were kept.");',
        '''    setPageValue("0");
    setPurposeDraft("");
    setMethodDraft("Other");
    setChapterNotesDraft({});
    setReconstructionDraft(EMPTY_RECONSTRUCTION);
    setSecondPassNotesDraft({});
    setApplicationDraft(EMPTY_APPLICATION);
    setDecisionDraft("");
    setShowNotes(false);
    persistBook(updated, "Book restarted. Saved notes and workflow progress were cleared; reading-session history was kept.");''',
        "book restart resets notes drafts",
    )
    s = replace_once(
        s,
        '              label: "Edit book details",',
        '''              label: "View / edit notes",
              onSelect: () => {
                setFeedback("");
                setShowNotes((current) => !current);
              },
            },
            {
              label: "Edit book details",''',
        "book notes menu action",
    )
    notes_panel = '''
      {showNotes && (
        <section className="reading-detail-page__panel space-y-4" id="reading-notes">
          <div>
            <h2 className="text-lg font-bold">Saved notes</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Review and edit the notes saved across this book&apos;s reading stages.</p>
          </div>
          <form onSubmit={saveAllNotes} className="space-y-4">
            <label className="block">
              <span className="reading-detail-page__label mb-1 block">Reading purpose</span>
              <textarea rows={2} value={purposeDraft} onChange={(event) => setPurposeDraft(event.target.value)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" />
            </label>

            {chapterReflections.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold">Chapter reflections</h3>
                {chapterReflections.map((reflection) => {
                  const draft = chapterNotesDraft[reflection.id] ?? reflection;
                  return (
                    <div key={reflection.id} className="reading-detail-page__note space-y-2">
                      <h4 className="font-semibold">{reflection.section}</h4>
                      <label className="block text-sm">Central point
                        <textarea rows={2} value={draft.centralPoint} onChange={(event) => setChapterNotesDraft((current) => ({ ...current, [reflection.id]: { ...draft, centralPoint: event.target.value } }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
                      </label>
                      <label className="block text-sm">Development
                        <textarea rows={2} value={draft.development} onChange={(event) => setChapterNotesDraft((current) => ({ ...current, [reflection.id]: { ...draft, development: event.target.value } }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
                      </label>
                      <label className="block text-sm">Questions
                        <textarea rows={2} value={draft.questions} onChange={(event) => setChapterNotesDraft((current) => ({ ...current, [reflection.id]: { ...draft, questions: event.target.value } }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-3">
              <h3 className="font-semibold">Whole-book reconstruction</h3>
              <label className="block text-sm">What is the book about?
                <textarea rows={2} value={reconstructionDraft.about} onChange={(event) => setReconstructionDraft((current) => ({ ...current, about: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
              </label>
              <label className="block text-sm">What is the book doing?
                <textarea rows={2} value={reconstructionDraft.doing} onChange={(event) => setReconstructionDraft((current) => ({ ...current, doing: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
              </label>
              <label className="block text-sm">How does it develop?
                <textarea rows={2} value={reconstructionDraft.development} onChange={(event) => setReconstructionDraft((current) => ({ ...current, development: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
              </label>
              <label className="block text-sm">What do you understand differently now?
                <textarea rows={2} value={reconstructionDraft.changed} onChange={(event) => setReconstructionDraft((current) => ({ ...current, changed: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
              </label>
            </div>

            {secondPassSections.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold">Second-pass notes</h3>
                {secondPassSections.map((section) => (
                  <label key={section.id} className="block text-sm">{section.section}
                    <textarea rows={3} value={secondPassNotesDraft[section.id] ?? section.notes} onChange={(event) => setSecondPassNotesDraft((current) => ({ ...current, [section.id]: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
                  </label>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <h3 className="font-semibold">Application notes</h3>
              <label className="block text-sm">Idea to apply
                <textarea rows={2} value={applicationDraft.idea} onChange={(event) => setApplicationDraft((current) => ({ ...current, idea: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
              </label>
              <label className="block text-sm">Experiment
                <textarea rows={2} value={applicationDraft.experiment} onChange={(event) => setApplicationDraft((current) => ({ ...current, experiment: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
              </label>
              <label className="block text-sm">Result
                <textarea rows={2} value={applicationDraft.result} onChange={(event) => setApplicationDraft((current) => ({ ...current, result: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className="reading-detail-page__action">Save notes</button>
              <button type="button" onClick={() => setShowNotes(false)} className="reading-detail-page__back">Close notes</button>
            </div>
          </form>
        </section>
      )}
'''
    s = replace_once(s, "      </header>\n\n      {editing && (", "      </header>\n" + notes_panel + "\n      {editing && (", "book notes panel")
    updated[p] = s

    # 3) Essay notes: an editable overview separate from the sequential prompts.
    p = "app/reading/essay/[id]/page.tsx"
    s = updated[p]
    s = replace_once(
        s,
        '  const [feedback, setFeedback] = useState("");',
        '  const [feedback, setFeedback] = useState("");\n  const [showNotes, setShowNotes] = useState(false);',
        "essay notes state",
    )
    s = replace_once(
        s,
        '    setLoaded(true);\n  }, [params.id]);',
        '''    setLoaded(true);
  }, [params.id]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);''',
        "essay feedback auto-dismiss",
    )
    s = replace_once(
        s,
        "  function completeCriticism() {",
        '''  function saveAllNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!essay) return;

    try {
      const updated: Essay = {
        ...essay,
        marks: { ...marksDraft },
        reflection: { ...reflectionDraft },
        criticismNotes: criticismNotesDraft.trim(),
      };
      updateEssay(updated);
      setEssay(updated);
      setFeedback("Essay notes saved.");
    } catch {
      setFeedback("Essay notes could not be saved. Please try again.");
    }
  }

  function completeCriticism() {''',
        "essay save all notes handler",
    )
    s = replace_once(
        s,
        '              label: "Edit essay details",',
        '''              label: "View / edit notes",
              onSelect: () => {
                setFeedback("");
                setShowNotes((current) => !current);
              },
            },
            {
              label: "Edit essay details",''',
        "essay notes menu action",
    )
    essay_notes_panel = '''
      {showNotes && (
        <section className="reading-detail-page__panel space-y-4" id="essay-notes">
          <div>
            <h2 className="text-lg font-bold">Saved notes</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Review and edit observations, reconstruction and criticism notes in one place.</p>
          </div>
          <form onSubmit={saveAllNotes} className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-semibold">Second reading · Observations</h3>
              {OBSERVATION_PROMPTS.map((prompt) => (
                <label key={prompt.key} className="block text-sm">
                  {prompt.title}
                  <textarea rows={3} value={marksDraft[prompt.key]} onChange={(event) => setMarksDraft((current) => ({ ...current, [prompt.key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
                </label>
              ))}
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold">Reconstruction · From memory</h3>
              {RECONSTRUCTION_PROMPTS.map((prompt) => (
                <label key={prompt.key} className="block text-sm">
                  {prompt.title}
                  <textarea rows={3} value={reflectionDraft[prompt.key]} onChange={(event) => setReflectionDraft((current) => ({ ...current, [prompt.key]: event.target.value }))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
                </label>
              ))}
            </div>
            <label className="block text-sm">
              Criticism and interpretation
              <textarea rows={5} value={criticismNotesDraft} onChange={(event) => setCriticismNotesDraft(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="reading-detail-page__action">Save notes</button>
              <button type="button" onClick={() => setShowNotes(false)} className="reading-detail-page__back">Close notes</button>
            </div>
          </form>
        </section>
      )}
'''
    s = replace_once(s, "      </header>\n\n      {editing && (", "      </header>\n" + essay_notes_panel + "\n      {editing && (", "essay notes panel")
    updated[p] = s

    # 4) Study feedback banners disappear on a timer or when the page unmounts.
    p = "lib/studyMvp/useCloudStudyState.ts"
    s = updated[p]
    s = replace_once(
        s,
        '  const [syncConflict, setSyncConflict] =\n    useState<StudySyncConflict | null>(null);\n\n  const statusRef',
        '''  const [syncConflict, setSyncConflict] =
    useState<StudySyncConflict | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!problem) return;
    const timeout = window.setTimeout(() => setProblem(""), 8000);
    return () => window.clearTimeout(timeout);
  }, [problem]);

  const statusRef''',
        "Study notice auto-dismiss",
    )
    updated[p] = s

    # 5) Study page: compact hero and trim repetitive saved-plan metadata.
    p = "app/study/page.tsx"
    s = updated[p]
    s = replace_once(
        s,
        'function SectionHeading({\n  eyebrow,\n  title,\n  detail,\n}: {\n  eyebrow: string;\n  title: string;\n  detail: string;\n}) {\n  return (\n    <div className="mb-5">\n      <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.15em] text-stone-500">\n        {eyebrow}\n      </p>\n      <h2 className="text-2xl font-bold">{title}</h2>\n      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-stone-600">\n        {detail}\n      </p>\n    </div>\n  );\n}',
        '''function SectionHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.15em] text-stone-500">
        {eyebrow}
      </p>
      <h2 className="text-xl font-bold">{title}</h2>
      {detail && (
        <p className="mt-1 max-w-3xl text-sm font-semibold leading-5 text-stone-600">
          {detail}
        </p>
      )}
    </div>
  );
}''',
        "compact Study section heading",
    )
    s = replace_once(s, 'className="overflow-hidden rounded-3xl bg-[#23412f] p-6 text-white shadow-sm sm:p-9"', 'className="overflow-hidden rounded-2xl bg-[#23412f] p-4 text-white shadow-sm sm:p-5"', "compact Study hero container")
    s = replace_once(s, 'className="mt-5 text-3xl font-bold text-white sm:text-4xl"', 'className="mt-2 text-2xl font-bold text-white sm:text-3xl"', "compact Study hero title")
    s = replace_once(s, 'className="mt-6 flex flex-wrap gap-3"', 'className="mt-3 flex flex-wrap gap-2"', "compact Study hero actions")
    s = replace_once(s, 'className="rounded-xl bg-[#fffaf1] px-4 py-2.5 text-sm font-extrabold text-[#23412f] transition hover:bg-white"', 'className="rounded-lg bg-[#fffaf1] px-3 py-2 text-xs font-extrabold text-[#23412f] transition hover:bg-white"', "compact view plan action")
    s = replace_once(s, 'className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-white/10"', 'className="rounded-lg border border-white/30 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-white/10"', "compact catalog action")
    s = replace_once(s, ': `Your saved plan for ${today}. The latest version stays in place during the day; replan explicitly if priorities change.`', ': ""', "remove repeated saved plan guidance")
    s = replace_once(
        s,
        '''                        <p className="mt-1 text-xs font-semibold text-stone-500">
                          {presentation.subtitle}
                        </p>''',
        '''                        <p className="mt-1 line-clamp-1 text-xs font-semibold text-stone-500">
                          {presentation.subtitle}
                        </p>''',
        "truncate plan item context",
    )
    s = replace_once(
        s,
        '''                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-bold text-stone-600">
                      <span>
                        Allocated: {item.allocated_minutes} min
                      </span>
                      <span>
                        Estimated remaining: {item.remaining_minutes} min
                      </span>
                      {item.allocated_question_ids.length > 0 && (
                        <span>
                          Questions today: {item.allocated_question_ids.length}
                        </span>
                      )}
                    </div>''',
        '''                    <div className="mt-2 text-xs font-bold text-stone-600">
                      {item.allocated_minutes} min allocated
                    </div>''',
        "compact saved plan item timing details",
    )
    s = replace_once(
        s,
        '''                    {!planningMode && (
                      <p className="mt-4 text-sm font-semibold text-stone-600">
                        {item.disposition
                          ? `Saved planning decision: ${item.disposition}.`
                          : "Saved allocation: planned work, not completion evidence."}
                      </p>
                    )}

                    {item.reason && (
                      <p className="mt-2 text-xs font-semibold text-stone-500">
                        {item.reason}
                      </p>
                    )}''',
        '''                    {planningMode && item.reason && (
                      <p className="mt-2 text-xs font-semibold text-stone-500">
                        {item.reason}
                      </p>
                    )}''',
        "remove repeated saved decision and allocation rationale",
    )
    s = replace_once(
        s,
        '''            ) : (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#d8ccb8] bg-white p-4">
                <div>
                  <p className="font-extrabold text-[#23412f]">
                    Saved plan version {latestTodaysPlan?.version}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-stone-500">
                    Saved at {latestTodaysPlan?.saved_at}.{" "}
                    {Math.max(0, todaysPlanSnapshots.length - 1)} previous
                    version(s) are preserved today. Planned allocations do not
                    count as completed work.
                  </p>
                </div>
                {hasRecordedTodaysWork ? (
  <p className="max-w-md text-sm font-semibold leading-6 text-stone-600">
    Today's plan is locked because work or a section completion has
    already been recorded. Your saved plan and history are preserved.
  </p>
) : (
  <button
    type="button"
    onClick={() => {
      setPlanningChoices({});
      setPlanningReasons({});
      setPlanningReentries({});
      setIsReplanning(true);
    }}
    className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#183021]"
  >
    Replan today
  </button>
)}
              </div>
            )}''',
        '''            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {!hasRecordedTodaysWork ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPlanningChoices({});
                      setPlanningReasons({});
                      setPlanningReentries({});
                      setIsReplanning(true);
                    }}
                    className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#183021]"
                  >
                    Replan today
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-stone-500">Saved worklist · {today}</span>
                )}
              </div>
            )}''',
        "compact saved plan footer",
    )
    s = replace_once(
        s,
        '''        detail="Work through the selected Sampler questions, write each answer before revealing the criteria, and assess your performance. Record Sampler and analysis time separately."''',
        '''        detail="Complete the selected questions, then record your Sampler and analysis time."''',
        "shorten Sampler guidance",
    )
    s = replace_once(
        s,
        '''          <p className="text-sm font-semibold text-stone-600">
            {reviewSectionReadyToComplete
              ? "All allocated reviews have been completed today."
              : "Complete every allocated review today before continuing."}
          </p>''',
        '''          {!reviewSectionReadyToComplete && (
            <p className="text-sm font-semibold text-stone-600">
              Complete every allocated review today before continuing.
            </p>
          )}''',
        "remove completed reviews success line",
    )
    updated[p] = s

    # 6) Shorten the empty Sampler guidance, keeping its meaning actionable.
    p = "app/study/GuidedPracticeRunner.tsx"
    s = updated[p]
    s = replace_once(
        s,
        '"No eligible Sampler questions are prepared. Add or activate at least one retrieval question with purpose Sampler."',
        '"No Sampler questions are ready yet. Add or activate a question with the Sampler purpose in Study management."',
        "shorten empty Sampler message",
    )
    updated[p] = s

    # 7) Consistent raised/pressed action treatment across primary page actions.
    p = "app/globals.css"
    s = updated[p]
    s += '''

/* Shared tactile interaction for prominent actions across the app. */
.app-content .reading-detail-page__action,
.app-content .btn--primary,
.app-content .btn-primary,
.app-content .right-now-start-button,
.app-content .plan-generate-button,
.app-content .project-work-action,
.app-content button[class*="bg-[#23412f]"],
.app-content button[class*="bg-emerald-700"] {
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.app-content .reading-detail-page__action:hover:not(:disabled),
.app-content button[class*="bg-[#23412f]"]:hover:not(:disabled),
.app-content button[class*="bg-emerald-700"]:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 0 #4e765a !important;
}
.app-content .reading-detail-page__action:active:not(:disabled),
.app-content button[class*="bg-[#23412f]"]:active:not(:disabled),
.app-content button[class*="bg-emerald-700"]:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow: 0 0 0 transparent !important;
}
.app-content .btn--primary:hover:not(:disabled),
.app-content .btn-primary:hover:not(:disabled),
.app-content .right-now-start-button:hover:not(:disabled),
.app-content .project-work-action:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 0 var(--accent-dark) !important;
}
.app-content .btn--primary:active:not(:disabled),
.app-content .btn-primary:active:not(:disabled),
.app-content .right-now-start-button:active:not(:disabled),
.app-content .project-work-action:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow: 0 0 0 transparent !important;
}
.app-content .plan-generate-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 0 var(--primary-dark) !important;
}
.app-content .plan-generate-button:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow: 0 0 0 transparent !important;
}
.app-content .item-work-tracker__mode {
  min-height: 34px !important;
  padding: 6px 12px;
  border: 0 !important;
  border-radius: 9px;
  background: transparent;
  color: #57534e;
  box-shadow: none !important;
  font-size: 12px;
  font-weight: 800;
  transition: background 120ms ease, color 120ms ease;
}
.app-content .item-work-tracker__mode:hover,
.app-content .item-work-tracker__mode:active {
  transform: none !important;
  box-shadow: none !important;
}
.app-content .item-work-tracker__mode--active {
  background: #23412f !important;
  color: #fffaf1 !important;
}
'''
    updated[p] = s

    # All edit operations above are in memory. Only write if every anchor passed.
    for relative, content in updated.items():
        (ROOT / relative).write_text(content, encoding="utf-8")

    print("UI refinement patch applied to:")
    for relative in paths:
        print(f"  {relative}")
    print("\nSaved app data was not modified. Book restart now clears its notes/workflow progress while preserving reading-session history.")
    print("Next: git diff --check && npx vitest run && npx tsc --noEmit && npm run build")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Stop: {error}")
        print("No files were written unless the script reached its final write phase.")
        raise SystemExit(2)
