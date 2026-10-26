import type {
  EntityId,
  ISODate,
  RetrievalTask,
  Topic,
} from "./types";

export type GateReadinessStatus =
  | "not_started"
  | "not_eligible"
  | "missing_questions"
  | "session_questions_unavailable"
  | "not_due"
  | "ready";

export interface GateReadiness {
  status: GateReadinessStatus;
  canAttempt: boolean;
  message: string;
  dueDate: ISODate;
  activeQuestionCount: number;
  requiredQuestionCount: 3;
  missingQuestionCount: number;
}

/**
 * Describes whether a topic may start or resume an initial gate.
 * The supplied task list is defensively restricted to active tasks belonging
 * to this topic. An unfinished session is never given substitute questions.
 */
export function getGateReadiness(
  topic: Topic,
  topicTasks: readonly RetrievalTask[],
  today: ISODate,
  unfinishedSessionTaskIds: readonly EntityId[] = [],
): GateReadiness {
  const activeTasks = topicTasks.filter(
    (task) => task.topic_id === topic.id && task.active,
  );
  const dueDate =
    topic.planned_consolidation_date ??
    topic.initial_study_date ??
    today;
  const activeQuestionCount = activeTasks.length;
  const missingQuestionCount = Math.max(0, 3 - activeQuestionCount);

  const result = (
    status: GateReadinessStatus,
    canAttempt: boolean,
    message: string,
  ): GateReadiness => ({
    status,
    canAttempt,
    message,
    dueDate,
    activeQuestionCount,
    requiredQuestionCount: 3,
    missingQuestionCount,
  });

  if (topic.status === "not_started") {
    return result(
      "not_started",
      false,
      "This topic has not been started. Use Start learning before attempting its initial gate.",
    );
  }

  if (
    topic.gate_passed ||
    topic.gate_result === "passed" ||
    topic.gate_result === "skill_based_passed"
  ) {
    return result(
      "not_eligible",
      false,
      "This topic has already passed its initial gate and does not need another initial-gate attempt.",
    );
  }

  const canUseInitialGate =
    topic.status === "in_learning" ||
    (topic.status === "relearn" && topic.gate_result === "failed");

  if (!canUseInitialGate) {
    return result(
      "not_eligible",
      false,
      "Only topics in learning, or failed topics awaiting corrective work, can use the initial gate.",
    );
  }

  const activeTaskIds = new Set(activeTasks.map((task) => task.id));
  const unavailableSessionTaskIds = unfinishedSessionTaskIds.filter(
    (id) => !activeTaskIds.has(id),
  );

  if (unavailableSessionTaskIds.length > 0) {
    return result(
      "session_questions_unavailable",
      false,
      `The unfinished gate uses ${unavailableSessionTaskIds.length} question(s) that are no longer active or available. Reactivate the original question(s) before resuming; this session will not substitute a different question set.`,
    );
  }

  if (activeQuestionCount < 3) {
    return result(
      "missing_questions",
      false,
      `This topic has ${activeQuestionCount} active retrieval question(s). At least three are required before a gate can be attempted.`,
    );
  }

  if (dueDate > today) {
    return result(
      "not_due",
      false,
      `This topic's planned gate date is ${dueDate}. It becomes eligible on that date; today is ${today}.`,
    );
  }

  return result(
    "ready",
    true,
    "This topic is ready for an initial-gate attempt.",
  );
}
