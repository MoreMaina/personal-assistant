/**
 * Study System App — MVP v1.2
 *
 * Safe CSV/TSV import and CSV export for the course/unit/topic catalog.
 * Import is atomic: invalid input returns the original state unchanged.
 * Historical events, reviews, work sessions, and metrics are never edited.
 */

import { assertStudyStateIntegrity } from "./storage";
import { defaultIdFactory, type IdFactory } from "./reviewEngine";
import type {
  Course,
  EntityId,
  ObjectiveType,
  RetrievalPurpose,
  RetrievalTask,
  RetrievalTaskType,
  StudyMvpState,
  Topic,
  TopicImportance,
  Unit,
} from "./types";

export const TOPIC_CSV_HEADERS = [
  "course_code",
  "course_name",
  "unit_code",
  "unit_name",
  "topic_number",
  "topic_title",
  "learning_objective",
  "objective_type",
  "prerequisite_topic_numbers",
  "topic_importance",
  "consolidation_estimated_duration_min",
  "task_prompt",
  "expected_answer_criteria",
  "task_type",
  "task_purpose",
  "estimated_duration_min",
  "task_active",
] as const;

const REQUIRED_HEADERS = [
  "course_code",
  "course_name",
  "unit_code",
  "unit_name",
  "topic_number",
  "topic_title",
  "learning_objective",
  "objective_type",
] as const;

const OBJECTIVE_TYPES = new Set<ObjectiveType>([
  "recall",
  "explain",
  "compare",
  "solve",
  "argue",
]);

const IMPORTANCE_VALUES = new Set<TopicImportance>([
  "low",
  "medium",
  "high",
  "critical",
]);

const TASK_TYPES = new Set<RetrievalTaskType>([
  "definition",
  "explanation",
  "comparison",
  "problem",
  "essay_plan",
  "application",
]);

const TASK_PURPOSES = new Set<RetrievalPurpose>([
  "gate",
  "review",
  "retry",
  "corrective",
  "mixed",
  "sampler",
]);

export interface TopicImportDiagnostic {
  severity: "error" | "warning";
  row: number | null;
  message: string;
}

export interface TopicImportCounts {
  courses_created: number;
  units_created: number;
  topics_created: number;
  existing_topics_reused: number;
  tasks_created: number;
  duplicate_tasks_skipped: number;
}

export interface TopicImportResult {
  ok: boolean;
  state: StudyMvpState;
  diagnostics: TopicImportDiagnostic[];
  counts: TopicImportCounts;
}

export interface TopicImportOptions {
  now?: string;
  idFactory?: IdFactory;
}

interface ParsedTopicRow {
  rowNumber: number;
  courseCode: string;
  courseName: string;
  unitCode: string;
  unitName: string;
  topicNumber: number;
  topicTitle: string;
  learningObjective: string;
  objectiveType: ObjectiveType;
  prerequisiteTopicNumbers: number[];
  prerequisitesSpecified: boolean;
  importance: TopicImportance;
  consolidationEstimate: number;
  taskPrompt: string;
  expectedAnswerCriteria: string;
  taskType: RetrievalTaskType;
  taskPurpose: RetrievalPurpose;
  taskEstimate: number;
  taskActive: boolean;
}

interface TopicGroup {
  key: string;
  rows: ParsedTopicRow[];
  first: ParsedTopicRow;
  unitId: EntityId | null;
  topicId: EntityId | null;
  topicExists: boolean;
}

function emptyCounts(): TopicImportCounts {
  return {
    courses_created: 0,
    units_created: 0,
    topics_created: 0,
    existing_topics_reused: 0,
    tasks_created: 0,
    duplicate_tasks_skipped: 0,
  };
}

function normalizedKey(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function normalizedPrompt(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function normalizeHeader(value: string): string {
  const base = value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const aliases: Record<string, string> = {
    course: "course_name",
    coursecode: "course_code",
    coursename: "course_name",
    unit: "unit_name",
    unitcode: "unit_code",
    unitname: "unit_name",
    topic: "topic_title",
    topicnumber: "topic_number",
    topicno: "topic_number",
    topictitle: "topic_title",
    objective: "learning_objective",
    learningobjective: "learning_objective",
    objectivetype: "objective_type",
    prerequisites: "prerequisite_topic_numbers",
    prerequisite_topic_ids: "prerequisite_topic_numbers",
    importance: "topic_importance",
    topicimportance: "topic_importance",
    consolidationestimateddurationmin: "consolidation_estimated_duration_min",
    prompt: "task_prompt",
    taskprompt: "task_prompt",
    expectedanswercriteria: "expected_answer_criteria",
    tasktype: "task_type",
    taskpurpose: "task_purpose",
    estimateddurationmin: "estimated_duration_min",
    taskactive: "task_active",
  };

  return aliases[base] ?? base;
}

function detectDelimiter(firstLine: string): string {
  const candidates = [",", "\t", ";"];
  let best = ",";
  let bestCount = -1;

  for (const delimiter of candidates) {
    let count = 0;
    let quoted = false;

    for (let index = 0; index < firstLine.length; index += 1) {
      const char = firstLine[index];
      if (char === '"') {
        if (quoted && firstLine[index + 1] === '"') {
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        count += 1;
      }
    }

    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }

  if (bestCount <= 0) {
    throw new Error("Could not detect CSV or pasted spreadsheet columns in the header row.");
  }

  return best;
}

function parseDelimitedText(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine.trim()) {
    throw new Error("Paste or provide a CSV/TSV header row and at least one data row.");
  }

  const delimiter = detectDelimiter(firstLine);
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  const finishField = () => {
    record.push(field);
    field = "";
  };
  const finishRecord = () => {
    finishField();
    if (record.some((cell) => cell.trim() !== "")) records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === delimiter) {
      finishField();
    } else if (char === "\n" || char === "\r") {
      finishRecord();
      if (char === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error("The CSV contains an unterminated quoted field.");
  }

  if (field.length > 0 || record.length > 0) finishRecord();
  return records;
}

function parsePositiveInteger(value: string, label: string, row: number): number {
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Row ${row}: ${label} must be a positive whole number.`);
  }
  return parsed;
}

function parseDuration(
  value: string,
  label: string,
  row: number,
  fallback: number,
): number {
  if (value.trim() === "") return fallback;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Row ${row}: ${label} must be a positive number of minutes.`);
  }
  return parsed;
}

function parsePrerequisites(value: string, row: number): number[] {
  if (!value.trim()) return [];
  const parts = value.split(/[|;]/).map((part) => part.trim()).filter(Boolean);
  const numbers = parts.map((part) => parsePositiveInteger(part, "prerequisite topic number", row));
  if (new Set(numbers).size !== numbers.length) {
    throw new Error(`Row ${row}: prerequisite topic numbers must not contain duplicates.`);
  }
  return numbers;
}

function parseRow(
  cells: string[],
  headers: string[],
  rowNumber: number,
): ParsedTopicRow {
  const values: Record<string, string> = {};
  headers.forEach((header, index) => {
    values[header] = (cells[index] ?? "").trim();
  });

  for (const field of REQUIRED_HEADERS) {
    if (!values[field]) {
      throw new Error(`Row ${rowNumber}: required field "${field}" is blank.`);
    }
  }

  const objective = values.objective_type.toLocaleLowerCase("en") as ObjectiveType;
  if (!OBJECTIVE_TYPES.has(objective)) {
    throw new Error(`Row ${rowNumber}: objective_type must be one of ${[...OBJECTIVE_TYPES].join(", ")}.`);
  }

  const importance = (values.topic_importance || "medium").toLocaleLowerCase("en") as TopicImportance;
  if (!IMPORTANCE_VALUES.has(importance)) {
    throw new Error(`Row ${rowNumber}: topic_importance must be low, medium, high, or critical.`);
  }

  const taskPrompt = values.task_prompt ?? "";
  const expectedAnswerCriteria = values.expected_answer_criteria ?? "";
  const hasTaskDetails = Boolean(
    taskPrompt || expectedAnswerCriteria || values.task_type || values.task_purpose ||
    values.estimated_duration_min || values.task_active,
  );
  if (hasTaskDetails && (!taskPrompt || !expectedAnswerCriteria)) {
    throw new Error(`Row ${rowNumber}: provide both task_prompt and expected_answer_criteria, or leave all task columns blank.`);
  }

  const taskType = (values.task_type || "explanation").toLocaleLowerCase("en") as RetrievalTaskType;
  if (taskPrompt && !TASK_TYPES.has(taskType)) {
    throw new Error(`Row ${rowNumber}: unsupported task_type "${taskType}".`);
  }

  const taskPurpose = (values.task_purpose || "gate").toLocaleLowerCase("en") as RetrievalPurpose;
  if (taskPrompt && !TASK_PURPOSES.has(taskPurpose)) {
    throw new Error(`Row ${rowNumber}: unsupported task_purpose "${taskPurpose}".`);
  }

  const activeText = (values.task_active || "true").toLocaleLowerCase("en");
  if (taskPrompt && activeText !== "true" && activeText !== "false") {
    throw new Error(`Row ${rowNumber}: task_active must be true or false.`);
  }

  return {
    rowNumber,
    courseCode: values.course_code,
    courseName: values.course_name,
    unitCode: values.unit_code,
    unitName: values.unit_name,
    topicNumber: parsePositiveInteger(values.topic_number, "topic_number", rowNumber),
    topicTitle: values.topic_title,
    learningObjective: values.learning_objective,
    objectiveType: objective,
    prerequisiteTopicNumbers: parsePrerequisites(values.prerequisite_topic_numbers ?? "", rowNumber),
    prerequisitesSpecified: Boolean(values.prerequisite_topic_numbers?.trim()),
    importance,
    consolidationEstimate: parseDuration(
      values.consolidation_estimated_duration_min ?? "",
      "consolidation_estimated_duration_min",
      rowNumber,
      30,
    ),
    taskPrompt,
    expectedAnswerCriteria,
    taskType,
    taskPurpose,
    taskEstimate: parseDuration(values.estimated_duration_min ?? "", "estimated_duration_min", rowNumber, 5),
    taskActive: activeText === "true",
  };
}

function groupKey(courseCode: string, unitCode: string, topicNumber: number): string {
  return `${normalizedKey(courseCode)}\u0000${normalizedKey(unitCode)}\u0000${topicNumber}`;
}

function unitKey(courseCode: string, unitCode: string): string {
  return `${normalizedKey(courseCode)}\u0000${normalizedKey(unitCode)}`;
}

function topicMetadataSignature(row: ParsedTopicRow): string {
  return JSON.stringify([
    normalizedKey(row.courseName),
    normalizedKey(row.unitName),
    normalizedKey(row.topicTitle),
    row.learningObjective.trim(),
    row.objectiveType,
    row.prerequisiteTopicNumbers,
    row.prerequisitesSpecified,
    row.importance,
    row.consolidationEstimate,
  ]);
}

function zeroResult(state: StudyMvpState, diagnostics: TopicImportDiagnostic[]): TopicImportResult {
  return { ok: false, state, diagnostics, counts: emptyCounts() };
}

function addDiagnostic(
  diagnostics: TopicImportDiagnostic[],
  severity: TopicImportDiagnostic["severity"],
  row: number | null,
  message: string,
): void {
  diagnostics.push({ severity, row, message });
}

function availableId(
  prefix: string,
  idFactory: IdFactory,
  usedIds: Set<string>,
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const id = idFactory(prefix);
    if (id && !usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }
  throw new Error(`Could not generate a unique ID for ${prefix}.`);
}

/**
 * Import one row per topic/task combination. Topic/catalog fields should be
 * repeated on each row for the same topic. A row may omit all task columns
 * when a topic is being imported before retrieval questions are prepared.
 */
export function importTopicCatalogText(
  state: StudyMvpState,
  input: string,
  options: TopicImportOptions = {},
): TopicImportResult {
  const diagnostics: TopicImportDiagnostic[] = [];
  let records: string[][];

  try {
    records = parseDelimitedText(input);
  } catch (error) {
    addDiagnostic(diagnostics, "error", null, error instanceof Error ? error.message : String(error));
    return zeroResult(state, diagnostics);
  }

  if (records.length < 2) {
    addDiagnostic(diagnostics, "error", null, "The import must contain a header and at least one non-empty data row.");
    return zeroResult(state, diagnostics);
  }

  const headers = records[0].map(normalizeHeader);
  const seenHeaders = new Set<string>();
  headers.forEach((header, index) => {
    if (!header) addDiagnostic(diagnostics, "error", 1, `Header column ${index + 1} is blank.`);
    if (seenHeaders.has(header)) addDiagnostic(diagnostics, "error", 1, `Header "${header}" appears more than once.`);
    seenHeaders.add(header);
  });
  for (const required of REQUIRED_HEADERS) {
    if (!seenHeaders.has(required)) addDiagnostic(diagnostics, "error", 1, `Missing required header "${required}".`);
  }
  if (diagnostics.some((item) => item.severity === "error")) return zeroResult(state, diagnostics);

  const parsedRows: ParsedTopicRow[] = [];
  records.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length > headers.length && cells.slice(headers.length).some((cell) => cell.trim())) {
      addDiagnostic(diagnostics, "error", rowNumber, `This row has more cells than the ${headers.length} header columns. Quote fields that contain the delimiter.`);
      return;
    }
    try {
      parsedRows.push(parseRow(cells, headers, rowNumber));
    } catch (error) {
      addDiagnostic(diagnostics, "error", rowNumber, error instanceof Error ? error.message.replace(/^Row \d+: /, "") : String(error));
    }
  });

  if (parsedRows.length === 0 && !diagnostics.some((item) => item.severity === "error")) {
    addDiagnostic(diagnostics, "error", null, "No importable topic rows were found.");
  }
  if (diagnostics.some((item) => item.severity === "error")) return zeroResult(state, diagnostics);

  const groups = new Map<string, TopicGroup>();
  for (const row of parsedRows) {
    const key = groupKey(row.courseCode, row.unitCode, row.topicNumber);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { key, rows: [row], first: row, unitId: null, topicId: null, topicExists: false });
      continue;
    }
    if (topicMetadataSignature(existing.first) !== topicMetadataSignature(row)) {
      addDiagnostic(diagnostics, "error", row.rowNumber, `Topic ${row.topicNumber} has conflicting course/unit/topic metadata across its rows.`);
    }
    existing.rows.push(row);
  }

  const courseNamesInImport = new Map<string, { name: string; row: number }>();
  for (const row of parsedRows) {
    const key = normalizedKey(row.courseCode);
    const seen = courseNamesInImport.get(key);
    if (seen && normalizedKey(seen.name) !== normalizedKey(row.courseName)) {
      addDiagnostic(diagnostics, "error", row.rowNumber, `Course code "${row.courseCode}" is associated with more than one course name.`);
    } else if (!seen) {
      courseNamesInImport.set(key, { name: row.courseName, row: row.rowNumber });
    }
  }

  const unitNamesInImport = new Map<string, { name: string; row: number }>();
  for (const row of parsedRows) {
    const key = unitKey(row.courseCode, row.unitCode);
    const seen = unitNamesInImport.get(key);
    if (seen && normalizedKey(seen.name) !== normalizedKey(row.unitName)) {
      addDiagnostic(diagnostics, "error", row.rowNumber, `Unit code "${row.unitCode}" has conflicting names within course "${row.courseCode}".`);
    } else if (!seen) {
      unitNamesInImport.set(key, { name: row.unitName, row: row.rowNumber });
    }
  }

  const counts = emptyCounts();
  const idFactory = options.idFactory ?? defaultIdFactory;
  const now = options.now ?? new Date().toISOString();
  const usedIds = new Set<string>([
    ...state.courses.map((item) => item.id),
    ...state.units.map((item) => item.id),
    ...state.topics.map((item) => item.id),
    ...state.lectures.map((item) => item.id),
    ...state.retrieval_tasks.map((item) => item.id),
    ...state.review_events.map((item) => item.id),
    ...state.task_events.map((item) => item.id),
    ...state.work_sessions.map((item) => item.id),
    ...state.assignments.map((item) => item.id),
    ...state.exams.map((item) => item.id),
    ...state.settings_change_history.map((item) => item.id),
  ]);

  const courses = [...state.courses];
  const units = [...state.units];
  const topics = [...state.topics];
  const retrievalTasks = [...state.retrieval_tasks];
  const courseByCode = new Map<string, Course>();

  for (const [code, spec] of courseNamesInImport) {
    const matches = state.courses.filter((course) => normalizedKey(course.code) === code);
    if (matches.length > 1) {
      addDiagnostic(diagnostics, "error", spec.row, `Course code "${spec.name}" is ambiguous in the existing state.`);
      continue;
    }
    if (matches[0]) {
      if (normalizedKey(matches[0].name) !== normalizedKey(spec.name)) {
        addDiagnostic(diagnostics, "error", spec.row, `Existing course code "${matches[0].code}" has a different name; import will not overwrite it.`);
      }
      courseByCode.set(code, matches[0]);
    } else {
      const course: Course = {
        id: availableId("course", idFactory, usedIds),
        name: spec.name,
        code: parsedRows.find((row) => normalizedKey(row.courseCode) === code)!.courseCode,
        color: "#557C8A",
        created_at: now,
      };
      courses.push(course);
      courseByCode.set(code, course);
      counts.courses_created += 1;
    }
  }

  const unitByKey = new Map<string, Unit>();
  for (const [key, spec] of unitNamesInImport) {
    const first = parsedRows.find((row) => unitKey(row.courseCode, row.unitCode) === key)!;
    const course = courseByCode.get(normalizedKey(first.courseCode));
    if (!course) continue;

    const matches = state.units.filter((unit) =>
      unit.course_id === course.id && normalizedKey(unit.code) === normalizedKey(first.unitCode),
    );
    if (matches.length > 1) {
      addDiagnostic(diagnostics, "error", spec.row, `Unit code "${first.unitCode}" is ambiguous in the existing state.`);
      continue;
    }
    if (matches[0]) {
      if (normalizedKey(matches[0].name) !== normalizedKey(spec.name)) {
        addDiagnostic(diagnostics, "error", spec.row, `Existing unit code "${matches[0].code}" has a different name; import will not overwrite it.`);
      }
      unitByKey.set(key, matches[0]);
    } else {
      const unit: Unit = {
        id: availableId("unit", idFactory, usedIds),
        course_id: course.id,
        code: first.unitCode,
        name: spec.name,
        order_index: units.filter((unit) => unit.course_id === course.id).length + 1,
      };
      units.push(unit);
      unitByKey.set(key, unit);
      counts.units_created += 1;
    }
  }

  const groupByKey = groups;
  for (const group of groupByKey.values()) {
    const row = group.first;
    const unit = unitByKey.get(unitKey(row.courseCode, row.unitCode));
    if (!unit) continue;
    group.unitId = unit.id;

    const matches = state.topics.filter((topic) =>
      topic.unit_id === unit.id && topic.topic_number === row.topicNumber,
    );
    if (matches.length > 1) {
      addDiagnostic(diagnostics, "error", row.rowNumber, `Topic number ${row.topicNumber} is ambiguous in the existing unit.`);
      continue;
    }
    if (matches[0]) {
      const topic = matches[0];
      if (
        normalizedKey(topic.title) !== normalizedKey(row.topicTitle) ||
        topic.learning_objective.trim() !== row.learningObjective.trim() ||
        topic.objective_type !== row.objectiveType
      ) {
        addDiagnostic(diagnostics, "error", row.rowNumber, `Existing topic ${row.topicNumber} has different core content; import will not overwrite it.`);
        continue;
      }
      group.topicId = topic.id;
      group.topicExists = true;
      counts.existing_topics_reused += 1;
    } else {
      group.topicId = availableId("topic", idFactory, usedIds);
      group.topicExists = false;
    }
  }

  // Resolve prerequisites only after all topic IDs are known.
  for (const group of groups.values()) {
    if (!group.unitId || !group.topicId) continue;
    const row = group.first;
    const prerequisiteIds: string[] = [];
    for (const number of row.prerequisiteTopicNumbers) {
      if (number === row.topicNumber) {
        addDiagnostic(diagnostics, "error", row.rowNumber, "A topic cannot be its own prerequisite.");
        continue;
      }
      const importedGroup = [...groups.values()].find((candidate) =>
        candidate.unitId === group.unitId && candidate.first.topicNumber === number,
      );
      const existingTopic = topics.find((topic) => topic.unit_id === group.unitId && topic.topic_number === number);
      const resolvedId = importedGroup?.topicId ?? existingTopic?.id;
      if (!resolvedId) {
        addDiagnostic(diagnostics, "error", row.rowNumber, `Prerequisite topic number ${number} was not found in unit "${row.unitCode}".`);
      } else {
        prerequisiteIds.push(resolvedId);
      }
    }

    if (group.topicExists && row.prerequisitesSpecified) {
      const existing = topics.find((topic) => topic.id === group.topicId)!;
      const left = [...existing.prerequisite_topic_ids].sort();
      const right = [...prerequisiteIds].sort();
      if (JSON.stringify(left) !== JSON.stringify(right)) {
        addDiagnostic(diagnostics, "error", row.rowNumber, `Existing topic ${row.topicNumber} has different prerequisite links; import will not overwrite them.`);
      }
    } else if (!group.topicExists) {
      topics.push({
        id: group.topicId,
        unit_id: group.unitId,
        topic_number: row.topicNumber,
        title: row.topicTitle,
        order_index: topics.filter((topic) => topic.unit_id === group.unitId).length + 1,
        learning_objective: row.learningObjective,
        objective_type: row.objectiveType,
        prerequisite_topic_ids: prerequisiteIds,
        status: "not_started",
        planned_consolidation_date: null,
        consolidation_estimated_duration_min: row.consolidationEstimate,
        initial_study_date: null,
        gate_passed: false,
        gate_result: "pending",
        weakness_flag: false,
        topic_importance: row.importance,
      });
      counts.topics_created += 1;
    }
  }

  const importedTaskSignatures = new Map<string, string>();
  for (const group of groups.values()) {
    if (!group.topicId) continue;
    for (const row of group.rows) {
      if (!row.taskPrompt) continue;

      const promptKey = `${group.topicId}\u0000${normalizedPrompt(row.taskPrompt)}`;
      const taskSignature = JSON.stringify([
        row.expectedAnswerCriteria.trim(),
        row.taskType,
        row.taskPurpose,
        row.taskEstimate,
        row.taskActive,
      ]);
      const alreadyParsed = importedTaskSignatures.get(promptKey);
      if (alreadyParsed !== undefined) {
        if (alreadyParsed !== taskSignature) {
          addDiagnostic(diagnostics, "error", row.rowNumber, `Retrieval question "${row.taskPrompt}" is duplicated with conflicting criteria or settings.`);
        } else {
          counts.duplicate_tasks_skipped += 1;
          addDiagnostic(diagnostics, "warning", row.rowNumber, `Duplicate retrieval question "${row.taskPrompt}" was ignored.`);
        }
        continue;
      }
      importedTaskSignatures.set(promptKey, taskSignature);

      const existingMatches = retrievalTasks.filter((task) =>
        task.topic_id === group.topicId && normalizedPrompt(task.prompt) === normalizedPrompt(row.taskPrompt),
      );
      if (existingMatches.length > 1) {
        addDiagnostic(diagnostics, "error", row.rowNumber, `The existing topic contains multiple tasks with the same prompt "${row.taskPrompt}".`);
        continue;
      }
      if (existingMatches[0]) {
        const existing = existingMatches[0];
        const matchesExactly =
          existing.expected_answer_criteria.trim() === row.expectedAnswerCriteria.trim() &&
          existing.task_type === row.taskType &&
          existing.purpose === row.taskPurpose &&
          existing.estimated_duration_min === row.taskEstimate &&
          existing.active === row.taskActive;
        if (!matchesExactly) {
          addDiagnostic(diagnostics, "error", row.rowNumber, `Existing retrieval question "${row.taskPrompt}" has different criteria or settings; import will not overwrite it.`);
        } else {
          counts.duplicate_tasks_skipped += 1;
        }
        continue;
      }

      const task: RetrievalTask = {
        id: availableId("task", idFactory, usedIds),
        topic_id: group.topicId,
        prompt: row.taskPrompt,
        expected_answer_criteria: row.expectedAnswerCriteria,
        task_type: row.taskType,
        purpose: row.taskPurpose,
        estimated_duration_min: row.taskEstimate,
        last_used_on: null,
        active: row.taskActive,
      };
      retrievalTasks.push(task);
      counts.tasks_created += 1;
    }
  }

  if (diagnostics.some((item) => item.severity === "error")) return zeroResult(state, diagnostics);

  const nextState: StudyMvpState = {
    ...state,
    courses,
    units,
    topics,
    retrieval_tasks: retrievalTasks,
  };

  try {
    assertStudyStateIntegrity(nextState);
  } catch (error) {
    addDiagnostic(diagnostics, "error", null, `Imported catalog failed integrity validation: ${error instanceof Error ? error.message : String(error)}`);
    return zeroResult(state, diagnostics);
  }

  return { ok: true, state: nextState, diagnostics, counts };
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n\t;]/.test(text) || text.trim() !== text
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

/** Export the editable topic/task catalog; use exportStudyMvpJSON for full state and history. */
export function exportTopicCatalogCsv(state: StudyMvpState): string {
  assertStudyStateIntegrity(state);
  const coursesById = new Map(state.courses.map((course) => [course.id, course]));
  const unitsById = new Map(state.units.map((unit) => [unit.id, unit]));
  const topicsById = new Map(state.topics.map((topic) => [topic.id, topic]));
  const tasksByTopic = new Map<EntityId, RetrievalTask[]>();
  for (const task of state.retrieval_tasks) {
    const items = tasksByTopic.get(task.topic_id) ?? [];
    items.push(task);
    tasksByTopic.set(task.topic_id, items);
  }

  const lines: string[] = [TOPIC_CSV_HEADERS.join(",")];
  for (const topic of state.topics) {
    const unit = unitsById.get(topic.unit_id);
    const course = unit ? coursesById.get(unit.course_id) : undefined;
    const prerequisites = topic.prerequisite_topic_ids
      .map((id) => topicsById.get(id))
      .filter((item): item is Topic => item !== undefined && item.unit_id === topic.unit_id)
      .map((item) => String(item.topic_number))
      .join("|");
    const tasks = tasksByTopic.get(topic.id) ?? [];
    const topicFields = [
      course?.code ?? "",
      course?.name ?? "",
      unit?.code ?? "",
      unit?.name ?? "",
      topic.topic_number,
      topic.title,
      topic.learning_objective,
      topic.objective_type,
      prerequisites,
      topic.topic_importance,
      topic.consolidation_estimated_duration_min,
    ];

    if (tasks.length === 0) {
      lines.push([...topicFields, "", "", "", "", "", ""].map(csvEscape).join(","));
    } else {
      for (const task of tasks) {
        lines.push([
          ...topicFields,
          task.prompt,
          task.expected_answer_criteria,
          task.task_type,
          task.purpose,
          task.estimated_duration_min,
          task.active,
        ].map(csvEscape).join(","));
      }
    }
  }

  return `${lines.join("\r\n")}\r\n`;
}
