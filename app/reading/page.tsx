"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import CardMenu from "@/app/components/CardMenu";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  addBook,
  addEssay,
  Book,
  Essay,
  getBooks,
  deleteBookAndSessions,
  getEssays,
  getReadingSessions,
  saveReadingSession,
  saveEssays,
  updateBook,
  updateEssay,
} from "@/lib/readingStorage";
import ProjectsPanel from "@/app/components/ProjectsPanel";

type Tab = "books" | "essays" | "projects";

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
const ACTIVE_READING_TIMER_KEY = "personal-assistant-active-reading-timer";

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
  const router = useRouter();
  const [tab, setTab] =
    useState<Tab>("books");

  const [books, setBooks] =
    useState<Book[]>([]);

  const [essays, setEssays] =
    useState<Essay[]>([]);

  const [collapsedBookIds, setCollapsedBookIds] =
    useState<Set<number>>(() => new Set());

  const [collapsedEssayIds, setCollapsedEssayIds] =
    useState<Set<number>>(() => new Set());

  const [showBookForm, setShowBookForm] =
    useState(false);
  const bookFormRef = useRef<HTMLFormElement>(null);
  const [editingBookId, setEditingBookId] = useState<number | null>(null);

  const [showEssayForm, setShowEssayForm] =
    useState(false);
  const essayFormRef = useRef<HTMLFormElement>(null);
  const [editingEssayId, setEditingEssayId] = useState<number | null>(null);
  const [exportTarget, setExportTarget] = useState<{
    title: string;
    fileName: string;
    content: string;
  } | null>(null);
  const [exportFeedback, setExportFeedback] = useState("");
  const [exportShowManualCopy, setExportShowManualCopy] = useState(false);
  const [exportCopyContent, setExportCopyContent] = useState("");


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

  const [timerRestored, setTimerRestored] =
    useState(false);

  const [clock, setClock] =
    useState(0);

  const [sessions, setSessions] =
    useState(
      getReadingSessions(),
    );

  const [launchHandled, setLaunchHandled] =
    useState(false);

  const [searchHighlightBookId, setSearchHighlightBookId] =
    useState<number | null>(null);

  const [searchHighlightEssayId, setSearchHighlightEssayId] =
    useState<number | null>(null);

  useEffect(() => {
    if (!showBookForm && !showEssayForm) return;
    function handleOutsidePointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (bookFormRef.current?.contains(target) || essayFormRef.current?.contains(target)) return;
      if (showBookForm) {
        setEditingBookId(null);
        setTitle("");
        setAuthor("");
        setCategory("Pleasure");
        setTotalPages("");
        setShowBookForm(false);
      }
      if (showEssayForm) {
        setEditingEssayId(null);
        setEssayTitle("");
        setEssayAuthor("");
        setEssaySource("");
        setShowEssayForm(false);
      }
    }
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer, true);
  }, [showBookForm, showEssayForm]);

  useEffect(() => {
    const loadedBooks = getBooks();
    const loadedEssays = getEssays();
    setBooks(loadedBooks);
    setEssays(loadedEssays);
    setCollapsedBookIds(new Set(loadedBooks.map((book) => book.id)));
    setCollapsedEssayIds(new Set(loadedEssays.map((essay) => essay.id)));
    setClock(Date.now());

    try {
      const rawTimer = window.localStorage.getItem(
        ACTIVE_READING_TIMER_KEY,
      );

      if (rawTimer) {
        const parsed: unknown = JSON.parse(rawTimer);

        if (
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          const saved = parsed as Record<string, unknown>;
          const savedBookId = saved.bookId;
          const savedStartedAt = saved.startedAt;

          if (
            typeof savedBookId === "number" &&
            Number.isSafeInteger(savedBookId) &&
            typeof savedStartedAt === "string" &&
            Number.isFinite(Date.parse(savedStartedAt)) &&
            loadedBooks.some((book) => book.id === savedBookId)
          ) {
            setActiveBookId(savedBookId);
            setStartedAt(savedStartedAt);
          }
        }
      }
    } catch (error) {
      console.error("Could not restore the active reading timer:", error);
    }

    setTimerRestored(true);
  }, []);

  useEffect(() => {
    if (!timerRestored) return;

    try {
      if (
        activeBookId !== null &&
        startedAt &&
        books.some((book) => book.id === activeBookId)
      ) {
        window.localStorage.setItem(
          ACTIVE_READING_TIMER_KEY,
          JSON.stringify({ bookId: activeBookId, startedAt }),
        );
      } else {
        window.localStorage.removeItem(ACTIVE_READING_TIMER_KEY);
      }
    } catch (error) {
      console.error("Could not preserve the active reading timer:", error);
    }
  }, [timerRestored, activeBookId, startedAt, books]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "books" || requested === "essays" || requested === "projects") {
      setTab(requested);
    }
  }, []);

  function changeTab(nextTab: Tab) {
    setTab(nextTab);
    const url = new URL(window.location.href);

    if (nextTab === "books") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", nextTab);
    }

    if (nextTab !== "projects") url.searchParams.delete("projectId");
    if (nextTab !== "books") {
      url.searchParams.delete("findBookId");
      url.searchParams.delete("bookId");
    }
    if (nextTab !== "essays") {
      url.searchParams.delete("findEssayId");
      url.searchParams.delete("essayId");
    }

    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
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

    const pages = Number(totalPages);
    if (
      !title.trim() ||
      !author.trim() ||
      !Number.isSafeInteger(pages) ||
      pages < 1
    ) {
      return;
    }

    const existing = books.find((book) => book.id === editingBookId);

    if (existing) {
      const currentPage = Math.min(existing.currentPage, pages);
      const status: Book["status"] =
        currentPage >= pages
          ? "Finished"
          : existing.status === "Finished"
            ? currentPage > 0 ? "Reading" : "Want to read"
            : existing.status;

      const updated: Book = {
        ...existing,
        title: title.trim(),
        author: author.trim(),
        category,
        totalPages: pages,
        currentPage,
        status,
      };

      updateBook(updated);
      setBooks((current) =>
        current.map((item) => item.id === updated.id ? updated : item),
      );
    } else {
      const book = addBook({
        title: title.trim(),
        author: author.trim(),
        category,
        totalPages: pages,
      });

      setBooks((current) => [...current, book]);
      setCollapsedBookIds((current) => new Set(current).add(book.id));
    }

    resetBookForm();
  };

  function resetBookForm() {
    setEditingBookId(null);
    setTitle("");
    setAuthor("");
    setCategory("Pleasure");
    setTotalPages("");
    setShowBookForm(false);
  }

  function startEditingBook(book: Book) {
    setEditingBookId(book.id);
    setTitle(book.title);
    setAuthor(book.author);
    setCategory(book.category);
    setTotalPages(String(book.totalPages));
    setShowBookForm(true);
  }

  function handleDeleteBook(book: Book) {
    const confirmed = window.confirm(
      `Delete "${book.title}" and its saved reading-session history? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      const remainingSessions = deleteBookAndSessions(book.id);
      setBooks((current) => current.filter((item) => item.id !== book.id));
      setSessions(remainingSessions);

      if (activeBookId === book.id) {
        setActiveBookId(null);
        setStartedAt(null);
      }

      if (editingBookId === book.id) resetBookForm();
    } catch {
      window.alert("The book could not be deleted. Please check browser storage and try again.");
    }
  }

  function handleRestartBook(book: Book) {
    const confirmed = window.confirm(
      `Restart "${book.title}" from page 0? Your previous reading sessions will be kept.`,
    );
    if (!confirmed) return;

    const updated: Book = {
      ...book,
      currentPage: 0,
      status: "Reading",
    };

    updateBook(updated);
    setBooks((current) =>
      current.map((item) => item.id === book.id ? updated : item),
    );

    if (activeBookId === book.id) {
      setStartedAt(new Date().toISOString());

    }
  }

  function getBookMenuActions(book: Book) {
    return [
      {
        label: "Edit book",
        onSelect: () => startEditingBook(book),
      },
      {
        label: "Restart reading",
        onSelect: () => handleRestartBook(book),
      },
      {
        label: "Delete book",
        destructive: true,
        onSelect: () => handleDeleteBook(book),
      },
    ];
  }

  const handleAddEssay = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!essayTitle.trim() || !essayAuthor.trim()) return;

    const existing = essays.find((essay) => essay.id === editingEssayId);

    if (existing) {
      // Update metadata only; preserve marks, reflections, timings and criticism state.
      const updated: Essay = {
        ...existing,
        title: essayTitle.trim(),
        author: essayAuthor.trim(),
        source: essaySource.trim(),
      };

      updateEssay(updated);
      setEssays((current) =>
        current.map((item) => item.id === updated.id ? updated : item),
      );
    } else {
      const essay = addEssay({
        title: essayTitle.trim(),
        author: essayAuthor.trim(),
        source: essaySource.trim(),
      });
      setEssays((current) => [...current, essay]);
      setCollapsedEssayIds((current) => new Set(current).add(essay.id));
    }

    resetEssayForm();
  };

  function resetEssayForm() {
    setEditingEssayId(null);
    setEssayTitle("");
    setEssayAuthor("");
    setEssaySource("");
    setShowEssayForm(false);
  }

  function startEditingEssay(essay: Essay) {
    setEditingEssayId(essay.id);
    setEssayTitle(essay.title);
    setEssayAuthor(essay.author);
    setEssaySource(essay.source);
    setShowEssayForm(true);
  }

  function handleRestartEssay(essay: Essay) {
    const confirmed = window.confirm(
      `Restart "${essay.title}"? Saved observations and memory reflections will be kept, but its reading timers and workflow stage will reset.`,
    );
    if (!confirmed) return;

    const updated: Essay = {
      ...essay,
      status: "To read",
      firstPassStartedAt: undefined,
      firstPassCompletedAt: undefined,
      firstPassSeconds: undefined,
      secondPassStartedAt: undefined,
      secondPassCompletedAt: undefined,
      secondPassSeconds: undefined,
      secondPassStep: 0,
      reflectionStartedAt: undefined,
      reflectionCompletedAt: undefined,
      reflectionSeconds: undefined,
      // Keep saved marks, reflections, and the existing criticism-unlock record.
    };

    updateEssay(updated);
    setEssays((current) =>
      current.map((item) => item.id === updated.id ? updated : item),
    );
  }

  function handleDeleteEssay(essay: Essay) {
    const confirmed = window.confirm(
      `Permanently delete "${essay.title}" and its saved marks and reflections? This cannot be undone.`,
    );
    if (!confirmed) return;

    const remaining = essays.filter((item) => item.id !== essay.id);
    try {
      saveEssays(remaining);
      setEssays(remaining);
      if (editingEssayId === essay.id) resetEssayForm();
    } catch {
      window.alert("The essay could not be deleted. Please check browser storage and try again.");
    }
  }

  function getEssayMenuActions(essay: Essay) {
    return [
      {
        label: "Edit essay",
        onSelect: () => startEditingEssay(essay),
      },
      {
        label: "Restart essay",
        onSelect: () => handleRestartEssay(essay),
      },
      {
        label: "Export notes",
        onSelect: () => { void shareEssayNotes(essay); },
      },
      {
        label: "Delete essay",
        destructive: true,
        onSelect: () => handleDeleteEssay(essay),
      },
    ];
  }

  function handleDeleteAllEssays() {
    if (essays.length === 0) return;

    const confirmed = window.confirm(
      `Permanently delete all ${essays.length} essays, including all saved notes, reflections, and progress? This cannot be undone. Export your notes first if you want to keep a copy.`,
    );
    if (!confirmed) return;

    try {
      saveEssays([]);
      setEssays([]);
      if (editingEssayId !== null) resetEssayForm();
    } catch {
      window.alert(
        "The essays could not be deleted. Please check browser storage and try again.",
      );
    }
  }

  function getEssayWorkspaceActions() {
    return [
      {
        label: "Export all notes",
        onSelect: () => { void shareAllEssayNotes(); },
      },
      {
        label: "Delete all essays",
        destructive: true,
        onSelect: handleDeleteAllEssays,
      },
    ];
  }

  function essayNotesMarkdown(essay: Essay): string {
    const markSections = secondPassPrompts.map(
      (prompt) =>
        `### ${prompt.title}\n\n${essay.marks?.[prompt.field]?.trim() || "_No note saved yet._"}`,
    );

    const reflectionSections = [
      ["What happened?", essay.reflection?.whatHappened],
      ["What changed?", essay.reflection?.whatChanged],
      ["Why this ending?", essay.reflection?.whyEnding],
    ].map(
      ([label, value]) =>
        `### ${label}\n\n${value?.trim() || "_No reflection saved yet._"}`,
    );

    return [
      `# ${essay.title}`,
      "",
      `- **Author:** ${essay.author || "Unknown"}`,
      `- **Source:** ${essay.source || "Not specified"}`,
      `- **Status:** ${essay.status}`,
      "",
      "## Second-pass notes",
      "",
      ...markSections,
      "",
      "## Memory reflection",
      "",
      ...reflectionSections,
      "",
      "## Time recorded",
      `- First pass: ${formatDuration(essay.firstPassSeconds ?? 0)}`,
      `- Second pass: ${formatDuration(essay.secondPassSeconds ?? 0)}`,
      `- Reflection: ${formatDuration(essay.reflectionSeconds ?? 0)}`,
      "",
    ].join("\n");
  }

  function downloadMarkdownFile(fileName: string, content: string) {
    const blob = new Blob([content], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function essayNotesFileName(title: string) {
    const slug =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "essay";
    return `${slug}-notes.md`;
  }

  function markdownToPlainText(markdown: string): string {
    return markdown
      .replace(/^\s*---+\s*$/gm, "────────────────────────")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
      .replace(/^\s*-\s+/gm, "• ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function shareEssayNotes(essay: Essay) {
    setExportFeedback("");
    setExportShowManualCopy(false);
    setExportCopyContent("");
    setExportTarget({
      title: `Notes: ${essay.title}`,
      fileName: essayNotesFileName(essay.title),
      content: essayNotesMarkdown(essay),
    });
  }

  function shareAllEssayNotes() {
    if (essays.length === 0) return;
    const content = essays.map(essayNotesMarkdown).join("\n\n---\n\n");
    setExportFeedback("");
    setExportShowManualCopy(false);
    setExportCopyContent("");
    setExportTarget({
      title: "All essay notes",
      fileName: "essay-notes.md",
      content: `# Essay notes\n\n${content}`,
    });
  }

  function openInObsidian() {
    if (!exportTarget) return;

    const noteName = exportTarget.fileName.replace(/\.md$/i, "");
    const baseUri = `obsidian://new?name=${encodeURIComponent(noteName)}`;
    const encodedContent = encodeURIComponent(exportTarget.content);

    // Use Obsidian's direct content parameter for ordinary-sized notes.
    if (encodedContent.length <= 5000) {
      setExportFeedback("Opening a new Obsidian note with your Markdown.");
      window.open(`${baseUri}&content=${encodedContent}`, "_self");
      return;
    }

    // For long exports, clipboard mode avoids an oversized app URI.
    void (async () => {
      try {
        await navigator.clipboard.writeText(exportTarget.content);
        setExportFeedback("Opening Obsidian with the long note copied.");
        window.open(`${baseUri}&clipboard=true`, "_self");
      } catch {
        setExportCopyContent(exportTarget.content);
        setExportShowManualCopy(true);
        setExportFeedback(
          "Clipboard access is blocked. Copy the notes below, then open Obsidian.",
        );
      }
    })();
  }

  function openGoogleKeep() {
    if (!exportTarget) return;

    const plainText = markdownToPlainText(exportTarget.content);

    // Open Keep directly from this user click, then prepare clean text to paste.
    window.open("https://keep.google.com/", "_blank");

    void (async () => {
      try {
        await navigator.clipboard.writeText(plainText);
        setExportFeedback(
          "Plain-text notes copied. In Google Keep, create a note and paste the text.",
        );
      } catch {
        setExportCopyContent(plainText);
        setExportShowManualCopy(true);
        setExportFeedback(
          "Keep opened. Copy the plain-text notes below into a new note.",
        );
      }
    })();
  }

  async function openInAnotherApp() {
    if (!exportTarget) return;

    const plainText = markdownToPlainText(exportTarget.content);

    if (typeof navigator.share === "function") {
      try {
        // Share plain text so non-Markdown apps don't display Markdown markers.
        await navigator.share({
          title: exportTarget.title,
          text: plainText,
        });
        setExportTarget(null);
        setExportFeedback("");
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    setExportCopyContent(plainText);
    setExportShowManualCopy(true);
    setExportFeedback(
      "This browser has no available app chooser. Copy the plain text below, or download Markdown separately.",
    );
  }

  async function copyExportNotes() {
    if (!exportTarget) return;

    const plainText = markdownToPlainText(exportTarget.content);
    try {
      await navigator.clipboard.writeText(plainText);
      setExportFeedback("Plain-text notes copied. Paste them into your chosen app.");
      setExportShowManualCopy(false);
    } catch {
      setExportCopyContent(plainText);
      setExportShowManualCopy(true);
      setExportFeedback("Select the plain-text notes below and copy them manually.");
    }
  }

  function downloadExportNotes() {
    if (!exportTarget) return;
    // Markdown download remains useful for Obsidian and other Markdown editors.
    downloadMarkdownFile(exportTarget.fileName, exportTarget.content);
    setExportTarget(null);
    setExportFeedback("");
    setExportShowManualCopy(false);
    setExportCopyContent("");
  }

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
    const params = new URLSearchParams(window.location.search);
    const findBookValue = params.get("findBookId");
    const findEssayValue = params.get("findEssayId");

    if (!findBookValue && !findEssayValue) return;
    if (books.length === 0 && essays.length === 0) return;

    if (findBookValue) {
      const id = Number(findBookValue);
      if (!Number.isFinite(id)) return;

      const book = books.find((item) => item.id === id);
      if (!book) return;

      setTab("books");
      setSearchHighlightBookId(book.id);
      setSearchHighlightEssayId(null);
      setCollapsedBookIds((current) => {
        const next = new Set(current);
        next.delete(book.id);
        return next;
      });

      // Keep any existing session running when jumping to a book from search.

      window.history.replaceState({}, "", "/reading");
      window.setTimeout(() => {
        document
          .getElementById(`book-${book.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
      return;
    }

    if (findEssayValue) {
      const id = Number(findEssayValue);
      if (!Number.isFinite(id)) return;

      const essay = essays.find((item) => item.id === id);
      if (!essay) return;

      setTab("essays");
      setSearchHighlightEssayId(essay.id);
      setSearchHighlightBookId(null);
      setCollapsedEssayIds((current) => {
        const next = new Set(current);
        next.delete(essay.id);
        return next;
      });

      // Finding an essay must not start or advance its workflow.
      window.history.replaceState({}, "", "/reading");
      window.setTimeout(() => {
        document
          .getElementById(`essay-${essay.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    }
  }, [books, essays]);

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
        setCollapsedBookIds((current) => {
          const next = new Set(current);
          next.delete(book.id);
          return next;
        });
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
        setCollapsedEssayIds((current) => {
          const next = new Set(current);
          next.delete(essay.id);
          return next;
        });

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

  function shouldToggleReadingCard(target: EventTarget | null) {
    return !(
      target instanceof Element &&
      target.closest(
        "button, input, textarea, select, a, summary, details, label",
      )
    );
  }

  function toggleBookCard(bookId: number) {
    setCollapsedBookIds((current) => {
      const next = new Set(current);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  }

  function toggleEssayCard(essayId: number) {
    setCollapsedEssayIds((current) => {
      const next = new Set(current);
      if (next.has(essayId)) next.delete(essayId);
      else next.add(essayId);
      return next;
    });
  }

  const essaySectionFor = (essay: Essay) =>
    essay.status === "To read"
      ? "To read"
      : essay.status === "Finished"
        ? "Finished"
        : "In progress";

  const orderedEssays = [
    ...essays.filter((essay) => essay.status === "To read"),
    ...essays.filter(
      (essay) => essay.status !== "To read" && essay.status !== "Finished",
    ),
    ...essays.filter((essay) => essay.status === "Finished"),
  ];

  return (
    <main className="min-h-full text-[var(--ink)]">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <header className="mb-5">
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Workspace
          </h1>
        </header>

        <div
          role="group"
          aria-label="Workspace section"
          className="mb-5 grid grid-cols-3 gap-1 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface-soft)] p-1"
        >
          {(["books", "essays", "projects"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={tab === option}
              onClick={() => changeTab(option)}
              className={`min-w-0 rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition ${
                tab === option
                  ? "bg-[var(--primary)] text-white shadow-[0_2px_0_var(--primary-dark)]"
                  : "text-[var(--ink-soft)] hover:bg-[var(--surface)]"
              }`}
            >
              {option === "books" ? "Books" : option === "essays" ? "Essays" : "Projects"}
            </button>
          ))}
        </div>

        {tab === "books" && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-2">
              <div className="min-w-0 rounded-xl bg-[var(--surface)] px-2 py-2">
                <p className="text-[10px] leading-snug text-[var(--ink-soft)] sm:text-xs">Currently reading</p>
                <p className="mt-1 text-base font-bold text-[var(--primary-dark)]">
                  {currentlyReading.length}
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-[var(--surface)] px-2 py-2">
                <p className="text-[10px] leading-snug text-[var(--ink-soft)] sm:text-xs">This week</p>
                <p className="mt-1 whitespace-nowrap text-sm font-bold text-[var(--primary-dark)]">
                  {minutesThisWeek} min
                </p>
              </div>
              <div className="min-w-0 rounded-xl bg-[var(--surface)] px-2 py-2">
                <p className="text-[10px] leading-snug text-[var(--ink-soft)] sm:text-xs">Finished</p>
                <p className="mt-1 text-base font-bold text-[var(--primary-dark)]">
                  {finished.length}
                </p>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-[var(--ink)]">
                Your books
              </h2>

              <button
                type="button"
                onClick={() =>
                  setShowBookForm(
                    true,
                  )
                }
                className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)]"
              >
                + Add book
              </button>
            </div>

            {showBookForm && (
              <form
                ref={bookFormRef}
                onSubmit={
                  handleAddBook
                }
                className="mb-6 rounded-[20px] border-2 border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
              >
                <h2 className="text-lg font-extrabold text-[var(--ink)]">
                  {editingBookId === null ? "Add a book" : "Edit book"}
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
                      className="mt-2 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-4 py-3 text-[var(--ink)]"
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
                      className="mt-2 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-4 py-3 text-[var(--ink)]"
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
                      className="mt-2 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-4 py-3 text-[var(--ink)]"
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
                      className="mt-2 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-4 py-3 text-[var(--ink)]"
                      placeholder="300"
                    />
                  </div>
                </div>

                <div className="mt-5 flex justify-end gap-3">

                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)]"
                  >
                    {editingBookId === null ? "Add book" : "Save changes"}
                  </button>
                </div>
              </form>
            )}

            <section className="mb-6">
              <h2 className="mb-2 text-base font-semibold text-[var(--ink)]">
                Currently reading
              </h2>

              <div className="space-y-3">
                {currentlyReading.map(
                  (book) => {
                    const progress = book.totalPages > 0
                      ? Math.min(100, Math.max(0, (book.currentPage / book.totalPages) * 100))
                      : 0;

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
                        tabIndex={0}
                        onClick={(event) => {
                          if (shouldToggleReadingCard(event.target)) {
                            router.push(`/reading/book/${book.id}`);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.target === event.currentTarget &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            router.push(`/reading/book/${book.id}`);
                          }
                        }}
                        className={`cursor-pointer rounded-[18px] border-2 border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 ${
                          searchHighlightBookId === book.id
                            ? "ring-2 ring-[var(--accent)]"
                            : ""
                        }`}
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/reading/book/${book.id}`}
                                className="reading-row__title-link line-clamp-2 text-sm font-bold text-[var(--ink)] sm:text-base"
                              >
                                {book.title}
                              </Link>
                              <p className="mt-1 break-words text-xs text-[var(--ink-soft)] sm:text-sm">
                                {book.author} · {book.category} · {book.currentPage}/{book.totalPages} pages
                              </p>
                            </div>
                            <div className="shrink-0">
                              <button
                                type="button"
                                className="reading-row__expand"
                                aria-label={collapsedBookIds.has(book.id) ? `Expand workflow for ${book.title}` : `Collapse workflow for ${book.title}`}
                                aria-expanded={!collapsedBookIds.has(book.id)}
                                title={collapsedBookIds.has(book.id) ? "Expand workflow" : "Collapse workflow"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleBookCard(book.id);
                                }}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 20 20"
                                  width="15"
                                  height="15"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={collapsedBookIds.has(book.id) ? "" : "rotate-180"}
                                >
                                  <path d="m5 7.5 5 5 5-5" />
                                </svg>
                              </button>
                              <CardMenu
                                title={`Actions for ${book.title}`}
                                actions={getBookMenuActions(book)}
                              />
                            </div>
                          </div>

                          {!collapsedBookIds.has(book.id) && (
                            <>
                          <div>
                            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]">
                              <div
                                className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
                                style={{
                                  width: `${progress}%`,
                                }}
                              />
                            </div>

                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {Math.round(
                                progress,
                              )}
                              % complete
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            {active ? (
                              <>
                                <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 font-mono text-sm font-bold text-[var(--ink)]">
                                  {formatDuration(
                                    bookSeconds,
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={
                                    stopReading
                                  }
                                  className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)]"
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
                                className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)]"
                              >
                                Start reading
                              </button>
                            )}

                            <details
                              className="relative"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <summary className="cursor-pointer list-none py-2 text-sm font-bold text-[var(--primary-dark)] underline underline-offset-2">
                                Edit pages
                              </summary>
                              <div className="mt-1 flex items-center gap-2">
                                <label htmlFor={`book-page-${book.id}`} className="text-xs font-bold text-[var(--muted)]">
                                  Page
                                </label>
                                <input
                                  id={`book-page-${book.id}`}
                                  type="number"
                                  min="0"
                                  max={book.totalPages}
                                  value={book.currentPage}
                                  onChange={(event) =>
                                    updateProgress(book, Number(event.target.value))
                                  }
                                  className="min-h-9 w-20 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 text-sm font-bold text-[var(--ink)]"
                                />
                              </div>
                            </details>
                          </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-base font-semibold text-[var(--ink)]">
                Want to read
              </h2>

              <div className="space-y-3">
                {wantToRead.map(
                  (book) => (
                    <div
                      key={book.id}
                      id={`book-${book.id}`}
                      tabIndex={0}
                      onClick={(event) => {
                        if (shouldToggleReadingCard(event.target)) {
                          router.push(`/reading/book/${book.id}`);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.target === event.currentTarget &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          router.push(`/reading/book/${book.id}`);
                        }
                      }}
                      className={`cursor-pointer flex items-center justify-between gap-3 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-3 ${
                        searchHighlightBookId === book.id
                          ? "ring-2 ring-[var(--accent)]"
                          : ""
                      }`}
                    >
                      <div>
                        <Link
                          href={`/reading/book/${book.id}`}
                          className="reading-row__title-link font-medium"
                        >
                          {book.title}
                        </Link>

                        {!collapsedBookIds.has(book.id) && (
                          <p className="mt-1 text-sm text-[var(--ink-soft)]">
                            {book.author} · {book.category}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {!collapsedBookIds.has(book.id) && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = { ...book, status: "Reading" as const };
                              updateBook(updated);
                              setBooks((current) =>
                                current.map((item) => item.id === book.id ? updated : item),
                              );
                            }}
                            className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)]"
                          >
                            Start
                          </button>
                        )}

                        <button
                          type="button"
                          className="reading-row__expand"
                          aria-label={collapsedBookIds.has(book.id) ? `Expand workflow for ${book.title}` : `Collapse workflow for ${book.title}`}
                          aria-expanded={!collapsedBookIds.has(book.id)}
                          title={collapsedBookIds.has(book.id) ? "Expand workflow" : "Collapse workflow"}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleBookCard(book.id);
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            width="15"
                            height="15"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={collapsedBookIds.has(book.id) ? "" : "rotate-180"}
                          >
                            <path d="m5 7.5 5 5 5-5" />
                          </svg>
                        </button>
                        <CardMenu
                          title={`Actions for ${book.title}`}
                          actions={getBookMenuActions(book)}
                        />
                      </div>
                    </div>
                  ),
                )}
              </div>
            </section>
            {finished.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-5 text-xl font-extrabold text-[var(--ink)]">Finished</h2>
                <div className="space-y-3">
                  {finished.map((book) => (
                    <article
                      key={book.id}
                      id={`book-${book.id}`}
                      tabIndex={0}
                      onClick={(event) => {
                        if (shouldToggleReadingCard(event.target)) {
                          router.push(`/reading/book/${book.id}`);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.target === event.currentTarget &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          router.push(`/reading/book/${book.id}`);
                        }
                      }}
                      className={`cursor-pointer rounded-[18px] border-2 border-[var(--border)] bg-[var(--surface)] p-4 ${
                        searchHighlightBookId === book.id
                          ? "ring-2 ring-[var(--accent)]"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/reading/book/${book.id}`}
                            className="reading-row__title-link font-semibold text-[var(--ink)]"
                          >
                            {book.title}
                          </Link>
                          {!collapsedBookIds.has(book.id) && (
                            <p className="mt-1 text-sm text-[var(--ink-soft)]">
                              {book.author} · {book.totalPages} pages · Finished
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">

                          <button
                            type="button"
                            className="reading-row__expand"
                            aria-label={collapsedBookIds.has(book.id) ? `Expand workflow for ${book.title}` : `Collapse workflow for ${book.title}`}
                            aria-expanded={!collapsedBookIds.has(book.id)}
                            title={collapsedBookIds.has(book.id) ? "Expand workflow" : "Collapse workflow"}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleBookCard(book.id);
                            }}
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 20 20"
                              width="15"
                              height="15"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={collapsedBookIds.has(book.id) ? "" : "rotate-180"}
                            >
                              <path d="m5 7.5 5 5 5-5" />
                            </svg>
                          </button>
                          <CardMenu
                            title={`Actions for ${book.title}`}
                            actions={getBookMenuActions(book)}
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {tab === "essays" && (
          <>
            <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">Essay practice</h2>
                <div className="flex shrink-0 items-center gap-1.5">
                  {essays.length > 0 && (
                    <CardMenu
                      title="Essay workspace actions"
                      actions={getEssayWorkspaceActions()}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setShowEssayForm(true)}
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--primary-dark)] bg-[var(--primary)] px-2.5 py-1 text-xs font-semibold text-white shadow-[0_2px_0_var(--primary-dark)]"
                  >
                    Add essay
                  </button>
                </div>
              </div>
              <details className="mt-2 rounded-lg bg-[var(--surface-soft)] px-2.5 py-2">
                <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--primary-dark)]">How to read essays</summary>
                <p className="mt-2 text-xs leading-relaxed text-[var(--ink-soft)]">
                  Read once straight through without analyzing. On the second pass, notice structural turns, rhythm and essential sentences. Reflect from memory, then write criticism that tests your interpretation.
                </p>
              </details>
              <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-medium text-[var(--ink-soft)] sm:text-xs">
                <span>First pass</span><span aria-hidden="true">›</span>
                <span>Second pass</span><span aria-hidden="true">›</span>
                <span>Memory reflection</span><span aria-hidden="true">›</span>
                <span>Criticism</span>
              </div>
            </div>

            {showEssayForm && (
              <form
                ref={essayFormRef}
                onSubmit={
                  handleAddEssay
                }
                className="mb-6 rounded-[20px] border-2 border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
              >
                <h2 className="text-xl font-extrabold text-[var(--ink)]">
                  {editingEssayId === null ? "Add an essay" : "Edit essay"}
                </h2>

                <div className="mt-5 space-y-5">
                  <div className="min-w-0 flex-1">
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
                      className="mt-2 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-4 py-3 text-[var(--ink)]"
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
                      className="mt-2 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-4 py-3 text-[var(--ink)]"
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
                      className="mt-2 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] px-4 py-3 text-[var(--ink)]"
                      placeholder="Book, journal, website, etc."
                    />
                  </div>
                </div>

                <div className="mt-5 flex justify-end gap-3">

                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)]"
                  >
                    {editingEssayId === null ? "Add essay" : "Save changes"}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {essays.length ===
              0 ? (
                <div className="rounded-[20px] border-2 border-dashed border-[var(--border)] bg-[var(--surface)] p-8 text-center">
                  <p className="font-medium">
                    No essays yet
                  </p>

                  <p className="mt-2 text-sm text-[var(--ink-soft)]">
                    Add your first essay
                    to begin the reading
                    method.
                  </p>
                </div>
              ) : (
                orderedEssays.map(
                  (essay, essayIndex) => {
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

                    const essaySection = essaySectionFor(essay);
                    const previousEssaySection =
                      essayIndex > 0
                        ? essaySectionFor(orderedEssays[essayIndex - 1])
                        : null;

                    return (
                      <div
                        key={`essay-entry-${essay.id}`}
                        className="space-y-4"
                      >
                        {essaySection !== previousEssaySection && (
                          <h2 className="text-xl font-extrabold text-[var(--ink)]">
                            {essaySection}
                          </h2>
                        )}
                      <article
                        id={`essay-${essay.id}`}
                        tabIndex={0}
                        onClick={(event) => {
                          if (shouldToggleReadingCard(event.target)) {
                            router.push(`/reading/essay/${essay.id}`);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.target === event.currentTarget &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            router.push(`/reading/essay/${essay.id}`);
                          }
                        }}
                        className={`cursor-pointer rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4 ${
                          searchHighlightEssayId === essay.id
                            ? "ring-2 ring-[var(--accent)]"
                            : ""
                        }`}
                      >
                        <div className="flex flex-col gap-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-[var(--ink)]">
                                  <Link
                                    href={`/reading/essay/${essay.id}`}
                                    className="reading-row__title-link"
                                  >
                                    {essay.title}
                                  </Link>
                                </h2>
                                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1 text-xs font-bold text-[var(--ink-soft)]">
                                  {essay.status}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-[var(--ink-soft)]">
                                {essay.author}
                                {essay.source ? ` · ${essay.source}` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                className="reading-row__expand"
                                aria-label={collapsedEssayIds.has(essay.id) ? `Expand workflow for ${essay.title}` : `Collapse workflow for ${essay.title}`}
                                aria-expanded={!collapsedEssayIds.has(essay.id)}
                                title={collapsedEssayIds.has(essay.id) ? "Expand workflow" : "Collapse workflow"}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleEssayCard(essay.id);
                                }}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 20 20"
                                  width="15"
                                  height="15"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={collapsedEssayIds.has(essay.id) ? "" : "rotate-180"}
                                >
                                  <path d="m5 7.5 5 5 5-5" />
                                </svg>
                              </button>
                              <CardMenu
                                title={`Actions for ${essay.title}`}
                                actions={getEssayMenuActions(essay)}
                              />

                            </div>
                          </div>

                          {!collapsedEssayIds.has(essay.id) && (
                          <>
                          {essay.status ===
                            "To read" && (
                            <div className="rounded-[18px] border-2 border-[var(--border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="font-medium">
                                    First pass
                                  </p>

                                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
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

                                <span className="text-sm text-[var(--ink-soft)]">
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
                                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)]"
                              >
                                Start first
                                pass
                              </button>
                            </div>
                          )}

                          {essay.status ===
                            "First pass" && (
                            <div className="rounded-[18px] border-2 border-[var(--border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="font-medium">
                                    First pass
                                  </p>

                                  <p className="mt-1 text-sm text-[var(--ink-soft)]">
                                    No
                                    analysis
                                    yet.
                                    Just
                                    read.
                                  </p>
                                </div>

                                <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm font-bold text-[var(--ink)]">
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
                                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)]"
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
                                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)]"
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
                              <div className="rounded-[18px] border-2 border-[var(--border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <p className="font-medium">
                                      Second
                                      pass
                                    </p>

                                    <p className="mt-1 text-sm text-[var(--ink-soft)]">
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

                                    <p className="font-mono text-xs text-[var(--muted)]">
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
                                    className="mt-3 min-h-32 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm outline-none focus:border-slate-400"
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
                                    className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-extrabold text-[var(--ink)] disabled:opacity-30"
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
                                    className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)] disabled:opacity-40"
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
                            <div className="rounded-[18px] border-2 border-[var(--border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="font-medium">
                                    Memory
                                    reflection
                                  </p>

                                  <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
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

                                <div className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-mono text-sm font-bold text-[var(--ink)]">
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

                                    <span className="text-xs text-[var(--muted)]">
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
                                    className="mt-2 min-h-24 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--ink)]"
                                  />
                                </div>

                                <div>
                                  <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium">
                                      2.
                                      What
                                      changed?
                                    </label>

                                    <span className="text-xs text-[var(--muted)]">
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
                                    className="mt-2 min-h-24 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--ink)]"
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

                                    <span className="text-xs text-[var(--muted)]">
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
                                    className="mt-2 min-h-24 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--ink)]"
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
                                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[var(--primary-dark)] bg-[var(--primary)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Complete
                                reflection
                              </button>

                              {!reflectionComplete && (
                                <p className="mt-3 text-xs text-[var(--muted)]">
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
                            <div className="rounded-[18px] border-2 border-[var(--border)] bg-[var(--surface-soft)] p-4 sm:p-5">
                              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="font-medium">
                                    Reading
                                    process
                                    complete
                                  </p>

                                  <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                                    Your
                                    interpretation
                                    was
                                    recorded
                                    before
                                    outside
                                    criticism.
                                  </p>
                                </div>

                                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-bold text-[var(--ink-soft)]">
                                  Criticism
                                  unlocked
                                </span>
                              </div>

                              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-[16px] border-2 border-[var(--border)] bg-[var(--surface)] p-4">
                                  <p className="text-xs text-[var(--muted)]">
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

                                <div className="rounded-[16px] border-2 border-[var(--border)] bg-[var(--surface)] p-4">
                                  <p className="text-xs text-[var(--muted)]">
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

                                <div className="rounded-[16px] border-2 border-[var(--border)] bg-[var(--surface)] p-4">
                                  <p className="text-xs text-[var(--muted)]">
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
                          <details className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-soft)] p-4">
                            <summary className="cursor-pointer font-extrabold text-[var(--ink)]">
                              View saved notes & reflection
                            </summary>
                            <div className="mt-4 space-y-5">
                              <section>
                                <h3 className="font-bold text-[var(--ink)]">
                                  Second-pass notes
                                </h3>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  {secondPassPrompts.map((prompt) => (
                                    <div
                                      key={prompt.field}
                                      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                                    >
                                      <p className="font-semibold text-[var(--ink)]">
                                        {prompt.title}
                                      </p>
                                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-soft)]">
                                        {essay.marks?.[prompt.field]?.trim() || "No note saved yet."}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </section>

                              <section>
                                <h3 className="font-bold text-[var(--ink)]">
                                  Memory reflection
                                </h3>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  {[
                                    {
                                      title: "What happened?",
                                      value: essay.reflection?.whatHappened,
                                    },
                                    {
                                      title: "What changed?",
                                      value: essay.reflection?.whatChanged,
                                    },
                                    {
                                      title: "Why this ending?",
                                      value: essay.reflection?.whyEnding,
                                    },
                                  ].map((item) => (
                                    <div
                                      key={item.title}
                                      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                                    >
                                      <p className="font-semibold text-[var(--ink)]">
                                        {item.title}
                                      </p>
                                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ink-soft)]">
                                        {item.value?.trim() || "No reflection saved yet."}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </section>

                              <button
                                type="button"
                                onClick={() => { void shareEssayNotes(essay); }}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-bold text-[var(--ink)]"
                              >
                                <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M12 15V3" />
                                  <path d="m7 8 5-5 5 5" />
                                  <path d="M5 12v8h14v-8" />
                                </svg>
                                Share notes with another app
                              </button>
                            </div>
                          </details>
                          </>
                          )}
                        </div>
                      </article>
                      </div>
                    );
                  },
                )
              )}
            </div>
          </>
        )}
        {tab === "projects" && <ProjectsPanel embedded />}
      </div>

      {exportTarget && (
        <div
          className="fixed inset-0 z-[130] grid place-items-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setExportTarget(null);
              setExportFeedback("");
              setExportShowManualCopy(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="essay-export-heading"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="essay-export-heading" className="text-xl font-extrabold text-[var(--ink)]">
                  Export notes
                </h2>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  {exportTarget.title}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg px-3 py-1 text-xl font-bold text-[var(--ink)]"
                aria-label="Close export options"
                onClick={() => {
                  setExportTarget(null);
                  setExportFeedback("");
                  setExportShowManualCopy(false);
                }}
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void openInObsidian()}
                className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-left font-bold text-[var(--ink)]"
              >
                Open in Obsidian
              </button>
              <button
                type="button"
                onClick={() => void openGoogleKeep()}
                className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-left font-bold text-[var(--ink)]"
              >
                Open Google Keep
              </button>
              <button
                type="button"
                onClick={() => void openInAnotherApp()}
                className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-left font-bold text-[var(--ink)]"
              >
                Open in another app
              </button>
              <button
                type="button"
                onClick={() => void copyExportNotes()}
                className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left font-bold text-[var(--ink)]"
              >
                Copy notes
              </button>
              <button
                type="button"
                onClick={downloadExportNotes}
                className="rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left font-bold text-[var(--ink)] sm:col-span-2"
              >
                Download Markdown
              </button>
            </div>

            {exportFeedback && (
              <p role="status" className="mt-4 rounded-xl bg-[var(--surface-soft)] p-3 text-sm text-[var(--ink)]">
                {exportFeedback}
              </p>
            )}

            {exportShowManualCopy && (
              <div className="mt-3">
                <label htmlFor="essay-export-copy" className="mb-2 block text-sm font-bold text-[var(--ink)]">
                  Notes to copy
                </label>
                <textarea
                  id="essay-export-copy"
                  readOnly
                  rows={7}
                  value={exportCopyContent || exportTarget.content}
                  onFocus={(event) => event.currentTarget.select()}
                  className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--background)] p-3 text-sm text-[var(--ink)]"
                />
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}