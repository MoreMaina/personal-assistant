
import type {
  Book,
  BookWorkflowStep,
  Essay,
  EssayWorkflowStep,
} from "./readingStorage";

function hasMinimumWords(value: string, minimum: number): boolean {
  const words = value.trim()
    ? value.trim().split(/\s+/).length
    : 0;

  return words >= minimum;
}

/**
 * Returns the next incomplete book-workflow step.
 * Existing records are interpreted from their saved progress.
 */
export function getCurrentBookWorkflowStep(
  book: Book,
): BookWorkflowStep | null {
  const completed = new Set(book.workflowCompletedSteps ?? []);
  const skipped = new Set(book.workflowSkippedSteps ?? []);

  const isComplete = (step: BookWorkflowStep) =>
    completed.has(step) || skipped.has(step);

  // Legacy books already started or finished have passed the purpose stage.
  const purposeComplete =
    isComplete("purpose") ||
    book.status !== "Want to read" ||
    Boolean(book.readingPurpose?.trim());

  if (!purposeComplete) {
    return "purpose";
  }

  // A finished status or full page progress means the first pass is complete.
  const firstPassComplete =
    isComplete("first_pass") ||
    book.status === "Finished" ||
    (
      book.totalPages > 0 &&
      book.currentPage >= book.totalPages
    );

  if (!firstPassComplete) {
    return "first_pass";
  }

  const reconstruction = book.wholeBookReconstruction;

  const reconstructionComplete =
    isComplete("reconstruction") ||
    Boolean(
      reconstruction &&
      [
        reconstruction.about,
        reconstruction.doing,
        reconstruction.development,
        reconstruction.changed,
      ].every((value) => value.trim().length > 0),
    );

  if (!reconstructionComplete) {
    return "reconstruction";
  }

  const secondPassSections = book.secondPassSections ?? [];

  // A legacy reading decision indicates the reader already progressed
  // beyond the second-pass stage.
  const secondPassComplete =
    isComplete("second_pass") ||
    Boolean(book.readingDecision) ||
    (
      secondPassSections.length > 0 &&
      secondPassSections.every((section) => section.completed)
    );

  if (!secondPassComplete) {
    return "second_pass";
  }

  const applicationComplete =
    isComplete("application") ||
    Boolean(book.readingDecision);

  if (!applicationComplete) {
    return "application";
  }

  return null;
}

/**
 * Returns the next incomplete essay-workflow step.
 * Each observation and each memory prompt is independently unlocked.
 */
export function getCurrentEssayWorkflowStep(
  essay: Essay,
): EssayWorkflowStep | null {
  const completed = new Set(essay.workflowCompletedSteps ?? []);

  const isComplete = (step: EssayWorkflowStep) =>
    completed.has(step);

  // A completed final stage means all preceding stages are complete.
  if (
    isComplete("criticism") ||
    Boolean(essay.criticismCompletedAt)
  ) {
    return null;
  }

  // Later statuses and timestamps establish first-pass completion
  // for older essays.
  const firstPassComplete =
    isComplete("first_pass") ||
    Boolean(essay.firstPassCompletedAt) ||
    essay.status === "Second pass" ||
    essay.status === "Reflection" ||
    essay.status === "Finished";

  if (!firstPassComplete) {
    return "first_pass";
  }

  const observationSteps: {
    step: EssayWorkflowStep;
    value: string;
  }[] = [
    {
      step: "second_pass_turns",
      value: essay.marks.turns,
    },
    {
      step: "second_pass_rhythm",
      value: essay.marks.rhythm,
    },
    {
      step: "second_pass_essential_sentences",
      value: essay.marks.essentialSentences,
    },
    {
      step: "second_pass_ending",
      value: essay.marks.ending,
    },
  ];

  for (const item of observationSteps) {
    if (!isComplete(item.step) && !item.value.trim()) {
      return item.step;
    }
  }

  const reflectionSteps: {
    step: EssayWorkflowStep;
    value: string;
  }[] = [
    {
      step: "reflection_what_happened",
      value: essay.reflection.whatHappened,
    },
    {
      step: "reflection_what_changed",
      value: essay.reflection.whatChanged,
    },
    {
      step: "reflection_why_ending",
      value: essay.reflection.whyEnding,
    },
  ];

  for (const item of reflectionSteps) {
    if (
      !isComplete(item.step) &&
      !hasMinimumWords(item.value, 5)
    ) {
      return item.step;
    }
  }

  return "criticism";
}
