"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import {
  deleteBookAndSessions,
  getBooks,
  updateBook,
  type Book,
  type ChapterReflection,
  type ReadingApplication,
  type ReadingDecision,
  type ReadingMethod,
  type SecondPassSection,
  type WholeBookReconstruction,
} from "@/lib/readingStorage";

const ACTIVE_READING_TIMER_KEY = "personal-assistant-active-reading-timer";

const EMPTY_RECONSTRUCTION: WholeBookReconstruction = {
  about: "",
  doing: "",
  development: "",
  changed: "",
};

const EMPTY_APPLICATION: ReadingApplication = {
  idea: "",
  experiment: "",
  result: "",
};

const READING_METHODS: {
  value: ReadingMethod;
  label: string;
  guidance: string;
}[] = [
  {
    value: "Novel / narrative nonfiction",
    label: "Novel or narrative nonfiction",
    guidance:
      "Experience the whole story first. Follow its development without constantly analyzing how it is constructed.",
  },
  {
    value: "Practical nonfiction",
    label: "Practical nonfiction",
    guidance:
      "Understand the central idea, how the author supports it, and what it might change in your understanding or behaviour.",
  },
  {
    value: "Philosophy / theory",
    label: "Philosophy or theoretical work",
    guidance:
      "Follow the reasoning carefully. Reconstruct arguments, examine assumptions, and revisit difficult sections when needed.",
  },
  {
    value: "Technical / skill-building",
    label: "Technical or skill-building book",
    guidance:
      "Alternate reading with examples, practice, and small tests of whether you can use what you have learned.",
  },
  {
    value: "Poetry / literary work",
    label: "Poetry or literary work",
    guidance:
      "Read slowly and revisit passages when useful. Pay attention to how language, rhythm, and form shape meaning.",
  },
  {
    value: "Other",
    label: "Other / mixed approach",
    guidance:
      "Choose the method that serves your purpose. A book may combine several approaches, and you can change methods as you read.",
  },
];

const READING_DECISIONS: ReadingDecision[] = [
  "Continue reading",
  "Revisit difficult sections",
  "Read selectively",
  "Apply an idea",
  "Stop — purpose fulfilled",
  "Stop — not enough value",
];

function clearActiveTimerForBook(bookId: number) {
  try {
    const raw = window.localStorage.getItem(ACTIVE_READING_TIMER_KEY);
    if (!raw) return;

    const timer = JSON.parse(raw) as { bookId?: unknown };
    if (timer.bookId === bookId) {
      window.localStorage.removeItem(ACTIVE_READING_TIMER_KEY);
    }
  } catch {
    // Keep an unreadable timer rather than risking removal of another book's timer.
  }
}

function BookDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [book, setBook] = useState<Book | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [pageValue, setPageValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editCategory, setEditCategory] =
    useState<Book["category"]>("Pleasure");
  const [editTotalPages, setEditTotalPages] = useState("");

  const [purposeDraft, setPurposeDraft] = useState("");
  const [methodDraft, setMethodDraft] = useState<ReadingMethod>("Other");

  const [chapterSection, setChapterSection] = useState("");
  const [chapterCentralPoint, setChapterCentralPoint] = useState("");
  const [chapterDevelopment, setChapterDevelopment] = useState("");
  const [chapterQuestions, setChapterQuestions] = useState("");

  const [reconstructionDraft, setReconstructionDraft] =
    useState<WholeBookReconstruction>(EMPTY_RECONSTRUCTION);

  const [secondPassTitle, setSecondPassTitle] = useState("");
  const [secondPassReason, setSecondPassReason] = useState("");
  const [secondPassNotesDraft, setSecondPassNotesDraft] =
    useState<Record<string, string>>({});

  const [applicationDraft, setApplicationDraft] =
    useState<ReadingApplication>(EMPTY_APPLICATION);
  const [decisionDraft, setDecisionDraft] =
    useState<ReadingDecision | "">("");

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

    setPurposeDraft(found?.readingPurpose ?? "");
    setMethodDraft(found?.readingMethod ?? "Other");

    setReconstructionDraft({
      ...EMPTY_RECONSTRUCTION,
      ...found?.wholeBookReconstruction,
    });

    setSecondPassNotesDraft(
      Object.fromEntries(
        (found?.secondPassSections ?? []).map((section) => [
          section.id,
          section.notes,
        ]),
      ),
    );

    setApplicationDraft({
      ...EMPTY_APPLICATION,
      ...found?.readingApplication,
    });
    setDecisionDraft(found?.readingDecision ?? "");
    setLoaded(true);
  }, [params.id]);

  function persistBook(updated: Book, message: string) {
    try {
      updateBook(updated);
      setBook(updated);
      setFeedback(message);
    } catch {
      setFeedback("Your changes could not be saved. Please try again.");
    }
  }

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

    persistBook({ ...book, currentPage: value }, "Reading progress saved.");
  }

  function savePurposeAndMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book) return;

    persistBook(
      {
        ...book,
        readingPurpose: purposeDraft.trim(),
        readingMethod: methodDraft,
      },
      "Your purpose and reading method were saved.",
    );
  }

  function saveChapterReflection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book) return;

    if (
      !chapterSection.trim() ||
      !(
        chapterCentralPoint.trim() ||
        chapterDevelopment.trim() ||
        chapterQuestions.trim()
      )
    ) {
      setFeedback("Add a chapter or section name and at least one reflection.");
      return;
    }

    const reflection: ChapterReflection = {
      id: `${Date.now()}`,
      section: chapterSection.trim(),
      centralPoint: chapterCentralPoint.trim(),
      development: chapterDevelopment.trim(),
      questions: chapterQuestions.trim(),
      updatedAt: new Date().toISOString(),
    };

    persistBook(
      {
        ...book,
        chapterReflections: [
          ...(book.chapterReflections ?? []),
          reflection,
        ],
      },
      "Chapter reflection saved.",
    );

    setChapterSection("");
    setChapterCentralPoint("");
    setChapterDevelopment("");
    setChapterQuestions("");
  }

  function removeChapterReflection(reflectionId: string) {
    if (!book) return;
    if (!window.confirm("Delete this chapter reflection?")) return;

    persistBook(
      {
        ...book,
        chapterReflections: (book.chapterReflections ?? []).filter(
          (item) => item.id !== reflectionId,
        ),
      },
      "Chapter reflection deleted.",
    );
  }

  function saveReconstruction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book) return;

    if (
      !reconstructionDraft.about.trim() &&
      !reconstructionDraft.doing.trim() &&
      !reconstructionDraft.development.trim() &&
      !reconstructionDraft.changed.trim()
    ) {
      setFeedback("Write at least one response before saving your reconstruction.");
      return;
    }

    persistBook(
      {
        ...book,
        wholeBookReconstruction: {
          ...reconstructionDraft,
          updatedAt: new Date().toISOString(),
        },
      },
      "Whole-book reconstruction saved.",
    );
  }

  function addSecondPassSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book) return;

    if (!secondPassTitle.trim()) {
      setFeedback("Enter the chapter, passage, or argument you want to revisit.");
      return;
    }

    const section: SecondPassSection = {
      id: `${Date.now()}`,
      section: secondPassTitle.trim(),
      reason: secondPassReason.trim(),
      notes: "",
      completed: false,
      updatedAt: new Date().toISOString(),
    };

    persistBook(
      {
        ...book,
        secondPassSections: [
          ...(book.secondPassSections ?? []),
          section,
        ],
      },
      "Section added to your second pass.",
    );

    setSecondPassNotesDraft((current) => ({
      ...current,
      [section.id]: "",
    }));
    setSecondPassTitle("");
    setSecondPassReason("");
  }

  function saveSecondPassNotes(
    event: FormEvent<HTMLFormElement>,
    sectionId: string,
  ) {
    event.preventDefault();
    if (!book) return;

    const sections = (book.secondPassSections ?? []).map((section) =>
      section.id === sectionId
        ? {
            ...section,
            notes: secondPassNotesDraft[sectionId] ?? "",
            updatedAt: new Date().toISOString(),
          }
        : section,
    );

    persistBook(
      { ...book, secondPassSections: sections },
      "Second-pass notes saved.",
    );
  }

  function toggleSecondPassSection(sectionId: string) {
    if (!book) return;

    persistBook(
      {
        ...book,
        secondPassSections: (book.secondPassSections ?? []).map((section) =>
          section.id === sectionId
            ? {
                ...section,
                completed: !section.completed,
                updatedAt: new Date().toISOString(),
              }
            : section,
        ),
      },
      "Second-pass progress updated.",
    );
  }

  function removeSecondPassSection(sectionId: string) {
    if (!book) return;
    if (!window.confirm("Remove this item from your second-pass list?")) return;

    persistBook(
      {
        ...book,
        secondPassSections: (book.secondPassSections ?? []).filter(
          (section) => section.id !== sectionId,
        ),
      },
      "Section removed from your second-pass list.",
    );

    setSecondPassNotesDraft((current) => {
      const next = { ...current };
      delete next[sectionId];
      return next;
    });
  }

  function saveApplicationAndDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!book) return;

    persistBook(
      {
        ...book,
        readingApplication: {
          ...applicationDraft,
          updatedAt: new Date().toISOString(),
        },
        readingDecision: decisionDraft || undefined,
      },
      "Your application notes and reading decision were saved.",
    );
  }

  function startReading() {
    if (!book) return;

    try {
      if (book.status !== "Reading") {
        const updated = { ...book, status: "Reading" as const };
        updateBook(updated);
        setBook(updated);
      }

      // The workflow only starts after this explicit user action.
      router.push(`/reading?bookId=${book.id}`);
    } catch {
      setFeedback("The reading session could not be started. Please try again.");
    }
  }

  function markFinished() {
    if (!book) return;

    const confirmed = window.confirm(
      "Mark this book as finished? You can still revisit sections and update your reflections afterward.",
    );
    if (!confirmed) return;

    const updated: Book = {
      ...book,
      currentPage:
        book.totalPages > 0 ? book.totalPages : book.currentPage,
      status: "Finished",
    };

    setPageValue(String(updated.currentPage));
    persistBook(updated, "Book marked as finished. The reconstruction stage is ready.");
  }

  function restartBook() {
    if (!book) return;

    const confirmed = window.confirm(
      `Restart "${book.title}" from page zero? Your existing reading-session history will be kept.`,
    );
    if (!confirmed) return;

    const updated: Book = {
      ...book,
      currentPage: 0,
      status: "Reading",
    };

    clearActiveTimerForBook(book.id);
    setPageValue("0");
    persistBook(updated, "First-pass progress reset. Previous reading sessions were kept.");
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

  function saveBookDetails(event: FormEvent<HTMLFormElement>) {
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

    setPageValue(String(currentPage));
    setEditing(false);
    persistBook(updated, "Book details saved.");
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

  const progress =
    book.totalPages > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((book.currentPage / book.totalPages) * 100),
          ),
        )
      : 0;

  const methodInfo = READING_METHODS.find(
    (item) => item.value === methodDraft,
  );

  const chapterReflections = book.chapterReflections ?? [];
  const secondPassSections = book.secondPassSections ?? [];
  const reconstruction = book.wholeBookReconstruction ?? EMPTY_RECONSTRUCTION;

  return (
    <main className="reading-detail-page">
      <Link className="reading-detail-page__back" href="/reading">
        ← Back to books
      </Link>

      <header>
        <p className="reading-detail-page__eyebrow">Your reading workspace</p>
        <h1>{book.title}</h1>
        <p className="reading-detail-page__subtitle">
          {book.author || "Author not specified"} · {book.category}
        </p>
      </header>

      <section className="reading-detail-page__panel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="reading-detail-page__label">Current stage</p>
            <p className="reading-detail-page__value mt-1">{book.status}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Understand the whole, examine what matters, then test what you learned.
            </p>
          </div>
          {book.status !== "Finished" && (
            <button
              type="button"
              className="reading-detail-page__action"
              onClick={startReading}
            >
              {book.status === "Want to read" ? "Start reading" : "Continue reading"}
            </button>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="reading-detail-page__label">Reading progress</span>
            <span className="reading-detail-page__value">
              {book.currentPage} / {book.totalPages} pages · {progress}%
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"
            role="progressbar"
            aria-label="Book reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </section>

      <details
        className="reading-detail-page__panel"
        open={book.status === "Want to read"}
      >
        <summary className="cursor-pointer text-sm font-semibold">
          <span className="mr-2 text-[var(--primary-dark)]">1</span>
          Before reading: establish your purpose
        </summary>

        <form onSubmit={savePurposeAndMethod} className="mt-4 space-y-4">
          <label className="block">
            <span className="reading-detail-page__label mb-1 block">
              What are you reading this book for?
            </span>
            <textarea
              rows={3}
              value={purposeDraft}
              onChange={(event) => setPurposeDraft(event.target.value)}
              placeholder="Understand an idea, experience a story, develop a skill, or something else…"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="reading-detail-page__label mb-1 block">
              Choose a reading method
            </span>
            <select
              value={methodDraft}
              onChange={(event) =>
                setMethodDraft(event.target.value as ReadingMethod)
              }
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              {READING_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>

          {methodInfo && (
            <p className="rounded-lg bg-[var(--surface-soft)] p-3 text-sm leading-6 text-[var(--ink-soft)]">
              {methodInfo.guidance}
            </p>
          )}

          <p className="text-xs text-[var(--muted)]">
            Keep your purpose brief. You can change your method as you learn more about the book.
          </p>

          <button type="submit" className="reading-detail-page__action">
            Save purpose and method
          </button>
        </form>
      </details>

      <details
        className="reading-detail-page__panel"
        open={book.status === "Reading"}
      >
        <summary className="cursor-pointer text-sm font-semibold">
          <span className="mr-2 text-[var(--primary-dark)]">2</span>
          First pass: understand the whole
        </summary>

        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-[var(--ink-soft)]">
            Read chapter by chapter, following the story or the development of the author’s ideas.
            Avoid interrupting yourself constantly to take notes. Pause briefly when a section is
            difficult, and reconstruct what matters before continuing.
          </p>

          <form onSubmit={savePage} className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="reading-detail-page__label mb-1 block">
                Current page
              </span>
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
            <button type="submit" className="reading-detail-page__action">
              Save progress
            </button>
          </form>

          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold">A brief chapter reflection</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Optional. Use a few words if that is enough. A mental summary is often all you need.
            </p>

            <form onSubmit={saveChapterReflection} className="mt-3 space-y-3">
              <label className="block">
                <span className="reading-detail-page__label mb-1 block">
                  Chapter or section
                </span>
                <input
                  value={chapterSection}
                  onChange={(event) => setChapterSection(event.target.value)}
                  placeholder="Chapter 3, Part II…"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="reading-detail-page__label mb-1 block">
                  What happened, or what was the central point?
                </span>
                <textarea
                  rows={2}
                  value={chapterCentralPoint}
                  onChange={(event) => setChapterCentralPoint(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="reading-detail-page__label mb-1 block">
                  What changed or developed?
                </span>
                <textarea
                  rows={2}
                  value={chapterDevelopment}
                  onChange={(event) => setChapterDevelopment(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="reading-detail-page__label mb-1 block">
                  What questions remain?
                </span>
                <textarea
                  rows={2}
                  value={chapterQuestions}
                  onChange={(event) => setChapterQuestions(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </label>

              <button type="submit" className="reading-detail-page__action">
                Save reflection
              </button>
            </form>
          </div>

          {chapterReflections.length > 0 && (
            <div className="space-y-3 border-t border-[var(--border)] pt-4">
              <h3 className="text-sm font-semibold">Saved chapter reflections</h3>
              {chapterReflections.map((item) => (
                <article
                  key={item.id}
                  className="reading-detail-page__note"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h4>{item.section}</h4>
                    <button
                      type="button"
                      onClick={() => removeChapterReflection(item.id)}
                      className="text-xs text-[var(--muted)] underline"
                    >
                      Delete
                    </button>
                  </div>
                  {item.centralPoint && <p>{item.centralPoint}</p>}
                  {item.development && (
                    <p><strong>Development:</strong> {item.development}</p>
                  )}
                  {item.questions && (
                    <p><strong>Questions:</strong> {item.questions}</p>
                  )}
                </article>
              ))}
            </div>
          )}

          {book.status !== "Finished" && (
            <div className="border-t border-[var(--border)] pt-4">
              <h3 className="text-sm font-semibold">Finished the book?</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                Complete the first pass before undertaking a comprehensive analysis, unless the book
                is difficult enough to require deeper work as you go.
              </p>
              <button
                type="button"
                onClick={markFinished}
                className="reading-detail-page__action mt-3"
              >
                Mark first pass finished
              </button>
            </div>
          )}
        </div>
      </details>

      <details
        className="reading-detail-page__panel"
        open={book.status === "Finished"}
      >
        <summary className="cursor-pointer text-sm font-semibold">
          <span className="mr-2 text-[var(--primary-dark)]">3</span>
          After finishing: reconstruct the whole
        </summary>

        <form onSubmit={saveReconstruction} className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-[var(--ink-soft)]">
            Close the book before looking at your notes or other people’s interpretations.
            Explain what you remember in your own words. These are prompts, not an exam;
            brief answers are enough.
          </p>

          <label className="block">
            <span className="reading-detail-page__label mb-1 block">
              What is the book about?
            </span>
            <textarea
              rows={3}
              value={reconstructionDraft.about}
              onChange={(event) =>
                setReconstructionDraft((current) => ({
                  ...current,
                  about: event.target.value,
                }))
              }
              placeholder="Explain its subject in your own words."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="reading-detail-page__label mb-1 block">
              What is the book doing?
            </span>
            <textarea
              rows={3}
              value={reconstructionDraft.doing}
              onChange={(event) =>
                setReconstructionDraft((current) => ({
                  ...current,
                  doing: event.target.value,
                }))
              }
              placeholder="Describe its central argument, narrative movement, or progression of ideas."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="reading-detail-page__label mb-1 block">
              How does it develop from beginning to end?
            </span>
            <textarea
              rows={3}
              value={reconstructionDraft.development}
              onChange={(event) =>
                setReconstructionDraft((current) => ({
                  ...current,
                  development: event.target.value,
                }))
              }
              placeholder="Identify the main stages and how they fit together."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="reading-detail-page__label mb-1 block">
              What do you understand differently now?
            </span>
            <textarea
              rows={3}
              value={reconstructionDraft.changed}
              onChange={(event) =>
                setReconstructionDraft((current) => ({
                  ...current,
                  changed: event.target.value,
                }))
              }
              placeholder="Record a change in understanding, perspective, or ability."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>

          <button type="submit" className="reading-detail-page__action">
            Save reconstruction
          </button>

          {reconstruction.updatedAt && (
            <p className="text-xs text-[var(--muted)]">
              Last saved: {new Date(reconstruction.updatedAt).toLocaleString()}
            </p>
          )}
        </form>
      </details>

      <details className="reading-detail-page__panel">
        <summary className="cursor-pointer text-sm font-semibold">
          <span className="mr-2 text-[var(--primary-dark)]">4</span>
          Second pass: examine what matters
        </summary>

        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-[var(--ink-soft)]">
            The second pass is selective unless the book deserves a complete rereading.
            Add a section because you want to resolve a question, deepen your understanding,
            examine an argument, or learn how something works.
          </p>

          <form onSubmit={addSecondPassSection} className="space-y-3">
            <label className="block">
              <span className="reading-detail-page__label mb-1 block">
                Chapter, passage, or argument
              </span>
              <input
                value={secondPassTitle}
                onChange={(event) => setSecondPassTitle(event.target.value)}
                placeholder="Chapter 4, the ending, an argument…"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="reading-detail-page__label mb-1 block">
                Why does it deserve another look?
              </span>
              <textarea
                rows={2}
                value={secondPassReason}
                onChange={(event) => setSecondPassReason(event.target.value)}
                placeholder="What do you want to understand or resolve?"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              />
            </label>

            <button type="submit" className="reading-detail-page__action">
              Add section to revisit
            </button>
          </form>

          {secondPassSections.length > 0 ? (
            <div className="space-y-3 border-t border-[var(--border)] pt-4">
              {secondPassSections.map((section) => (
                <article key={section.id} className="reading-detail-page__note">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3>{section.section}</h3>
                      {section.reason && <p>{section.reason}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSecondPassSection(section.id)}
                      className="text-xs font-semibold text-[var(--primary-dark)] underline"
                    >
                      {section.completed ? "Mark to revisit" : "Mark examined"}
                    </button>
                  </div>

                  <form
                    onSubmit={(event) => saveSecondPassNotes(event, section.id)}
                    className="mt-3 space-y-2"
                  >
                    <label className="block">
                      <span className="reading-detail-page__label mb-1 block">
                        Notes from revisiting
                      </span>
                      <textarea
                        rows={3}
                        value={secondPassNotesDraft[section.id] ?? section.notes}
                        onChange={(event) =>
                          setSecondPassNotesDraft((current) => ({
                            ...current,
                            [section.id]: event.target.value,
                          }))
                        }
                        placeholder="What became clearer? How does this part contribute to the whole?"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex flex-wrap gap-3">
                      <button type="submit" className="reading-detail-page__action">
                        Save notes
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSecondPassSection(section.id)}
                        className="text-xs text-[var(--muted)] underline"
                      >
                        Remove
                      </button>
                    </div>
                  </form>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Nothing selected yet. Add only sections where a second look would be useful.
            </p>
          )}
        </div>
      </details>

      <details className="reading-detail-page__panel">
        <summary className="cursor-pointer text-sm font-semibold">
          <span className="mr-2 text-[var(--primary-dark)]">5</span>
          Apply what matters—or decide to stop
        </summary>

        <form onSubmit={saveApplicationAndDecision} className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-[var(--ink-soft)]">
            Application is especially useful for practical or skill-building books, but it is not
            compulsory for every book. A novel may be worthwhile as an experience. Choose the
            outcome that fits your purpose.
          </p>

          <label className="block">
            <span className="reading-detail-page__label mb-1 block">
              An idea worth trying (optional)
            </span>
            <textarea
              rows={2}
              value={applicationDraft.idea}
              onChange={(event) =>
                setApplicationDraft((current) => ({
                  ...current,
                  idea: event.target.value,
                }))
              }
              placeholder="What might be worth putting into practice?"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="reading-detail-page__label mb-1 block">
              How will you test it?
            </span>
            <textarea
              rows={2}
              value={applicationDraft.experiment}
              onChange={(event) =>
                setApplicationDraft((current) => ({
                  ...current,
                  experiment: event.target.value,
                }))
              }
              placeholder="Describe a small experiment or practical step."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="reading-detail-page__label mb-1 block">
              What happened?
            </span>
            <textarea
              rows={2}
              value={applicationDraft.result}
              onChange={(event) =>
                setApplicationDraft((current) => ({
                  ...current,
                  result: event.target.value,
                }))
              }
              placeholder="Record the result when you have tried it."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="reading-detail-page__label mb-1 block">
              What should happen next?
            </span>
            <select
              value={decisionDraft}
              onChange={(event) =>
                setDecisionDraft(event.target.value as ReadingDecision | "")
              }
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <option value="">Choose a decision (optional)</option>
              {READING_DECISIONS.map((decision) => (
                <option value={decision} key={decision}>
                  {decision}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="reading-detail-page__action">
            Save application and decision
          </button>

          {book.readingDecision && (
            <p className="rounded-lg bg-[var(--surface-soft)] p-3 text-sm">
              Current decision: <strong>{book.readingDecision}</strong>
            </p>
          )}
        </form>
      </details>

      <details className="reading-detail-page__panel">
        <summary className="cursor-pointer text-sm font-semibold">
          Book details and management
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
            {editing ? "Cancel editing" : "Edit book details"}
          </button>

          {editing && (
            <form onSubmit={saveBookDetails} className="space-y-3">
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

              <button type="submit" className="reading-detail-page__action">
                Save book details
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-2">
            {book.status !== "Finished" && (
              <button
                type="button"
                onClick={markFinished}
                className="reading-detail-page__action"
              >
                Mark first pass finished
              </button>
            )}

            <button
              type="button"
              onClick={restartBook}
              className="reading-detail-page__back"
            >
              Restart from page zero
            </button>

            <button
              type="button"
              onClick={deleteBook}
              className="min-h-10 rounded-xl border border-red-300 bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-red-700"
            >
              Delete book
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
