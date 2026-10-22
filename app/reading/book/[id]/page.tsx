"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import {
  getBooks,
  updateBook,
  type Book,
} from "@/lib/readingStorage";

function BookDetailContent() {
  const params = useParams<{ id: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [pageValue, setPageValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const id = Number(params.id);
    const found = Number.isSafeInteger(id)
      ? getBooks().find((item) => item.id === id) ?? null
      : null;

    setBook(found);
    setPageValue(found ? String(found.currentPage) : "");
    setLoaded(true);
  }, [params.id]);

  function savePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book) return;

    const value = Number(pageValue);
    if (!Number.isFinite(value) || value < 0 || value > book.totalPages) {
      setFeedback(`Enter a page from 0 to ${book.totalPages}.`);
      return;
    }

    const updated = {
      ...book,
      currentPage: Math.floor(value),
    };
    updateBook(updated);
    setBook(updated);
    setPageValue(String(updated.currentPage));
    setFeedback("Reading progress saved.");
  }

  if (!loaded) {
    return (
      <main className="reading-detail-page">
        <p className="text-xs text-[var(--muted)]">Loading book…</p>
      </main>
    );
  }

  if (!book) {
    return (
      <main className="reading-detail-page">
        <Link className="reading-detail-page__back" href="/reading?tab=books">
          ← Back to books
        </Link>
        <h1>Book not found</h1>
        <p className="reading-detail-page__subtitle">
          This book may have been deleted or may no longer be available in this browser.
        </p>
      </main>
    );
  }

  const progress = book.totalPages > 0
    ? Math.min(100, Math.max(0, Math.round((book.currentPage / book.totalPages) * 100)))
    : 0;

  return (
    <main className="reading-detail-page">
      <Link className="reading-detail-page__back" href="/reading?tab=books">
        ← Back to books
      </Link>

      <header>
        <p className="reading-detail-page__eyebrow">Book details</p>
        <h1>{book.title}</h1>
        <p className="reading-detail-page__subtitle">
          {book.author || "Author not specified"} · {book.category}
        </p>
      </header>

      <section className="reading-detail-page__panel">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="reading-detail-page__label">Status</p>
            <p className="reading-detail-page__value mt-1">{book.status}</p>
          </div>
          <div>
            <p className="reading-detail-page__label">Reading progress</p>
            <p className="reading-detail-page__value mt-1">{progress}%</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="reading-detail-page__label">Pages read</span>
            <span className="reading-detail-page__value">
              {book.currentPage} / {book.totalPages}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]">
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </section>

      <section className="reading-detail-page__panel">
        <h2 className="mb-3 text-sm font-semibold">Update reading progress</h2>
        <form onSubmit={savePage} className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1">
            <span className="reading-detail-page__label block mb-1">Current page</span>
            <input
              type="number"
              min="0"
              max={book.totalPages}
              value={pageValue}
              onChange={(event) => setPageValue(event.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>
          <button className="reading-detail-page__action" type="submit">
            Save progress
          </button>
        </form>
        {feedback && (
          <p role="status" className="mt-3 text-xs text-[var(--ink-soft)]">
            {feedback}
          </p>
        )}
        <p className="mt-3 text-xs text-[var(--muted)]">
          {book.totalPages} total pages
        </p>
      </section>

      <div className="mt-5 flex flex-wrap gap-3">
        {book.status !== "Finished" && (
          <Link
            className="reading-detail-page__action"
            href={`/reading?bookId=${book.id}`}
          >
            Start / continue reading
          </Link>
        )}
        <Link className="reading-detail-page__back" href="/reading?tab=books">
          Return to book list
        </Link>
      </div>
    </main>
  );
}

export default function BookDetailPage() {
  return (
    <Suspense
      fallback={
        <main className="reading-detail-page">
          <p className="text-xs text-[var(--muted)]">Loading book…</p>
        </main>
      }
    >
      <BookDetailContent />
    </Suspense>
  );
}
