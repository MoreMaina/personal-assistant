export type Book = {
  id: number;
  title: string;
  author: string;
  category: "Pleasure" | "Course";
  totalPages: number;
  currentPage: number;
  status: "Reading" | "Want to read" | "Finished";
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
};

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

  try {
    return JSON.parse(saved);
  } catch {
    return defaultBooks;
  }
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

export function getReadingSessions(): ReadingSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  const saved = localStorage.getItem(SESSIONS_KEY);

  if (!saved) {
    return [];
  }

  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }
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

  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }
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