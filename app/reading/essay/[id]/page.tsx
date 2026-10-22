"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  getEssays,
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
  const [essay, setEssay] = useState<Essay | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const id = Number(params.id);
    const found = Number.isSafeInteger(id)
      ? getEssays().find((item) => item.id === id) ?? null
      : null;
    setEssay(found);
    setLoaded(true);
  }, [params.id]);

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
