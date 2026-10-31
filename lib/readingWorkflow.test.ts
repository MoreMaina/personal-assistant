
import { describe, expect, it } from "vitest";

import {
  getCurrentBookWorkflowStep,
  getCurrentEssayWorkflowStep,
} from "./readingWorkflow";

import type { Book, Essay } from "./readingStorage";

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 1,
    title: "Test book",
    author: "Test author",
    category: "Pleasure",
    totalPages: 100,
    currentPage: 0,
    status: "Want to read",
    ...overrides,
  };
}

function makeEssay(overrides: Partial<Essay> = {}): Essay {
  return {
    id: 1,
    title: "Test essay",
    author: "Test author",
    source: "",
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
    ...overrides,
  };
}

describe("Reading workflow sequence", () => {
  describe("Book workflow", () => {
    it("starts a new book at purpose", () => {
      expect(
        getCurrentBookWorkflowStep(makeBook()),
      ).toBe("purpose");
    });

    it("moves an existing Reading book to first pass", () => {
      expect(
        getCurrentBookWorkflowStep(
          makeBook({ status: "Reading" }),
        ),
      ).toBe("first_pass");
    });

    it("moves a finished book to reconstruction", () => {
      expect(
        getCurrentBookWorkflowStep(
          makeBook({ status: "Finished" }),
        ),
      ).toBe("reconstruction");
    });

    it("requires all four reconstruction responses", () => {
      const book = makeBook({
        status: "Finished",
        wholeBookReconstruction: {
          about: "About",
          doing: "Doing",
          development: "",
          changed: "Changed",
        },
      });

      expect(getCurrentBookWorkflowStep(book))
        .toBe("reconstruction");
    });

    it("unlocks second pass after reconstruction", () => {
      const book = makeBook({
        status: "Finished",
        wholeBookReconstruction: {
          about: "About",
          doing: "Doing",
          development: "Development",
          changed: "Changed",
        },
      });

      expect(getCurrentBookWorkflowStep(book))
        .toBe("second_pass");
    });

    it("keeps second pass current while a selected section is unfinished", () => {
      const book = makeBook({
        status: "Finished",
        wholeBookReconstruction: {
          about: "About",
          doing: "Doing",
          development: "Development",
          changed: "Changed",
        },
        secondPassSections: [
          {
            id: "section-1",
            section: "Chapter 1",
            reason: "",
            notes: "Reviewed",
            completed: true,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "section-2",
            section: "Chapter 2",
            reason: "",
            notes: "",
            completed: false,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      });

      expect(getCurrentBookWorkflowStep(book))
        .toBe("second_pass");
    });

    it("moves to application after all selected sections are examined", () => {
      const book = makeBook({
        status: "Finished",
        wholeBookReconstruction: {
          about: "About",
          doing: "Doing",
          development: "Development",
          changed: "Changed",
        },
        secondPassSections: [
          {
            id: "section-1",
            section: "Chapter 1",
            reason: "",
            notes: "Reviewed",
            completed: true,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      });

      expect(getCurrentBookWorkflowStep(book))
        .toBe("application");
    });

    it("allows an explicitly skipped optional second pass", () => {
      const book = makeBook({
        status: "Finished",
        wholeBookReconstruction: {
          about: "About",
          doing: "Doing",
          development: "Development",
          changed: "Changed",
        },
        workflowSkippedSteps: ["second_pass"],
      });

      expect(getCurrentBookWorkflowStep(book))
        .toBe("application");
    });

    it("recognises an existing reading decision as completion", () => {
      const book = makeBook({
        status: "Finished",
        wholeBookReconstruction: {
          about: "About",
          doing: "Doing",
          development: "Development",
          changed: "Changed",
        },
        readingDecision: "Continue reading",
      });

      expect(getCurrentBookWorkflowStep(book)).toBeNull();
    });
  });

  describe("Essay workflow", () => {
    it("starts at first pass", () => {
      expect(
        getCurrentEssayWorkflowStep(makeEssay()),
      ).toBe("first_pass");
    });

    it("unlocks the first observation after first-pass completion", () => {
      const essay = makeEssay({
        firstPassCompletedAt: "2026-01-01T00:00:00.000Z",
      });

      expect(getCurrentEssayWorkflowStep(essay))
        .toBe("second_pass_turns");
    });

    it("unlocks observations in sequence", () => {
      const essay = makeEssay({
        firstPassCompletedAt: "2026-01-01T00:00:00.000Z",
        marks: {
          turns: "The main turning point",
          rhythm: "",
          essentialSentences: "",
          ending: "",
        },
      });

      expect(getCurrentEssayWorkflowStep(essay))
        .toBe("second_pass_rhythm");
    });

    it("unlocks memory reflection after all four observations", () => {
      const essay = makeEssay({
        firstPassCompletedAt: "2026-01-01T00:00:00.000Z",
        marks: {
          turns: "Turning point",
          rhythm: "Rhythm",
          essentialSentences: "Essential sentences",
          ending: "Ending",
        },
      });

      expect(getCurrentEssayWorkflowStep(essay))
        .toBe("reflection_what_happened");
    });

    it("requires five words for each memory response", () => {
      const essay = makeEssay({
        firstPassCompletedAt: "2026-01-01T00:00:00.000Z",
        marks: {
          turns: "Turning point",
          rhythm: "Rhythm",
          essentialSentences: "Essential sentences",
          ending: "Ending",
        },
        reflection: {
          whatHappened: "This is five words here",
          whatChanged: "Only four words here",
          whyEnding: "",
        },
      });

      expect(getCurrentEssayWorkflowStep(essay))
        .toBe("reflection_what_changed");
    });

    it("unlocks criticism after all memory responses", () => {
      const essay = makeEssay({
        status: "Finished",
        reflectionCompletedAt: "2026-01-01T00:00:00.000Z",
        firstPassCompletedAt: "2026-01-01T00:00:00.000Z",
        marks: {
          turns: "Turning point",
          rhythm: "Rhythm",
          essentialSentences: "Essential sentences",
          ending: "Ending",
        },
        reflection: {
          whatHappened: "This is five words here",
          whatChanged: "This has five words too",
          whyEnding: "The ending changes everything profoundly",
        },
      });

      expect(getCurrentEssayWorkflowStep(essay))
        .toBe("criticism");
    });

    it("recognises completed criticism", () => {
      const essay = makeEssay({
        criticismCompletedAt: "2026-01-01T00:00:00.000Z",
      });

      expect(getCurrentEssayWorkflowStep(essay))
        .toBeNull();
    });
  });
});
