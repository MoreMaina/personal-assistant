import {
  defaultIdFactory,
  localDateOfTimestamp,
  type IdFactory,
} from "./reviewEngine";

import type {
  AttemptResult,
  EntityId,
  RetrievalPurpose,
  StudyMvpState,
  TaskEvent,
} from "./types";

export type GuidedPracticeKind = Extract<
  RetrievalPurpose,
  "mixed" | "sampler"
>;

export interface GuidedPracticeQuestion {
  taskId: EntityId;
  topicId: EntityId;
  courseName: string;
  unitName: string;
  topicTitle: string;
  prompt: string;
  expectedAnswerCriteria: string;
  taskType: StudyMvpState["retrieval_tasks"][number]["task_type"];
  estimatedDurationMin: number;
  lastUsedOn: string | null;
}

const IMPORTANCE_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} as const;

export function getGuidedPracticeQuestions(
  state: StudyMvpState,
  purpose: GuidedPracticeKind,
): GuidedPracticeQuestion[] {
  const coursesById = new Map(
    state.courses.map((item) => [item.id, item]),
  );
  const unitsById = new Map(
    state.units.map((item) => [item.id, item]),
  );

  const topicsById = new Map(
    state.topics.map((item) => [item.id, item]),
  );

  const grouped = new Map<
    EntityId,
    {
      topic: StudyMvpState["topics"][number];
      courseName: string;
      unitName: string;
      unitOrderIndex: number;
      questions: GuidedPracticeQuestion[];
    }
  >();

  for (const task of state.retrieval_tasks) {
    if (!task.active || task.purpose !== purpose) {
      continue;
    }

    const topic = topicsById.get(task.topic_id);

    if (!topic || topic.status !== "active") {
      continue;
    }

    const unit = unitsById.get(topic.unit_id);

    if (!unit) {
      continue;
    }

    const course = coursesById.get(unit.course_id);

    if (!course || course.archived_at) {
      continue;
    }

    const group = grouped.get(topic.id) ?? {
      topic,
      courseName: course.name,
      unitName: unit.name,
      unitOrderIndex: unit.order_index,
      questions: [],
    };

    group.questions.push({
      taskId: task.id,
      topicId: topic.id,
      courseName: course.name,
      unitName: unit.name,
      topicTitle: topic.title,
      prompt: task.prompt,
      expectedAnswerCriteria:
        task.expected_answer_criteria,
      taskType: task.task_type,
      estimatedDurationMin:
        task.estimated_duration_min,
      lastUsedOn: task.last_used_on,
    });

    grouped.set(topic.id, group);
  }

  if (
    purpose === "mixed" &&
    grouped.size < 2
  ) {
    return [];
  }

  const groups = [...grouped.values()].sort(
    (a, b) =>
      IMPORTANCE_ORDER[a.topic.topic_importance] -
        IMPORTANCE_ORDER[b.topic.topic_importance] ||
      a.courseName.localeCompare(b.courseName) ||
      a.unitOrderIndex - b.unitOrderIndex ||
      a.unitName.localeCompare(b.unitName) ||
      a.topic.order_index - b.topic.order_index ||
      a.topic.topic_number - b.topic.topic_number ||
      a.topic.id.localeCompare(b.topic.id),
  );

  for (const group of groups) {
    group.questions.sort(
      (a, b) =>
        (a.lastUsedOn ?? "").localeCompare(
          b.lastUsedOn ?? "",
        ) ||
        a.taskId.localeCompare(b.taskId),
    );
  }

  // Alternate between topics so that the practice is genuinely mixed.
  const result: GuidedPracticeQuestion[] = [];
  const positions = groups.map(() => 0);

  let remaining = true;

  while (remaining) {
    remaining = false;

    for (let index = 0; index < groups.length; index++) {
      const question =
        groups[index].questions[positions[index]];

      if (question) {
        result.push(question);
        positions[index] += 1;
        remaining = true;
      }
    }
  }

  return result;
}

export interface GuidedPracticeSessionSelection {
  selectedTaskIds: EntityId[];
  questions: GuidedPracticeQuestion[];
  missingTaskIds: EntityId[];
  attemptedTaskIds: EntityId[];
}

/**
 * Selects a question set that fits the planned practice allocation.
 * Once the first answer is saved, its question-ID snapshot is reused
 * so the session does not reshuffle after a refresh.
 */
export function getGuidedPracticeSessionSelection(
  state: StudyMvpState,
  purpose: GuidedPracticeKind,
  subjectId: EntityId,
  today: string,
  plannedMinutes: number,
): GuidedPracticeSessionSelection {
  const subjectType =
    purpose === "mixed" ? "mixed_practice" : "sampler";

  const sessionEvents = state.task_events.filter(
    (event) =>
      event.event_type === "guided_practice_attempt" &&
      event.subject_type === subjectType &&
      event.subject_id === subjectId &&
      localDateOfTimestamp(
        event.logged_at,
        state.settings.timezone,
      ) === today,
  );

  const savedSnapshot = sessionEvents.find(
    (event) =>
      Array.isArray(
        event.guided_practice_selected_task_ids_snapshot,
      ),
  )?.guided_practice_selected_task_ids_snapshot;

  let selectedTaskIds: EntityId[];

  if (savedSnapshot) {
    selectedTaskIds = [...savedSnapshot];
  } else {
    const candidates = getGuidedPracticeQuestions(
      state,
      purpose,
    );

    const selected: GuidedPracticeQuestion[] = [];
    let remainingMinutes =
      Number.isSafeInteger(plannedMinutes) &&
      plannedMinutes > 0
        ? plannedMinutes
        : 0;

    for (const question of candidates) {
      if (
        question.estimatedDurationMin <=
        remainingMinutes
      ) {
        selected.push(question);
        remainingMinutes -= question.estimatedDurationMin;
      }
    }

    const selectedTopicCount = new Set(
      selected.map((question) => question.topicId),
    ).size;

    selectedTaskIds =
      purpose === "mixed" && selectedTopicCount < 2
        ? []
        : selected.map((question) => question.taskId);
  }

  const availableById = new Map(
    getGuidedPracticeQuestions(state, purpose).map(
      (question) => [question.taskId, question],
    ),
  );

  const questions = selectedTaskIds
    .map((id) => availableById.get(id))
    .filter(
      (question): question is GuidedPracticeQuestion =>
        question !== undefined,
    );

  const missingTaskIds = selectedTaskIds.filter(
    (id) => !availableById.has(id),
  );

  const attemptedTaskIds = [
    ...new Set(
      sessionEvents
        .map((event) => event.retrieval_task_id)
        .filter((id): id is EntityId => id !== null),
    ),
  ];

  return {
    selectedTaskIds,
    questions,
    missingTaskIds,
    attemptedTaskIds,
  };
}

export interface GuidedPracticeAttemptInput {
  purpose: GuidedPracticeKind;
  subjectId: EntityId;
  taskId: EntityId;
  responseText: string;
  result: AttemptResult;
  loggedAt: string;
  eventId?: EntityId;
  idFactory?: IdFactory;
  selectedTaskIdsSnapshot: readonly EntityId[];
}

export interface GuidedPracticeAttemptResult {
  state: StudyMvpState;
  attemptEvent: TaskEvent;
  outcome: "recorded" | "duplicate";
}

/**
 * Records one immutable guided-practice answer.
 *
 * This is separate from review and gate attempts. It does not change
 * review progression or record duration; aggregate time remains a
 * separate WorkSession.
 */
export function applyGuidedPracticeAttempt(
  state: StudyMvpState,
  input: GuidedPracticeAttemptInput,
): GuidedPracticeAttemptResult {
  if (
    !Number.isFinite(Date.parse(input.loggedAt)) ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(input.loggedAt)
  ) {
    throw new Error(
      "Guided-practice timestamp must include a timezone.",
    );
  }

  const responseText = input.responseText.trim();

  if (!responseText || responseText.length > 20_000) {
    throw new Error(
      "Enter a response between 1 and 20,000 characters.",
    );
  }

  if (
    input.result !== "green" &&
    input.result !== "yellow" &&
    input.result !== "red"
  ) {
    throw new Error("Choose a Green, Yellow, or Red result.");
  }

  const task = state.retrieval_tasks.find(
    (item) => item.id === input.taskId,
  );

  if (
    !task ||
    !task.active ||
    task.purpose !== input.purpose
  ) {
    throw new Error(
      "This question is not an active question for the selected guided-practice activity.",
    );
  }

  const topic = state.topics.find(
    (item) => item.id === task.topic_id,
  );

  if (!topic || topic.status !== "active") {
    throw new Error(
      "The question's topic is no longer active.",
    );
  }

  const unit = state.units.find(
    (item) => item.id === topic.unit_id,
  );

  if (!unit) {
    throw new Error(
      "The question's unit could not be found.",
    );
  }

  const course = state.courses.find(
    (item) => item.id === unit.course_id,
  );

  if (!course || course.archived_at) {
    throw new Error(
      "The question's course is missing or archived.",
    );
  }

  const subjectType =
    input.purpose === "mixed"
      ? "mixed_practice"
      : "sampler";

  if (!input.subjectId.trim()) {
    throw new Error(
      "A guided-practice block ID is required.",
    );
  }

  const selectedTaskIdsSnapshot = [
    ...input.selectedTaskIdsSnapshot,
  ];

  const minimumSelected =
    input.purpose === "mixed" ? 2 : 1;

  if (
    selectedTaskIdsSnapshot.length < minimumSelected ||
    new Set(selectedTaskIdsSnapshot).size !==
      selectedTaskIdsSnapshot.length
  ) {
    throw new Error(
      "The guided-practice question selection is invalid.",
    );
  }

  const eligibleIds = new Set(
    getGuidedPracticeQuestions(
      state,
      input.purpose,
    ).map((question) => question.taskId),
  );

  if (
    selectedTaskIdsSnapshot.some(
      (id) => !eligibleIds.has(id),
    ) ||
    !selectedTaskIdsSnapshot.includes(task.id)
  ) {
    throw new Error(
      "The selected question set contains a question that is no longer eligible.",
    );
  }

  const selectedTopicCount = new Set(
    selectedTaskIdsSnapshot.map((id) =>
      state.retrieval_tasks.find(
        (item) => item.id === id,
      )!.topic_id,
    ),
  ).size;

  if (
    input.purpose === "mixed" &&
    selectedTopicCount < 2
  ) {
    throw new Error(
      "Mixed practice must include questions from at least two active topics.",
    );
  }

  const attemptDate = localDateOfTimestamp(
    input.loggedAt,
    state.settings.timezone,
  );

  const sessionEvents = state.task_events.filter(
    (event) =>
      event.event_type === "guided_practice_attempt" &&
      event.subject_type === subjectType &&
      event.subject_id === input.subjectId &&
      localDateOfTimestamp(
        event.logged_at,
        state.settings.timezone,
      ) === attemptDate,
  );

  for (const previous of sessionEvents) {
    if (
      JSON.stringify(
        previous.guided_practice_selected_task_ids_snapshot,
      ) !== JSON.stringify(selectedTaskIdsSnapshot)
    ) {
      throw new Error(
        "This guided-practice block already has a different saved question selection.",
      );
    }
  }

  const idFactory = input.idFactory ?? defaultIdFactory;

  const attemptEvent: TaskEvent = {
    id: input.eventId ?? idFactory("event"),
    logged_at: input.loggedAt,
    event_type: "guided_practice_attempt",
    subject_type: subjectType,
    subject_id: input.subjectId,
    review_event_id: null,
    retrieval_task_id: task.id,
    gate_session_id: null,
    gate_selected_task_ids_snapshot: null,
    skill_demonstrated_without_hints: null,
    work_session_id: null,
    related_event_id: null,
    estimated_duration_min_at_event:
      task.estimated_duration_min,
    task_type_at_event: task.task_type,
    priority_at_event: null,
    intended_due_date_at_event: null,
    current_due_date_at_event: null,
    actual_duration_min: null,
    result: input.result,
    yellow_gap_severity: null,
    disposition: null,
    reason: null,
    prompt_snapshot: task.prompt,
    expected_answer_criteria_snapshot:
      task.expected_answer_criteria,
    response_text: responseText,
    guided_practice_selected_task_ids_snapshot:
      selectedTaskIdsSnapshot,
    critical_error_flag: null,
    defer_count_at_event: null,
    re_entry_condition: null,
    old_priority: null,
    new_priority: null,
  };

  const sameId = state.task_events.find(
    (event) => event.id === attemptEvent.id,
  );

  if (sameId) {
    if (
      JSON.stringify(sameId) !==
      JSON.stringify(attemptEvent)
    ) {
      throw new Error(
        `TaskEvent ID "${attemptEvent.id}" is already used for different evidence.`,
      );
    }

    return {
      state,
      attemptEvent: sameId,
      outcome: "duplicate",
    };
  }


  const alreadyAttempted = state.task_events.some(
    (event) =>
      event.event_type === "guided_practice_attempt" &&
      event.subject_type === subjectType &&
      event.subject_id === input.subjectId &&
      event.retrieval_task_id === task.id &&
      localDateOfTimestamp(
        event.logged_at,
        state.settings.timezone,
      ) === attemptDate,
  );

  if (alreadyAttempted) {
    throw new Error(
      "This question already has a guided-practice attempt in this block today.",
    );
  }

    state: {
      ...state,
      retrieval_tasks: state.retrieval_tasks.map(
        (item) =>
          item.id === task.id
            ? { ...item, last_used_on: attemptDate }
            : item,
      ),
      task_events: [
        ...state.task_events,
        attemptEvent,
      ],
    },
    attemptEvent,
    outcome: "recorded",
  };
}
