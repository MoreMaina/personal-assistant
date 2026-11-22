import type {
  RetrievalTask,
  Topic,
  Unit,
} from "./types";

/** True when a question may be selected for a newly created session.
 * Legacy records with no availability flag remain eligible unless superseded.
 */
export function isRetrievalTaskAvailableForNewSessions(
  task: RetrievalTask,
  allTasks: readonly RetrievalTask[],
): boolean {
  return (
    task.active &&
    task.available_for_new_sessions !== false &&
    !allTasks.some((candidate) => candidate.supersedes_task_id === task.id)
  );
}

export interface TopicPreparationBlocker {
  code:
    | "missing_objective"
    | "generic_objective"
    | "missing_objective_type"
    | "task_count"
    | "gate_questions"
    | "review_questions"
    | "missing_task_prompt"
    | "missing_answer_criteria";
  message: string;
}

export interface TopicPreparationReadiness {
  ready: boolean;
  activeTaskCount: number;
  activeGateQuestionCount: number;
  activeReviewQuestionCount: number;
  blockers: TopicPreparationBlocker[];
}

const VALID_OBJECTIVE_TYPES = new Set([
  "recall",
  "explain",
  "compare",
  "solve",
  "argue",
]);

const GENERIC_OBJECTIVE = /^(?:general|tbd|todo|n\/?a|none|to be (?:decided|determined)|understand(?:ing)?|learn about|study the topic|review the topic)\b/i;

/**
 * Assess whether a topic has the minimum preparation required before
 * it can be manually marked Ready. This function does not mutate state.
 */
export function getTopicPreparationReadiness(
  topic: Topic,
  tasks: readonly RetrievalTask[],
): TopicPreparationReadiness {
  const blockers: TopicPreparationBlocker[] = [];
  const objective = topic.learning_objective.trim();

  if (!objective) {
    blockers.push({
      code: "missing_objective",
      message: "Add a clear learning objective.",
    });
  } else if (
    objective.length < 20 ||
    GENERIC_OBJECTIVE.test(objective)
  ) {
    blockers.push({
      code: "generic_objective",
      message: "Make the learning objective specific and assessable.",
    });
  }

  if (!VALID_OBJECTIVE_TYPES.has(topic.objective_type)) {
    blockers.push({
      code: "missing_objective_type",
      message: "Choose a valid objective type.",
    });
  }

  const activeTasks = tasks.filter(
    (task) =>
      task.topic_id === topic.id &&
      isRetrievalTaskAvailableForNewSessions(task, tasks),
  );
  const gateTasks = activeTasks.filter(
    (task) => task.purpose === "gate",
  );
  const reviewTasks = activeTasks.filter(
    (task) => task.purpose === "review" || task.purpose === "retry",
  );

  if (activeTasks.length < 3 || activeTasks.length > 5) {
    blockers.push({
      code: "task_count",
      message: `Keep 3–5 active retrieval questions for this topic; currently there are ${activeTasks.length}.`,
    });
  }

  if (gateTasks.length < 3) {
    blockers.push({
      code: "gate_questions",
      message: `At least 3 active Gate questions are required; currently there are ${gateTasks.length}.`,
    });
  }

  if (reviewTasks.length < 2) {
    blockers.push({
      code: "review_questions",
      message: `At least 2 active Review questions are required; currently there are ${reviewTasks.length}.`,
    });
  }

  if (activeTasks.some((task) => !task.prompt.trim())) {
    blockers.push({
      code: "missing_task_prompt",
      message: "Every question available for new sessions needs a prompt.",
    });
  }

  if (activeTasks.some((task) => !task.expected_answer_criteria.trim())) {
    blockers.push({
      code: "missing_answer_criteria",
      message: "Every question available for new sessions needs meaningful expected-answer criteria.",
    });
  }

  return {
    ready: blockers.length === 0,
    activeTaskCount: activeTasks.length,
    activeGateQuestionCount: gateTasks.length,
    activeReviewQuestionCount: reviewTasks.length,
    blockers,
  };
}

/**
 * Only new initial-learning selection is blocked here. Existing topics
 * without preparation_status remain planner-compatible until reviewed.
 */
export function isTopicPreparedForPlanner(
  topic: Topic,
  unit: Unit | undefined,
): boolean {
  if (unit?.planner_excluded) return false;

  return (
    topic.preparation_status !== "draft" &&
    topic.preparation_status !== "excluded"
  );
}
