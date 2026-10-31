"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import {
  getEssays,
  saveEssays,
  updateEssay,
  type Essay,
} from "@/lib/readingStorage";
import { getCurrentEssayWorkflowStep } from "@/lib/readingWorkflow";
import { ItemWorkTimer } from "@/app/components/ItemWorkTimer";

const OBSERVATION_PROMPTS: {
  key: keyof Essay["marks"];
  title: string;
  hint: string;
}[] = [
  {
    key: "turns",
    title: "Where does the essay turn?",
    hint: "Find the moment when its direction, perspective, or emotional movement changes.",
  },
  {
    key: "rhythm",
    title: "Where does it accelerate or pause?",
    hint: "Notice changes in pace, compression, silence, or the amount of attention a moment receives.",
  },
  {
    key: "essentialSentences",
    title: "Which sentences feel impossible to remove?",
    hint: "Choose sentences whose removal would change the force, meaning, or structure of the essay.",
  },
  {
    key: "ending",
    title: "What does the ending make you reinterpret?",
    hint: "Consider how the final line or paragraph changes your understanding of what came before.",
  },
];

const RECONSTRUCTION_PROMPTS: {
  key: keyof Essay["reflection"];
  title: string;
  hint: string;
}[] = [
  {
    key: "whatHappened",
    title: "What happened?",
    hint: "Reconstruct the essay in your own words, without looking at it.",
  },
  {
    key: "whatChanged",
    title: "What changed?",
    hint: "Describe the shift in understanding, perspective, or emotional force.",
  },
  {
    key: "whyEnding",
    title: "Why did the ending have to come there?",
    hint: "How does its placement shape the meaning of what came before? Does the structure itself make the argument?",
  },
];

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return minutes > 0
    ? `${minutes} min${remainder ? ` ${remainder}s` : ""}`
    : `${remainder}s`;
}

function stageNumber(status: Essay["status"]) {
  switch (status) {
    case "To read":
    case "First pass":
      return 1;
    case "Second pass":
      return 2;
    case "Reflection":
      return 3;
    case "Finished":
      return 4;
  }
}

function EssayDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [essay, setEssay] = useState<Essay | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editSource, setEditSource] = useState("");

  const [marksDraft, setMarksDraft] = useState<Essay["marks"]>({
    turns: "",
    rhythm: "",
    essentialSentences: "",
    ending: "",
  });

  const [reflectionDraft, setReflectionDraft] =
    useState<Essay["reflection"]>({
      whatHappened: "",
      whatChanged: "",
      whyEnding: "",
    });

  useEffect(() => {
    const id = Number(params.id);
    const found = Number.isSafeInteger(id)
      ? getEssays().find((item) => item.id === id) ?? null
      : null;

    setEssay(found);
    setEditTitle(found?.title ?? "");
    setEditAuthor(found?.author ?? "");
    setEditSource(found?.source ?? "");
    if (found) {
      setMarksDraft({ ...found.marks });
      setReflectionDraft({ ...found.reflection });
    }
    setLoaded(true);
  }, [params.id]);

  function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!essay) return;

    const title = editTitle.trim();
    if (!title) {
      setFeedback("Enter an essay title.");
      return;
    }

    try {
      const updated: Essay = {
        ...essay,
        title,
        author: editAuthor.trim(),
        source: editSource.trim(),
      };
      updateEssay(updated);
      setEssay(updated);
      setEditing(false);
      setFeedback("Essay details saved.");
    } catch {
      setFeedback("Essay details could not be saved. Please try again.");
    }
  }

  function finishFirstPass() {
    if (!essay) return;

    const updated: Essay = {
      ...essay,
      status: "First pass",
      firstPassCompletedAt: new Date().toISOString(),
    };

    try {
      updateEssay(updated);
      setEssay(updated);
      setFeedback("First reading completed. Your examination stage is now unlocked.");
    } catch {
      setFeedback("First reading progress could not be saved. Please try again.");
    }
  }

  function saveObservations(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!essay) return;

    try {
      const updated: Essay = { ...essay, marks: { ...marksDraft } };
      updateEssay(updated);
      setEssay(updated);
      setFeedback("Your four structural observations were saved.");
    } catch {
      setFeedback("Observations could not be saved. Please try again.");
    }
  }

  function saveReconstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!essay) return;

    if (
      !reflectionDraft.whatHappened.trim() &&
      !reflectionDraft.whatChanged.trim() &&
      !reflectionDraft.whyEnding.trim()
    ) {
      setFeedback("Write at least one response before saving your reconstruction.");
      return;
    }

    try {
      const updated: Essay = {
        ...essay,
        reflection: { ...reflectionDraft },
      };
      updateEssay(updated);
      setEssay(updated);
      setFeedback("Your reconstruction from memory was saved.");
    } catch {
      setFeedback("Your reconstruction could not be saved. Please try again.");
    }
  }

  function downloadNotes() {
    if (!essay) return;

    const observations = OBSERVATION_PROMPTS
      .filter((item) => essay.marks[item.key].trim())
      .map((item) => `### ${item.title}\n\n${essay.marks[item.key]}`);

    const reconstruction = RECONSTRUCTION_PROMPTS
      .filter((item) => essay.reflection[item.key].trim())
      .map((item) => `### ${item.title}\n\n${essay.reflection[item.key]}`);

    const totalSeconds =
      (essay.firstPassSeconds ?? 0) +
      (essay.secondPassSeconds ?? 0) +
      (essay.reflectionSeconds ?? 0);

    const markdown = [
      `# ${essay.title}`,
      "",
      `- Author: ${essay.author || "Not specified"}`,
      `- Source: ${essay.source || "Not specified"}`,
      `- Stage: ${essay.status}`,
      `- Recorded practice time: ${formatDuration(totalSeconds)}`,
      "",
      "## First reading: Experience",
      "",
      "Read the essay straight through before analyzing its construction.",
      "",
      "## Second reading: Examine",
      "",
      observations.length ? observations.join("\n\n") : "No observations saved yet.",
      "",
      "## After reading: Reconstruct from memory",
      "",
      reconstruction.length
        ? reconstruction.join("\n\n")
        : "No reconstruction saved yet.",
      "",
    ].join("\n");

    try {
      const blob = new Blob([markdown], {
        type: "text/markdown;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const filename =
        essay.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "essay-notes";

      anchor.href = url;
      anchor.download = `${filename}.md`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback("Notes download started.");
    } catch {
      setFeedback("Notes could not be downloaded. Please try again.");
    }
  }

  function restartEssay() {
    if (!essay) return;

    const confirmed = window.confirm(
      `Restart "${essay.title}" from the beginning? This clears its recorded stage progress, observations and reconstruction. Export your notes first if you want to keep a copy.`,
    );
    if (!confirmed) return;

    try {
      const updated: Essay = {
        ...essay,
        status: "To read",
        firstPassStartedAt: undefined,
        firstPassCompletedAt: undefined,
        firstPassSeconds: 0,
        secondPassStartedAt: undefined,
        secondPassCompletedAt: undefined,
        secondPassSeconds: 0,
        secondPassStep: 0,
        reflectionStartedAt: undefined,
        reflectionCompletedAt: undefined,
        reflectionSeconds: 0,
        criticismUnlockedAt: undefined,
        marks: {
          turns: "",
          rhythm: "",
          essentialSentences: "",
          ending: "",
        },
        reflection: {
          whatHappened: "",
          whatChanged: "",
          whyEnding: "",
        },
      };

      updateEssay(updated);
      setEssay(updated);
      setMarksDraft({ ...updated.marks });
      setReflectionDraft({ ...updated.reflection });
      setFeedback("Essay restarted. You can begin again with an uninterrupted first reading.");
    } catch {
      setFeedback("The essay could not be restarted. Please try again.");
    }
  }

  function deleteEssay() {
    if (!essay) return;

    const confirmed = window.confirm(
      `Delete "${essay.title}" and all its saved observations, reconstruction and progress? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      saveEssays(getEssays().filter((item) => item.id !== essay.id));
      router.push("/reading?tab=essays");
    } catch {
      setFeedback("The essay could not be deleted. Please try again.");
    }
  }

  if (!loaded) {
    return (
      <main className="reading-detail-page">
        <p className="text-xs text-[var(--muted)]">Loading essay…</p>
      </main>
    );
  }

  if (!essay) {
    return (
      <main className="reading-detail-page">
        <Link
          className="reading-detail-page__back"
          href="/reading?tab=essays"
        >
          ← Back to essays
        </Link>
        <h1>Essay not found</h1>
        <p className="reading-detail-page__subtitle">
          This essay may have been deleted or may no longer be available in this browser.
        </p>
      </main>
    );
  }

  const totalSeconds =
    (essay.firstPassSeconds ?? 0) +
    (essay.secondPassSeconds ?? 0) +
    (essay.reflectionSeconds ?? 0);

  const currentStage = stageNumber(essay.status);
  const currentWorkflowStep = getCurrentEssayWorkflowStep(essay);

  const isObservationStep =
    currentWorkflowStep === "second_pass_turns" ||
    currentWorkflowStep === "second_pass_rhythm" ||
    currentWorkflowStep === "second_pass_essential_sentences" ||
    currentWorkflowStep === "second_pass_ending";

  const isReflectionStep =
    currentWorkflowStep === "reflection_what_happened" ||
    currentWorkflowStep === "reflection_what_changed" ||
    currentWorkflowStep === "reflection_why_ending";
  return (
    <main className="reading-detail-page">
      <Link
        className="reading-detail-page__back"
        href="/reading?tab=essays"
      >
        ← Back to essays
      </Link>

      <header>
        <p className="reading-detail-page__eyebrow">Essay workspace</p>
        <h1>{essay.title}</h1>
        <p className="reading-detail-page__subtitle">
          {essay.author || "Author not specified"}
          {essay.source ? ` · ${essay.source}` : ""}
        </p>
      </header>

      <section className="reading-detail-page__panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="reading-detail-page__label">Current stage</p>
            <p className="reading-detail-page__value mt-1">{essay.status}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {formatDuration(totalSeconds)} recorded
            </p>
          </div>

          {essay.status !== "Finished" && (
            <Link
              className="reading-detail-page__action"
              href={`/reading?essayId=${essay.id}`}
            >
              {essay.status === "To read"
                ? "Start first reading"
                : "Continue essay practice"}
            </Link>
          )}
        </div>

        <ol
          className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"
          aria-label="Essay reading stages"
        >
          {[
            "Experience",
            "Examine",
            "Reconstruct",
            "Criticism",
          ].map((label, index) => {
            const number = index + 1;
            const complete =
              number === 1
                ? Boolean(essay.firstPassCompletedAt)
                : number === 2
                  ? Boolean(essay.secondPassCompletedAt)
                  : number === 3
                    ? Boolean(essay.reflectionCompletedAt)
                    : essay.status === "Finished";

            return (
              <li
                key={label}
                className="rounded-lg bg-[var(--surface-soft)] p-3"
              >
                <p className="text-xs text-[var(--muted)]">
                  Stage {number}
                </p>
                <p className="mt-1 text-sm font-semibold">{label}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {complete
                    ? "Complete"
                    : number === currentStage
                      ? "Current"
                      : "Ahead"}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <details
        className="reading-detail-page__panel"
        hidden={currentWorkflowStep !== "first_pass"}
        open={currentWorkflowStep === "first_pass"}
      >
        <summary className="cursor-pointer text-sm font-semibold">Stage 1 · Experience</summary>
        <div className="mt-4">
        <h2 className="mt-1 text-base font-semibold">Read the essay straight through</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          Read once for the experience. Notice where your attention changes, but resist the
          urge to stop and explain why. Don&apos;t mark sentences or analyze the structure yet.
          The aim is to experience the whole piece before examining its construction.
        </p>
        <ItemWorkTimer
          itemId={`reading-essay-${essay.id}-first-pass`}
          itemName={`First reading: ${essay.title}`}
          defaultMinutes={25}
        />

        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          The timer measures your focused reading separately from your recorded
          reading-session history. When you have finished experiencing the whole
          essay, mark this stage complete.
        </p>

        <button
          type="button"
          onClick={finishFirstPass}
          className="reading-detail-page__action mt-3"
        >
          Mark first reading complete
        </button>
        </div>
      </details>

      <details className="reading-detail-page__panel" open={essay.status === "Second pass"}>
        <summary className="cursor-pointer text-sm font-semibold">Stage 2 · Examine</summary>
        <div className="mt-4">
        <h2 className="mt-1 text-base font-semibold">The second reading: four observations</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          Read slowly with a pencil. Focus on these four structural choices rather than
          collecting every beautiful sentence. Save a note only where it helps you see
          how the essay works.
        </p>

        <form onSubmit={saveObservations} className="mt-4 space-y-4">
          {OBSERVATION_PROMPTS.map((item, index) => (
            <label key={item.key} className="block">
              <span className="reading-detail-page__label mb-1 block">
                {index + 1}. {item.title}
              </span>
              <span className="mb-2 block text-xs leading-5 text-[var(--muted)]">
                {item.hint}
              </span>
              <textarea
                rows={3}
                value={marksDraft[item.key]}
                onChange={(event) =>
                  setMarksDraft((current) => ({
                    ...current,
                    [item.key]: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>
          ))}

          <button type="submit" className="reading-detail-page__action">
            Save observations
          </button>
        </form>
        </div>
      </details>

      <details className="reading-detail-page__panel" open={essay.status === "Reflection" || essay.status === "Finished"}>
        <summary className="cursor-pointer text-sm font-semibold">Stage 3 · Reconstruct</summary>
        <div className="mt-4">
        <h2 className="mt-1 text-base font-semibold">Close the essay and recall</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          Before reading criticism or someone else&apos;s interpretation, write three sentences
          from memory. Recognition while looking at the page is different from being able
          to reconstruct the essay yourself.
        </p>

        <form onSubmit={saveReconstruction} className="mt-4 space-y-4">
          {RECONSTRUCTION_PROMPTS.map((item, index) => (
            <label key={item.key} className="block">
              <span className="reading-detail-page__label mb-1 block">
                {index + 1}. {item.title}
              </span>
              <span className="mb-2 block text-xs leading-5 text-[var(--muted)]">
                {item.hint}
              </span>
              <textarea
                rows={3}
                value={reflectionDraft[item.key]}
                onChange={(event) =>
                  setReflectionDraft((current) => ({
                    ...current,
                    [item.key]: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>
          ))}

          <button type="submit" className="reading-detail-page__action">
            Save reconstruction
          </button>
        </form>
        </div>
      </details>

      <details className="reading-detail-page__panel" open={essay.status === "Finished"}>
        <summary className="cursor-pointer text-sm font-semibold">Stage 4 · Criticism</summary>
        <div className="mt-4">
        <h2 className="mt-1 text-base font-semibold">Consider what the structure means</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          Having made your own observations and reconstruction, consider whether the
          structure itself produces the essay&apos;s meaning. Does the narrative make an
          argument the author never states directly? Does the ending transform an earlier
          detail? What would be lost if the essay ended somewhere else?
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          You don&apos;t need to force an interpretation. Compare your understanding with the
          text, identify what remains uncertain, and consult criticism when it can genuinely
          deepen your reading.
        </p>
        </div>
      </details>

      {currentWorkflowStep === null && (
        <section className="reading-detail-page__panel">
          <h2 className="text-base font-bold">Essay workflow complete</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
            You have completed the essay experience, examination,
            reconstruction and criticism stages.
          </p>
        </section>
      )}
      
      <details className="reading-detail-page__panel">
        <summary className="cursor-pointer text-sm font-semibold">
          Manage essay details
        </summary>

        <div className="mt-4 space-y-4">
          <button
            type="button"
            className="reading-detail-page__back"
            onClick={() => {
              setEditing((current) => !current);
              setFeedback("");
            }}
          >
            {editing ? "Cancel editing" : "Edit title, author and source"}
          </button>

          {editing && (
            <form onSubmit={saveDetails} className="space-y-3">
              <label className="block">
                <span className="reading-detail-page__label mb-1 block">Title</span>
                <input
                  required
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="reading-detail-page__label mb-1 block">Author</span>
                <input
                  value={editAuthor}
                  onChange={(event) => setEditAuthor(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="reading-detail-page__label mb-1 block">Source / URL</span>
                <input
                  value={editSource}
                  onChange={(event) => setEditSource(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </label>
              <button type="submit" className="reading-detail-page__action">
                Save essay details
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="reading-detail-page__action"
              onClick={downloadNotes}
            >
              Download notes (.md)
            </button>
            <button
              type="button"
              className="reading-detail-page__back"
              onClick={restartEssay}
            >
              Restart essay workflow
            </button>
            <button
              type="button"
              className="min-h-10 rounded-xl border border-red-300 bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-red-700"
              onClick={deleteEssay}
            >
              Delete essay
            </button>
          </div>
        </div>
      </details>

      {feedback && (
        <p role="status" className="mt-3 text-xs text-[var(--ink-soft)]">
          {feedback}
        </p>
      )}

      <div className="mt-5">
        <Link className="reading-detail-page__back" href="/reading?tab=essays">
          Return to essay list
        </Link>
      </div>
    </main>
  );
}

export default function EssayDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="reading-detail-page">
          <p className="text-xs text-[var(--muted)]">Loading essay…</p>
        </main>
      }
    >
      <EssayDetailContent />
    </Suspense>
  );
}
