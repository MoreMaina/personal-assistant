import { readStoredJson } from "./storageRecovery";

export type ReadingMethod =
  | "Novel / narrative nonfiction"
  | "Practical nonfiction"
  | "Philosophy / theory"
  | "Technical / skill-building"
  | "Poetry / literary work"
  | "Other";

export type ChapterReflection = {
  id: string;
  section: string;
  centralPoint: string;
  development: string;
  questions: string;
  updatedAt: string;
};

export type WholeBookReconstruction = {
  about: string;
  doing: string;
  development: string;
  changed: string;
  updatedAt?: string;
};

export type SecondPassSection = {
  id: string;
  section: string;
  reason: string;
  notes: string;
  completed: boolean;
  updatedAt: string;
};

export type ReadingApplication = {
  idea: string;
  experiment: string;
  result: string;
  updatedAt?: string;
};

export type ReadingDecision =
  | "Continue reading"
  | "Revisit difficult sections"
  | "Read selectively"
  | "Apply an idea"
  | "Stop — purpose fulfilled"
  | "Stop — not enough value";

export type BookWorkflowStep =
  | "purpose"
  | "first_pass"
  | "reconstruction"
  | "second_pass"
  | "application";

export type EssayWorkflowStep =
  | "first_pass"
  | "second_pass_turns"
  | "second_pass_rhythm"
  | "second_pass_essential_sentences"
  | "second_pass_ending"
  | "reflection_what_happened"
  | "reflection_what_changed"
  | "reflection_why_ending"
  | "criticism";

export type Book = {
  id: number;
  title: string;
  author: string;
  category: "Pleasure" | "Course";
  totalPages: number;
  currentPage: number;
  status: "Reading" | "Want to read" | "Finished";

  // Optional reading-framework data preserves compatibility with existing books.
  readingPurpose?: string;
  readingMethod?: ReadingMethod;
  chapterReflections?: ChapterReflection[];
  wholeBookReconstruction?: WholeBookReconstruction;
  secondPassSections?: SecondPassSection[];
  readingApplication?: ReadingApplication;
  readingDecision?: ReadingDecision;

  // Optional explicit workflow markers; older records remain compatible.
  workflowCompletedSteps?: BookWorkflowStep[];
  workflowSkippedSteps?: BookWorkflowStep[];
};

export type ReadingSession = {
  id: number;
  bookId: number;
  startedAt: string;
  endedAt: string;
  minutes: number;
};

export type EssayStatus =
  | "To read"
  | "First pass"
  | "Second pass"
  | "Reflection"
  | "Finished";

export type EssayMarks = {
  turns: string;
  rhythm: string;
  essentialSentences: string;
  ending: string;
};

export type EssayReflection = {
  whatHappened: string;
  whatChanged: string;
  whyEnding: string;
};

export type Essay = {
  id: number;
  title: string;
  author: string;
  source: string;

  status: EssayStatus;

  firstPassStartedAt?: string;
  firstPassCompletedAt?: string;
  firstPassSeconds?: number;

  secondPassStartedAt?: string;
  secondPassCompletedAt?: string;
  secondPassSeconds?: number;

  secondPassStep?: number;

  reflectionStartedAt?: string;
  reflectionCompletedAt?: string;
  reflectionSeconds?: number;

  marks: EssayMarks;
  reflection: EssayReflection;

  criticismUnlockedAt?: string;

  // Optional explicit step markers preserve sequential progress.
  workflowCompletedSteps?: EssayWorkflowStep[];
  criticismNotes?: string;
  criticismCompletedAt?: string;
};

function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isBookArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isObjectRecord(item) &&
        typeof item.id === "number" &&
        typeof item.title === "string" &&
        typeof item.author === "string",
    )
  );
}

function isSessionArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isObjectRecord(item) &&
        typeof item.id === "number" &&
        typeof item.bookId === "number",
    )
  );
}

function isEssayArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isObjectRecord(item) &&
        typeof item.id === "number" &&
        typeof item.title === "string" &&
        typeof item.author === "string",
    )
  );
}

const BOOKS_KEY = "personal-assistant-books";
const SESSIONS_KEY = "personal-assistant-reading-sessions";
const ESSAYS_KEY = "personal-assistant-essays";

const defaultBooks: Book[] = [
  {
    id: 1,
    title: "The Master and His Emissary",
    author: "Iain McGilchrist",
    category: "Pleasure",
    totalPages: 608,
    currentPage: 365,
    status: "Reading",
  },
];

export function getBooks(): Book[] {
  if (typeof window === "undefined") {
    return defaultBooks;
  }

  const saved = localStorage.getItem(BOOKS_KEY);
  if (!saved) {
    return defaultBooks;
  }

  return readStoredJson<Book[]>(
    BOOKS_KEY,
    saved,
    defaultBooks,
    isBookArray,
  );
}

export function saveBooks(books: Book[]) {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
}

export function addBook(
  book: Omit<Book, "id" | "status" | "currentPage">,
) {
  const books = getBooks();

  const newBook: Book = {
    ...book,
    id: Date.now(),
    currentPage: 0,
    status: "Want to read",
    workflowCompletedSteps: [],
    workflowSkippedSteps: [],
  };

  saveBooks([...books, newBook]);

  return newBook;
}

export function updateBook(updatedBook: Book) {
  const books = getBooks();

  saveBooks(
    books.map((book) =>
      book.id === updatedBook.id ? updatedBook : book,
    ),
  );
}

export function deleteBookAndSessions(bookId: number) {
  saveBooks(getBooks().filter((book) => book.id !== bookId));

  const sessions = getReadingSessions().filter(
    (session) => session.bookId !== bookId,
  );

  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  return sessions;
}

export function getReadingSessions(): ReadingSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  const saved = localStorage.getItem(SESSIONS_KEY);
  if (!saved) {
    return [];
  }

  return readStoredJson<ReadingSession[]>(
    SESSIONS_KEY,
    saved,
    [],
    isSessionArray,
  );
}

export function saveReadingSession(
  session: Omit<ReadingSession, "id">,
) {
  const sessions = getReadingSessions();

  const newSession: ReadingSession = {
    ...session,
    id: Date.now(),
  };

  localStorage.setItem(
    SESSIONS_KEY,
    JSON.stringify([...sessions, newSession]),
  );

  return newSession;
}

export function getEssays(): Essay[] {
  if (typeof window === "undefined") {
    return [];
  }

  const saved = localStorage.getItem(ESSAYS_KEY);
  if (!saved) {
    return [];
  }

  return readStoredJson<Essay[]>(
    ESSAYS_KEY,
    saved,
    [],
    isEssayArray,
  );
}

export function saveEssays(essays: Essay[]) {
  localStorage.setItem(ESSAYS_KEY, JSON.stringify(essays));
}

export function addEssay(
  essay: Pick<Essay, "title" | "author" | "source">,
) {
  const essays = getEssays();

  const newEssay: Essay = {
    ...essay,
    id: Date.now(),
    status: "To read",

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

    secondPassStep: 0,
    workflowCompletedSteps: [],
  };
  
  saveEssays([...essays, newEssay]);

  return newEssay;
}

export function updateEssay(essay: Essay) {
  const essays = getEssays();

  saveEssays(
    essays.map((item) =>
      item.id === essay.id ? essay : item,
    ),
  );
}
