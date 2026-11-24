import {
  getTopicPreparationReadiness,
  isRetrievalTaskAvailableForNewSessions,
  normalizeRetrievalPrompt,
} from "./preparationReadiness";import { getTopicPreparationReadiness, isRetrievalTaskAvailableForNewSessions } from "./preparationReadiness";
import type {
  EntityId,
  ObjectiveType,
  RetrievalPurpose,
  RetrievalTask,
  RetrievalTaskType,
  StudyMvpState,
  TopicPreparationStatus,
} from "./types";

export interface RetrievalQuestionDraft {
  prompt: string;
  expected_answer_criteria: string;
  task_type: RetrievalTaskType;
  purpose: RetrievalPurpose;
  estimated_duration_min: number;
}

export type StudyIdFactory = (prefix: string) => EntityId;

function validateQuestionDraft(input: RetrievalQuestionDraft): RetrievalQuestionDraft {
  const prompt = input.prompt.trim();
  const criteria = input.expected_answer_criteria.trim();
  const duration = input.estimated_duration_min;
  const validTaskTypes = new Set(["definition", "explanation", "comparison", "problem", "essay_plan", "application"]);
  const validPurposes = new Set(["gate", "review", "retry", "corrective", "mixed", "sampler"]);

  if (!validTaskTypes.has(input.task_type)) throw new Error("Choose a valid retrieval question type.");
  if (!validPurposes.has(input.purpose)) throw new Error("Choose a valid retrieval question purpose.");
  if (!prompt) throw new Error("Enter a retrieval question prompt.");
  if (!criteria || criteria.length < 8) {
    throw new Error("Add meaningful expected-answer criteria (at least 8 characters).");
  }
  if (!Number.isSafeInteger(duration) || duration < 1 || duration > 180) {
    throw new Error("Question duration must be a whole number between 1 and 180 minutes.");
  }

  return {
    ...input,
    prompt,
    expected_answer_criteria: criteria,
  };
}

function assertTopicExists(state: StudyMvpState, topicId: EntityId): void {
  if (!state.topics.some((topic) => topic.id === topicId)) {
    throw new Error("The selected topic no longer exists. Refresh the preparation page.");
  }
}

function assertUniqueId(state: StudyMvpState, id: EntityId): void {
  if (!id || state.retrieval_tasks.some((task) => task.id === id)) {
    throw new Error("A unique question ID could not be created.");
  }
}

function isTaskAvailable(task: RetrievalTask, allTasks: readonly RetrievalTask[]): boolean {
  return isRetrievalTaskAvailableForNewSessions(task, allTasks);
}

function assertNoAvailablePromptDuplicate(
  state: StudyMvpState,
  topicId: EntityId,
  prompt: string,
  ignoredTaskId?: EntityId,
): void {
  const normalizedPrompt = normalizeRetrievalPrompt(prompt);
  const duplicate = state.retrieval_tasks.some(
    (task) =>
      task.topic_id === topicId &&
      task.id !== ignoredTaskId &&
      isTaskAvailable(task, state.retrieval_tasks) &&
      normalizeRetrievalPrompt(task.prompt) === normalizedPrompt,
  );

  if (duplicate) {
    throw new Error(
      "This topic already has an available question with the same prompt. Use a distinct prompt.",
    );
  }
}

function reconcileReadyTopics(
  state: StudyMvpState,
  topics: StudyMvpState["topics"],
  retrievalTasks: StudyMvpState["retrieval_tasks"],
): StudyMvpState["topics"] {
  return topics.map((topic) =>
    topic.preparation_status === "ready" &&
    !getTopicPreparationReadiness(topic, retrievalTasks).ready
      ? { ...topic, preparation_status: "draft" as const }
      : topic,
  );
}

export function addRetrievalQuestion(
  state: StudyMvpState,
  topicId: EntityId,
  draft: RetrievalQuestionDraft,
  idFactory: StudyIdFactory,
): StudyMvpState {
  assertTopicExists(state, topicId);
  const availableCount = state.retrieval_tasks.filter(
    (task) => task.topic_id === topicId && isTaskAvailable(task, state.retrieval_tasks),
  ).length;
  if (availableCount >= 5) {
    throw new Error("A topic supports 3–5 active questions for new sessions. Deactivate or replace an existing question first.");
  }
  const valid = validateQuestionDraft(draft);
  assertNoAvailablePromptDuplicate(state, topicId, valid.prompt);
  const id = idFactory("retrieval_task");
  assertUniqueId(state, id);

  const question: RetrievalTask = {
    id,
    topic_id: topicId,
    ...valid,
    last_used_on: null,
    active: true,
    available_for_new_sessions: true,
    version_number: 1,
    supersedes_task_id: null,
  };

  const retrievalTasks = [...state.retrieval_tasks, question];
  return {
    ...state,
    retrieval_tasks: retrievalTasks,
    topics: reconcileReadyTopics(state, state.topics, retrievalTasks),
  };
}

export function isReferencedByUnfinishedSession(
  state: StudyMvpState,
  taskId: EntityId,
): boolean {
  const pendingReview = state.review_events.some(
    (review) =>
      (review.status === "pending" || review.status === "in_progress" || review.status === "deferred" || review.status === "missed") &&
      review.selected_task_ids.includes(taskId),
  );
  if (pendingReview) return true;

  const unfinishedGate = state.topics.some((topic) => {
    const session = getLatestGateSession(state, topic.id);
    return Boolean(session && !session.complete && session.selectedTaskIds.includes(taskId));
  });
  if (unfinishedGate) return true;

  const guidedSnapshots = state.task_events.filter(
    (event) =>
      event.event_type === "guided_practice_attempt" &&
      event.guided_practice_selected_task_ids_snapshot?.includes(taskId),
  );
  for (const event of guidedSnapshots) {
    const selectedIds = event.guided_practice_selected_task_ids_snapshot ?? [];
    const sameSessionAttempts = state.task_events.filter(
      (candidate) =>
        candidate.event_type === "guided_practice_attempt" &&
        candidate.logged_at.slice(0, 10) === event.logged_at.slice(0, 10) &&
        JSON.stringify(candidate.guided_practice_selected_task_ids_snapshot ?? []) === JSON.stringify(selectedIds),
    );
    const attemptedIds = new Set(sameSessionAttempts.map((candidate) => candidate.retrieval_task_id).filter(Boolean));
    if (attemptedIds.size < selectedIds.length) return true;
  }
  return false;
}

/**
 * Replace a question by appending a new version. The old question's
 * wording, criteria, ID and historical links remain intact. It is excluded
 * from newly created sessions, but remains active when an unfinished
 * Gate or Review already references it.
 */
export function createRetrievalQuestionVersion(
  state: StudyMvpState,
  previousTaskId: EntityId,
  draft: RetrievalQuestionDraft,
  idFactory: StudyIdFactory,
): StudyMvpState {
  const previous = state.retrieval_tasks.find((task) => task.id === previousTaskId);
  if (!previous) throw new Error("The question to replace could not be found.");
  if (state.retrieval_tasks.some((task) => task.supersedes_task_id === previousTaskId)) {
    throw new Error("A newer version already exists. Edit the latest active version instead.");
  }
  if (!previous.active || previous.available_for_new_sessions === false) {
    throw new Error("Restore the latest question before creating a replacement version.");
  }

  const valid = validateQuestionDraft(draft);
  assertNoAvailablePromptDuplicate(state, previous.topic_id, valid.prompt, previousTaskId);
  const id = idFactory("retrieval_task");
  assertUniqueId(state, id);

  const nextVersion: RetrievalTask = {
    ...valid,
    id,
    topic_id: previous.topic_id,
    last_used_on: null,
    active: true,
    available_for_new_sessions: true,
    version_number: (previous.version_number ?? 1) + 1,
    supersedes_task_id: previous.id,
  };

  const retrievalTasks = [
    ...state.retrieval_tasks.map((task) =>
      task.id === previousTaskId
        ? {
            ...task,
            active: isReferencedByUnfinishedSession(state, task.id),
            available_for_new_sessions: false,
          }
        : task,
    ),
    nextVersion,
  ];
  return {
    ...state,
    retrieval_tasks: retrievalTasks,
    topics: reconcileReadyTopics(state, state.topics, retrievalTasks),
  };
}

export function setRetrievalQuestionActive(
  state: StudyMvpState,
  taskId: EntityId,
  active: boolean,
): StudyMvpState {
  const task = state.retrieval_tasks.find((item) => item.id === taskId);
  if (!task) throw new Error("The selected question could not be found.");
  const hasNewerVersion = state.retrieval_tasks.some(
    (candidate) => candidate.supersedes_task_id === taskId,
  );
  if (active && hasNewerVersion) {
    throw new Error("This question has been superseded. Restore or edit its latest version instead.");
  }

  const keepForUnfinishedSession = !active && isReferencedByUnfinishedSession(state, taskId);
  const nextActive = active || keepForUnfinishedSession;
  const nextAvailability = active;
  if (active) {
    const currentAvailableCount = state.retrieval_tasks.filter(
      (item) => item.topic_id === task.topic_id && isTaskAvailable(item, state.retrieval_tasks),
    ).length;
    assertNoAvailablePromptDuplicate(state, task.topic_id, task.prompt, taskId);
    if (currentAvailableCount >= 5) {
      throw new Error("A topic supports at most five active questions for new sessions. Deactivate another question first.");
    }
  }
  if (task.active === nextActive && task.available_for_new_sessions === nextAvailability) return state;

  const retrievalTasks = state.retrieval_tasks.map((item) =>
    item.id === taskId
      ? { ...item, active: nextActive, available_for_new_sessions: nextAvailability }
      : item,
  );
  return {
    ...state,
    retrieval_tasks: retrievalTasks,
    topics: reconcileReadyTopics(state, state.topics, retrievalTasks),
  };
}

export function setTopicPreparationStatus(
  state: StudyMvpState,
  topicId: EntityId,
  status: TopicPreparationStatus,
): StudyMvpState {
  const topic = state.topics.find((item) => item.id === topicId);
  if (!topic) throw new Error("The selected topic could not be found.");

  if (status === "ready") {
    const readiness = getTopicPreparationReadiness(topic, state.retrieval_tasks);
    if (!readiness.ready) {
      throw new Error(
        `This topic is not ready yet: ${readiness.blockers.map((item) => item.message).join(" ")}`,
      );
    }
  }

  return {
    ...state,
    topics: state.topics.map((item) =>
      item.id === topicId ? { ...item, preparation_status: status } : item,
    ),
  };
}

export function setUnitPlannerExcluded(
  state: StudyMvpState,
  unitId: EntityId,
  excluded: boolean,
): StudyMvpState {
  const unit = state.units.find((item) => item.id === unitId);
  if (!unit) throw new Error("The selected unit could not be found.");
  if (Boolean(unit.planner_excluded) === excluded) return state;

  return {
    ...state,
    units: state.units.map((item) =>
      item.id === unitId ? { ...item, planner_excluded: excluded } : item,
    ),
  };
}

export function updateTopicLearningObjective(
  state: StudyMvpState,
  topicId: EntityId,
  learningObjective: string,
  objectiveType: ObjectiveType,
): StudyMvpState {
  const topic = state.topics.find((item) => item.id === topicId);
  if (!topic) throw new Error("The selected topic could not be found.");
  const topics = state.topics.map((item) =>
    item.id === topicId
      ? { ...item, learning_objective: learningObjective.trim(), objective_type: objectiveType }
      : item,
  );
  return {
    ...state,
    topics: reconcileReadyTopics(state, topics, state.retrieval_tasks),
  };
}
