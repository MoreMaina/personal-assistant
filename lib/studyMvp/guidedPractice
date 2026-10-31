import type {
  EntityId,
  RetrievalPurpose,
  StudyMvpState,
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
