import type { PlannedItem, PlanTaskKind } from "./dailyPlanner";
import type { StudyMvpState } from "./types";

type PresentationItem = Pick<
  PlannedItem,
  "kind" | "subject_id" | "review_event_id"
>;

type PresentationState = Pick<
  StudyMvpState,
  "courses" | "units" | "topics" | "assignments" | "review_events"
>;

export interface DailyPlanItemPresentation {
  title: string;
  subtitle: string;
}

const TASK_LABELS: Record<PlanTaskKind, string> = {
  topic_consolidation: "Topic consolidation",
  gate: "Initial learning gate",
  review: "Review",
  assignment: "Assignment",
  corrective: "Corrective work",
  recovery: "Recovery work",
  mixed_practice: "Mixed practice",
  sampler: "Saturday sampler",
};

function courseLabel(
  course: PresentationState["courses"][number] | undefined,
): string | null {
  if (!course) return null;

  const name = course.name.trim();
  const code = course.code.trim();

  if (name && code) return `${name} (${code})`;
  return name || code || null;
}

function topicContext(
  topic: PresentationState["topics"][number],
  state: PresentationState,
): string[] {
  const unit = state.units.find(
    (candidate) => candidate.id === topic.unit_id,
  );
  const course = unit
    ? state.courses.find((candidate) => candidate.id === unit.course_id)
    : undefined;

  return [
    courseLabel(course),
    unit?.name.trim() || null,
  ].filter((value): value is string => Boolean(value));
}

/**
 * Resolves user-facing labels without changing planner IDs or persisted state.
 * Missing references produce readable fallbacks instead of exposing IDs.
 */
export function getDailyPlanItemPresentation(
  item: PresentationItem,
  state: PresentationState,
): DailyPlanItemPresentation {
  const taskLabel = TASK_LABELS[item.kind];

  if (item.kind === "mixed_practice") {
    return {
      title: "Mixed practice",
      subtitle: "Mixed retrieval across active topics",
    };
  }

  if (item.kind === "sampler") {
    return {
      title: "Saturday sampler",
      subtitle: "80-minute sampling block · up to 10 minutes for analysis",
    };
  }

  if (item.kind === "assignment") {
    const assignment = state.assignments.find(
      (candidate) => candidate.id === item.subject_id,
    );

    if (!assignment) {
      return {
        title: "Assignment details unavailable",
        subtitle: taskLabel,
      };
    }

    const course = state.courses.find(
      (candidate) => candidate.id === assignment.course_id,
    );

    return {
      title: assignment.title.trim() || "Untitled assignment",
      subtitle: [
        taskLabel,
        courseLabel(course),
        assignment.due_date ? `Due ${assignment.due_date}` : null,
      ].filter((value): value is string => Boolean(value)).join(" · "),
    };
  }

  const review = item.kind === "review"
    ? state.review_events.find(
        (candidate) =>
          candidate.id === (item.review_event_id ?? item.subject_id),
      )
    : undefined;

  const topicId = review?.topic_id ??
    (item.kind === "review" ? null : item.subject_id);

  const topic = topicId
    ? state.topics.find((candidate) => candidate.id === topicId)
    : undefined;

  if (!topic) {
    if (item.kind === "review") {
      return {
        title: "Review session",
        subtitle: [
          taskLabel,
          review ? `Stage ${review.stage}` : null,
          review ? `Due ${review.current_due_date}` : "Topic details unavailable",
        ].filter((value): value is string => Boolean(value)).join(" · "),
      };
    }

    return {
      title:
        item.kind === "corrective"
          ? "Corrective work"
          : item.kind === "recovery"
            ? "Recovery work"
            : "Topic details unavailable",
      subtitle: taskLabel,
    };
  }

  const subtitleParts = [taskLabel];

  if (review) {
    subtitleParts.push(`Stage ${review.stage}`);
    subtitleParts.push(`Due ${review.current_due_date}`);
  }

  subtitleParts.push(...topicContext(topic, state));

  return {
    title: topic.title.trim() || "Untitled topic",
    subtitle: subtitleParts.join(" · "),
  };
}
