"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import {
  deleteBookAndSessions,
  getBooks,
  updateBook,
  type Book,
} from "@/lib/readingStorage";

const ACTIVE_READING_TIMER_KEY = "personal-assistant-active-reading-timer";

function clearActiveTimerForBook(bookId: number) {
  try {
    const raw = window.localStorage.getItem(ACTIVE_READING_TIMER_KEY);
    if (!raw) return;

    const timer = JSON.parse(raw) as { bookId?: unknown };
    if (timer.bookId === bookId) {
      window.localStorage.removeItem(ACTIVE_READING_TIMER_KEY);
    }
  } catch {
    // Do not remove an unreadable timer belonging to an unknown book.
  }
}

function BookDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [book, setBook] = useState<Book | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pageValue, setPageValue] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editCategory, setEditCategory] =
    useState<Book["category"]>("Pleasure");
  const [editTotalPages, setEditTotalPages] = useState("");

  useEffect(() => {
    const id = Number(params.id);
    const found = Number.isSafeInteger(id)
      ? getBooks().find((item) => item.id === id) ?? null
      : null;

    setBook(found);
    setPageValue(found ? String(found.currentPage) : "");
    setEditTitle(found?.title ?? "");
    setEditAuthor(found?.author ?? "");
    setEditCategory(found?.category ?? "Pleasure");
    setEditTotalPages(found ? String(found.totalPages) : "");
    setLoaded(true);
  }, [params.id]);

  function savePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book) return;

    const value = Number(pageValue);
    if (
      pageValue.trim() === "" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > book.totalPages
    ) {
      setFeedback(`Enter a whole-number page from 0 to ${book.totalPages}.`);
      return;
    }

    try {
      const updated = { ...book, currentPage: value };
      updateBook(updated);
      setBook(updated);
      setPageValue(String(updated.currentPage));
      setFeedback("Reading progress saved.");
    } catch {
      setFeedback("Progress could not be saved. Please try again.");
    }
  }

  function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book) return;

    const title = editTitle.trim();
    const totalPages = Number(editTotalPages);

    if (!title) {
      setFeedback("Enter a book title.");
      return;
    }
    if (
      editTotalPages.trim() === "" ||
      !Number.isInteger(totalPages) ||
      totalPages < 0
    ) {
      setFeedback("Enter a valid total page count (zero is allowed if unknown).");
      return;
    }

    try {
      const currentPage = Math.min(book.currentPage, totalPages);
      const updated: Book = {
        ...book,
        title,
        author: editAuthor.trim(),
        category: editCategory,
        totalPages,
        currentPage,
        status:
          totalPages > 0 && currentPage >= totalPages
            ? "Finished"
            : book.status === "Finished" && currentPage < totalPages
              ? "Reading"
              : book.status,
      };

      updateBook(updated);
      setBook(updated);
      setPageValue(String(currentPage));
      setEditing(false);
      setFeedback("Book details saved.");
    } catch {
      setFeedback("Book details could not be saved. Please try again.");
    }
  }

  function restartBook() {
    if (!book) return;
    const confirmed = window.confirm(
      `Restart "${book.title}" from page zero? Your existing reading-session history will be kept.`,
    );
    if (!confirmed) return;

    try {
      const updated: Book = {
        ...book,
        currentPage: 0,
        status: "Reading",
      };
      updateBook(updated);
      clearActiveTimerForBook(book.id);
      setBook(updated);
      setPageValue("0");
      setFeedback("Reading progress reset. Previous reading sessions were kept.");
    } catch {
      setFeedback("The book could not be restarted. Please try again.");
    }
  }

  function markFinished() {
    if (!book) return;

    try {
      const updated: Book = {
        ...book,
        currentPage:
          book.totalPages > 0 ? book.totalPages : book.currentPage,
        status: "Finished",
      };
      updateBook(updated);
      clearActiveTimerForBook(book.id);
      setBook(updated);
      setPageValue(String(updated.currentPage));
      setFeedback("Book marked as finished.");
    } catch {
      setFeedback("The book could not be updated. Please try again.");
    }
  }

  function deleteBook() {
    if (!book) return;
    const confirmed = window.confirm(
      `Delete "${book.title}" and its reading-session history? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      deleteBookAndSessions(book.id);
      clearActiveTimerForBook(book.id);
      router.push("/reading?tab=books");
    } catch {
      setFeedback("The book could not be deleted. Please try again.");
    }
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
        <Link className="reading-detail-page__back" href="/reading">
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
      <Link className="reading-detail-page__back" href="/reading">
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
            <span className="reading-detail-page__label mb-1 block">Current page</span>
            <input
              type="number"
              min="0"
              max={book.totalPages}
              step="1"
              value={pageValue}
              onChange={(event) => setPageValue(event.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>
          <button className="reading-detail-page__action" type="submit">
            Save progress
          </button>
        </form>
        <p className="mt-3 text-xs text-[var(--muted)]">
          {book.totalPages} total pages
        </p>
      </section>

      <section className="reading-detail-page__panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Manage book</h2>
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
              <span className="reading-detail-page__label mb-1 block">Category</span>
              <select
                value={editCategory}
                onChange={(event) =>
                  setEditCategory(event.target.value as Book["category"])
                }
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <option value="Pleasure">Pleasure</option>
                <option value="Course">Course</option>
              </select>
            </label>

            <label className="block">
              <span className="reading-detail-page__label mb-1 block">
                Total pages
              </span>
              <input
                required
                type="number"
                min="0"
                step="1"
                value={editTotalPages}
                onChange={(event) => setEditTotalPages(event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>

            <button className="reading-detail-page__action" type="submit">
              Save book details
            </button>
          </form>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {book.status !== "Finished" && (
            <button
              className="reading-detail-page__action"
              type="button"
              onClick={markFinished}
            >
              Mark finished
            </button>
          )}
          <button
            className="reading-detail-page__back"
            type="button"
            onClick={restartBook}
          >
            Restart from page zero
          </button>
          <button
            className="min-h-10 rounded-xl border border-red-300 bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-red-700"
            type="button"
            onClick={deleteBook}
          >
            Delete book
          </button>
        </div>

        {feedback && (
          <p role="status" className="mt-3 text-xs text-[var(--ink-soft)]">
            {feedback}
          </p>
        )}
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
        <Link className="reading-detail-page__back" href="/reading">
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
