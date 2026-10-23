import { createPlanningDecisionEvents } from "./dailyPlanner";
import { nextStudyDayAfter } from "./reviewEngine";
import { assertStudyStateIntegrity } from "./storage";

import type {
  DailyPlan,
} from "./dailyPlanner";

import type {
  StudyMvpState,
  TaskEvent,
} from "./types";

export interface ApplyDailyPlanDecisionsResult {
  state: StudyMvpState;
  emittedEvents: TaskEvent[];
  duplicate: boolean;
}

/**
 * Persist the decisions for a fully resolved daily plan.
 *
 * A deterministic TaskEvent identity makes replaying the same plan
 * idempotent. Operational ReviewEvent/Topic fields are changed only when
 * a new decision event is emitted. Immutable attempt history is untouched.
 *
 * This records planning decisions; it does not convert an allocated time
 * block into evidence of a completed review, gate, or work session.
 */
export function applyDailyPlanDecisions(
  state: StudyMvpState,
  plan: DailyPlan,
  options: {
    loggedAt?: string;
  } = {},
): ApplyDailyPlanDecisionsResult {
  if (!plan.can_finalize) {
    throw new Error(
      plan.unresolved_decisions.length > 0
        ? `Resolve these planning decisions before saving: ${plan.unresolved_decisions.join(", ")}.`
        : "The daily plan cannot be finalized while it contains unresolved or conflicting items.",
    );
  }

  if (plan.has_silent_drops || plan.has_conflicting_dispositions) {
    throw new Error(
      "The daily plan contains silent drops or conflicting dispositions and cannot be saved.",
    );
  }

  const emittedEvents = createPlanningDecisionEvents(
    plan,
    state.task_events,
    options,
  );

  if (emittedEvents.length === 0) {
    return {
      state,
      emittedEvents: [],
      duplicate: true,
    };
  }

  const reviews = [...state.review_events];
  let topics = [...state.topics];
  const nextStudyDate = nextStudyDayAfter(plan.date);

  for (const event of emittedEvents) {
    const reviewIndex = event.review_event_id
      ? reviews.findIndex((review) => review.id === event.review_event_id)
      : -1;

    const review =
      reviewIndex >= 0 ? reviews[reviewIndex] : undefined;

    const disposition = event.disposition;

    const isDefer =
      event.event_type === "defer" ||
      disposition === "DEFER" ||
      disposition === "override_defer";

    const isSkip =
      event.event_type === "skip" ||
      disposition === "SKIP" ||
      disposition === "skip";

    const isRelearn =
      event.event_type === "relearn" ||
      disposition === "RELEARN" ||
      disposition === "relearn";

    if (review && isDefer) {
      reviews[reviewIndex] = {
        ...review,
        status: "deferred",
        current_due_date: nextStudyDate,
        defer_count: review.defer_count + 1,
      };
    } else if (review && isSkip) {
      reviews[reviewIndex] = {
        ...review,
        status: "skipped",
      };
    } else if (review && isRelearn) {
      reviews[reviewIndex] = {
        ...review,
        status: "retired",
      };
    }

    if (isRelearn) {
      const linkedTopicId =
        review?.topic_id ??
        (
          topics.some((topic) => topic.id === event.subject_id)
            ? event.subject_id
            : null
        );

      if (linkedTopicId) {
        topics = topics.map((topic) =>
          topic.id === linkedTopicId
            ? { ...topic, status: "relearn" }
            : topic,
        );
      }
    }

    if (!review && isDefer) {
      // Gates and consolidation use the topic's planned date as their
      // operational re-entry date; no gate result is inferred from planning.
      topics = topics.map((topic) =>
        topic.id === event.subject_id
          ? {
              ...topic,
              planned_consolidation_date: nextStudyDate,
            }
          : topic,
      );
    }
  }

  const nextState: StudyMvpState = {
    ...state,
    topics,
    review_events: reviews,
    task_events: [...state.task_events, ...emittedEvents],
  };

  assertStudyStateIntegrity(nextState);

  return {
    state: nextState,
    emittedEvents,
    duplicate: false,
  };
}
