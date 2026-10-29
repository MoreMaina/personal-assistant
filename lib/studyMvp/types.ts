/**
 * Study System App — MVP v1.2
 *
 * Canonical domain types. These types are separate from the legacy
 * five-box Study implementation so the new engine can be tested
 * before the existing interface or storage is changed.
 */

import type { DailyPlan } from "./dailyPlanner";

export type ISODate = string;
export type ISODateTime = string;
export type EntityId = string;
export type StudySessionSectionId =
  | "initial_learning"
  | "topic_gate"
  | "reviews"
  | "topic_consolidation"
  | "assignments"
  | "corrective"
  | "recovery"
  | "mixed_practice"
  | "sampler";

export type PlanTaskKind =
  | "initial_learning"
  | "topic_consolidation"
  | "gate"
  | "review"
  | "assignment"
  | "corrective"
  | "recovery"
  | "mixed_practice"
  | "sampler";

export type ObjectiveType =
  | "recall"
  | "explain"
  | "compare"
  | "solve"
  | "argue";

export type TopicStatus =
  | "not_started"
  | "in_learning"
  | "active"
  | "relearn"
  | "maintenance_pending_classification"
  | "archived"
  | "optional_maintenance"
  | "carried_forward";

export type GateResult =
  | "pending"
  | "passed"
  | "failed"
  | "skill_based_passed";

export type TopicImportance =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type TaskPriority = 1 | 2 | 3 | 4 | 5;
export type ReviewStage = 1 | 2 | 3 | 4 | 5;

export type RetrievalTaskType =
  | "definition"
  | "explanation"
  | "comparison"
  | "problem"
  | "essay_plan"
  | "application";

export type RetrievalPurpose =
  | "gate"
  | "review"
  | "retry"
  | "corrective"
  | "mixed"
  | "sampler";

export type AttemptResult = "green" | "yellow" | "red";

export type YellowGapSeverity = "minor" | "substantive";

export type ReviewResult =
  | AttemptResult
  | "incomplete";

export type ReviewEventKind =
  | "scheduled_review"
  | "retry";

export type ReviewEventStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "deferred"
  | "skipped"
  | "missed"
  | "retired";

export type PlanningDisposition =
  | "DO"
  | "DEFER"
  | "RELEARN"
  | "SKIP";

export type ForcedDisposition =
  | "complete"
  | "split"
  | "relearn"
  | "skip"
  | "override_defer";

export type SkipReentryCondition =
  | "later_failure"
  | "upcoming_exam"
  | "time_available"
  | "never";

export type TaskEventType =
  | "review_scheduled"
  | "attempt"
  | "gate_attempt"
  | "defer"
  | "skip"
  | "relearn"
  | "work_session"
  | "forced_disposition"
  | "priority_change"
  | "skip_resolution"
  | "content_preparation";

export type TaskEventSubjectType =
  | "review_event"
  | "retrieval_task"
  | "gate_attempt"
  | "assignment"
  | "corrective_task"
  | "topic_consolidation"
  | "initial_learning"
  | "mixed_practice"
  | "sampler";

export interface Course {
  id: EntityId;
  name: string;
  code: string;
  color: string;
  created_at: ISODateTime;
}

export interface Unit {
  id: EntityId;
  course_id: EntityId;
  code: string;
  name: string;
  order_index: number;
}

export interface Topic {
  id: EntityId;
  unit_id: EntityId;
  topic_number: number;
  title: string;
  order_index: number;

  learning_objective: string;
  objective_type: ObjectiveType;
  prerequisite_topic_ids: EntityId[];

  status: TopicStatus;
  planned_consolidation_date: ISODate | null;
  consolidation_estimated_duration_min: number;
  initial_study_date: ISODate | null;

  /**
   * Derived convenience fields.
   * The immutable TaskEvent history is authoritative.
   */
  gate_passed: boolean;
  gate_result: GateResult;

  weakness_flag: boolean;
  topic_importance: TopicImportance;
}

export type LectureKind = "lecture" | "lab" | "tutorial";

export interface Lecture {
  id: EntityId;
  unit_id: EntityId;
  topic_id: EntityId;
  date: ISODate;
  kind: LectureKind;
}

export interface RetrievalTask {
  id: EntityId;
  topic_id: EntityId;
  prompt: string;
  expected_answer_criteria: string;

  task_type: RetrievalTaskType;
  purpose: RetrievalPurpose;

  estimated_duration_min: number;
  last_used_on: ISODate | null;
  active: boolean;
}

export interface ReviewEvent {
  id: EntityId;
  topic_id: EntityId;

  stage: ReviewStage;
  event_kind: ReviewEventKind;
  holds_stage: boolean;

  /**
   * These IDs must be selected before the attempt starts.
   */
  selected_task_ids: EntityId[];

  overall_result: ReviewResult | null;
  yellow_gap_severity: YellowGapSeverity | null;

  source_review_id: EntityId | null;

  /**
   * Immutable once created. Sunday adjustments happen before
   * this date is recorded.
   */
  intended_due_date: ISODate;

  /**
   * Mutable operational date; never use it for historical
   * on-time metrics.
   */
  current_due_date: ISODate;

  completed_at: ISODateTime | null;

  priority_at_scheduling: TaskPriority;
  current_priority: TaskPriority;
  defer_count: number;

  moved_from_sunday: boolean;
  status: ReviewEventStatus;
}

export type WorkSubjectType =
  | "assignment"
  | "corrective"
  | "topic_consolidation";

export interface WorkSession {
  id: EntityId;
  subject_type: WorkSubjectType;
  subject_id: EntityId;
  planned_duration_min: number;
  actual_duration_min: number;
  logged_at: ISODateTime;
  notes: string;
}

export interface TaskEvent {
  id: EntityId;
  logged_at: ISODateTime;

  event_type: TaskEventType;
  subject_type: TaskEventSubjectType;
  subject_id: EntityId;

  review_event_id: EntityId | null;
  retrieval_task_id: EntityId | null;

  gate_session_id: EntityId | null;
  gate_selected_task_ids_snapshot: EntityId[] | null;
  skill_demonstrated_without_hints: boolean | null;

  work_session_id: EntityId | null;
  related_event_id: EntityId | null;

  estimated_duration_min_at_event: number | null;
  task_type_at_event: RetrievalTaskType | null;
  priority_at_event: TaskPriority | null;

  intended_due_date_at_event: ISODate | null;
  current_due_date_at_event: ISODate | null;

  actual_duration_min: number | null;
  result: AttemptResult | null;
  yellow_gap_severity: YellowGapSeverity | null;

  disposition: PlanningDisposition | ForcedDisposition | null;
  reason: string | null;

  critical_error_flag: boolean | null;
  defer_count_at_event: number | null;

  re_entry_condition: SkipReentryCondition | null;

  old_priority: TaskPriority | null;
  new_priority: TaskPriority | null;
}

export type AssignmentImportance = TopicImportance;

export type AssignmentStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface Assignment {
  id: EntityId;
  course_id: EntityId;
  title: string;
  due_date: ISODate;

  estimated_duration_min: number;
  remaining_min: number;
  max_session_min: number;

  importance: AssignmentImportance;
  status: AssignmentStatus;
}

export type ExamType = "cat1" | "cat2" | "final";

export interface Exam {
  id: EntityId;
  course_id: EntityId;
  type: ExamType;
  date: ISODate;
  coverage_units: EntityId[];
  coverage_topics: EntityId[];
}

export interface EngineChangeRecord {
  id: EntityId;
  date: ISODateTime;
  previous_version: string;
  new_version: string;
  bug: string;
  why_trial_could_not_continue: string;
  change: string;
}

export interface StudySettings {
  timezone: string;

  study_days: number[];
  rest_day: number;

  daily_budget_min: number;
  review_reserve_min: number;
  min_mixed_practice_min: number;

  mixed_practice_target_mon_wed: number;
  mixed_practice_target_thu_fri: number;

  repair_recovery_cap_min: number;
  recovery_block_min: number;
  default_assignment_session_target_min: number;

  intervals_days: [1, 3, 7, 14, 30];
  gate_threshold_pct: number;
  defer_limit: number;
  skip_rate_threshold_pct_p45: number;

  trial_start_date: ISODate | null;
  trial_end_date: ISODate | null;

  last_final_exam_date: ISODate | null;

  week4_evaluation_start: ISODate | null;
  week4_evaluation_end: ISODate | null;

  engine_version: string;
  engine_change_history: EngineChangeRecord[];
}

export interface WeekMetrics {
  week_number: number;
  week_start: ISODate;
  week_end: ISODate;

  overall_on_time_completion_pct: number | null;
  priority_1_3_on_time_completion_pct: number | null;

  deferral_rate_pct: number | null;
  total_deferral_decisions: number;

  median_duration_error_pct: Partial<
    Record<RetrievalTaskType, number | null>
  >;

  duration_error_sample_counts: Partial<
    Record<RetrievalTaskType, number>
  >;

  overdue_critical_backlog_min: number;

  priority_1_3_skip_count: number;
  priority_4_5_skip_rate_pct: number | null;

  notes: string;

  /**
   * Frozen evidence used to produce this snapshot.
   * Later estimates or queue changes must not rewrite it.
   */
  source_event_ids: EntityId[];
  source_snapshot: TaskEvent[];
}

export interface SettingsChangeRecord {
  id: EntityId;
  changed_at: ISODateTime;
  reason: string;
  changed_fields: string[];
  previous_values: Partial<StudySettings>;
  new_values: Partial<StudySettings>;
}

export interface SavedDailyPlanSnapshot {
  id: EntityId;
  date: ISODate;
  version: number;
  saved_at: ISODateTime;
  plan: DailyPlan;
}

export interface DailyPlanExecution {
  id: EntityId;
  date: ISODate;
  plan_snapshot_id: EntityId;
  completed_section_ids: StudySessionSectionId[];
  updated_at: ISODateTime;
}

export interface StudyMvpState {
  schema_version: 1;

  courses: Course[];
  units: Unit[];
  topics: Topic[];
  lectures: Lecture[];
  retrieval_tasks: RetrievalTask[];

  review_events: ReviewEvent[];
  task_events: TaskEvent[];
  work_sessions: WorkSession[];

  assignments: Assignment[];
  exams: Exam[];

  settings: StudySettings;
  weekly_metrics: WeekMetrics[];

  /**
   * Append-only audit history for settings changes.
   */
  settings_change_history: SettingsChangeRecord[];

  /**
   * Optional for compatibility with older schema-v1 records.
   * Saved snapshots are append-only; earlier versions are retained.
   */
  daily_plan_history?: SavedDailyPlanSnapshot[];
  daily_plan_executions?: DailyPlanExecution[];
}
