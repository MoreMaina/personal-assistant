"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { getClasses } from "@/lib/classStorage";
import { getCalendarItems } from "@/lib/calendarItemStorage";
import { getProjects } from "@/lib/projectStorage";
import {
  getBooks,
  getEssays,
} from "@/lib/readingStorage";
import {
  getCourses,
  getLectures,
  getUnits,
} from "@/lib/studyStorage";
import {
  filterGlobalSearchRecords,
  type GlobalSearchRecord,
} from "@/lib/globalSearch";

export const OPEN_GLOBAL_SEARCH_EVENT =
  "personal-assistant:open-global-search";

function buildIndex(): GlobalSearchRecord[] {
  const records: GlobalSearchRecord[] = [];

  function add(
    key: string,
    category: string,
    title: string,
    detail: string,
    href: string,
    extra = "",
  ) {
    records.push({
      key,
      category,
      title,
      detail,
      href,
      searchableText: `${title} ${category} ${detail} ${extra}`,
    });
  }

  for (const project of getProjects()) {
    add(
      `project-${project.id}`,
      "Project",
      project.name,
      `${project.status} · ${project.importance} importance · ${project.purpose} · Next: ${project.nextAction}`,
      `/projects?projectId=${project.id}`,
      `${project.context} ${project.energy} ${project.deadline ?? ""}`,
    );
  }

  for (const book of getBooks()) {
    add(
      `book-${book.id}`,
      "Book",
      book.title,
      `${book.author} · ${book.status} · ${book.currentPage}/${book.totalPages} pages`,
      `/reading?findBookId=${book.id}`,
      book.category,
    );
  }

  for (const essay of getEssays()) {
    add(
      `essay-${essay.id}`,
      "Essay",
      essay.title,
      `${essay.author} · ${essay.status} · ${essay.source}`,
      `/reading?findEssayId=${essay.id}`,
      `${essay.marks.turns} ${essay.marks.rhythm} ${essay.marks.essentialSentences} ${essay.marks.ending}`,
    );
  }

  const courses = getCourses();
  const units = getUnits();
  const lectures = getLectures();
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));

  for (const lecture of lectures) {
    const unit = unitById.get(lecture.unitId);
    const course = unit ? courseById.get(unit.courseId) : undefined;
    const context = `${course?.name ?? "Course"} · ${unit?.name ?? "Unit"}`;

    add(
      `lecture-${lecture.id}`,
      "Study lecture",
      lecture.name,
      `${context} · Review box ${lecture.box} · ${lecture.reviewCount} reviews`,
      `/study/manage?findLectureId=${lecture.id}`,
      `${lecture.lastRating ?? ""} ${lecture.nextReviewAt}`,
    );
  }

  for (const item of getCalendarItems()) {
    if (item.type === "event") {
      add(
        `calendar-event-${item.id}`,
        "Calendar event",
        item.title,
        `${item.date} · ${item.startTime ?? "Time not set"} · ${item.location ?? ""}`,
        `/classes?findCalendarItemId=${encodeURIComponent(item.id)}`,
        `${item.notes ?? ""} ${item.recurrence ? "recurring" : ""}`,
      );
    } else {
      add(
        `calendar-task-${item.id}`,
        "Calendar task",
        item.title,
        `${item.completed ? "Completed" : "Not completed"} · ${item.priority} priority · ${item.dueDate ?? "No due date"}`,
        `/classes?findCalendarItemId=${encodeURIComponent(item.id)}`,
        `${item.notes ?? ""} ${item.recurrence ? "recurring" : ""}`,
      );
    }
  }

  for (const item of getClasses()) {
    add(
      `class-${item.id}`,
      "Scheduled class",
      item.name,
      `${item.day} · ${item.start}–${item.end} · ${item.type}`,
      `/classes?findClassId=${item.id}`,
    );
  }

  return records;
}

export default function GlobalSearch({
  showTrigger = true,
}: {
  showTrigger?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<GlobalSearchRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [indexError, setIndexError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const results = useMemo(
    () => filterGlobalSearchRecords(records, query),
    [records, query],
  );

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (pathname === "/login") return;

      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setOpen(true);
      }

      if (open && event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [open, pathname]);

  useEffect(() => {
    function handleExternalOpen() {
      if (pathname !== "/login") {
        setOpen(true);
      }
    }

    window.addEventListener(
      OPEN_GLOBAL_SEARCH_EVENT,
      handleExternalOpen,
    );

    return () => {
      window.removeEventListener(
        OPEN_GLOBAL_SEARCH_EVENT,
        handleExternalOpen,
      );
    };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    setQuery("");
    setActiveIndex(0);
    setIndexError("");

    try {
      setRecords(buildIndex());
    } catch (error) {
      console.error("Global search could not read app records:", error);
      setRecords([]);
      setIndexError(
        "Some local records could not be read safely. Check Backup & Recovery before retrying.",
      );
    }

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function closeSearch() {
    setOpen(false);
  }

  if (pathname === "/login") {
    return null;
  }

  return (
    <>
      {showTrigger && (
        <button
          ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search your assistant"
        title="Search your assistant (Ctrl+K or ⌘K)"
        className="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-full border-2 border-[var(--border)] bg-[var(--surface)] font-extrabold text-[var(--primary)] transition hover:-translate-y-0.5 sm:w-auto sm:px-3"
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 5 5" />
        </svg>
        <span className="hidden sm:inline">Search</span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[200] overflow-y-auto bg-black/45 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSearch();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-search-title"
            className="mx-auto mt-[6vh] w-full max-w-2xl rounded-2xl border-2 border-[var(--primary-dark)] bg-[var(--surface)] p-4 shadow-2xl sm:p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="global-search-title" className="text-xl font-extrabold">
                Search your assistant
              </h2>
              <button
                type="button"
                onClick={closeSearch}
                className="min-h-10 min-w-10 rounded-full border-2 border-[var(--border)] font-extrabold"
                aria-label="Close search"
              >
                ×
              </button>
            </div>

            <label className="mt-4 block">
              <span className="sr-only">Search projects, books, study and calendar</span>
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="global-search-results"
                aria-activedescendant={
                  results.length > 0
                    ? `global-search-result-${activeIndex}`
                    : undefined
                }
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && results.length > 0) {
                    event.preventDefault();
                    setActiveIndex((current) =>
                      Math.min(current + 1, results.length - 1),
                    );
                  } else if (event.key === "ArrowUp" && results.length > 0) {
                    event.preventDefault();
                    setActiveIndex((current) => Math.max(current - 1, 0));
                  } else if (event.key === "Enter" && results[activeIndex]) {
                    event.preventDefault();
                    resultRefs.current[activeIndex]?.click();
                  }
                }}
                placeholder="Search projects, books, essays, lectures, events..."
                className="mt-1 min-h-12 w-full rounded-xl border-2 border-[var(--border)] bg-white px-4 py-3 text-base outline-none focus:border-[var(--primary)]"
              />
            </label>

            <p className="mt-2 text-xs font-bold text-[var(--muted)]">
              Search is read-only. Selecting a result takes you to the record without editing it.
            </p>

            {indexError && (
              <p role="alert" className="mt-4 rounded-xl bg-[var(--accent-soft)] p-3 text-sm font-bold text-[var(--accent-dark)]">
                {indexError}
              </p>
            )}

            <div
              id="global-search-results"
              role="listbox"
              aria-label="Search results"
              className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto"
            >
              {query.trim() === "" ? (
                <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-sm font-bold text-[var(--ink-soft)]">
                  Start typing to search your saved records.
                </p>
              ) : results.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--border)] p-5 text-sm font-bold text-[var(--ink-soft)]">
                  No matching records found.
                </p>
              ) : (
                results.map((result, index) => (
                  <Link
                    key={result.key}
                    id={`global-search-result-${index}`}
                    ref={(element) => {
                      resultRefs.current[index] = element;
                    }}
                    role="option"
                    aria-selected={index === activeIndex}
                    href={result.href}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={closeSearch}
                    className={`block rounded-xl border-2 p-3 transition ${
                      index === activeIndex
                        ? "border-[var(--primary-dark)] bg-[var(--primary-soft)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-extrabold text-[var(--ink)]">
                          {result.title}
                        </span>
                        <span className="mt-1 block break-words text-sm text-[var(--ink-soft)]">
                          {result.detail}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-1 text-xs font-extrabold text-[var(--primary)]">
                        {result.category}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>

            <p className="mt-3 text-xs font-bold text-[var(--muted)]">
              ↑ ↓ Navigate results · Enter open · Esc close · Ctrl+K / ⌘K open search
            </p>
          </section>
        </div>
      )}
    </>
  );
}
