"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  addBook,
  addEssay,
  Book,
  Essay,
  getBooks,
  getEssays,
  getReadingSessions,
  saveReadingSession,
  updateBook,
  updateEssay,
} from "@/lib/readingStorage";

type Tab = "books" | "essays";

const secondPassPrompts = [
  {
    field: "turns" as const,
    title: "Where does the piece turn?",
  },
  {
    field: "rhythm" as const,
    title: "Where does it accelerate or pause?",
  },
  {
    field: "essentialSentences" as const,
    title: "Which sentences feel impossible to remove?",
  },
  {
    field: "ending" as const,
    title: "What does the ending make you reinterpret?",
  },
];

const MIN_REFLECTION_WORDS = 5;

function wordCount(text: string) {
  return text.trim()
    ? text.trim().split(/\s+/).length
    : 0;
}

function formatDuration(
  totalSeconds: number,
) {
  const hours = Math.floor(
    totalSeconds / 3600,
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );

  const seconds =
    totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes
    .toString()
    .padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export default function ReadingPage() {
  const [tab, setTab] =
    useState<Tab>("books");

  const [books, setBooks] =
    useState<Book[]>([]);

  const [essays, setEssays] =
    useState<Essay[]>([]);

  const [showBookForm, setShowBookForm] =
    useState(false);

  const [showEssayForm, setShowEssayForm] =
    useState(false);

  const [title, setTitle] =
    useState("");

  const [author, setAuthor] =
    useState("");

  const [category, setCategory] =
    useState<
      "Pleasure" | "Course"
    >("Pleasure");

  const [totalPages, setTotalPages] =
    useState("");

  const [essayTitle, setEssayTitle] =
    useState("");

  const [essayAuthor, setEssayAuthor] =
    useState("");

  const [essaySource, setEssaySource] =
    useState("");

  const [activeBookId, setActiveBookId] =
    useState<number | null>(null);

  const [startedAt, setStartedAt] =
    useState<string | null>(null);

  const [clock, setClock] =
    useState(0);

  const [sessions, setSessions] =
    useState(
      getReadingSessions(),
    );

  const [launchHandled, setLaunchHandled] =
    useState(false);

  useEffect(() => {
    setBooks(getBooks());
    setEssays(getEssays());
    setClock(Date.now());
  }, []);

  useEffect(() => {
    const interval =
      setInterval(() => {
        setClock(Date.now());
      }, 1000);

    return () =>
      clearInterval(interval);
  }, []);

  const currentlyReading =
    books.filter(
      (book) =>
        book.status ===
        "Reading",
    );

  const wantToRead =
    books.filter(
      (book) =>
        book.status ===
        "Want to read",
    );

  const finished =
    books.filter(
      (book) =>
        book.status ===
        "Finished",
    );

  const minutesThisWeek =
    useMemo(() => {
      if (!clock) {
        return 0;
      }

      const oneWeekAgo =
        clock -
        7 *
          24 *
          60 *
          60 *
          1000;

      return sessions
        .filter(
          (session) =>
            new Date(
              session.startedAt,
            ).getTime() >=
            oneWeekAgo,
        )
        .reduce(
          (total, session) =>
            total +
            session.minutes,
          0,
        );
    }, [
      sessions,
      clock,
    ]);

  const handleAddBook = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const pages =
      Number(totalPages);

    if (
      !title.trim() ||
      !author.trim() ||
      !pages
    ) {
      return;
    }

    const book = addBook({
      title: title.trim(),
      author: author.trim(),
      category,
      totalPages: pages,
    });

    setBooks((current) => [
      ...current,
      book,
    ]);

    setTitle("");
    setAuthor("");
    setCategory("Pleasure");
    setTotalPages("");
    setShowBookForm(false);
  };

  const handleAddEssay = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      !essayTitle.trim() ||
      !essayAuthor.trim()
    ) {
      return;
    }

    const essay = addEssay({
      title: essayTitle.trim(),
      author: essayAuthor.trim(),
      source: essaySource.trim(),
    });

    setEssays((current) => [
      ...current,
      essay,
    ]);

    setEssayTitle("");
    setEssayAuthor("");
    setEssaySource("");
    setShowEssayForm(false);
  };

  const startReading = (
    bookId: number,
  ) => {
    setTab("books");
    setActiveBookId(bookId);
    setStartedAt(
      new Date().toISOString(),
    );
  };

  const stopReading = () => {
    if (
      !activeBookId ||
      !startedAt
    ) {
      return;
    }

    const minutes =
      Math.max(
        1,
        Math.round(
          (clock -
            new Date(
              startedAt,
            ).getTime()) /
            60000,
        ),
      );

    const session =
      saveReadingSession({
        bookId: activeBookId,
        startedAt,
        endedAt:
          new Date().toISOString(),
        minutes,
      });

    setSessions((current) => [
      ...current,
      session,
    ]);

    setActiveBookId(null);
    setStartedAt(null);
  };

  const updateProgress = (
    book: Book,
    newPage: number,
  ) => {
    const page =
      Math.min(
        Math.max(
          newPage,
          0,
        ),
        book.totalPages,
      );

    const updated: Book = {
      ...book,
      currentPage: page,
      status:
        page >=
        book.totalPages
          ? "Finished"
          : page > 0
            ? "Reading"
            : book.status,
    };

    updateBook(updated);

    setBooks((current) =>
      current.map((item) =>
        item.id === updated.id
          ? updated
          : item,
      ),
    );
  };

  const startEssayFirstPass = (
    essay: Essay,
  ) => {
    const updated: Essay = {
      ...essay,
      status: "First pass",
      firstPassStartedAt:
        new Date().toISOString(),
    };

    updateEssay(updated);

    setEssays((current) =>
      current.map((item) =>
        item.id === essay.id
          ? updated
          : item,
      ),
    );
  };

  const finishEssayFirstPass = (
    essay: Essay,
  ) => {
    if (
      !essay.firstPassStartedAt
    ) {
      return;
    }

    const seconds =
      Math.max(
        1,
        Math.round(
          (clock -
            new Date(
              essay.firstPassStartedAt,
            ).getTime()) /
            1000,
        ),
      );

    const updated: Essay = {
      ...essay,
      status: "First pass",
      firstPassCompletedAt:
        new Date().toISOString(),
      firstPassSeconds:
        seconds,
    };

    updateEssay(updated);

    setEssays((current) =>
      current.map((item) =>
        item.id === essay.id
          ? updated
          : item,
      ),
    );
  };

  const startEssaySecondPass = (
    essay: Essay,
  ) => {
    const updated: Essay = {
      ...essay,
      status: "Second pass",
      secondPassStartedAt:
        essay.secondPassStartedAt ??
        new Date().toISOString(),
      secondPassStep:
        essay.secondPassStep ?? 0,
    };

    updateEssay(updated);

    setEssays((current) =>
      current.map((item) =>
        item.id === essay.id
          ? updated
          : item,
      ),
    );
  };

  const goToNextSecondPassPrompt = (
    essay: Essay,
  ) => {
    const step =
      essay.secondPassStep ?? 0;

    if (
      step <
      secondPassPrompts.length -
        1
    ) {
      const updated: Essay = {
        ...essay,
        secondPassStep:
          step + 1,
      };

      updateEssay(updated);

      setEssays((current) =>
        current.map((item) =>
          item.id === essay.id
            ? updated
            : item,
        ),
      );

      return;
    }

    finishEssaySecondPass(
      essay,
    );
  };

  const goToPreviousSecondPassPrompt = (
    essay: Essay,
  ) => {
    const step =
      essay.secondPassStep ?? 0;

    if (step <= 0) {
      return;
    }

    const updated: Essay = {
      ...essay,
      secondPassStep:
        step - 1,
    };

    updateEssay(updated);

    setEssays((current) =>
      current.map((item) =>
        item.id === essay.id
          ? updated
          : item,
      ),
    );
  };

  const finishEssaySecondPass = (
    essay: Essay,
  ) => {
    if (
      !essay.secondPassStartedAt
    ) {
      return;
    }

    const marksComplete =
      essay.marks.turns.trim() &&
      essay.marks.rhythm.trim() &&
      essay.marks
        .essentialSentences
        .trim() &&
      essay.marks.ending.trim();

    if (!marksComplete) {
      return;
    }

    const seconds =
      Math.max(
        1,
        Math.round(
          (clock -
            new Date(
              essay.secondPassStartedAt,
            ).getTime()) /
            1000,
        ),
      );

    const updated: Essay = {
      ...essay,
      status: "Reflection",
      secondPassCompletedAt:
        new Date().toISOString(),
      secondPassSeconds:
        seconds,
      reflectionStartedAt:
        new Date().toISOString(),
    };

    updateEssay(updated);

    setEssays((current) =>
      current.map((item) =>
        item.id === essay.id
          ? updated
          : item,
      ),
    );
  };

  const updateEssayMarks = (
    essay: Essay,
    field: keyof Essay["marks"],
    value: string,
  ) => {
    const updated: Essay = {
      ...essay,
      marks: {
        ...essay.marks,
        [field]: value,
      },
    };

    updateEssay(updated);

    setEssays((current) =>
      current.map((item) =>
        item.id === essay.id
          ? updated
          : item,
      ),
    );
  };

  const updateReflection = (
    essay: Essay,
    field: keyof Essay["reflection"],
    value: string,
  ) => {
    const updated: Essay = {
      ...essay,
      reflection: {
        ...essay.reflection,
        [field]: value,
      },
    };

    updateEssay(updated);

    setEssays((current) =>
      current.map((item) =>
        item.id === essay.id
          ? updated
          : item,
      ),
    );
  };

  const completeReflection = (
    essay: Essay,
  ) => {
    if (
      !essay.reflectionStartedAt
    ) {
      return;
    }

    const complete =
      wordCount(
        essay.reflection
          .whatHappened,
      ) >=
        MIN_REFLECTION_WORDS &&
      wordCount(
        essay.reflection
          .whatChanged,
      ) >=
        MIN_REFLECTION_WORDS &&
      wordCount(
        essay.reflection
          .whyEnding,
      ) >=
        MIN_REFLECTION_WORDS;

    if (!complete) {
      return;
    }

    const seconds =
      Math.max(
        1,
        Math.round(
          (clock -
            new Date(
              essay.reflectionStartedAt,
            ).getTime()) /
            1000,
        ),
      );

    const updated: Essay = {
      ...essay,
      status: "Finished",
      reflectionCompletedAt:
        new Date().toISOString(),
      reflectionSeconds:
        seconds,
      criticismUnlockedAt:
        new Date().toISOString(),
    };

    updateEssay(updated);

    setEssays((current) =>
      current.map((item) =>
        item.id === essay.id
          ? updated
          : item,
      ),
    );
  };

  useEffect(() => {
    if (
      launchHandled ||
      (books.length === 0 &&
        essays.length === 0)
    ) {
      return;
    }

    const params =
      new URLSearchParams(
        window.location.search,
      );

    const bookIdValue =
      params.get("bookId");

    const essayIdValue =
      params.get("essayId");

    const bookId = bookIdValue
      ? Number(bookIdValue)
      : null;

    const essayId = essayIdValue
      ? Number(essayIdValue)
      : null;

    if (
      bookId !== null &&
      Number.isFinite(bookId)
    ) {
      const book = books.find(
        (item) =>
          item.id === bookId,
      );

      if (book) {
        setTab("books");
        setActiveBookId(
          book.id,
        );
        setStartedAt(
          new Date().toISOString(),
        );

        window.history.replaceState(
          {},
          "",
          "/reading",
        );

        window.setTimeout(() => {
          document
            .getElementById(
              `book-${book.id}`,
            )
            ?.scrollIntoView({
              behavior:
                "smooth",
              block: "center",
            });
        }, 0);
      }

      setLaunchHandled(true);
      return;
    }

    if (
      essayId !== null &&
      Number.isFinite(essayId)
    ) {
      const essay = essays.find(
        (item) =>
          item.id === essayId,
      );

      if (essay) {
        setTab("essays");

        if (
          essay.status ===
          "To read"
        ) {
          startEssayFirstPass(
            essay,
          );
        } else if (
          essay.status ===
            "First pass" &&
          essay.firstPassCompletedAt
        ) {
          startEssaySecondPass(
            essay,
          );
        }

        window.history.replaceState(
          {},
          "",
          "/reading",
        );

        window.setTimeout(() => {
          document
            .getElementById(
              `essay-${essay.id}`,
            )
            ?.scrollIntoView({
              behavior:
                "smooth",
              block: "center",
            });
        }, 0);
      }

      setLaunchHandled(true);
    }
  }, [
    launchHandled,
    books,
    essays,
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <header className="mb-8">
          <p className="text-sm font-medium text-slate-500">
            Your reading life
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Reading
          </h1>

          <p className="mt-2 text-slate-600">
            Read deliberately, while keeping a
            record of what you actually read.
          </p>
        </header>

        <div className="mb-8 flex gap-2 rounded-full bg-slate-200 p-1">
          <button
            type="button"
            onClick={() =>
              setTab("books")
            }
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium ${
              tab === "books"
                ? "bg-white shadow-sm"
                : "text-slate-500"
            }`}
          >
            Books
          </button>

          <button
            type="button"
            onClick={() =>
              setTab("essays")
            }
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium ${
              tab === "essays"
                ? "bg-white shadow-sm"
                : "text-slate-500"
            }`}
          >
            Essays
          </button>
        </div>

        {tab === "books" && (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">
                  Currently reading
                </p>

                <p className="mt-2 text-2xl font-semibold">
                  {
                    currentlyReading.length
                  }
                </p>
              </div>

              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">
                  Reading this week
                </p>

                <p className="mt-2 text-2xl font-semibold">
                  {minutesThisWeek}{" "}
                  min
                </p>
              </div>

              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">
                  Finished
                </p>

                <p className="mt-2 text-2xl font-semibold">
                  {finished.length}
                </p>
              </div>
            </div>

            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Your books
              </h2>

              <button
                type="button"
                onClick={() =>
                  setShowBookForm(
                    true,
                  )
                }
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                + Add book
              </button>
            </div>

            {showBookForm && (
              <form
                onSubmit={
                  handleAddBook
                }
                className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
              >
                <h2 className="text-lg font-semibold">
                  Add a book
                </h2>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">
                      Title
                    </label>

                    <input
                      value={title}
                      onChange={(
                        event,
                      ) =>
                        setTitle(
                          event.target
                            .value,
                        )
                      }
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3"
                      placeholder="Book title"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">
                      Author
                    </label>

                    <input
                      value={author}
                      onChange={(
                        event,
                      ) =>
                        setAuthor(
                          event.target
                            .value,
                        )
                      }
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3"
                      placeholder="Author"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">
                      Type
                    </label>

                    <select
                      value={category}
                      onChange={(
                        event,
                      ) =>
                        setCategory(
                          event.target
                            .value as
                            | "Pleasure"
                            | "Course",
                        )
                      }
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <option value="Pleasure">
                        Pleasure
                      </option>

                      <option value="Course">
                        Course
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">
                      Total pages
                    </label>

                    <input
                      type="number"
                      min="1"
                      value={totalPages}
                      onChange={(
                        event,
                      ) =>
                        setTotalPages(
                          event.target
                            .value,
                        )
                      }
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3"
                      placeholder="300"
                    />
                  </div>
                </div>

                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setShowBookForm(
                        false,
                      )
                    }
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Add book
                  </button>
                </div>
              </form>
            )}

            <section className="mb-8">
              <h2 className="mb-4 text-lg font-semibold">
                Currently reading
              </h2>

              <div className="space-y-4">
                {currentlyReading.map(
                  (book) => {
                    const progress =
                      (book.currentPage /
                        book.totalPages) *
                      100;

                    const active =
                      activeBookId ===
                      book.id;

                    const bookSeconds =
                      active &&
                      startedAt
                        ? Math.max(
                            0,
                            Math.floor(
                              (clock -
                                new Date(
                                  startedAt,
                                ).getTime()) /
                                1000,
                            ),
                          )
                        : 0;

                    return (
                      <div
                        key={book.id}
                        id={`book-${book.id}`}
                        className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
                      >
                        <div className="flex flex-col gap-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-lg font-semibold">
                                {
                                  book.title
                                }
                              </p>

                              <p className="mt-1 text-sm text-slate-500">
                                {
                                  book.author
                                }{" "}
                                ·{" "}
                                {
                                  book.category
                                }
                              </p>
                            </div>

                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                              {
                                book.currentPage
                              }
                              /
                              {
                                book.totalPages
                              }
                            </span>
                          </div>

                          <div>
                            <div className="h-2 rounded-full bg-slate-100">
                              <div
                                className="h-2 rounded-full bg-slate-900"
                                style={{
                                  width: `${progress}%`,
                                }}
                              />
                            </div>

                            <p className="mt-2 text-sm text-slate-500">
                              {Math.round(
                                progress,
                              )}
                              % complete
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            {active ? (
                              <>
                                <div className="rounded-full bg-slate-100 px-4 py-2 font-mono text-sm">
                                  {formatDuration(
                                    bookSeconds,
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={
                                    stopReading
                                  }
                                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                                >
                                  Stop reading
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  startReading(
                                    book.id,
                                  )
                                }
                                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                              >
                                Start reading
                              </button>
                            )}

                            <input
                              type="number"
                              min="0"
                              max={
                                book.totalPages
                              }
                              value={
                                book.currentPage
                              }
                              onChange={(
                                event,
                              ) =>
                                updateProgress(
                                  book,
                                  Number(
                                    event
                                      .target
                                      .value,
                                  ),
                                )
                              }
                              className="w-28 rounded-full border border-slate-200 px-4 py-2 text-sm"
                            />

                            <span className="text-sm text-slate-500">
                              current page
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-lg font-semibold">
                Want to read
              </h2>

              <div className="space-y-3">
                {wantToRead.map(
                  (book) => (
                    <div
                      key={book.id}
                      className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-slate-200"
                    >
                      <div>
                        <p className="font-medium">
                          {book.title}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {book.author}{" "}
                          ·{" "}
                          {book.category}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const updated =
                            {
                              ...book,
                              status:
                                "Reading" as const,
                            };

                          updateBook(
                            updated,
                          );

                          setBooks(
                            (
                              current,
                            ) =>
                              current.map(
                                (
                                  item,
                                ) =>
                                  item.id ===
                                  book.id
                                    ? updated
                                    : item,
                              ),
                          );
                        }}
                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium"
                      >
                        Start
                      </button>
                    </div>
                  ),
                )}
              </div>
            </section>
          </>
        )}

        {tab === "essays" && (
          <>
            <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    Your essay practice
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    First pass →
                    second pass →
                    memory reflection
                    → criticism.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowEssayForm(
                      true,
                    )
                  }
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                >
                  + Add essay
                </button>
              </div>
            </div>

            {showEssayForm && (
              <form
                onSubmit={
                  handleAddEssay
                }
                className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
              >
                <h2 className="text-lg font-semibold">
                  Add an essay
                </h2>

                <div className="mt-5 space-y-5">
                  <div>
                    <label className="text-sm font-medium">
                      Essay title
                    </label>

                    <input
                      value={essayTitle}
                      onChange={(
                        event,
                      ) =>
                        setEssayTitle(
                          event.target
                            .value,
                        )
                      }
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3"
                      placeholder="Essay title"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">
                      Author
                    </label>

                    <input
                      value={essayAuthor}
                      onChange={(
                        event,
                      ) =>
                        setEssayAuthor(
                          event.target
                            .value,
                        )
                      }
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3"
                      placeholder="Author"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">
                      Source (optional)
                    </label>

                    <input
                      value={essaySource}
                      onChange={(
                        event,
                      ) =>
                        setEssaySource(
                          event.target
                            .value,
                        )
                      }
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3"
                      placeholder="Book, journal, website, etc."
                    />
                  </div>
                </div>

                <div className="mt-5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setShowEssayForm(
                        false,
                      )
                    }
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Add essay
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-6">
              {essays.length ===
              0 ? (
                <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-slate-200">
                  <p className="font-medium">
                    No essays yet
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    Add your first essay
                    to begin the reading
                    method.
                  </p>
                </div>
              ) : (
                essays.map(
                  (essay) => {
                    const step =
                      essay.secondPassStep ??
                      0;

                    const currentPrompt =
                      secondPassPrompts[
                        step
                      ];

                    const firstPassSeconds =
                      essay.firstPassSeconds ??
                      0;

                    const activeFirstPassSeconds =
                      essay.status ===
                        "First pass" &&
                      essay.firstPassStartedAt
                        ? Math.max(
                            0,
                            Math.floor(
                              (clock -
                                new Date(
                                  essay.firstPassStartedAt,
                                ).getTime()) /
                                1000,
                            ),
                          )
                        : 0;

                    const activeSecondPassSeconds =
                      essay.status ===
                        "Second pass" &&
                      essay.secondPassStartedAt
                        ? Math.max(
                            0,
                            Math.floor(
                              (clock -
                                new Date(
                                  essay.secondPassStartedAt,
                                ).getTime()) /
                                1000,
                            ),
                          )
                        : 0;

                    const activeReflectionSeconds =
                      essay.status ===
                        "Reflection" &&
                      essay.reflectionStartedAt
                        ? Math.max(
                            0,
                            Math.floor(
                              (clock -
                                new Date(
                                  essay.reflectionStartedAt,
                                ).getTime()) /
                                1000,
                            ),
                          )
                        : 0;

                    const currentPromptValue =
                      currentPrompt
                        ? essay
                            .marks[
                            currentPrompt
                              .field
                          ]
                        : "";

                    const reflectionComplete =
                      wordCount(
                        essay
                          .reflection
                          .whatHappened,
                      ) >=
                        MIN_REFLECTION_WORDS &&
                      wordCount(
                        essay
                          .reflection
                          .whatChanged,
                      ) >=
                        MIN_REFLECTION_WORDS &&
                      wordCount(
                        essay
                          .reflection
                          .whyEnding,
                      ) >=
                        MIN_REFLECTION_WORDS;

                    return (
                      <article
                        key={essay.id}
                        id={`essay-${essay.id}`}
                        className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
                      >
                        <div className="flex flex-col gap-5">
                          <div className="flex flex-col justify-between gap-3 sm:flex-row">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-xl font-semibold">
                                  {
                                    essay.title
                                  }
                                </h2>

                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                                  {
                                    essay.status
                                  }
                                </span>
                              </div>

                              <p className="mt-1 text-sm text-slate-500">
                                {
                                  essay.author
                                }

                                {essay.source
                                  ? ` · ${essay.source}`
                                  : ""}
                              </p>
                            </div>
                          </div>

                          {essay.status ===
                            "To read" && (
                            <div className="rounded-2xl bg-slate-50 p-5">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="font-medium">
                                    First pass
                                  </p>

                                  <p className="mt-2 text-sm leading-6 text-slate-500">
                                    Read
                                    straight
                                    through
                                    without
                                    analyzing.
                                    Notice
                                    where
                                    your
                                    attention
                                    changes.
                                  </p>
                                </div>

                                <span className="text-sm text-slate-500">
                                  1 / 2
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  startEssayFirstPass(
                                    essay,
                                  )
                                }
                                className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                              >
                                Start first
                                pass
                              </button>
                            </div>
                          )}

                          {essay.status ===
                            "First pass" && (
                            <div className="rounded-2xl bg-slate-50 p-5">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="font-medium">
                                    First pass
                                  </p>

                                  <p className="mt-1 text-sm text-slate-500">
                                    No
                                    analysis
                                    yet.
                                    Just
                                    read.
                                  </p>
                                </div>

                                <div className="rounded-full bg-white px-4 py-2 font-mono text-sm ring-1 ring-slate-200">
                                  {essay.firstPassCompletedAt
                                    ? formatDuration(
                                        firstPassSeconds,
                                      )
                                    : formatDuration(
                                        activeFirstPassSeconds,
                                      )}
                                </div>
                              </div>

                              {essay.firstPassCompletedAt ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    startEssaySecondPass(
                                      essay,
                                    )
                                  }
                                  className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                                >
                                  Start
                                  second
                                  pass
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    finishEssayFirstPass(
                                      essay,
                                    )
                                  }
                                  className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                                >
                                  Finish
                                  first
                                  pass
                                </button>
                              )}
                            </div>
                          )}

                          {essay.status ===
                            "Second pass" &&
                            currentPrompt && (
                              <div className="rounded-2xl bg-slate-50 p-5">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <p className="font-medium">
                                      Second
                                      pass
                                    </p>

                                    <p className="mt-1 text-sm text-slate-500">
                                      Mark
                                      only
                                      what
                                      the
                                      method
                                      asks
                                      you
                                      to
                                      notice.
                                    </p>
                                  </div>

                                  <div className="text-right">
                                    <p className="text-sm font-medium">
                                      {step +
                                        1}{" "}
                                      / 4
                                    </p>

                                    <p className="font-mono text-xs text-slate-500">
                                      {formatDuration(
                                        activeSecondPassSeconds,
                                      )}
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-6">
                                  <label className="text-base font-medium">
                                    {
                                      currentPrompt.title
                                    }
                                  </label>

                                  <textarea
                                    value={
                                      currentPromptValue
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      updateEssayMarks(
                                        essay,
                                        currentPrompt.field,
                                        event.target
                                          .value,
                                      )
                                    }
                                    autoFocus
                                    className="mt-3 min-h-32 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm outline-none focus:border-slate-400"
                                    placeholder="Write your observation here..."
                                  />
                                </div>

                                <div className="mt-5 flex justify-between gap-3">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      goToPreviousSecondPassPrompt(
                                        essay,
                                      )
                                    }
                                    disabled={
                                      step ===
                                      0
                                    }
                                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium disabled:opacity-30"
                                  >
                                    Back
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      goToNextSecondPassPrompt(
                                        essay,
                                      )
                                    }
                                    disabled={
                                      !currentPromptValue.trim()
                                    }
                                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                                  >
                                    {step ===
                                    3
                                      ? "Finish second pass"
                                      : "Save & next"}
                                  </button>
                                </div>
                              </div>
                            )}

                          {essay.status ===
                            "Reflection" && (
                            <div className="rounded-2xl bg-slate-50 p-5">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="font-medium">
                                    Memory
                                    reflection
                                  </p>

                                  <p className="mt-2 text-sm leading-6 text-slate-500">
                                    Before
                                    reading
                                    criticism
                                    or
                                    anyone
                                    else&apos;s
                                    interpretation,
                                    write
                                    three
                                    sentences
                                    from
                                    memory.
                                  </p>
                                </div>

                                <div className="rounded-full bg-white px-4 py-2 font-mono text-sm ring-1 ring-slate-200">
                                  {formatDuration(
                                    activeReflectionSeconds,
                                  )}
                                </div>
                              </div>

                              <div className="mt-6 space-y-5">
                                <div>
                                  <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium">
                                      1.
                                      What
                                      happened?
                                    </label>

                                    <span className="text-xs text-slate-500">
                                      {wordCount(
                                        essay
                                          .reflection
                                          .whatHappened,
                                      )}{" "}
                                      /{" "}
                                      {
                                        MIN_REFLECTION_WORDS
                                      }{" "}
                                      words
                                    </span>
                                  </div>

                                  <textarea
                                    value={
                                      essay
                                        .reflection
                                        .whatHappened
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      updateReflection(
                                        essay,
                                        "whatHappened",
                                        event
                                          .target
                                          .value,
                                      )
                                    }
                                    className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                                  />
                                </div>

                                <div>
                                  <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium">
                                      2.
                                      What
                                      changed?
                                    </label>

                                    <span className="text-xs text-slate-500">
                                      {wordCount(
                                        essay
                                          .reflection
                                          .whatChanged,
                                      )}{" "}
                                      /{" "}
                                      {
                                        MIN_REFLECTION_WORDS
                                      }{" "}
                                      words
                                    </span>
                                  </div>

                                  <textarea
                                    value={
                                      essay
                                        .reflection
                                        .whatChanged
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      updateReflection(
                                        essay,
                                        "whatChanged",
                                        event
                                          .target
                                          .value,
                                      )
                                    }
                                    className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                                  />
                                </div>

                                <div>
                                  <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium">
                                      3.
                                      Why
                                      did
                                      the
                                      ending
                                      have
                                      to
                                      come
                                      there?
                                    </label>

                                    <span className="text-xs text-slate-500">
                                      {wordCount(
                                        essay
                                          .reflection
                                          .whyEnding,
                                      )}{" "}
                                      /{" "}
                                      {
                                        MIN_REFLECTION_WORDS
                                      }{" "}
                                      words
                                    </span>
                                  </div>

                                  <textarea
                                    value={
                                      essay
                                        .reflection
                                        .whyEnding
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      updateReflection(
                                        essay,
                                        "whyEnding",
                                        event
                                          .target
                                          .value,
                                      )
                                    }
                                    className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm"
                                  />
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  completeReflection(
                                    essay,
                                  )
                                }
                                disabled={
                                  !reflectionComplete
                                }
                                className="mt-5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Complete
                                reflection
                              </button>

                              {!reflectionComplete && (
                                <p className="mt-3 text-xs text-slate-500">
                                  Each
                                  answer
                                  needs
                                  at least{" "}
                                  {
                                    MIN_REFLECTION_WORDS
                                  }{" "}
                                  words.
                                </p>
                              )}
                            </div>
                          )}

                          {essay.status ===
                            "Finished" && (
                            <div className="rounded-2xl bg-slate-50 p-5">
                              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="font-medium">
                                    Reading
                                    process
                                    complete
                                  </p>

                                  <p className="mt-1 text-sm leading-6 text-slate-500">
                                    Your
                                    interpretation
                                    was
                                    recorded
                                    before
                                    outside
                                    criticism.
                                  </p>
                                </div>

                                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium ring-1 ring-slate-200">
                                  Criticism
                                  unlocked
                                </span>
                              </div>

                              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                                  <p className="text-xs text-slate-500">
                                    First
                                    pass
                                  </p>

                                  <p className="mt-1 font-mono text-sm">
                                    {formatDuration(
                                      essay.firstPassSeconds ??
                                        0,
                                    )}
                                  </p>
                                </div>

                                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                                  <p className="text-xs text-slate-500">
                                    Second
                                    pass
                                  </p>

                                  <p className="mt-1 font-mono text-sm">
                                    {formatDuration(
                                      essay.secondPassSeconds ??
                                        0,
                                    )}
                                  </p>
                                </div>

                                <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                                  <p className="text-xs text-slate-500">
                                    Reflection
                                  </p>

                                  <p className="mt-1 font-mono text-sm">
                                    {formatDuration(
                                      essay.reflectionSeconds ??
                                        0,
                                    )}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  },
                )
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}