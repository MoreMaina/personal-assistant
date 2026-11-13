import type { GlobalSearchRecord } from "@/lib/globalSearch";
import type { StudyMvpState } from "@/lib/studyMvp/types";

/** Build search records only from the current Study MVP catalogue.
 * Archived courses and their dependent records are intentionally excluded.
 */
export function buildStudySearchRecords(state: StudyMvpState): GlobalSearchRecord[] {
  const records: GlobalSearchRecord[] = [];
  const courses = state.courses.filter((course) => !course.archived_at);
  const courseById = new Map(courses.map((course) => [course.id, course] as const));
  const units = state.units.filter((unit) => courseById.has(unit.course_id));
  const unitById = new Map(units.map((unit) => [unit.id, unit] as const));
  const topics = state.topics.filter((topic) => unitById.has(topic.unit_id));
  const topicById = new Map(topics.map((topic) => [topic.id, topic] as const));

  function add(
    key: string,
    category: string,
    title: string,
    detail: string,
    extra = "",
    href = "/study",
  ) {
    records.push({
      key,
      category,
      title,
      detail,
      href,
      searchableText: `${title} ${category} ${detail} ${extra}`,
    });
  }

  for (const course of courses) {
    const period = course.academic_year && course.academic_semester
      ? `Year ${course.academic_year} · Semester ${course.academic_semester}`
      : "Unassigned";
    add(
      `study-course-${course.id}`,
      "Study course",
      course.name,
      `${course.code ? `${course.code} · ` : ""}${period}`,
      course.code,
      "/settings",
    );
  }

  for (const unit of units) {
    const course = courseById.get(unit.course_id);
    if (!course) continue;
    add(
      `study-unit-${unit.id}`,
      "Study unit",
      unit.name,
      `${course.name}${course.code ? ` · ${course.code}` : ""}${unit.code ? ` · ${unit.code}` : ""}`,
      `${unit.code} ${unit.order_index}`,
    );
  }

  for (const topic of topics) {
    const unit = unitById.get(topic.unit_id);
    const course = unit ? courseById.get(unit.course_id) : undefined;
    if (!unit || !course) continue;
    add(
      `study-topic-${topic.id}`,
      "Study topic",
      topic.title,
      `${course.name} · ${unit.name} · Topic ${topic.topic_number}`,
      `${topic.learning_objective} ${topic.objective_type} ${topic.topic_importance}`,
    );
  }

  for (const lecture of state.lectures) {
    const unit = unitById.get(lecture.unit_id);
    const course = unit ? courseById.get(unit.course_id) : undefined;
    if (!unit || !course) continue;
    const topic = topicById.get(lecture.topic_id);
    add(
      `study-lecture-${lecture.id}`,
      "Study lecture",
      topic ? `${lecture.kind} · ${topic.title}` : `${lecture.kind} · ${unit.name}`,
      `${course.name} · ${unit.name} · ${lecture.date}`,
      lecture.kind,
    );
  }

  for (const task of state.retrieval_tasks) {
    if (!task.active) continue;
    const topic = topicById.get(task.topic_id);
    const unit = topic ? unitById.get(topic.unit_id) : undefined;
    const course = unit ? courseById.get(unit.course_id) : undefined;
    if (!topic || !unit || !course) continue;
    add(
      `study-task-${task.id}`,
      "Study question",
      task.prompt,
      `${course.name} · ${unit.name} · ${topic.title}`,
      `${task.expected_answer_criteria} ${task.task_type} ${task.purpose}`,
    );
  }

  return records;
}
