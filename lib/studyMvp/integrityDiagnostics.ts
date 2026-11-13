import type {
  EntityId,
  StudyMvpState,
} from "./types";

export type StudyReferenceIssue = {
  collection:
    | "units"
    | "topics"
    | "lectures"
    | "retrieval_tasks"
    | "review_events"
    | "assignments"
    | "exams";
  recordId: EntityId;
  field: string;
  referencedId: EntityId;
  problem: "missing_reference" | "parent_mismatch";
};

export function findStudyReferenceIssues(
  state: StudyMvpState,
): StudyReferenceIssue[] {
  const issues: StudyReferenceIssue[] = [];

  const coursesById = new Map(
    state.courses.map((item) => [item.id, item]),
  );
  const unitsById = new Map(
    state.units.map((item) => [item.id, item]),
  );
  const topicsById = new Map(
    state.topics.map((item) => [item.id, item]),
  );
  const tasksById = new Map(
    state.retrieval_tasks.map((item) => [item.id, item]),
  );
  const reviewsById = new Map(
    state.review_events.map((item) => [item.id, item]),
  );

  function addIssue(
    collection: StudyReferenceIssue["collection"],
    recordId: EntityId,
    field: string,
    referencedId: EntityId,
    problem: StudyReferenceIssue["problem"] = "missing_reference",
  ) {
    issues.push({
      collection,
      recordId,
      field,
      referencedId,
      problem,
    });
  }

  for (const unit of state.units) {
    if (!coursesById.has(unit.course_id)) {
      addIssue(
        "units",
        unit.id,
        "course_id",
        unit.course_id,
      );
    }
  }

  for (const topic of state.topics) {
    if (!unitsById.has(topic.unit_id)) {
      addIssue(
        "topics",
        topic.id,
        "unit_id",
        topic.unit_id,
      );
    }

    for (const prerequisiteId of topic.prerequisite_topic_ids) {
      if (!topicsById.has(prerequisiteId)) {
        addIssue(
          "topics",
          topic.id,
          "prerequisite_topic_ids",
          prerequisiteId,
        );
      }
    }
  }

  for (const lecture of state.lectures) {
    if (!unitsById.has(lecture.unit_id)) {
      addIssue(
        "lectures",
        lecture.id,
        "unit_id",
        lecture.unit_id,
      );
    }

    const topic = topicsById.get(lecture.topic_id);

    if (!topic) {
      addIssue(
        "lectures",
        lecture.id,
        "topic_id",
        lecture.topic_id,
      );
    } else if (topic.unit_id !== lecture.unit_id) {
      addIssue(
        "lectures",
        lecture.id,
        "topic_id",
        lecture.topic_id,
        "parent_mismatch",
      );
    }
  }

  for (const task of state.retrieval_tasks) {
    if (!topicsById.has(task.topic_id)) {
      addIssue(
        "retrieval_tasks",
        task.id,
        "topic_id",
        task.topic_id,
      );
    }
  }

  for (const review of state.review_events) {
    if (!topicsById.has(review.topic_id)) {
      addIssue(
        "review_events",
        review.id,
        "topic_id",
        review.topic_id,
      );
    }

    for (const taskId of review.selected_task_ids) {
      const task = tasksById.get(taskId);

      if (!task) {
        addIssue(
          "review_events",
          review.id,
          "selected_task_ids",
          taskId,
        );
      } else if (task.topic_id !== review.topic_id) {
        addIssue(
          "review_events",
          review.id,
          "selected_task_ids",
          taskId,
          "parent_mismatch",
        );
      }
    }

    if (review.source_review_id) {
      const sourceReview = reviewsById.get(
        review.source_review_id,
      );

      if (!sourceReview) {
        addIssue(
          "review_events",
          review.id,
          "source_review_id",
          review.source_review_id,
        );
      } else if (sourceReview.topic_id !== review.topic_id) {
        addIssue(
          "review_events",
          review.id,
          "source_review_id",
          review.source_review_id,
          "parent_mismatch",
        );
      }
    }
  }

  for (const assignment of state.assignments) {
    if (!coursesById.has(assignment.course_id)) {
      addIssue(
        "assignments",
        assignment.id,
        "course_id",
        assignment.course_id,
      );
    }
  }

  for (const exam of state.exams) {
    if (!coursesById.has(exam.course_id)) {
      addIssue(
        "exams",
        exam.id,
        "course_id",
        exam.course_id,
      );
    }

    for (const unitId of exam.coverage_units) {
      const unit = unitsById.get(unitId);

      if (!unit) {
        addIssue(
          "exams",
          exam.id,
          "coverage_units",
          unitId,
        );
      } else if (unit.course_id !== exam.course_id) {
        addIssue(
          "exams",
          exam.id,
          "coverage_units",
          unitId,
          "parent_mismatch",
        );
      }
    }

    for (const topicId of exam.coverage_topics) {
      const topic = topicsById.get(topicId);

      if (!topic) {
        addIssue(
          "exams",
          exam.id,
          "coverage_topics",
          topicId,
        );
        continue;
      }

      const unit = unitsById.get(topic.unit_id);

      if (unit && unit.course_id !== exam.course_id) {
        addIssue(
          "exams",
          exam.id,
          "coverage_topics",
          topicId,
          "parent_mismatch",
        );
      }
    }
  }

  return issues;
}
