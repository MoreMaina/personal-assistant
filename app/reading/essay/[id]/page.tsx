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

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0
    ? `${minutes} min${remainder ? ` ${remainder}s` : ""}`
    : `${remainder}s`;
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

  useEffect(() => {
    const id = Number(params.id);
    const found = Number.isSafeInteger(id)
      ? getEssays().find((item) => item.id === id) ?? null
      : null;

    setEssay(found);
    setEditTitle(found?.title ?? "");
    setEditAuthor(found?.author ?? "");
    setEditSource(found?.source ?? "");
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

  function downloadNotes() {
    if (!essay) return;

    const observationLines = [
      ["Where does the piece turn?", essay.marks.turns],
      ["Where does it accelerate or pause?", essay.marks.rhythm],
      ["Essential sentences", essay.marks.essentialSentences],
      ["What does the ending make you reinterpret?", essay.marks.ending],
    ]
      .filter(([, value]) => value.trim())
      .map(([label, value]) => `### ${label}\n\n${value}`);

    const reflectionLines = [
      ["What happened?", essay.reflection.whatHappened],
      ["What changed?", essay.reflection.whatChanged],
      ["Why this ending?", essay.reflection.whyEnding],
    ]
      .filter(([, value]) => value.trim())
      .map(([label, value]) => `### ${label}\n\n${value}`);

    const totalSeconds =
      (essay.firstPassSeconds ?? 0) +
      (essay.secondPassSeconds ?? 0) +
      (essay.reflectionSeconds ?? 0);

    const markdown = [
      `# ${essay.title}`,
      "",
      `- Author: ${essay.author || "Not specified"}`,
      `- Source: ${essay.source || "Not specified"}`,
      `- Status: ${essay.status}`,
      `- Recorded practice time: ${formatDuration(totalSeconds)}`,
      "",
      "## Saved observations",
      "",
      observationLines.length
        ? observationLines.join("\n\n")
        : "No observations saved.",
      "",
      "## Memory reflection",
      "",
      reflectionLines.length
        ? reflectionLines.join("\n\n")
        : "No reflections saved.",
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
      `Restart "${essay.title}" from the beginning? This clears its recorded stage progress, observations and reflections.`,
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
      setFeedback("Essay workflow restarted. Its saved notes were cleared.");
    } catch {
      setFeedback("The essay could not be restarted. Please try again.");
    }
  }

  function deleteEssay() {
    if (!essay) return;

    const confirmed = window.confirm(
      `Delete "${essay.title}" and all its saved observations, reflections and progress? This cannot be undone.`,
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
        <Link className="reading-detail-page__back" href="/reading?tab=essays">
          ← Back to essays
        </Link>
        <h1>Essay not found</h1>
        <p className="reading-detail-page__subtitle">
          This essay may have been deleted or may no longer be available in this browser.
        </p>
      </main>
    );
  }

  const observations = [
    { label: "Where does the piece turn?", value: essay.marks.turns },
    { label: "Where does it accelerate or pause?", value: essay.marks.rhythm },
    { label: "Essential sentences", value: essay.marks.essentialSentences },
    { label: "What does the ending make you reinterpret?", value: essay.marks.ending },
  ].filter((item) => item.value.trim().length > 0);

  const reflections = [
    { label: "What happened?", value: essay.reflection.whatHappened },
    { label: "What changed?", value: essay.reflection.whatChanged },
    { label: "Why this ending?", value: essay.reflection.whyEnding },
  ].filter((item) => item.value.trim().length > 0);

  const secondsRecorded =
    (essay.firstPassSeconds ?? 0) +
    (essay.secondPassSeconds ?? 0) +
    (essay.reflectionSeconds ?? 0);

  return (
    <main className="reading-detail-page">
      <Link className="reading-detail-page__back" href="/reading?tab=essays">
        ← Back to essays
      </Link>

      <header>
        <p className="reading-detail-page__eyebrow">Essay details</p>
        <h1>{essay.title}</h1>
        <p className="reading-detail-page__subtitle">
          {essay.author || "Author not specified"}
          {essay.source ? ` · ${essay.source}` : ""}
        </p>
      </header>

      <section className="reading-detail-page__panel">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="reading-detail-page__label">Current stage</p>
            <p className="reading-detail-page__value mt-1">{essay.status}</p>
          </div>
          <div>
            <p className="reading-detail-page__label">Time recorded</p>
            <p className="reading-detail-page__value mt-1">
              {formatDuration(secondsRecorded)}
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs text-[var(--muted)]">
          First pass → Second pass → Memory reflection → Criticism
        </p>

        {essay.status !== "Finished" && (
          <Link
            className="reading-detail-page__action mt-4"
            href={`/reading?essayId=${essay.id}`}
          >
            Start / continue essay workflow
          </Link>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">Saved observations</h2>
        {observations.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No observations saved yet.</p>
        ) : (
          <div className="space-y-3">
            {observations.map((item) => (
              <article className="reading-detail-page__note" key={item.label}>
                <h2>{item.label}</h2>
                <p>{item.value}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">Memory reflection</h2>
        {reflections.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No reflections saved yet.</p>
        ) : (
          <div className="space-y-3">
            {reflections.map((item) => (
              <article className="reading-detail-page__note" key={item.label}>
                <h2>{item.label}</h2>
                <p>{item.value}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="reading-detail-page__panel mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Manage essay</h2>
          <button
            type="button"
            className="reading-detail-page__back"
            onClick={() => {
              setEditing((value) => !value);
              setFeedback("");
            }}
          >
            {editing ? "Cancel editing" : "Edit details"}
          </button>
        </div>

        {editing && (
          <form onSubmit={saveDetails} className="mt-4 space-y-3">
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

            <button className="reading-detail-page__action" type="submit">
              Save essay details
            </button>
          </form>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="reading-detail-page__action"
            type="button"
            onClick={downloadNotes}
          >
            Download notes (.md)
          </button>
          <button
            className="reading-detail-page__back"
            type="button"
            onClick={restartEssay}
          >
            Restart essay workflow
          </button>
          <button
            className="min-h-10 rounded-xl border border-red-300 bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-red-700"
            type="button"
            onClick={deleteEssay}
          >
            Delete essay
          </button>
        </div>

        {feedback && (
          <p role="status" className="mt-3 text-xs text-[var(--ink-soft)]">
            {feedback}
          </p>
        )}
      </section>

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
