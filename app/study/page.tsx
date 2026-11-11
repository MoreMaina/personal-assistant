"use client";

import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent,
} from "react";
import Link from "next/link";
import { ItemWorkTimer } from "@/app/components/ItemWorkTimer";
import GuidedPracticeRunner from "@/app/study/GuidedPracticeRunner";

import {
  addCalendarDays,
  localDateOfTimestamp,
} from "@/lib/studyMvp/reviewEngine";

import {
  buildStudyDailyPlan,
  getDefaultGateTaskIds,
  getLatestGateSession,
} from "@/lib/studyMvp/dashboard";

import type {
  ExplicitPlanningDecision,
  ForcedPlanningDecision,
} from "@/lib/studyMvp/dailyPlanner";

import { applyDailyPlanDecisions } from "@/lib/studyMvp/planningWorkflow";

import {
  appendDailyPlanSnapshot,
  completeDailyPlanSection,
} from "@/lib/studyMvp/dailyPlanHistory";
import { getDailyPlanItemPresentation } from "@/lib/studyMvp/planPresentation";
import { getGateReadiness } from "@/lib/studyMvp/gateReadiness";
import {
  canCompleteMixedPracticeWithoutQuestions,
  getGuidedPracticeSessionSelection,
} from "@/lib/studyMvp/guidedPractice";

import {
  applyGateAttempt,
  applyReviewAttempt,
  pauseIncompleteReview,
  reactivateGateSessionTasks,
  startTopicLearning,
} from "@/lib/studyMvp/workflow";

import {
  exportStudyMvpJSON,
  removeUnusedStarterScaffold,
} from "@/lib/studyMvp/storage";
import { unlinkClassesFromStudyUnits } from "@/lib/classStorage";

import { useCloudStudyState } from "@/lib/studyMvp/useCloudStudyState";

import {
  exportTopicCatalogCsv,
  importTopicCatalogText,
  type TopicImportDiagnostic,
} from "@/lib/studyMvp/csvImport";

import { defaultIdFactory } from "@/lib/studyMvp/reviewEngine";

import type {
  AttemptResult,
  EntityId,
  ForcedDisposition,
  RetrievalTask,
  SavedDailyPlanSnapshot,
  SkipReentryCondition,
  StudyMvpState,
  TaskEvent,
  Topic,
  WorkSession,
  YellowGapSeverity,
} from "@/lib/studyMvp/types";

import type {
  PlanTaskKind,
  StudySessionSectionId,
} from "@/lib/studyMvp/types";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Format an ISO study date as a readable label, e.g. "Nov 9th". */
function formatStudyDateLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return value;
  }

  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";

  const monthLabel = date.toLocaleDateString("en-US", { month: "short" });
  return `${monthLabel} ${day}${suffix}`;
}

function downloadFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

function topicPriority(topic: Topic): 1 | 2 | 3 | 4 | 5 {
  const base = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
  }[topic.topic_importance];

  return Math.max(
    1,
    topic.weakness_flag ? base - 1 : base,
  ) as 1 | 2 | 3 | 4 | 5;
}

const FORCED_PLANNING_DISPOSITIONS: ForcedDisposition[] = [
  "complete",
  "split",
  "relearn",
  "skip",
  "override_defer",
];

function isForcedPlanningDisposition(
  value: string,
): value is ForcedDisposition {
  return FORCED_PLANNING_DISPOSITIONS.includes(
    value as ForcedDisposition,
  );
}

function sectionIdForTaskKind(
  kind: PlanTaskKind,
): StudySessionSectionId {
  switch (kind) {
    case "initial_learning":
      return "initial_learning";
    case "gate":
      return "topic_gate";
    case "review":
      return "reviews";
    case "topic_consolidation":
      return "topic_consolidation";
    case "assignment":
      return "assignments";
    case "corrective":
      return "corrective";
    case "recovery":
      return "recovery";
    case "mixed_practice":
      return "mixed_practice";
    case "sampler":
      return "sampler";
  }
}

function pillClass(value: string): string {
  if (
    value === "DO" ||
    value === "PROTECTED" ||
    value === "passed" ||
    value === "skill_based_passed" ||
    value === "green"
  ) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (
    value === "DEFER" ||
    value === "in_learning" ||
    value === "pending" ||
    value === "yellow" ||
    value === "in_progress"
  ) {
    return "bg-amber-100 text-amber-800";
  }

  if (
    value === "SKIP" ||
    value === "RELEARN" ||
    value === "failed" ||
    value === "red"
  ) {
    return "bg-rose-100 text-rose-800";
  }

  return "bg-stone-100 text-stone-700";
}

const STUDY_FORM_CONTROL_CLASS =
  "w-full rounded-xl border border-[#d8ccb8] bg-white px-3 py-3 text-sm font-semibold text-stone-800 placeholder:text-stone-400 shadow-sm transition-colors focus:border-[#557c61] focus:outline-none focus:ring-2 focus:ring-[#dce8d8] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500";

const STUDY_FORM_CONTROL_COMPACT_CLASS =
  "w-full rounded-xl border border-[#d8ccb8] bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 placeholder:text-stone-400 shadow-sm transition-colors focus:border-[#557c61] focus:outline-none focus:ring-2 focus:ring-[#dce8d8] disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500";

function SectionHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="mb-4">
      <p className="mb-1 text-xs font-extrabold uppercase tracking-[0.15em] text-stone-500">
        {eyebrow}
      </p>
      <h2 className="text-xl font-bold">{title}</h2>
      {detail && (
        <p className="mt-1 max-w-3xl text-sm font-semibold leading-5 text-stone-600">
          {detail}
        </p>
      )}
    </div>
  );
}

function InitialLearningSection({
  state,
  snapshot,
  today,
  persist,
  onStartLearning,
}: {
  state: StudyMvpState;
  snapshot: SavedDailyPlanSnapshot;
  today: string;
  persist: (
    next: StudyMvpState,
    successMessage?: string,
  ) => boolean;
  onStartLearning: (topicId: EntityId) => void;
}) {
  const [actualDurationMin, setActualDurationMin] = useState(5);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const item =
    snapshot.plan.items.find(
      (candidate) => candidate.kind === "initial_learning",
    ) ?? null;

  const topic = item
    ? state.topics.find(
        (candidate) => candidate.id === item.subject_id,
      ) ?? null
    : null;

  const loggedMinutes = topic
    ? state.work_sessions
        .filter(
          (session) =>
            session.subject_type === "initial_learning" &&
            session.subject_id === topic.id &&
            localDateOfTimestamp(
              session.logged_at,
              state.settings.timezone,
            ) === today,
        )
        .reduce(
          (total, session) => total + session.actual_duration_min,
          0,
        )
    : 0;

  const requiredTimeRecorded = Boolean(
    item &&
      item.allocated_minutes > 0 &&
      loggedMinutes >= item.allocated_minutes,
  );

  function saveLearningSession(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (!item || !topic || item.allocated_minutes <= 0) {
      setError(
        "This learning item is unavailable or has no allocated time. Review today's plan before continuing.",
      );
      return;
    }

    if (topic.status !== "in_learning") {
      setError(
        "Start learning for this topic before recording a learning session.",
      );
      return;
    }

    if (
      !Number.isFinite(actualDurationMin) ||
      actualDurationMin < 1 ||
      actualDurationMin > 600
    ) {
      setError("Enter an actual duration between 1 and 600 minutes.");
      return;
    }

    if (requiredTimeRecorded) {
      setError(
        "The allocated learning time has already been recorded. Complete this section before moving on.",
      );
      return;
    }

    const loggedAt = new Date().toISOString();
    const sessionId = newId("work-session");
    const trimmedNotes = notes.trim();

    const session: WorkSession = {
      id: sessionId,
      subject_type: "initial_learning",
      subject_id: topic.id,
      planned_duration_min: item.allocated_minutes,
      actual_duration_min: actualDurationMin,
      logged_at: loggedAt,
      notes: trimmedNotes,
    };

    const taskEvent: TaskEvent = {
      id: newId("event"),
      logged_at: loggedAt,
      event_type: "work_session",
      subject_type: "initial_learning",
      subject_id: topic.id,
      review_event_id: null,
      retrieval_task_id: null,
      gate_session_id: null,
      gate_selected_task_ids_snapshot: null,
      skill_demonstrated_without_hints: null,
      work_session_id: sessionId,
      related_event_id: null,
      estimated_duration_min_at_event: item.allocated_minutes,
      task_type_at_event: null,
      priority_at_event: item.priority,
      intended_due_date_at_event: item.intended_due_date,
      current_due_date_at_event: item.current_due_date,
      actual_duration_min: actualDurationMin,
      result: null,
      yellow_gap_severity: null,
      disposition: null,
      reason: trimmedNotes || null,
      critical_error_flag: null,
      defer_count_at_event: item.defer_count,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
    };

    const nextState: StudyMvpState = {
      ...state,
      work_sessions: [
        ...state.work_sessions,
        session,
      ],
      task_events: [
        ...state.task_events,
        taskEvent,
      ],
    };

    if (
      persist(
        nextState,
        `Recorded ${actualDurationMin} minutes of initial learning for "${topic.title}".`,
      )
    ) {
      setNotes("");
    }
  }

  function finishLearningSection() {
    if (!requiredTimeRecorded || !item) return;

    setError("");

    try {
      const nextState = completeDailyPlanSection(
        state,
        snapshot.id,
        "initial_learning",
        new Date().toISOString(),
      );

      persist(
        nextState,
        "Initial learning section completed. The next planned section is now eligible.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete the initial-learning section.",
      );
    }
  }

  return (
    <section
      id="initial-learning"
      className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
    >
      <SectionHeading
        eyebrow="Study activity"
        title="Initial learning"
        detail="Record time spent on the planned topic."
      />
            <ItemWorkTimer
        itemId="study-section:initial-learning"
        itemName="Initial learning"
        defaultMinutes={25}
      />
      
      {!item || item.allocated_minutes <= 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm font-semibold text-stone-600">
          This plan has no positive initial-learning allocation to work on.
          Review or replan today&apos;s worklist before continuing.
        </p>
      ) : !topic ? (
        <p className="rounded-xl bg-white p-4 text-sm font-semibold text-rose-800">
          The planned topic could not be found. Replan today&apos;s worklist before continuing.
        </p>
      ) : (
        <>
          <div className="rounded-2xl border border-[#e4dac9] bg-white p-4">
            <h3 className="font-extrabold text-[#23412f]">
              {topic.title}
            </h3>
            <p className="mt-2 text-sm font-semibold text-stone-600">
              {topic.learning_objective}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-[#efe4d1] p-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
                  Planned allocation
                </p>
                <p className="mt-1 text-xl font-extrabold text-[#23412f]">
                  {item.allocated_minutes} min
                </p>
              </div>
              <div className="rounded-xl bg-[#efe4d1] p-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
                  Actual time recorded today
                </p>
                <p className="mt-1 text-xl font-extrabold text-[#23412f]">
                  {loggedMinutes} min
                </p>
              </div>
            </div>
          </div>

          {topic.status === "not_started" ? (
            <div className="mt-4">
              <p className="mb-3 text-sm font-semibold text-stone-600">
                Start the topic before recording your learning session.
              </p>
              <button
                type="button"
                onClick={() => onStartLearning(topic.id)}
                className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#183021]"
              >
                Start learning
              </button>
            </div>
          ) : topic.status === "in_learning" ? (
            <form
              onSubmit={saveLearningSession}
              className="mt-5 space-y-4"
            >
              <label className="block">
                <span className="mb-1 block text-sm font-extrabold text-stone-700">
                  Actual study duration (minutes)
                </span>
                <input
                  type="number"
                  min={1}
                  max={600}
                  step={1}
                  value={actualDurationMin}
                  onChange={(event) =>
                    setActualDurationMin(Number(event.target.value))
                  }
                  disabled={requiredTimeRecorded}
                  className={STUDY_FORM_CONTROL_CLASS}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-extrabold text-stone-700">
                  What did you work on? (optional)
                </span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={requiredTimeRecorded}
                  placeholder="Record the material studied or work completed."
                  className={STUDY_FORM_CONTROL_CLASS}
                />
              </label>

              <button
                type="submit"
                disabled={requiredTimeRecorded}
                className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#183021] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Record actual learning session
              </button>
            </form>
          ) : (
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              This topic is currently marked {topic.status.replace(/_/g, " ")}.
              Review the saved plan before continuing with initial learning.
            </p>
          )}

          <div className="mt-5 rounded-2xl border border-[#d8ccb8] p-4">
            <p className="text-sm font-semibold text-stone-700">
              {requiredTimeRecorded
                ? "The planned initial-learning time has been recorded as actual work."
                : `Record ${Math.max(
                    0,
                    item.allocated_minutes - loggedMinutes,
                  )} more actual minute(s) before completing this section.`}
            </p>
            <button
              type="button"
              onClick={finishLearningSection}
              disabled={!requiredTimeRecorded}
              className="mt-3 rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#183021] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
            >
              Complete initial-learning section
            </button>
          </div>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800"
        >
          {error}
        </p>
      )}
    </section>
  );
}

function TopicConsolidationSection({
  state,
  snapshot,
  today,
  persist,
}: {
  state: StudyMvpState;
  snapshot: SavedDailyPlanSnapshot;
  today: string;
  persist: (
    next: StudyMvpState,
    successMessage?: string,
  ) => boolean;
}) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [actualDurationMin, setActualDurationMin] = useState(5);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const items = snapshot.plan.items.filter(
    (item) => item.kind === "topic_consolidation",
  );

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ??
    items[0] ??
    null;

  function topicFor(
    item: (typeof items)[number],
  ): Topic | null {
    return (
      state.topics.find(
        (topic) => topic.id === item.subject_id,
      ) ?? null
    );
  }

  function loggedMinutesFor(topicId: EntityId): number {
    return state.work_sessions
      .filter(
        (session) =>
          session.subject_type === "topic_consolidation" &&
          session.subject_id === topicId &&
          localDateOfTimestamp(
            session.logged_at,
            state.settings.timezone,
          ) === today,
      )
      .reduce(
        (total, session) => total + session.actual_duration_min,
        0,
      );
  }

  const allAllocationsRecorded =
    items.length > 0 &&
    items.every((item) => {
      const topic = topicFor(item);

      return Boolean(
        topic &&
          item.allocated_minutes > 0 &&
          loggedMinutesFor(topic.id) >= item.allocated_minutes,
      );
    });

  const allGuidedQuestionsCompleted =
    items.length > 0 &&
    items.every((item) => {
      const selection = getGuidedPracticeSessionSelection(
        state,
        "mixed",
        item.subject_id,
        today,
        item.allocated_minutes,
      );

      return (
        selection.selectedTaskIds.length > 0 &&
        selection.missingTaskIds.length === 0 &&
        selection.selectedTaskIds.every((id) =>
          selection.attemptedTaskIds.includes(id),
        )
      );
    });

  function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedItem) {
      setError("No topic-consolidation item is available in this plan.");
      return;
    }

    const topic = topicFor(selectedItem);

    if (!topic) {
      setError("The planned topic could not be found. Review today's plan.");
      return;
    }

    if (topic.status !== "in_learning") {
      setError(
        "This topic is no longer in the learning state. Review today's plan before recording work.",
      );
      return;
    }

    if (selectedItem.allocated_minutes <= 0) {
      setError(
        "This item has no positive time allocation. Replan today's worklist before continuing.",
      );
      return;
    }

    if (
      !Number.isSafeInteger(actualDurationMin) ||
      actualDurationMin < 1 ||
      actualDurationMin > 600
    ) {
      setError("Enter an actual duration between 1 and 600 whole minutes.");
      return;
    }

    if (
      loggedMinutesFor(topic.id) >= selectedItem.allocated_minutes
    ) {
      setError(
        "The allocated consolidation time is already recorded for this topic today.",
      );
      return;
    }

    const loggedAt = new Date().toISOString();
    const sessionId = newId("work-session");
    const trimmedNotes = notes.trim();

    const session: WorkSession = {
      id: sessionId,
      subject_type: "topic_consolidation",
      subject_id: topic.id,
      planned_duration_min: selectedItem.allocated_minutes,
      actual_duration_min: actualDurationMin,
      logged_at: loggedAt,
      notes: trimmedNotes,
    };

    const taskEvent: TaskEvent = {
      id: newId("event"),
      logged_at: loggedAt,
      event_type: "work_session",
      subject_type: "topic_consolidation",
      subject_id: topic.id,
      review_event_id: null,
      retrieval_task_id: null,
      gate_session_id: null,
      gate_selected_task_ids_snapshot: null,
      skill_demonstrated_without_hints: null,
      work_session_id: sessionId,
      related_event_id: null,
      estimated_duration_min_at_event: selectedItem.estimated_minutes,
      task_type_at_event: null,
      priority_at_event: selectedItem.priority,
      intended_due_date_at_event: selectedItem.intended_due_date,
      current_due_date_at_event: selectedItem.current_due_date,
      actual_duration_min: actualDurationMin,
      result: null,
      yellow_gap_severity: null,
      disposition: null,
      reason: trimmedNotes || null,
      critical_error_flag: null,
      defer_count_at_event: selectedItem.defer_count,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
    };

    const nextState: StudyMvpState = {
      ...state,
      work_sessions: [...state.work_sessions, session],
      task_events: [...state.task_events, taskEvent],
    };

    if (
      persist(
        nextState,
        `Recorded ${actualDurationMin} minutes of topic consolidation for "${topic.title}".`,
      )
    ) {
      setNotes("");
    }
  }

  function finishSection() {
    if (!allAllocationsRecorded) return;
    setError("");

    try {
      const nextState = completeDailyPlanSection(
        state,
        snapshot.id,
        "topic_consolidation",
        new Date().toISOString(),
      );

      persist(
        nextState,
        "Topic-consolidation section completed. The next planned section is now eligible.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete the topic-consolidation section.",
      );
    }
  }

  const selectedTopic = selectedItem
    ? topicFor(selectedItem)
    : null;

  const selectedLoggedMinutes = selectedTopic
    ? loggedMinutesFor(selectedTopic.id)
    : 0;

  const selectedAllocationReached = Boolean(
    selectedItem &&
      selectedLoggedMinutes >= selectedItem.allocated_minutes,
  );

  return (
    <section
      id="topic-consolidation"
      className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
    >
      <SectionHeading
        eyebrow="Study activity"
        title="Topic consolidation"
        detail="Log time spent consolidating each topic."
      />

      <ItemWorkTimer
        itemId="study-section:topic-consolidation"
        itemName="Topic consolidation"
        defaultMinutes={25}
      />      

      <div className="mb-5 rounded-2xl bg-white p-4">
        <h3 className="font-extrabold text-[#23412f]">
          Today&apos;s consolidation allocations
        </h3>
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const topic = topicFor(item);
            const logged = topic ? loggedMinutesFor(topic.id) : 0;

            return (
              <li
                key={item.id}
                className="flex flex-wrap justify-between gap-2 rounded-xl bg-[#efe4d1] p-3 text-sm font-semibold"
              >
                <span>{topic?.title ?? "Missing planned topic"}</span>
                <span>
                  {logged} / {item.allocated_minutes} min recorded
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm font-semibold text-stone-600">
          No topic-consolidation items are available in this saved plan.
        </p>
      ) : (
        <>
          <form onSubmit={saveSession} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Topic to work on
              </span>
              <select
                value={selectedItem?.id ?? ""}
                onChange={(event) => setSelectedItemId(event.target.value)}
                className={STUDY_FORM_CONTROL_CLASS}
              >
                {items.map((item) => {
                  const topic = topicFor(item);

                  return (
                    <option key={item.id} value={item.id}>
                      {topic?.title ?? item.subject_id} · {item.allocated_minutes} min
                    </option>
                  );
                })}
              </select>
            </label>

            {selectedTopic?.status === "in_learning" ? (
              <>
                <label className="block">
                  <span className="mb-1 block text-sm font-extrabold text-stone-700">
                    Actual study duration (minutes)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    step={1}
                    value={actualDurationMin}
                    onChange={(event) =>
                      setActualDurationMin(Number(event.target.value))
                    }
                    disabled={selectedAllocationReached}
                    className={STUDY_FORM_CONTROL_CLASS}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-extrabold text-stone-700">
                    What did you work on? (optional)
                  </span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    disabled={selectedAllocationReached}
                    placeholder="Record the material reviewed or practice completed."
                    className={STUDY_FORM_CONTROL_CLASS}
                  />
                </label>

                <button
                  type="submit"
                  disabled={selectedAllocationReached}
                  className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#183021] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Record actual consolidation session
                </button>
              </>
            ) : (
              <p className="rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                This topic is unavailable for consolidation in its current state. Review today&apos;s plan before continuing.
              </p>
            )}
          </form>

          <div className="mt-5 rounded-2xl border border-[#d8ccb8] p-4">
            <p className="text-sm font-semibold text-stone-700">
              {allAllocationsRecorded
                ? "The actual consolidation time allocated to every planned topic has been recorded today."
                : "Record the outstanding actual consolidation time for every planned topic before completing this section."}
            </p>
            <button
              type="button"
              onClick={finishSection}
              disabled={!allAllocationsRecorded}
              className="mt-3 rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#183021] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
            >
              Complete topic-consolidation section
            </button>
          </div>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800"
        >
          {error}
        </p>
      )}
    </section>
  );
}

function AssignmentSection({
  state,
  snapshot,
  today,
  persist,
}: {
  state: StudyMvpState;
  snapshot: SavedDailyPlanSnapshot;
  today: string;
  persist: (
    next: StudyMvpState,
    successMessage?: string,
  ) => boolean;
}) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [actualDurationMin, setActualDurationMin] = useState(5);
  const [remainingAfterSession, setRemainingAfterSession] =
    useState<number | null>(null);
  const [markComplete, setMarkComplete] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const items = snapshot.plan.items.filter(
    (item) =>
      item.kind === "assignment" &&
      item.allocated_minutes > 0,
  );

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ??
    items[0] ??
    null;

  function assignmentFor(item: (typeof items)[number]) {
    return (
      state.assignments.find(
        (assignment) => assignment.id === item.subject_id,
      ) ?? null
    );
  }

  const assignment = selectedItem
    ? assignmentFor(selectedItem)
    : null;

  function loggedMinutesFor(assignmentId: EntityId): number {
    return state.work_sessions
      .filter(
        (session) =>
          session.subject_type === "assignment" &&
          session.subject_id === assignmentId &&
          localDateOfTimestamp(
            session.logged_at,
            state.settings.timezone,
          ) === today,
      )
      .reduce(
        (total, session) => total + session.actual_duration_min,
        0,
      );
  }

  const allAllocationsRecorded =
    items.length > 0 &&
    items.every((item) => {
      const plannedAssignment = assignmentFor(item);

      return Boolean(
        plannedAssignment &&
          (
            plannedAssignment.status === "completed" ||
            plannedAssignment.status === "cancelled" ||
            loggedMinutesFor(plannedAssignment.id) >=
              item.allocated_minutes
          ),
      );
    });  

  const defaultRemainingMinutes = assignment
    ? Math.max(
        0,
        assignment.remaining_min - actualDurationMin,
      )
    : 0;

  const remainingMinutesAfterSession =
    remainingAfterSession ?? defaultRemainingMinutes;

  function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedItem || !assignment) {
      setError(
        "The selected assignment could not be found. Review today's plan.",
      );
      return;
    }

    if (
      assignment.status === "completed" ||
      assignment.status === "cancelled"
    ) {
      setError(
        "This assignment is no longer active. Select another planned assignment.",
      );
      return;
    }

    if (
      !Number.isSafeInteger(actualDurationMin) ||
      actualDurationMin < 1 ||
      actualDurationMin > 600
    ) {
      setError(
        "Enter an actual duration between 1 and 600 whole minutes.",
      );
      return;
    }

    if (
      loggedMinutesFor(assignment.id) >=
      selectedItem.allocated_minutes
    ) {
      setError(
        "The planned assignment time has already been recorded today.",
      );
      return;
    }

    if (
      !Number.isSafeInteger(remainingMinutesAfterSession) ||
      remainingMinutesAfterSession < 0
    ) {
      setError(
        "Enter a valid non-negative estimate for the remaining work.",
      );
      return;
    }

    if (
      markComplete &&
      remainingMinutesAfterSession !== 0
    ) {
      setError(
        "Set the remaining estimate to zero when confirming completion.",
      );
      return;
    }

    if (
      !markComplete &&
      remainingMinutesAfterSession === 0
    ) {
      setError(
        "If work remains unfinished, enter a positive remaining-time estimate. Otherwise, explicitly confirm completion.",
      );
      return;
    }

    const loggedAt = new Date().toISOString();
    const sessionId = newId("work-session");
    const trimmedNotes = notes.trim();

    const session: WorkSession = {
      id: sessionId,
      subject_type: "assignment",
      subject_id: assignment.id,
      planned_duration_min: selectedItem.allocated_minutes,
      actual_duration_min: actualDurationMin,
      logged_at: loggedAt,
      notes: trimmedNotes,
    };

    const taskEvent: TaskEvent = {
      id: newId("event"),
      logged_at: loggedAt,
      event_type: "work_session",
      subject_type: "assignment",
      subject_id: assignment.id,
      review_event_id: null,
      retrieval_task_id: null,
      gate_session_id: null,
      gate_selected_task_ids_snapshot: null,
      skill_demonstrated_without_hints: null,
      work_session_id: sessionId,
      related_event_id: null,
      estimated_duration_min_at_event:
        selectedItem.estimated_minutes,
      task_type_at_event: null,
      priority_at_event: selectedItem.priority,
      intended_due_date_at_event:
        selectedItem.intended_due_date,
      current_due_date_at_event:
        selectedItem.current_due_date,
      actual_duration_min: actualDurationMin,
      result: null,
      yellow_gap_severity: null,
      disposition: null,
      reason: markComplete
        ? `Assignment explicitly marked complete. ${trimmedNotes}`.trim()
        : trimmedNotes || null,
      critical_error_flag: null,
      defer_count_at_event: selectedItem.defer_count,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
    };

    const nextState: StudyMvpState = {
      ...state,
      assignments: state.assignments.map((item) =>
        item.id === assignment.id
          ? {
              ...item,
              remaining_min: markComplete
                ? 0
                : remainingMinutesAfterSession,
              status: markComplete
                ? "completed"
                : item.status === "pending"
                  ? "in_progress"
                  : item.status,
            }
          : item,
      ),
      work_sessions: [...state.work_sessions, session],
      task_events: [...state.task_events, taskEvent],
    };

    if (
      persist(
        nextState,
        markComplete
          ? `Recorded ${actualDurationMin} minutes and marked "${assignment.title}" complete.`
          : `Recorded ${actualDurationMin} minutes for "${assignment.title}".`,
      )
    ) {
      setNotes("");
      setRemainingAfterSession(null);
      setMarkComplete(false);
    }
  }

  function finishSection() {
    if (!allAllocationsRecorded) return;

    setError("");

    try {
      const nextState = completeDailyPlanSection(
        state,
        snapshot.id,
        "assignments",
        new Date().toISOString(),
      );

      persist(
        nextState,
        "Assignments section completed. The next planned section is now eligible.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete the assignments section.",
      );
    }
  }

  return (
    <section
      id="assignments"
      className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
    >
      <SectionHeading
        eyebrow="Study activity"
        title="Assignments"
        detail="Log time and update the remaining work."
      />

      <ItemWorkTimer
        itemId="study-section:assignments"
        itemName="Assignments"
        defaultMinutes={25}
      />
      
      {items.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm font-semibold text-stone-600">
          There are no positively allocated assignments in today&apos;s saved plan.
        </p>
      ) : (
        <>
          <div className="mb-5 rounded-2xl bg-white p-4">
            <h3 className="font-extrabold text-[#23412f]">
              Today&apos;s assignment allocations
            </h3>
            <ul className="mt-3 space-y-2">
              {items.map((item) => {
                const plannedAssignment = assignmentFor(item);
                const logged = plannedAssignment
                  ? loggedMinutesFor(plannedAssignment.id)
                  : 0;

                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap justify-between gap-2 rounded-xl bg-[#efe4d1] p-3 text-sm font-semibold"
                  >
                    <span>
                      {plannedAssignment?.title ??
                        "Missing planned assignment"}
                    </span>
                    <span>
                      {logged} / {item.allocated_minutes} min recorded
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <form onSubmit={saveSession} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Assignment to work on
              </span>
              <select
                value={selectedItem?.id ?? ""}
                onChange={(event) => {
                  setSelectedItemId(event.target.value);
                  setRemainingAfterSession(null);
                  setMarkComplete(false);
                  setError("");
                }}
                className={STUDY_FORM_CONTROL_CLASS}
              >
                {items.map((item) => {
                  const plannedAssignment = assignmentFor(item);

                  return (
                    <option key={item.id} value={item.id}>
                      {plannedAssignment?.title ?? item.subject_id}
                      {" · "}
                      {item.allocated_minutes} min allocated
                    </option>
                  );
                })}
              </select>
            </label>

            {!assignment ? (
              <p className="rounded-xl bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                The planned assignment could not be found. Review today&apos;s plan.
              </p>
            ) : assignment.status === "completed" ||
              assignment.status === "cancelled" ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                This assignment is {assignment.status}. Select another active assignment or review today&apos;s plan.
              </p>
            ) : (
              <>
                <div className="rounded-xl bg-white p-4">
                  <p className="text-sm font-bold text-stone-600">
                    Due {assignment.due_date}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-stone-600">
                    Estimated work remaining: {assignment.remaining_min} min
                  </p>
                </div>

                <label className="block">
                  <span className="mb-1 block text-sm font-extrabold text-stone-700">
                    Actual work duration (minutes)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    step={1}
                    value={actualDurationMin}
                    onChange={(event) =>
                      setActualDurationMin(Number(event.target.value))
                    }
                    disabled={
                      loggedMinutesFor(assignment.id) >=
                      selectedItem!.allocated_minutes
                    }
                    className={STUDY_FORM_CONTROL_CLASS}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-extrabold text-stone-700">
                    Estimated minutes remaining after this session
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    value={remainingMinutesAfterSession}
                    onChange={(event) =>
                      setRemainingAfterSession(Number(event.target.value))
                    }
                    disabled={markComplete}
                    className={STUDY_FORM_CONTROL_CLASS}
                  />
                  <span className="mt-1 block text-xs font-semibold text-stone-500">
                    Defaults to the current estimate minus this session&apos;s duration. Adjust it if your actual remaining workload is different.
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm font-semibold text-stone-700">
                  <input
                    type="checkbox"
                    checked={markComplete}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setMarkComplete(checked);
                      setRemainingAfterSession(checked ? 0 : null);
                    }}
                    className="mt-1 accent-[#23412f]"
                  />
                  I confirm that this assignment is complete.
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-extrabold text-stone-700">
                    Work completed (optional)
                  </span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    disabled={
                      loggedMinutesFor(assignment.id) >=
                      selectedItem!.allocated_minutes
                    }
                    placeholder="Describe the work completed during this session."
                    className={STUDY_FORM_CONTROL_CLASS}
                  />
                </label>

                <button
                  type="submit"
                  disabled={
                    loggedMinutesFor(assignment.id) >=
                    selectedItem!.allocated_minutes
                  }
                  className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#183021] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Record assignment work session
                </button>
              </>
            )}
          </form>

          <div className="mt-5 rounded-2xl border border-[#d8ccb8] p-4">
            <p className="text-sm font-semibold text-stone-700">
              {allAllocationsRecorded
                ? "All planned assignment allocations have been recorded or explicitly resolved."
                : "Record the planned time for every active assignment, or explicitly resolve an assignment, before completing this section."}
            </p>
            <button
              type="button"
              onClick={finishSection}
              disabled={!allAllocationsRecorded}
              className="mt-3 rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#183021] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
            >
              Complete assignments section
            </button>
          </div>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800"
        >
          {error}
        </p>
      )}
    </section>
  );
}

function CorrectiveSection({
  state,
  snapshot,
  today,
  persist,
}: {
  state: StudyMvpState;
  snapshot: SavedDailyPlanSnapshot;
  today: string;
  persist: (
    next: StudyMvpState,
    successMessage?: string,
  ) => boolean;
}) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [actualDurationMin, setActualDurationMin] = useState(5);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const items = snapshot.plan.items.filter(
    (item) =>
      item.kind === "corrective" &&
      item.allocated_minutes > 0,
  );

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ??
    items[0] ??
    null;

  function labelFor(item: (typeof items)[number]): string {
    const task = state.retrieval_tasks.find(
      (candidate) => candidate.id === item.subject_id,
    );

    const topic = state.topics.find(
      (candidate) => candidate.id === item.subject_id,
    );

    return (
      task?.prompt ??
      topic?.title ??
      `Corrective work · ${item.subject_id.slice(0, 8)}`
    );
  }

  function loggedMinutesFor(subjectId: EntityId): number {
    return state.work_sessions
      .filter(
        (session) =>
          session.subject_type === "corrective" &&
          session.subject_id === subjectId &&
          localDateOfTimestamp(
            session.logged_at,
            state.settings.timezone,
          ) === today,
      )
      .reduce(
        (total, session) => total + session.actual_duration_min,
        0,
      );
  }

  const allAllocationsRecorded =
    items.length > 0 &&
    items.every(
      (item) =>
        loggedMinutesFor(item.subject_id) >=
        item.allocated_minutes,
    );

  function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedItem) {
      setError(
        "No corrective-work item is available in today's saved plan.",
      );
      return;
    }

    if (
      !Number.isSafeInteger(actualDurationMin) ||
      actualDurationMin < 1 ||
      actualDurationMin > 600
    ) {
      setError(
        "Enter an actual duration between 1 and 600 whole minutes.",
      );
      return;
    }

    if (
      loggedMinutesFor(selectedItem.subject_id) >=
      selectedItem.allocated_minutes
    ) {
      setError(
        "The planned corrective-work time has already been recorded today.",
      );
      return;
    }

    const loggedAt = new Date().toISOString();
    const sessionId = newId("work-session");
    const trimmedNotes = notes.trim();

    const session: WorkSession = {
      id: sessionId,
      subject_type: "corrective",
      subject_id: selectedItem.subject_id,
      planned_duration_min: selectedItem.allocated_minutes,
      actual_duration_min: actualDurationMin,
      logged_at: loggedAt,
      notes: trimmedNotes,
    };

    const taskEvent: TaskEvent = {
      id: newId("event"),
      logged_at: loggedAt,
      event_type: "work_session",
      subject_type: "corrective_task",
      subject_id: selectedItem.subject_id,
      review_event_id: null,
      retrieval_task_id: null,
      gate_session_id: null,
      gate_selected_task_ids_snapshot: null,
      skill_demonstrated_without_hints: null,
      work_session_id: sessionId,
      related_event_id: null,
      estimated_duration_min_at_event:
        selectedItem.estimated_minutes,
      task_type_at_event: null,
      priority_at_event: selectedItem.priority,
      intended_due_date_at_event:
        selectedItem.intended_due_date,
      current_due_date_at_event:
        selectedItem.current_due_date,
      actual_duration_min: actualDurationMin,
      result: null,
      yellow_gap_severity: null,
      disposition: null,
      reason: trimmedNotes || null,
      critical_error_flag: null,
      defer_count_at_event: selectedItem.defer_count,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
    };

    const nextState: StudyMvpState = {
      ...state,
      work_sessions: [...state.work_sessions, session],
      task_events: [...state.task_events, taskEvent],
    };

    if (
      persist(
        nextState,
        `Recorded ${actualDurationMin} minutes of corrective work.`,
      )
    ) {
      setNotes("");
    }
  }

  function finishSection() {
    if (!allAllocationsRecorded) return;

    setError("");

    try {
      const nextState = completeDailyPlanSection(
        state,
        snapshot.id,
        "corrective",
        new Date().toISOString(),
      );

      persist(
        nextState,
        "Corrective-work allocation recorded. The next planned section is now eligible.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete today's corrective-work section.",
      );
    }
  }

  return (
    <section
      id="corrective"
      className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
    >
      <SectionHeading
        eyebrow="Study activity"
        title="Corrective work"
        detail="Record time spent closing learning gaps."
      />

      <ItemWorkTimer
        itemId="study-section:corrective"
        itemName="Corrective work"
        defaultMinutes={25}
      />

      {items.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm font-semibold text-stone-600">
          There are no positively allocated corrective-work items in today&apos;s saved plan.
        </p>
      ) : (
        <>
          <div className="mb-5 rounded-2xl bg-white p-4">
            <h3 className="font-extrabold text-[#23412f]">
              Today&apos;s corrective-work allocations
            </h3>
            <ul className="mt-3 space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap justify-between gap-2 rounded-xl bg-[#efe4d1] p-3 text-sm font-semibold"
                >
                  <span>{labelFor(item)}</span>
                  <span>
                    {loggedMinutesFor(item.subject_id)} /{" "}
                    {item.allocated_minutes} min recorded
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={saveSession} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Corrective work to record
              </span>
              <select
                value={selectedItem?.id ?? ""}
                onChange={(event) => {
                  setSelectedItemId(event.target.value);
                  setError("");
                }}
                className={STUDY_FORM_CONTROL_CLASS}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {labelFor(item)} · {item.allocated_minutes} min
                  </option>
                ))}
              </select>
            </label>

            <label className="block max-w-sm">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Actual work duration (minutes)
              </span>
              <input
                type="number"
                min={1}
                max={600}
                value={actualDurationMin}
                onChange={(event) =>
                  setActualDurationMin(Number(event.target.value))
                }
                className={STUDY_FORM_CONTROL_CLASS}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className={STUDY_FORM_CONTROL_CLASS}
                placeholder="What did you practise or clarify?"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-rose-100 p-3 text-sm font-bold text-rose-900"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#31573f]"
            >
              Record corrective-work session
            </button>
          </form>

          <div className="mt-6 border-t border-[#e4dac9] pt-5">
            <p className="text-sm font-semibold text-stone-600">
              {allAllocationsRecorded
                ? "All corrective-work allocations have enough recorded time."
                : "Record the allocated time for every corrective-work item before continuing."}
            </p>
            <button
              type="button"
              disabled={!allAllocationsRecorded}
              onClick={finishSection}
              className="mt-3 rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#31573f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Complete corrective-work section
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function RecoverySection({
  state,
  snapshot,
  today,
  persist,
}: {
  state: StudyMvpState;
  snapshot: SavedDailyPlanSnapshot;
  today: string;
  persist: (
    next: StudyMvpState,
    successMessage?: string,
  ) => boolean;
}) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [actualDurationMin, setActualDurationMin] = useState(5);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const items = snapshot.plan.items.filter(
    (item) =>
      item.kind === "recovery" &&
      item.allocated_minutes > 0,
  );

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ??
    items[0] ??
    null;

  function labelFor(item: (typeof items)[number]): string {
    const task = state.retrieval_tasks.find(
      (candidate) => candidate.id === item.subject_id,
    );

    const topic = state.topics.find(
      (candidate) => candidate.id === item.subject_id,
    );

    return (
      task?.prompt ??
      topic?.title ??
      `Recovery work · ${item.subject_id.slice(0, 8)}`
    );
  }

  function loggedMinutesFor(subjectId: EntityId): number {
    return state.work_sessions
      .filter(
        (session) =>
          session.subject_type === "recovery" &&
          session.subject_id === subjectId &&
          localDateOfTimestamp(
            session.logged_at,
            state.settings.timezone,
          ) === today,
      )
      .reduce(
        (total, session) => total + session.actual_duration_min,
        0,
      );
  }

  const allAllocationsRecorded =
    items.length > 0 &&
    items.every(
      (item) =>
        loggedMinutesFor(item.subject_id) >=
        item.allocated_minutes,
    );

  function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedItem) {
      setError(
        "No recovery-work item is available in today's saved plan.",
      );
      return;
    }

    if (
      !Number.isSafeInteger(actualDurationMin) ||
      actualDurationMin < 1 ||
      actualDurationMin > 600
    ) {
      setError(
        "Enter an actual duration between 1 and 600 whole minutes.",
      );
      return;
    }

    if (
      loggedMinutesFor(selectedItem.subject_id) >=
      selectedItem.allocated_minutes
    ) {
      setError(
        "The planned recovery time has already been recorded today.",
      );
      return;
    }

    const loggedAt = new Date().toISOString();
    const sessionId = newId("work-session");
    const trimmedNotes = notes.trim();

    const session: WorkSession = {
      id: sessionId,
      subject_type: "recovery",
      subject_id: selectedItem.subject_id,
      planned_duration_min: selectedItem.allocated_minutes,
      actual_duration_min: actualDurationMin,
      logged_at: loggedAt,
      notes: trimmedNotes,
    };

    const taskEvent: TaskEvent = {
      id: newId("event"),
      logged_at: loggedAt,
      event_type: "work_session",
      subject_type: "corrective_task",
      subject_id: selectedItem.subject_id,
      review_event_id: null,
      retrieval_task_id: null,
      gate_session_id: null,
      gate_selected_task_ids_snapshot: null,
      skill_demonstrated_without_hints: null,
      work_session_id: sessionId,
      related_event_id: null,
      estimated_duration_min_at_event:
        selectedItem.estimated_minutes,
      task_type_at_event: null,
      priority_at_event: selectedItem.priority,
      intended_due_date_at_event:
        selectedItem.intended_due_date,
      current_due_date_at_event:
        selectedItem.current_due_date,
      actual_duration_min: actualDurationMin,
      result: null,
      yellow_gap_severity: null,
      disposition: null,
      reason: trimmedNotes || null,
      critical_error_flag: null,
      defer_count_at_event: selectedItem.defer_count,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
    };

    const nextState: StudyMvpState = {
      ...state,
      work_sessions: [...state.work_sessions, session],
      task_events: [...state.task_events, taskEvent],
    };

    if (
      persist(
        nextState,
        `Recorded ${actualDurationMin} minutes of recovery work.`,
      )
    ) {
      setNotes("");
    }
  }

  function finishSection() {
    if (!allAllocationsRecorded) return;

    setError("");

    try {
      const nextState = completeDailyPlanSection(
        state,
        snapshot.id,
        "recovery",
        new Date().toISOString(),
      );

      persist(
        nextState,
        "Recovery section completed. The next planned section is now eligible.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete today's recovery section.",
      );
    }
  }

  return (
    <section
      id="recovery"
      className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
    >
      <SectionHeading
        eyebrow="Study activity"
        title="Recovery work"
        detail="Record time spent catching up on unfinished work."
      />

      <ItemWorkTimer
        itemId="study-section:recovery"
        itemName="Recovery work"
        defaultMinutes={25}
      />
      
      {items.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm font-semibold text-stone-600">
          There are no positively allocated recovery items in today&apos;s saved plan.
        </p>
      ) : (
        <>
          <div className="mb-5 rounded-2xl bg-white p-4">
            <h3 className="font-extrabold text-[#23412f]">
              Today&apos;s recovery allocations
            </h3>
            <ul className="mt-3 space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap justify-between gap-2 rounded-xl bg-[#efe4d1] p-3 text-sm font-semibold"
                >
                  <span>{labelFor(item)}</span>
                  <span>
                    {loggedMinutesFor(item.subject_id)} /{" "}
                    {item.allocated_minutes} min recorded
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={saveSession} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Recovery work to record
              </span>
              <select
                value={selectedItem?.id ?? ""}
                onChange={(event) => {
                  setSelectedItemId(event.target.value);
                  setError("");
                }}
                className={STUDY_FORM_CONTROL_CLASS}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {labelFor(item)} · {item.allocated_minutes} min
                  </option>
                ))}
              </select>
            </label>

            <label className="block max-w-sm">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Actual work duration (minutes)
              </span>
              <input
                type="number"
                min={1}
                max={600}
                value={actualDurationMin}
                onChange={(event) =>
                  setActualDurationMin(Number(event.target.value))
                }
                className={STUDY_FORM_CONTROL_CLASS}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className={STUDY_FORM_CONTROL_CLASS}
                placeholder="What did you catch up on?"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-rose-100 p-3 text-sm font-bold text-rose-900"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#31573f]"
            >
              Record recovery session
            </button>
          </form>

          <div className="mt-6 border-t border-[#e4dac9] pt-5">
            <p className="text-sm font-semibold text-stone-600">
              {allAllocationsRecorded
                ? "All recovery allocations have enough recorded time."
                : "Record the allocated time for every recovery item before continuing."}
            </p>
            <button
              type="button"
              disabled={!allAllocationsRecorded}
              onClick={finishSection}
              className="mt-3 rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#31573f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Complete recovery section
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function MixedPracticeSection({
  state,
  snapshot,
  today,
  persist,
}: {
  state: StudyMvpState;
  snapshot: SavedDailyPlanSnapshot;
  today: string;
  persist: (
    next: StudyMvpState,
    successMessage?: string,
  ) => boolean;
}) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [actualDurationMin, setActualDurationMin] = useState(5);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const items = snapshot.plan.items.filter(
    (item) =>
      item.kind === "mixed_practice" &&
      item.allocated_minutes > 0,
  );

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ??
    items[0] ??
    null;

  function loggedMinutesFor(subjectId: EntityId): number {
    return state.work_sessions
      .filter(
        (session) =>
          session.subject_type === "mixed_practice" &&
          session.subject_id === subjectId &&
          localDateOfTimestamp(
            session.logged_at,
            state.settings.timezone,
          ) === today,
      )
      .reduce(
        (total, session) => total + session.actual_duration_min,
        0,
      );
  }

  const allAllocationsRecorded =
    items.length > 0 &&
    items.every(
      (item) =>
        loggedMinutesFor(item.subject_id) >=
        item.allocated_minutes,
    );

  const guidedSelections = items.map((item) => ({
    item,
    selection: getGuidedPracticeSessionSelection(
      state,
      "mixed",
      item.subject_id,
      today,
      item.allocated_minutes,
    ),
  }));

  const allGuidedQuestionsCompleted =
    items.length > 0 &&
    guidedSelections.every(({ selection }) =>
      selection.selectedTaskIds.length > 0 &&
      selection.missingTaskIds.length === 0 &&
      selection.selectedTaskIds.every((id) =>
        selection.attemptedTaskIds.includes(id),
      ),
    );

  const unavailableQuestionBlocks = guidedSelections.filter(({ selection }) =>
    canCompleteMixedPracticeWithoutQuestions(selection),
  );

  const guidedRequirementsResolved = guidedSelections.every(({ selection }) =>
    canCompleteMixedPracticeWithoutQuestions(selection) || (
      selection.selectedTaskIds.length > 0 &&
      selection.missingTaskIds.length === 0 &&
      selection.selectedTaskIds.every((id) =>
        selection.attemptedTaskIds.includes(id),
      )
    ),
  );

  const canCompleteWithoutQuestions =
    allAllocationsRecorded &&
    unavailableQuestionBlocks.length > 0 &&
    guidedRequirementsResolved;

  const guidedPracticeCanCloseWithUnavailableQuestions =
    unavailableQuestionBlocks.length > 0 && guidedRequirementsResolved;

  const blockingGuidedSelection = guidedSelections.find(({ selection }) =>
    !canCompleteMixedPracticeWithoutQuestions(selection) && (
      selection.selectedTaskIds.length === 0 ||
      selection.missingTaskIds.length > 0 ||
      !selection.selectedTaskIds.every((id) =>
        selection.attemptedTaskIds.includes(id),
      )
    ),
  )?.selection ?? null;

  const guidedPracticeStatusMessage = guidedPracticeCanCloseWithUnavailableQuestions
    ? allAllocationsRecorded
      ? "Planned time is recorded. No eligible questions were available for one or more blocks. Complete without questions to save this limitation and continue."
      : "No eligible questions were available for one or more blocks. Record the planned time, then close the section with this limitation recorded."
    : !allGuidedQuestionsCompleted
      ? blockingGuidedSelection?.selectionIssue === "not-enough-topics"
        ? "Add active mixed-practice questions to a second topic."
        : blockingGuidedSelection?.selectionIssue === "allocation-too-short"
          ? "Increase mixed-practice time or reduce question estimates."
          : blockingGuidedSelection?.selectionIssue === "missing-questions"
            ? "Restore the missing selected questions before continuing."
            : blockingGuidedSelection?.selectionIssue === "no-active-questions"
              ? "Add active mixed-practice questions to at least two topics."
              : "Answer the selected questions before continuing."
    : !allAllocationsRecorded
      ? "Record the allocated time for every mixed-practice block."
      : "Mixed practice is complete.";

  function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedItem) {
      setError(
        "No mixed-practice block is available in today's saved plan.",
      );
      return;
    }

    if (
      !Number.isSafeInteger(actualDurationMin) ||
      actualDurationMin < 1 ||
      actualDurationMin > 600
    ) {
      setError(
        "Enter an actual duration between 1 and 600 whole minutes.",
      );
      return;
    }

    if (
      loggedMinutesFor(selectedItem.subject_id) >=
      selectedItem.allocated_minutes
    ) {
      setError(
        "The planned mixed-practice time has already been recorded today.",
      );
      return;
    }

    const loggedAt = new Date().toISOString();
    const sessionId = newId("work-session");
    const trimmedNotes = notes.trim();

    const session: WorkSession = {
      id: sessionId,
      subject_type: "mixed_practice",
      subject_id: selectedItem.subject_id,
      planned_duration_min: selectedItem.allocated_minutes,
      actual_duration_min: actualDurationMin,
      logged_at: loggedAt,
      notes: trimmedNotes,
    };

    const taskEvent: TaskEvent = {
      id: newId("event"),
      logged_at: loggedAt,
      event_type: "work_session",
      subject_type: "mixed_practice",
      subject_id: selectedItem.subject_id,
      review_event_id: null,
      retrieval_task_id: null,
      gate_session_id: null,
      gate_selected_task_ids_snapshot: null,
      skill_demonstrated_without_hints: null,
      work_session_id: sessionId,
      related_event_id: null,
      estimated_duration_min_at_event:
        selectedItem.estimated_minutes,
      task_type_at_event: null,
      priority_at_event: selectedItem.priority,
      intended_due_date_at_event:
        selectedItem.intended_due_date,
      current_due_date_at_event:
        selectedItem.current_due_date,
      actual_duration_min: actualDurationMin,
      result: null,
      yellow_gap_severity: null,
      disposition: null,
      reason: trimmedNotes || null,
      critical_error_flag: null,
      defer_count_at_event: selectedItem.defer_count,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
    };

    const nextState: StudyMvpState = {
      ...state,
      work_sessions: [...state.work_sessions, session],
      task_events: [...state.task_events, taskEvent],
    };

    if (
      persist(
        nextState,
        `Recorded ${actualDurationMin} minutes of mixed practice.`,
      )
    ) {
      setNotes("");
    }
  }

  function finishSection() {
    if (
      !allAllocationsRecorded ||
      (!allGuidedQuestionsCompleted && !canCompleteWithoutQuestions)
    ) {
      return;
    }

    setError("");

    try {
      const completedAt = new Date().toISOString();
      const unavailableResolutionEvents: TaskEvent[] =
        canCompleteWithoutQuestions
          ? unavailableQuestionBlocks
              .filter(({ item }) => !state.task_events.some((event) =>
                event.event_type === "guided_practice_unavailable" &&
                event.subject_type === "mixed_practice" &&
                event.subject_id === item.subject_id &&
                localDateOfTimestamp(
                  event.logged_at,
                  state.settings.timezone,
                ) === today,
              ))
              .map(({ item, selection }) => ({
                id: newId("event"),
                logged_at: completedAt,
                event_type: "guided_practice_unavailable",
                subject_type: "mixed_practice",
                subject_id: item.subject_id,
                review_event_id: null,
                retrieval_task_id: null,
                gate_session_id: null,
                gate_selected_task_ids_snapshot: null,
                skill_demonstrated_without_hints: null,
                work_session_id: null,
                related_event_id: null,
                estimated_duration_min_at_event: item.estimated_minutes,
                task_type_at_event: null,
                priority_at_event: item.priority,
                intended_due_date_at_event: item.intended_due_date,
                current_due_date_at_event: item.current_due_date,
                actual_duration_min: null,
                result: null,
                yellow_gap_severity: null,
                disposition: null,
                reason: `No eligible active mixed-practice questions were available (${selection.selectionIssue}); planned time was recorded and the section was closed without question attempts.`,
                guided_practice_selected_task_ids_snapshot: null,
                critical_error_flag: null,
                defer_count_at_event: item.defer_count,
                re_entry_condition: null,
                old_priority: null,
                new_priority: null,
              }))
          : [];

      const stateWithResolution: StudyMvpState =
        unavailableResolutionEvents.length > 0
          ? {
              ...state,
              task_events: [
                ...state.task_events,
                ...unavailableResolutionEvents,
              ],
            }
          : state;

      const nextState = completeDailyPlanSection(
        stateWithResolution,
        snapshot.id,
        "mixed_practice",
        completedAt,
      );

      persist(
        nextState,
        canCompleteWithoutQuestions
          ? "Mixed-practice time recorded. No eligible questions were available, so the section was closed with that limitation saved."
          : "Mixed-practice section completed. The next planned section is now eligible.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete today's mixed-practice section.",
      );
    }
  }

  return (
    <section
      id="mixed-practice"
      className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
    >
      <SectionHeading
        eyebrow="Study activity"
        title="Mixed practice"
        detail="Answer questions from at least two active topics."
      />

      <ItemWorkTimer
        itemId="study-section:mixed-practice"
        itemName="Mixed practice"
        defaultMinutes={25}
      />
      
      {items.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm font-semibold text-stone-600">
          There are no positively allocated mixed-practice blocks in today&apos;s saved plan.
        </p>
      ) : (
        <>
          <div className="mb-5 rounded-2xl bg-white p-4">
            <h3 className="font-extrabold text-[#23412f]">
              Today&apos;s mixed-practice allocations
            </h3>
            <ul className="mt-3 space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap justify-between gap-2 rounded-xl bg-[#efe4d1] p-3 text-sm font-semibold"
                >
                  <span>Mixed-practice block</span>
                  <span>
                    {loggedMinutesFor(item.subject_id)} /{" "}
                    {item.allocated_minutes} min recorded
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <form onSubmit={saveSession} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Block to record
              </span>
              <select
                value={selectedItem?.id ?? ""}
                onChange={(event) => {
                  setSelectedItemId(event.target.value);
                  setError("");
                }}
                className={STUDY_FORM_CONTROL_CLASS}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    Mixed-practice block · {item.allocated_minutes} min
                  </option>
                ))}
              </select>
            </label>

            <label className="block max-w-sm">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Actual work duration (minutes)
              </span>
              <input
                type="number"
                min={1}
                max={600}
                value={actualDurationMin}
                onChange={(event) =>
                  setActualDurationMin(Number(event.target.value))
                }
                className={STUDY_FORM_CONTROL_CLASS}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className={STUDY_FORM_CONTROL_CLASS}
                placeholder="Which topics or skills did you mix together?"
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-rose-100 p-3 text-sm font-bold text-rose-900"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={
                !selectedItem ||
                loggedMinutesFor(selectedItem.subject_id) >= selectedItem.allocated_minutes
              }
              className="study-primary-action rounded-xl border border-[#006d77] bg-[#006d77] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#005a63] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Record mixed-practice session
            </button>
             </form>

          {selectedItem && (
            <GuidedPracticeRunner
              state={state}
              purpose="mixed"
              subjectId={selectedItem.subject_id}
              plannedMinutes={selectedItem.allocated_minutes}
              today={today}
              persist={persist}
            />
          )}

          <div className="mt-6 border-t border-[#e4dac9] pt-5">
            <p className="text-sm font-semibold text-stone-600">
              {guidedPracticeStatusMessage}
            </p>
            <button
              type="button"
              disabled={
                !allAllocationsRecorded ||
                (!allGuidedQuestionsCompleted && !canCompleteWithoutQuestions)
              }
              onClick={finishSection}
              className="study-primary-action mt-3 rounded-xl border border-[#006d77] bg-[#006d77] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#005a63] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {canCompleteWithoutQuestions
                ? "Complete without questions"
                : "Complete mixed-practice section"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function SamplerSection({
  state,
  snapshot,
  today,
  persist,
}: {
  state: StudyMvpState;
  snapshot: SavedDailyPlanSnapshot;
  today: string;
  persist: (
    next: StudyMvpState,
    successMessage?: string,
  ) => boolean;
}) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [actualDurationMin, setActualDurationMin] = useState(10);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const items = snapshot.plan.items.filter(
    (item) =>
      item.kind === "sampler" &&
      item.allocated_minutes + item.analysis_minutes > 0,
  );

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ??
    items[0] ??
    null;

  function plannedMinutesFor(
    item: (typeof items)[number],
  ): number {
    return item.allocated_minutes + item.analysis_minutes;
  }

  function loggedMinutesFor(subjectId: EntityId): number {
    return state.work_sessions
      .filter(
        (session) =>
          session.subject_type === "sampler" &&
          session.subject_id === subjectId &&
          localDateOfTimestamp(
            session.logged_at,
            state.settings.timezone,
          ) === today,
      )
      .reduce(
        (total, session) => total + session.actual_duration_min,
        0,
      );
  }

  const allAllocationsRecorded =
    items.length > 0 &&
    items.every(
      (item) =>
        loggedMinutesFor(item.subject_id) >=
        plannedMinutesFor(item),
    );

  const allGuidedQuestionsCompleted =
    items.length > 0 &&
    items.every((item) => {
      const selection = getGuidedPracticeSessionSelection(
        state,
        "sampler",
        item.subject_id,
        today,
        item.allocated_minutes,
      );

      return (
        selection.selectedTaskIds.length > 0 &&
        selection.missingTaskIds.length === 0 &&
        selection.selectedTaskIds.every((id) =>
          selection.attemptedTaskIds.includes(id),
        )
      );
    });

  function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedItem) {
      setError(
        "No sampler is available in today's saved plan.",
      );
      return;
    }

    if (
      !Number.isSafeInteger(actualDurationMin) ||
      actualDurationMin < 1 ||
      actualDurationMin > 600
    ) {
      setError(
        "Enter an actual duration between 1 and 600 whole minutes.",
      );
      return;
    }

    const plannedMinutes = plannedMinutesFor(selectedItem);

    if (
      loggedMinutesFor(selectedItem.subject_id) >= plannedMinutes
    ) {
      setError(
        "The allocated sampler and analysis time has already been recorded today.",
      );
      return;
    }

    const loggedAt = new Date().toISOString();
    const sessionId = newId("work-session");
    const trimmedNotes = notes.trim();

    const session: WorkSession = {
      id: sessionId,
      subject_type: "sampler",
      subject_id: selectedItem.subject_id,
      planned_duration_min: plannedMinutes,
      actual_duration_min: actualDurationMin,
      logged_at: loggedAt,
      notes: trimmedNotes,
    };

    const taskEvent: TaskEvent = {
      id: newId("event"),
      logged_at: loggedAt,
      event_type: "work_session",
      subject_type: "sampler",
      subject_id: selectedItem.subject_id,
      review_event_id: null,
      retrieval_task_id: null,
      gate_session_id: null,
      gate_selected_task_ids_snapshot: null,
      skill_demonstrated_without_hints: null,
      work_session_id: sessionId,
      related_event_id: null,
      estimated_duration_min_at_event:
        selectedItem.estimated_minutes,
      task_type_at_event: null,
      priority_at_event: selectedItem.priority,
      intended_due_date_at_event:
        selectedItem.intended_due_date,
      current_due_date_at_event:
        selectedItem.current_due_date,
      actual_duration_min: actualDurationMin,
      result: null,
      yellow_gap_severity: null,
      disposition: null,
      reason: trimmedNotes || null,
      critical_error_flag: null,
      defer_count_at_event: selectedItem.defer_count,
      re_entry_condition: null,
      old_priority: null,
      new_priority: null,
    };

    const nextState: StudyMvpState = {
      ...state,
      work_sessions: [...state.work_sessions, session],
      task_events: [...state.task_events, taskEvent],
    };

    if (
      persist(
        nextState,
        `Recorded ${actualDurationMin} minutes of Saturday sampler work.`,
      )
    ) {
      setNotes("");
    }
  }

  function finishSection() {
    if (!allAllocationsRecorded) return;

    setError("");

    try {
      const nextState = completeDailyPlanSection(
        state,
        snapshot.id,
        "sampler",
        new Date().toISOString(),
      );

      persist(
        nextState,
        "Saturday Sampler completed. The daily Study sequence is now complete.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete today's Sampler section.",
      );
    }
  }

  return (
    <section
      id="sampler"
      className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
    >
      <SectionHeading
        eyebrow="Study activity"
        title="Saturday Sampler"
        detail="Answer the selected questions, then record your time."
      />

      <ItemWorkTimer
        itemId="study-section:sampler"
        itemName="Saturday sampler"
        defaultMinutes={25}
      />
      
      {items.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm font-semibold text-stone-600">
          There is no positively allocated Sampler work in today&apos;s saved plan.
        </p>
      ) : (
        <>
          <div className="mb-5 rounded-2xl bg-white p-4">
            <h3 className="font-extrabold text-[#23412f]">
              Today&apos;s Sampler allocation
            </h3>
            <ul className="mt-3 space-y-2">
              {items.map((item) => {
                const planned = plannedMinutesFor(item);
                const logged = loggedMinutesFor(item.subject_id);

                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap justify-between gap-2 rounded-xl bg-[#efe4d1] p-3 text-sm font-semibold"
                  >
                    <span>Sampler and analysis</span>
                    <span>
                      {logged} / {planned} min recorded
                    </span>
                    <span className="w-full text-xs font-medium text-stone-600">
                      Sampler: {Math.max(   0,   item.allocated_minutes - item.analysis_minutes, )}{" "} min · Analysis:{" "}
                      {item.analysis_minutes} min
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <form onSubmit={saveSession} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Sampler allocation to record
              </span>
              <select
                value={selectedItem?.id ?? ""}
                onChange={(event) => {
                  setSelectedItemId(event.target.value);
                  setError("");
                }}
                className={STUDY_FORM_CONTROL_CLASS}
              >
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    Sampler and analysis · {plannedMinutesFor(item)} min
                  </option>
                ))}
              </select>
            </label>

            <label className="block max-w-sm">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Actual work duration (minutes)
              </span>
              <input
                type="number"
                min={1}
                max={600}
                value={actualDurationMin}
                onChange={(event) =>
                  setActualDurationMin(Number(event.target.value))
                }
                className={STUDY_FORM_CONTROL_CLASS}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className={STUDY_FORM_CONTROL_CLASS}
                placeholder="Record your performance or what the analysis revealed."
              />
            </label>

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-rose-100 p-3 text-sm font-bold text-rose-900"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#31573f]"
            >
              Record Sampler session
            </button>
          </form>

          {selectedItem && (
            <GuidedPracticeRunner
              state={state}
              purpose="sampler"
              subjectId={selectedItem.subject_id}
              plannedMinutes={selectedItem.allocated_minutes}
              today={today}
              persist={persist}
            />
          )}

          <div className="mt-6 border-t border-[#e4dac9] pt-5">
            <p className="text-sm font-semibold text-stone-600">
              {!allGuidedQuestionsCompleted
                ? "Answer every selected Sampler question before continuing."
                : allAllocationsRecorded
                  ? "All Sampler questions are answered and all Sampler and analysis time is recorded."
                  : "Record the planned time for the Sampler and its analysis before continuing."}
            </p>
            <button
              type="button"
              disabled={
                !allAllocationsRecorded ||
                !allGuidedQuestionsCompleted
              }
              onClick={finishSection}
              className="mt-3 rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#31573f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Complete Sampler section
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default function StudyMvpPage() {
  const {
    state,
    loadingError,
    notice,
    setNotice,
    problem,
    setProblem,
    cloudSyncStatus,
    syncConflict,
    persist,
    migrateLocalToCloud,
    chooseCloudVersion,
    chooseBrowserVersion,
    downloadConflictCopy,
  } = useCloudStudyState();

  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const starterScaffoldCleanupAttempted = useRef(false);

  useEffect(() => {
    if (starterScaffoldCleanupAttempted.current || !state) return;
    if (cloudSyncStatus !== "ready" && cloudSyncStatus !== "synced") return;

    const cleanedState = removeUnusedStarterScaffold(state);
    if (cleanedState === state) {
      starterScaffoldCleanupAttempted.current = true;
      return;
    }

    // This cleanup is restricted to the exact untouched scaffold. If the
    // catalogue was edited or any learning history exists, it is preserved.
    starterScaffoldCleanupAttempted.current = true;
    const removedUnitIds = state.units.map((unit) => unit.id);
    if (
      persist(
        cleanedState,
        "Removed the unused starter examples. Your Study catalogue is now ready for your real courses.",
      )
    ) {
      unlinkClassesFromStudyUnits(removedUnitIds);
    } else {
      starterScaffoldCleanupAttempted.current = false;
    }
  }, [state, cloudSyncStatus, persist]);

useEffect(() => {
  if (!isCatalogOpen) return;

  document.getElementById("catalog")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}, [isCatalogOpen]);

function openCatalogTools() {
  setIsCatalogOpen(true);

  if (isCatalogOpen) {
    document.getElementById("catalog")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}
  
  const [importText, setImportText] = useState("");
  const [importDiagnostics, setImportDiagnostics] = useState<
    TopicImportDiagnostic[]
  >([]);
  const [importCounts, setImportCounts] = useState<string[]>([]);
  const [importPreviewReady, setImportPreviewReady] = useState(false);

  // These are editable drafts. Only complete, validated decisions are
  // passed to the planning engine.
  const [planningChoices, setPlanningChoices] = useState<
    Record<string, string>
  >({});
  const [planningReasons, setPlanningReasons] = useState<
    Record<string, string>
  >({});
  const [planningReentries, setPlanningReentries] = useState<
    Record<string, SkipReentryCondition | "">
  >({});
  const [planningOrder, setPlanningOrder] = useState<EntityId[]>([]);
  const [draggedPlanningItemId, setDraggedPlanningItemId] =
  useState<EntityId | null>(null);

  const [dragOverPlanningItemId, setDragOverPlanningItemId] =
  useState<EntityId | null>(null);
  const [isReplanning, setIsReplanning] = useState(false);
  const [isAdditionalPlanning, setIsAdditionalPlanning] = useState(false);

  const [
  includeAdditionalInitialLearning,
  setIncludeAdditionalInitialLearning,
] = useState(false);

  const [gateTopicId, setGateTopicId] = useState("");
  const [gateSelectedTaskIds, setGateSelectedTaskIds] = useState<
    EntityId[]
  >([]);
  const [gateTaskId, setGateTaskId] = useState("");
  const [gateResult, setGateResult] =
    useState<AttemptResult>("green");
  const [gateYellowSeverity, setGateYellowSeverity] =
    useState<YellowGapSeverity>("minor");
  const [gateDuration, setGateDuration] = useState(5);
  const [gateCriticalError, setGateCriticalError] = useState(false);
  const [gateCorrectiveReady, setGateCorrectiveReady] = useState(false);
  const [gateNextReviewTaskIds, setGateNextReviewTaskIds] = useState<
    EntityId[] | null
  >(null);

  const [reviewId, setReviewId] = useState("");
  const [reviewTaskId, setReviewTaskId] = useState("");
  const [reviewResult, setReviewResult] =
    useState<AttemptResult>("green");
  const [reviewYellowSeverity, setReviewYellowSeverity] =
    useState<YellowGapSeverity>("minor");
  const [reviewDuration, setReviewDuration] = useState(5);
  const [reviewCriticalError, setReviewCriticalError] = useState(false);
  const [reviewNextTaskIds, setReviewNextTaskIds] = useState<
    EntityId[] | null
  >(null);
  const [nextReviewEstimate, setNextReviewEstimate] = useState(10);

  const today = state
    ? localDateOfTimestamp(
        new Date().toISOString(),
        state.settings.timezone,
      )
    : "";

  const todaysPlanSnapshots = state && today
    ? (state.daily_plan_history ?? [])
        .filter((snapshot) => snapshot.date === today)
        .sort((left, right) => left.version - right.version)
    : [];

  const latestTodaysPlan =
    todaysPlanSnapshots[todaysPlanSnapshots.length - 1] ?? null;

  const todaysExecution = latestTodaysPlan
  ? (state?.daily_plan_executions ?? []).find(
      (execution) =>
        execution.plan_snapshot_id === latestTodaysPlan.id,
    ) ?? null
  : null;

  const completedSectionIds = new Set(
    todaysExecution?.completed_section_ids ?? [],
  );

  const studyTimezone = state?.settings.timezone ?? "UTC";

const hasRecordedTodaysWork =
  completedSectionIds.size > 0 ||
  (state?.work_sessions ?? []).some(
    (session) =>
      localDateOfTimestamp(
        session.logged_at,
        studyTimezone,
      ) === today,
  ) ||
  (state?.task_events ?? []).some(
    (event) =>
      [
        "attempt",
        "gate_attempt",
        "work_session",
        "content_preparation",
      ].includes(event.event_type) &&
      localDateOfTimestamp(
        event.logged_at,
        studyTimezone,
      ) === today,
  );

    const plannedSectionIds = [
    ...new Set(
      (latestTodaysPlan?.plan.items ?? [])
        .filter((item) => item.allocated_minutes > 0)
        .map((item) => sectionIdForTaskKind(item.kind)),
    ),
  ];

  const activeSectionId =
    plannedSectionIds.find(
      (sectionId) => !completedSectionIds.has(sectionId),
    ) ?? null;

  const todayPlanComplete = Boolean(
    latestTodaysPlan &&
    plannedSectionIds.length > 0 &&
    activeSectionId === null
  );

  const planningMode = !latestTodaysPlan || isReplanning;

  const planResult = useMemo(() => {
    if (
      !state ||
      !today ||
      (!isReplanning && latestTodaysPlan)
    ) {
      return {
        build: null,
        error: "",
      };
    }

    const explicitDecisions: Record<
      string,
      ExplicitPlanningDecision | undefined
    > = {};
    const forcedDecisions: Record<
      string,
      ForcedPlanningDecision | undefined
    > = {};

    for (const [itemId, choice] of Object.entries(planningChoices)) {
      const reason = (planningReasons[itemId] ?? "").trim();
      const reEntryCondition =
        planningReentries[itemId] || undefined;

      // Incomplete form drafts must not make the entire plan disappear.
      if (!reason) continue;

      if (
        choice === "DEFER" ||
        choice === "SKIP" ||
        choice === "RELEARN"
      ) {
        if (choice === "SKIP" && !reEntryCondition) continue;

        explicitDecisions[itemId] = {
          disposition: choice,
          reason,
          ...(choice === "SKIP" && reEntryCondition
            ? { re_entry_condition: reEntryCondition }
            : {}),
        };
        continue;
      }

      if (isForcedPlanningDisposition(choice)) {
        if (choice === "skip" && !reEntryCondition) continue;

        forcedDecisions[itemId] = {
          disposition: choice,
          reason,
          ...(choice === "skip" && reEntryCondition
            ? { re_entry_condition: reEntryCondition }
            : {}),
        };
      }
    }

    try {
      return {
        build: buildStudyDailyPlan(state, today, {
  explicitDecisions,
  forcedDecisions,
  includeAdditionalInitialLearning,
}),
        error: "",
      };
    } catch (error) {
      return {
        build: null,
        error:
          error instanceof Error
            ? error.message
            : "Could not generate the daily plan.",
      };
    }
  }, [
    state,
    today,
    isReplanning,
    latestTodaysPlan,
    planningChoices,
    planningReasons,
    planningReentries,
    includeAdditionalInitialLearning,
  ]);

  const planBuild = planResult.build;
  const plan = planningMode
    ? planBuild?.plan
    : latestTodaysPlan?.plan;
  const orderedPlanItems = useMemo(() => {
  if (!plan) return [];

  const itemsById = new Map(
    plan.items.map((item) => [item.id, item]),
  );
  const orderedIds = planningOrder.filter(
    (id) => itemsById.has(id),
  );
  const orderedItems = orderedIds.map(
    (id) => itemsById.get(id)!,
  );
  const includedIds = new Set(orderedIds);

  return [
    ...orderedItems,
    ...plan.items.filter(
      (item) => !includedIds.has(item.id),
    ),
  ];
}, [plan, planningOrder]);

function movePlanningItemTo(
  itemId: EntityId,
  targetItemId: EntityId,
) {
  const ids = orderedPlanItems.map((item) => item.id);
  const fromIndex = ids.indexOf(itemId);
  const toIndex = ids.indexOf(targetItemId);

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex === toIndex
  ) {
    return;
  }

  const [movedId] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, movedId);

  setPlanningOrder(ids);
}
  const hasIncompletePlanningChoice = Boolean(
    plan?.items.some((item) => {
      const choice = planningChoices[item.id] ?? "";
      if (!choice) return false;

      if (!(planningReasons[item.id] ?? "").trim()) {
        return true;
      }

      return (
        (choice === "SKIP" || choice === "skip") &&
        !planningReentries[item.id]
      );
    }),
  );

  function saveDailyPlan() {
    if (!state || !plan || !planningMode) return;

      if (latestTodaysPlan && hasRecordedTodaysWork && !isAdditionalPlanning) {
    setIsReplanning(false);
    setProblem(
      "Today's saved worklist cannot be replaced after work has been recorded. Use the additional-work option to create a new version.",
    );
    return;
  }

    if (!plan.can_finalize) {
      setProblem(
        "Resolve the required planning decisions before saving this plan.",
      );
      return;
    }

    if (hasIncompletePlanningChoice) {
      setProblem(
        "Every selected decision needs a reason. SKIP also needs a re-entry condition.",
      );
      return;
    }

    try {
      const loggedAt = new Date().toISOString();
      const orderedPlan = {
        ...plan,
        items: orderedPlanItems,
      };

      const result = applyDailyPlanDecisions(
        state,
        orderedPlan,
        { loggedAt },
      );

      const appended = appendDailyPlanSnapshot(
        result.state,
        orderedPlan,
        loggedAt,
      );

      const message =
        `Saved daily plan version ${appended.snapshot.version} for ${appended.snapshot.date}. ` +
        (
          result.emittedEvents.length === 0
            ? "No new planning-decision events were needed."
            : `Recorded ${result.emittedEvents.length} immutable planning-decision event(s).`
        );

      if (persist(appended.state, message)) {
        setPlanningChoices({});
        setPlanningReasons({});
        setPlanningReentries({});
        setIsReplanning(false);
        setIsAdditionalPlanning(false);
        setPlanningOrder([]);
      }
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not save daily planning decisions.",
      );
    }
  }

  const gateTopics = state
    ? state.topics.filter(
        (topic) =>
          !topic.gate_passed &&
          topic.gate_result !== "passed" &&
          topic.gate_result !== "skill_based_passed" &&
          (
            topic.status === "not_started" ||
            topic.status === "in_learning" ||
            (topic.status === "relearn" && topic.gate_result === "failed")
          ),
      )
    : [];

  const selectedGateTopic =
    gateTopics.find((topic) => topic.id === gateTopicId) ??
    gateTopics[0] ??
    null;

  const gateTasks = state && selectedGateTopic
    ? state.retrieval_tasks.filter(
        (task) =>
          task.topic_id === selectedGateTopic.id &&
          task.active,
      )
    : [];

  const latestGateSession =
    state && selectedGateTopic
      ? getLatestGateSession(state, selectedGateTopic.id)
      : null;

  const openGateSession =
    latestGateSession && !latestGateSession.complete
      ? latestGateSession
      : null;


  const gateSessionOriginalTasks = state && openGateSession
    ? openGateSession.selectedTaskIds.map((id) =>
        state.retrieval_tasks.find((task) => task.id === id),
      )
    : [];

  const canReactivateOriginalGateTasks = Boolean(
    selectedGateTopic &&
    openGateSession &&
    openGateSession.selectedTaskIds.length >= 3 &&
    new Set(openGateSession.selectedTaskIds).size ===
      openGateSession.selectedTaskIds.length &&
    gateSessionOriginalTasks.every(
      (task) => task !== undefined && task.topic_id === selectedGateTopic.id,
    ) &&
    gateSessionOriginalTasks.some(
      (task) => task !== undefined && !task.active,
    ),
  );
    const gateReadiness = state && selectedGateTopic
    ? getGateReadiness(
        selectedGateTopic,
        gateTasks,
        today,
        openGateSession?.selectedTaskIds ?? [],
      )
    : null;

  const plannedGateItems =
    (latestTodaysPlan?.plan.items ?? []).filter(
      (item) => item.kind === "gate" && item.allocated_minutes > 0,
    );

  const gateSectionReadyToComplete = (() => {
    if (!state || plannedGateItems.length === 0) return false;

    return plannedGateItems.every((item) => {
      const latestSession = getLatestGateSession(state, item.subject_id);

      if (!latestSession?.complete) return false;

      return state.task_events.some(
        (event) =>
          event.event_type === "gate_attempt" &&
          event.gate_session_id === latestSession.id &&
          localDateOfTimestamp(
            event.logged_at,
            state.settings.timezone,
          ) === today,
      );
    });
  })();

  const defaultGateTaskIds = getDefaultGateTaskIds(gateTasks);

  const selectedGateIds = openGateSession
    ? openGateSession.selectedTaskIds
    : gateSelectedTaskIds.length > 0
      ? gateSelectedTaskIds
      : defaultGateTaskIds;

  const gateAttemptedIds = new Set(
    openGateSession?.attemptedTaskIds ?? [],
  );

  const remainingGateTasks = gateTasks.filter(
    (task) =>
      selectedGateIds.includes(task.id) &&
      !gateAttemptedIds.has(task.id),
  );

  const nextGateTaskIds = gateTasks.map((task) => task.id);

  const displayedGateNextIds =
    gateNextReviewTaskIds ??
    nextGateTaskIds.slice(0, 2);

  const dueReviews = state
    ? state.review_events.filter(
        (review) =>
          ["pending", "in_progress", "deferred", "missed"].includes(
            review.status,
          ) &&
          review.current_due_date <= today,
      )
    : [];

    const plannedReviewItems =
    (latestTodaysPlan?.plan.items ?? []).filter(
      (item) =>
        item.kind === "review" &&
        item.allocated_minutes > 0,
    );

  const reviewSectionReadyToComplete = Boolean(
    state &&
      plannedReviewItems.length > 0 &&
      plannedReviewItems.every((item) => {
        const review = state.review_events.find(
          (candidate) => candidate.id === item.subject_id,
        );

        if (!review || review.status !== "completed") {
          return false;
        }

        return state.task_events.some(
          (event) =>
            event.event_type === "attempt" &&
            event.review_event_id === review.id &&
            localDateOfTimestamp(
              event.logged_at,
              state.settings.timezone,
            ) === today,
        );
      }),
  );
  
  const selectedReview =
    dueReviews.find((review) => review.id === reviewId) ??
    dueReviews[0] ??
    null;

  const reviewTopic = state && selectedReview
    ? state.topics.find(
        (topic) => topic.id === selectedReview.topic_id,
      )
    : undefined;

  const reviewTasks = state && selectedReview
    ? selectedReview.selected_task_ids
        .map((id) =>
          state.retrieval_tasks.find((task) => task.id === id),
        )
        .filter(
          (task): task is RetrievalTask =>
            task !== undefined &&
            task.topic_id === selectedReview.topic_id,
        )
    : [];

  const reviewAttemptedIds = new Set(
    state && selectedReview
      ? state.task_events
          .filter(
            (event) =>
              event.event_type === "attempt" &&
              event.review_event_id === selectedReview.id,
          )
          .map((event) => event.retrieval_task_id)
          .filter((id): id is string => id !== null)
      : [],
  );

  const remainingReviewTasks = reviewTasks.filter(
    (task) => !reviewAttemptedIds.has(task.id),
  );

  const activeTasksForReviewTopic =
    state && selectedReview
      ? state.retrieval_tasks.filter(
          (task) =>
            task.topic_id === selectedReview.topic_id &&
            task.active,
        )
      : [];

  const displayedReviewNextIds =
    reviewNextTaskIds ??
    activeTasksForReviewTopic.slice(0, 2).map((task) => task.id);

  function changeGateTopic(id: string) {
    setGateTopicId(id);
    setGateTaskId("");
    setGateCorrectiveReady(false);
    setGateNextReviewTaskIds(null);

    if (!state || !id) {
      setGateSelectedTaskIds([]);
      return;
    }

    const latest = getLatestGateSession(state, id);
    const openSession =
      latest && !latest.complete ? latest : null;

    const topicTasks = state.retrieval_tasks.filter(
      (task) => task.topic_id === id && task.active,
    );

    setGateSelectedTaskIds(
      openSession
        ? openSession.selectedTaskIds
        : getDefaultGateTaskIds(topicTasks),
    );
  }

  function changeReview(id: string) {
    setReviewId(id);
    setReviewTaskId("");
    setReviewNextTaskIds(null);
    setReviewCriticalError(false);
  }

  function toggleId(
    current: EntityId[],
    id: EntityId,
    checked: boolean,
  ): EntityId[] {
    if (checked) {
      return current.includes(id) ? current : [...current, id];
    }
    return current.filter((value) => value !== id);
  }

  function startTrial() {
    if (!state || state.settings.trial_start_date) return;

    const currentDate = today;
    persist(
      {
        ...state,
        settings: {
          ...state.settings,
          trial_start_date: currentDate,
          trial_end_date: addCalendarDays(currentDate, 27),
          week4_evaluation_start: addCalendarDays(currentDate, 21),
          week4_evaluation_end: addCalendarDays(currentDate, 27),
        },
      },
      "The four-week engine trial has started.",
    );
  }

  function importCountLabels(
    counts: ReturnType<typeof importTopicCatalogText>["counts"],
  ): string[] {
    return [
      `Courses created: ${counts.courses_created}`,
      `Units created: ${counts.units_created}`,
      `Topics created: ${counts.topics_created}`,
      `Existing topics reused: ${counts.existing_topics_reused}`,
      `Tasks created: ${counts.tasks_created}`,
      `Duplicate tasks skipped: ${counts.duplicate_tasks_skipped}`,
    ];
  }

  function importCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;

    setImportDiagnostics([]);
    setImportCounts([]);
    setImportPreviewReady(false);
    setProblem("");
    setNotice("");

    try {
      const result = importTopicCatalogText(state, importText, {
        now: new Date().toISOString(),
        idFactory: defaultIdFactory,
      });

      setImportDiagnostics(result.diagnostics);

      if (!result.ok) {
        setProblem("Import rejected. No catalog changes were saved.");
        return;
      }

      setImportCounts(importCountLabels(result.counts));
      setImportPreviewReady(true);
      setNotice("Preview ready. No catalog changes have been saved yet.");
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "The catalog preview failed.",
      );
    }
  }

  function applyCatalogImport() {
    if (!state || !importText.trim() || !importPreviewReady) return;

    setProblem("");
    setNotice("");

    try {
      // Revalidate against the latest state; the preview itself never saves.
      const result = importTopicCatalogText(state, importText, {
        now: new Date().toISOString(),
        idFactory: defaultIdFactory,
      });

      setImportDiagnostics(result.diagnostics);

      if (!result.ok) {
        setImportCounts([]);
        setImportPreviewReady(false);
        setProblem(
          "The catalog import is no longer valid against the current study state. " +
          "No changes were saved. Review the diagnostics and create a new preview.",
        );
        return;
      }

      const saved = persist(
        result.state,
        "Catalog imported successfully.",
      );

      if (saved) {
        setImportCounts(importCountLabels(result.counts));
        setImportPreviewReady(false);
      }
    } catch (error) {
      setImportPreviewReady(false);
      setProblem(
        error instanceof Error
          ? error.message
          : "The catalog import failed. No changes were applied by this handler.",
      );
    }
  }

  async function readCatalogFile(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImportText(await file.text());
      setImportDiagnostics([]);
      setImportCounts([]);
      setImportPreviewReady(false);
      setNotice(`Loaded ${file.name}. Review the text and select Validate and preview import.`);
      setProblem("");
      setProblem("");
    } catch {
      setProblem("Could not read that file.");
    } finally {
      event.target.value = "";
    }
  }
  function beginPlannedTopicLearning(topicId: EntityId) {
    if (!state) return;

    const topic = state.topics.find(
      (candidate) => candidate.id === topicId,
    );

    if (!topic) {
      setProblem("The planned topic could not be found.");
      return;
    }

    try {
      const next = startTopicLearning(state, topic.id);

      const saved = persist(
        next,
        `Started learning "${topic.title}". Continue preparation in the topic workflow; gate eligibility is still checked separately.`,
      );

      if (saved) {
        changeGateTopic(topic.id);
        setProblem("");
      }
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not start the planned topic.",
      );
    }
  }


  function beginSelectedTopicLearning() {
    if (!state || !selectedGateTopic) return;

    try {
      const next = startTopicLearning(state, selectedGateTopic.id);
      const saved = persist(
        next,
        `Started learning "${selectedGateTopic.title}". A gate attempt unlocks when at least three active questions exist and its planned date has arrived.`,
      );

      if (saved) {
        setGateSelectedTaskIds([]);
        setGateTaskId("");
        setGateCorrectiveReady(false);
        setGateNextReviewTaskIds(null);
      }
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not start learning for this topic.",
      );
    }
  }


  function reactivateOriginalGateQuestions() {
    if (!state || !selectedGateTopic || !openGateSession) return;

    try {
      const inactiveCount = state.retrieval_tasks.filter(
        (task) =>
          openGateSession.selectedTaskIds.includes(task.id) && !task.active,
      ).length;

      const next = reactivateGateSessionTasks(
        state,
        selectedGateTopic.id,
        openGateSession.id,
        openGateSession.selectedTaskIds,
      );

      if (next === state) {
        setProblem("");
        setNotice("The original gate questions are already active. Recheck gate readiness.");
        return;
      }

      const saved = persist(
        next,
        `Reactivated ${inactiveCount} original gate question(s). The saved selection and attempt history are unchanged; resume the same gate session.`,
      );

      if (saved) setProblem("");
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not reactivate the original gate questions.",
      );
    }
  }

  function submitGateAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || !selectedGateTopic) return;

    try {
      if (!gateReadiness?.canAttempt) {
        throw new Error(
          gateReadiness?.message ?? "This topic is not ready for a gate attempt.",
        );
      }

      if (
        !openGateSession &&
        selectedGateTopic.gate_result === "failed" &&
        !gateCorrectiveReady
      ) {
        throw new Error(
          "Complete corrective work and explicitly mark it ready before starting another gate session.",
        );
      }

      if (
        selectedGateIds.length < 3 ||
        new Set(selectedGateIds).size !== selectedGateIds.length
      ) {
        throw new Error(
          "Select at least three distinct gate tasks before attempting the gate.",
        );
      }

      const activeSession =
        latestGateSession && !latestGateSession.complete
          ? latestGateSession
          : null;

      if (activeSession && selectedGateIds.join("|") !==
          activeSession.selectedTaskIds.join("|")) {
        throw new Error(
          "An unfinished gate must resume with its original selected task set.",
        );
      }

      const chosenTaskId =
        remainingGateTasks.find((task) => task.id === gateTaskId)?.id ??
        remainingGateTasks[0]?.id;

      if (!chosenTaskId) {
        throw new Error(
          "There are no unanswered tasks in this gate session. Start a new session only after the gate is complete and corrective work is ready if required.",
        );
      }

      const nextReviewTaskIds =
        gateNextReviewTaskIds ??
        nextGateTaskIds.slice(0, 2);

      const result = applyGateAttempt(state, {
        topicId: selectedGateTopic.id,
        gateSessionId: activeSession?.id ?? newId("gate"),
        selectedTaskIds: selectedGateIds,
        retrievalTaskId: chosenTaskId,
        result: gateResult,
        actualDurationMin: gateDuration,
        loggedAt: new Date().toISOString(),
        yellowGapSeverity:
          gateResult === "yellow"
            ? gateYellowSeverity
            : undefined,
        criticalErrorFlag: gateCriticalError,
        correctiveWorkReady:
          !activeSession &&
          selectedGateTopic.gate_result === "failed"
            ? gateCorrectiveReady
            : undefined,
        eventId: newId("event"),
        nextReview: {
          selectedTaskIds: nextReviewTaskIds,
          estimatedDurationMin: nextReviewEstimate,
          priority: topicPriority(selectedGateTopic),
        },
        idFactory: newId,
      });

      const saved = persist(
        result.state,
        result.gate.gate_passed
          ? "Gate passed. Review 1 was scheduled from the actual pass date."
          : result.gate.complete
            ? "Gate failed. Corrective work is required before a new gate session."
            : "Gate attempt recorded.",
      );

      if (saved && result.gate.gate_passed) {
        setGateTopicId("");
        setGateSelectedTaskIds([]);
        setGateTaskId("");
        setGateCorrectiveReady(false);
      } else if (saved && result.gate.complete) {
        setGateTaskId("");
        setGateCriticalError(false);
      }
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not record the gate attempt.",
      );
    }
  }

    function finishTopicGateSection() {
    if (
      !state ||
      !latestTodaysPlan ||
      !gateSectionReadyToComplete
    ) {
      return;
    }

    try {
      const nextState = completeDailyPlanSection(
        state,
        latestTodaysPlan.id,
        "topic_gate",
        new Date().toISOString(),
      );

      persist(
        nextState,
        "Topic Gate section completed. The next planned section is now eligible.",
      );
    } catch (cause) {
      setProblem(
        cause instanceof Error
          ? cause.message
          : "Could not complete today's Topic Gate section.",
      );
    }
  }
  
  function submitReviewAttempt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || !selectedReview) return;

    try {
      const chosenTaskId =
        remainingReviewTasks.find((task) => task.id === reviewTaskId)?.id ??
        remainingReviewTasks[0]?.id;

      if (!chosenTaskId) {
        throw new Error("This review has no remaining unanswered questions.");
      }

      const nextTaskIds =
        reviewNextTaskIds ??
        activeTasksForReviewTopic.slice(0, 2).map((task) => task.id);

      const result = applyReviewAttempt(state, {
        reviewId: selectedReview.id,
        taskId: chosenTaskId,
        result: reviewResult,
        actualDurationMin: reviewDuration,
        loggedAt: new Date().toISOString(),
        yellowGapSeverity:
          reviewResult === "yellow"
            ? reviewYellowSeverity
            : undefined,
        criticalErrorFlag: reviewCriticalError,
        eventId: newId("event"),
        nextSelectedTaskIds: nextTaskIds,
        nextEstimatedDurationMin: nextReviewEstimate,
        idFactory: newId,
      });

      const saved = persist(
        result.state,
        result.outcome === "duplicate"
          ? "This identical attempt was already recorded."
          : result.outcome === "in_progress"
            ? "Attempt recorded. The review remains in progress."
            : result.outcome === "relearn"
              ? "Review ended. Corrective work is required."
              : result.outcome === "retry"
                ? "Review completed. A same-stage retry was scheduled."
                : result.outcome === "advance"
                  ? "Review completed. The next stage was scheduled or the topic needs classification."
                  : "Review attempt recorded.",
      );

      if (saved) {
        setReviewTaskId("");
        setReviewCriticalError(false);
      }
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not record the review attempt.",
      );
    }
  }

    function finishReviewSection() {
    if (
      !state ||
      !latestTodaysPlan ||
      !reviewSectionReadyToComplete
    ) {
      return;
    }

    try {
      const nextState = completeDailyPlanSection(
        state,
        latestTodaysPlan.id,
        "reviews",
        new Date().toISOString(),
      );

      persist(
        nextState,
        "Due Reviews section completed. The next planned section is now eligible.",
      );
    } catch (cause) {
      setProblem(
        cause instanceof Error
          ? cause.message
          : "Could not complete today's Due Reviews section.",
      );
    }
  }
  
  function pauseReview() {
    if (!state || !selectedReview) return;

    try {
      const next = pauseIncompleteReview(state, {
        reviewId: selectedReview.id,
        pausedAt: new Date().toISOString(),
        idFactory: newId,
      });

      persist(
        next,
        "Review paused. Its original task selection is preserved and remaining work is due the next study day.",
      );
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not pause the review.",
      );
    }
  }

  function exportCatalog() {
    if (!state) return;

    try {
      downloadFile(
        `study-catalog-${today || "export"}.csv`,
        exportTopicCatalogCsv(state),
        "text/csv;charset=utf-8",
      );
      setNotice("Catalog CSV exported.");
      setProblem("");
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not export the catalog.",
      );
    }
  }

  function exportBackup() {
    if (!state) return;

    try {
      downloadFile(
        `study-mvp-backup-${today || "export"}.json`,
        exportStudyMvpJSON(state),
        "application/json;charset=utf-8",
      );
      setNotice("Full JSON backup exported.");
      setProblem("");
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Could not export the backup.",
      );
    }
  }

  if (cloudSyncStatus === "migration" && state) {
    return (
      <main className="mx-auto max-w-3xl space-y-6 pb-12">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 sm:p-9">
          <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-amber-900">
            Study data migration
          </p>

          <h1 className="mt-3 text-3xl font-bold text-stone-900">
            Your existing browser Study workspace is ready to migrate to the cloud
          </h1>

          <p className="mt-4 leading-7 text-stone-700">
            Existing browser data was found, but no cloud Study record exists
            yet. Nothing has been uploaded. Download a recovery copy and
            review the data before approving migration.
          </p>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-white p-4">
            <h2 className="font-bold">Browser Study state</h2>
            <p className="mt-2 text-sm text-stone-600">
              {state.courses.length} courses, {state.units.length} units,{" "}
              {state.topics.length} topics,{" "}
              {state.retrieval_tasks.length} retrieval tasks,{" "}
              {state.review_events.length} reviews, and{" "}
              {state.task_events.length} task events.
            </p>

            <button
              type="button"
              onClick={() =>
                downloadFile(
                  `study-mvp-pre-migration-${today || "backup"}.json`,
                  exportStudyMvpJSON(state),
                  "application/json",
                )
              }
              className="mt-4 w-full rounded-xl border border-stone-300 px-4 py-3 text-sm font-bold text-stone-800 hover:bg-stone-50"
            >
              Download browser recovery copy
            </button>
          </div>

          {problem && (
            <p role="alert" className="mt-5 rounded-xl bg-rose-100 p-4 text-sm font-bold text-rose-900">
              {problem}
            </p>
          )}

          <button
            type="button"
            onClick={() => void migrateLocalToCloud()}
            className="mt-6 w-full rounded-xl bg-emerald-900 px-5 py-3 font-bold text-white hover:bg-emerald-800"
          >
            Approve migration to cloud
          </button>

          <p className="mt-4 text-xs leading-5 text-stone-600">
            Migration creates the cloud record only if another session has
            not created one first. If cloud data appears before migration
            completes, the app will stop and ask you to resolve the difference.
          </p>
        </section>
      </main>
    );
  }

  if (syncConflict) {
    const conflict = syncConflict;

    return (
      <main className="mx-auto max-w-4xl space-y-6 pb-12">
        <section className="rounded-3xl border border-amber-300 bg-amber-50 p-6 sm:p-9">
          <p className="text-xs font-extrabold uppercase tracking-[0.15em] text-amber-900">
            Study storage conflict
          </p>
          <h1 className="mt-3 text-3xl font-bold text-stone-900">
            Two different Study copies were found
          </h1>
          <p className="mt-4 leading-7 text-stone-700">
            Your browser and cloud account contain different Study states.
            Neither has been silently overwritten. Download both copies
            before choosing how to proceed.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <h2 className="font-bold">This browser</h2>
              <p className="mt-2 text-sm text-stone-600">
                {conflict.localState.courses.length} courses,{" "}
                {conflict.localState.topics.length} topics,{" "}
                {conflict.localState.task_events.length} task events.
              </p>
              <button
                type="button"
                onClick={() =>
                  downloadConflictCopy("browser", conflict.localState)
                }
                className="mt-4 w-full rounded-xl border border-stone-300 px-4 py-3 text-sm font-bold text-stone-800 hover:bg-stone-50"
              >
                Download browser copy
              </button>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <h2 className="font-bold">Cloud account</h2>
              <p className="mt-2 text-sm text-stone-600">
                {conflict.cloudState.courses.length} courses,{" "}
                {conflict.cloudState.topics.length} topics,{" "}
                {conflict.cloudState.task_events.length} task events.
                Cloud revision {conflict.cloudRevision}.
              </p>
              <button
                type="button"
                onClick={() =>
                  downloadConflictCopy("cloud", conflict.cloudState)
                }
                className="mt-4 w-full rounded-xl border border-stone-300 px-4 py-3 text-sm font-bold text-stone-800 hover:bg-stone-50"
              >
                Download cloud copy
              </button>
            </div>
          </div>

          {problem && (
            <p role="alert" className="mt-5 rounded-xl bg-rose-100 p-4 text-sm font-bold text-rose-900">
              {problem}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void chooseCloudVersion()}
              className="rounded-xl bg-emerald-900 px-5 py-3 font-bold text-white hover:bg-emerald-800"
            >
              Use cloud version
            </button>
            <button
              type="button"
              onClick={() => void chooseBrowserVersion()}
              className="rounded-xl border border-stone-400 bg-white px-5 py-3 font-bold text-stone-900 hover:bg-stone-50"
            >
              Try saving browser version to cloud
            </button>
          </div>

          <p className="mt-4 text-xs leading-5 text-stone-600">
            Saving the browser version may be rejected if it would rewrite
            protected history. If that happens, both copies remain available
            for export; no unsafe overwrite will be forced.
          </p>
        </section>
      </main>
    );
  }

  if (loadingError) {
    return (
      <section className="rounded-3xl border border-rose-200 bg-white p-7">
        <h1 className="text-3xl font-bold">Study</h1>
        <p className="mt-4 text-rose-800">{loadingError}</p>
        <p className="mt-2 text-sm text-stone-600">
          The Study workspace could not be loaded. Check the error above and retry after resolving the problem.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-xl bg-emerald-900 px-4 py-2 text-white"
        >
          Return to Today
        </Link>
      </section>
    );
  }

  if (!state) {
    return (
      <div className="py-20 text-center text-stone-500">
        Connecting to your cloud-backed Study workspace…
      </div>
    );
  }

  const importHasErrors = importDiagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );

  return (
    <div className="study-page mx-auto max-w-6xl space-y-8 pb-12">
      <header className="study-page__header overflow-hidden rounded-2xl border border-[#d5e1e4] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="study-page__eyebrow rounded-full border px-3 py-1 text-xs font-semibold">
            Study system
          </span>
          <span className="study-sync-status rounded-full px-3 py-1 text-sm font-semibold" aria-live="polite">
            {cloudSyncStatus === "synced"
              ? "Cloud-backed · synced"
              : cloudSyncStatus === "syncing"
                ? "Cloud-backed · saving"
                : cloudSyncStatus === "ready"
                  ? "Cloud-backed · ready"
                  : cloudSyncStatus === "loading"
                    ? "Connecting to cloud"
                    : "Cloud storage needs attention"}
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">
          Study workspace
        </h1>
      </header>

      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900"
        >
          {notice}
        </div>
      )}

      {problem && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900"
        >
          {problem}
        </div>
      )}

      {state.courses.length === 0 && (
        <section className="rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-6 sm:p-8">
          <SectionHeading
            eyebrow="First steps"
            title="Set up your study workspace"
            detail="Import your courses, units and topics to get started."
          />
          <button
            type="button"
            onClick={openCatalogTools}
            className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#1a2e24]"
          >
            Import your course catalogue
          </button>
        </section>
      )}

      {state.courses.length > 0 && !state.settings.trial_start_date && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div>
            <h2 className="font-extrabold text-amber-950">
              Engine trial has not started
            </h2>
            <p className="mt-1 text-sm font-semibold text-amber-900">
              Start the four-week evaluation period when you are ready.
            </p>
          </div>
          <button
            type="button"
            onClick={startTrial}
            className="rounded-xl bg-amber-900 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-amber-950"
          >
            Start four-week trial
          </button>
        </section>
      )}

      <section
        id="daily-plan"
        className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
      >
        <SectionHeading
          eyebrow="01 · Plan"
          title={planningMode ? "Daily time budget" : "Today's saved worklist"}
          detail={
            planningMode
              ? "Build a plan from due reviews and unfinished work. Each saved plan is kept as a dated snapshot."
              : ""
          }
        />

        <div className="study-page__summary-banner mb-5">
          <div className="study-page__summary-item">
            <p className="study-page__summary-label">Study day</p>
            <p className="study-page__summary-value">
              {today ? formatStudyDateLabel(today) : "Loading…"}
            </p>
          </div>
          <div className="study-page__summary-item">
            <p className="study-page__summary-label">Daily budget</p>
            <p className="study-page__summary-value">
              {state.settings.daily_budget_min} min
            </p>
          </div>
          <div className="study-page__summary-item">
            <p className="study-page__summary-label">Trial</p>
            <p className="study-page__summary-value">
              {state.settings.trial_start_date
                ? `${formatStudyDateLabel(state.settings.trial_start_date)}${
                    state.settings.trial_end_date
                      ? ` – ${formatStudyDateLabel(state.settings.trial_end_date)}`
                      : ""
                  }`
                : "Not started"}
            </p>
          </div>
        </div>

                {planningMode && (
          <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-xl border border-[#d8ccb8] bg-white p-4">
            <input
              type="checkbox"
              checked={includeAdditionalInitialLearning}
              onChange={(event) =>
                setIncludeAdditionalInitialLearning(event.target.checked)
              }
              className="mt-1 h-4 w-4 accent-[#23412f]"
            />
            <span>
              <span className="block text-sm font-extrabold text-[#23412f]">
                Consider additional new topics
              </span>
            </span>
          </label>
        )}
        
        {planResult.error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900">
            {planResult.error}
          </div>
        )}

        {isAdditionalPlanning && plan && plan.items.length === 0 && (
          <div className="mb-5 rounded-2xl border border-[var(--p6-border-decorative)] bg-[var(--p6-surface-subtle)] p-4">
            <h3 className="font-bold text-[var(--p6-text)]">No additional work available</h3>
            <p className="mt-1 text-sm text-[var(--p6-text-secondary)]">
              There are no more eligible activities in this plan. You can finish for today.
              {!includeAdditionalInitialLearning && " You can also consider additional new topics above."}
            </p>
            <button
              type="button"
              onClick={() => {
                setIsAdditionalPlanning(false);
                setIsReplanning(false);
                setPlanningChoices({});
                setPlanningReasons({});
                setPlanningReentries({});
                setPlanningOrder([]);
              }}
              className="mt-3 rounded-xl border border-[var(--p6-border-strong)] bg-white px-4 py-3 text-sm font-semibold text-[var(--p6-primary)]"
            >
              Finish for today
            </button>
          </div>
        )}

        {plan && (
          <>
          {planningMode && (
            <div className="mb-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-stone-700">
                  Planned allocation
                </span>
                <span className="text-sm font-extrabold text-[#23412f]">
                  {plan.allocated_minutes} / {plan.budget_minutes} min
                </span>
              </div>
              <div
                className="h-3 overflow-hidden rounded-full bg-[#e5dccb]"
                role="progressbar"
                aria-label="Daily plan allocation"
                aria-valuenow={plan.allocated_minutes}
                aria-valuemin={0}
                aria-valuemax={plan.budget_minutes}
              >
                <div
                  className="h-full rounded-full bg-[#557c61] transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      plan.budget_minutes > 0
                        ? (plan.allocated_minutes / plan.budget_minutes) * 100
                        : 0,
                    )}%`,
                  }}
                />
              </div>
              
              <div className="mt-2 flex justify-between text-xs font-bold text-stone-500">
                <span>{plan.remaining_budget_minutes} min remaining</span>
                <span>
                  {hasIncompletePlanningChoice
                    ? "Finish selected decisions below"
                    : plan.can_finalize
                      ? "No unresolved planner decisions"
                      : `${plan.unresolved_decisions.length} unresolved decision(s)`}
                </span>
              </div>
            </div>
            )}

                        <details
              open={planningMode}
              className="rounded-2xl"
            >
              <summary className="cursor-pointer rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-[#23412f]">
                {planningMode
                  ? "Review and order planned activities"
                  : `View saved plan details and timers (${plan.items.length} activities)`}
              </summary>
              <div className="mt-3">
            {plan.items.length === 0 ? (
              <p className="rounded-xl bg-white p-4 text-sm font-semibold text-stone-600">
                No study tasks are scheduled for this date.
              </p>
            ) : (
              <div className="space-y-3">
                {orderedPlanItems.map((item) => {
                  const presentation = getDailyPlanItemPresentation(item, state);
                  const choice = planningChoices[item.id] ?? "";
                  const forcedControl =
                    item.decision_required ||
                    isForcedPlanningDisposition(choice);
                  
                  return (
                    <div
                      key={item.id}
                      className={`study-plan-item rounded-2xl border border-[#e4dac9] bg-white p-4 ${planningMode ? "study-plan-item--reorderable" : ""}`}
                      onDragOver={(event) => {
                        if (
                          !planningMode ||
                          draggedPlanningItemId === null
                        ) {
                          return;
                        }

                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOverPlanningItemId(item.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();

                        const draggedId =
                          event.dataTransfer.getData("text/plain");

                        if (planningMode && draggedId) {
                          movePlanningItemTo(
                            draggedId as EntityId,
                            item.id,
                          );
                        }

                        setDraggedPlanningItemId(null);
                        setDragOverPlanningItemId(null);
                      }}
                    >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {planningMode &&
                          dragOverPlanningItemId === item.id && (
                            <div
                              className="study-plan-item__drop-indicator mb-3 h-1 rounded-full bg-[#006d77]"
                              aria-hidden="true"
                            />
                          )}
                        <h3 className="break-words font-extrabold text-[#23412f]">
                          {presentation.title}
                        </h3>
                        <p className="mt-1 line-clamp-1 text-xs font-semibold text-stone-500">
                          {presentation.subtitle}
                        </p>

                        {planningMode && (
                          <button
                            type="button"
                            draggable={true}
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData(
                                "text/plain",
                                String(item.id),
                              );
                              setDraggedPlanningItemId(item.id);
                            }}
                            onDragEnd={() => {
                              setDraggedPlanningItemId(null);
                              setDragOverPlanningItemId(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
                                return;
                              }

                              event.preventDefault();
                              const currentIndex = orderedPlanItems.findIndex(
                                (orderedItem) => orderedItem.id === item.id,
                              );
                              const targetIndex =
                                currentIndex + (event.key === "ArrowUp" ? -1 : 1);
                              const targetItem = orderedPlanItems[targetIndex];

                              if (targetItem) {
                                movePlanningItemTo(item.id, targetItem.id);
                              }
                            }}
                            className="study-plan-item__drag-handle"
                            aria-label={`Reorder ${presentation.title}; use the Up and Down arrow keys to move`}
                            aria-keyshortcuts="ArrowUp ArrowDown"
                            title="Drag to reorder, or use the Up and Down arrow keys"
                          >
                            <span aria-hidden="true" className="text-2xl leading-none">⠿</span>
                          </button>
                        )}

                        {!planningMode &&
                          item.kind === "initial_learning" &&
                          state?.topics.some(
                            (topic) =>
                              topic.id === item.subject_id &&
                              topic.status === "not_started",
                          ) && (
                            <button
                              type="button"
                              onClick={() =>
                                beginPlannedTopicLearning(item.subject_id)
                              }
                              className="mt-3 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                            >
                              Start learning
                            </button>
                          )}
                          
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-extrabold ${pillClass(
                            item.category ?? "",
                          )}`}
                        >
                          {item.category ?? "Needs decision"}
                        </span>
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-extrabold text-stone-700">
                          Priority {item.priority}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs font-bold text-stone-600">
                      {item.allocated_minutes} min allocated
                    </div>


                    {planningMode && (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-stone-500">
                          Planning decision
                        </span>
                        <select
                          value={choice}
                          onChange={(event) => {
                            setPlanningChoices((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }));
                            setPlanningReasons((current) => ({
                              ...current,
                              [item.id]: "",
                            }));
                            setPlanningReentries((current) => ({
                              ...current,
                              [item.id]: "",
                            }));
                          }}
                          className={STUDY_FORM_CONTROL_COMPACT_CLASS}
                        >
                          {forcedControl ? (
                            <>
                              <option value="">Choose required action…</option>
                              <option value="complete">
                                Complete all remaining questions
                              </option>
                              <option value="split">
                                Split across sessions
                              </option>
                              <option value="relearn">
                                Send to relearning
                              </option>
                              <option value="skip">
                                Skip with re-entry condition
                              </option>
                              <option value="override_defer">
                                Explicitly override another deferral
                              </option>
                            </>
                          ) : (
                            <>
                              <option value="">
                                Use planner recommendation
                              </option>
                              <option value="DEFER">
                                Defer to the next study day
                              </option>
                              <option value="RELEARN">
                                Send to relearning
                              </option>
                              <option value="SKIP">
                                Skip with re-entry condition
                              </option>
                            </>
                          )}
                        </select>
                        {item.decision_required && (
                          <span className="mt-1 block text-xs font-bold text-rose-700">
                            A forced decision is required before this plan can be saved.
                          </span>
                        )}
                      </label>

                      {choice !== "" && (
                        <label className="block">
                          <span className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-stone-500">
                            Decision reason (required)
                          </span>
                          <input
                            type="text"
                            value={planningReasons[item.id] ?? ""}
                            onChange={(event) =>
                              setPlanningReasons((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Explain why this is the right action"
                            className={STUDY_FORM_CONTROL_COMPACT_CLASS}
                          />
                        </label>
                      )}

                      {(choice === "SKIP" || choice === "skip") && (
                        <label className="block">
                          <span className="mb-1 block text-xs font-extrabold uppercase tracking-wide text-stone-500">
                            Re-entry condition (required)
                          </span>
                          <select
                            value={planningReentries[item.id] ?? ""}
                            onChange={(event) =>
                              setPlanningReentries((current) => ({
                                ...current,
                                [item.id]: event.target.value as
                                  | SkipReentryCondition
                                  | "",
                              }))
                            }
                            className={STUDY_FORM_CONTROL_COMPACT_CLASS}
                          >
                            <option value="">Select a condition…</option>
                            <option value="later_failure">
                              Re-enter after a later failure
                            </option>
                            <option value="upcoming_exam">
                              Re-enter before an upcoming exam
                            </option>
                            <option value="time_available">
                              Re-enter when time is available
                            </option>
                            <option value="never">
                              Never re-enter
                            </option>
                          </select>
                        </label>
                      )}
                    </div>
                    )}

                    {planningMode && item.reason && (
                      <p className="mt-2 text-xs font-semibold text-stone-500">
                        {item.reason}
                      </p>
                    )}
                  </div>
                  );
                })}
              </div>
                        )}
              </div>
            </details>

            {plan.warnings.length > 0 && (
              <div className="mt-5 rounded-2xl bg-[#efe4d1] p-4">
                <h3 className="font-extrabold text-[#23412f]">
                  Planner notes
                </h3>
                <ul className="mt-2 space-y-1 text-sm font-semibold text-stone-600">
                  {plan.warnings.map((warning, index) => (
                    <li key={`${index}-${warning}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {planningMode ? (
              <>
                <div className="study-plan-actions mt-5 flex flex-wrap items-center gap-3">
                  {(!isAdditionalPlanning || plan.items.length > 0) && (
                    <button
                      type="button"
                      onClick={saveDailyPlan}
                      disabled={
                        !plan.can_finalize ||
                        plan.items.length === 0 ||
                        hasIncompletePlanningChoice
                      }
                      className="study-primary-action rounded-xl px-5 py-3 text-sm font-semibold"
                    >
                      {isAdditionalPlanning ? "Save next worklist" : "Save today's plan"}
                    </button>
                  )}
                  {latestTodaysPlan && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlanningChoices({});
                        setPlanningReasons({});
                        setPlanningReentries({});
                        setIsReplanning(false);
                        setIsAdditionalPlanning(false);
                        setPlanningOrder([]);
                      }}
                      className="rounded-xl border border-[#d8ccb8] bg-white px-5 py-3 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
                    >
                      Cancel replan
                    </button>
                  )}
                  {hasIncompletePlanningChoice && (
                    <p className="text-sm font-bold text-rose-700">
                      Add a reason for each selected action; SKIP also requires a re-entry condition.
                    </p>
                  )}
                  {!plan.can_finalize && (
                    <p className="text-sm font-bold text-rose-700">
                      Resolve the required decisions before saving.
                    </p>
                  )}
                </div>

                <p className="study-plan-explainer mt-4 text-sm leading-6">
                  Planned time is not completed work. Only saved attempts and sessions count.
                </p>
              </>
            ) : (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {!hasRecordedTodaysWork ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPlanningChoices({});
                      setPlanningReasons({});
                      setPlanningReentries({});
                      setIsAdditionalPlanning(false);
                      setIsReplanning(true);
                    }}
                    className="study-primary-action rounded-xl px-5 py-3 text-sm font-semibold"
                  >
                    Replan today
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-stone-500">Saved · {formatStudyDateLabel(today)}</span>
                )}
              </div>
            )}
          </>
                )}
      </section>

      {state && todayPlanComplete && !planningMode && (
        <section className="study-plan-complete rounded-3xl border p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[var(--p6-primary)]">Today</p>
              <h2 className="mt-1 text-xl font-bold">Today's plan is complete</h2>
              <p className="mt-2 text-sm text-[var(--p6-text-secondary)]">
                All {plannedSectionIds.length} planned sections are complete. Your work is saved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPlanningChoices({});
                setPlanningReasons({});
                setPlanningReentries({});
                setPlanningOrder([]);
                setIncludeAdditionalInitialLearning(false);
                setIsAdditionalPlanning(true);
                setIsReplanning(true);
              }}
              className="study-primary-action rounded-xl px-5 py-3 text-sm font-semibold"
            >
              Check for more work
            </button>
          </div>
        </section>
      )}

      {state &&
        latestTodaysPlan &&
        !planningMode &&
        activeSectionId === "initial_learning" && (
          <InitialLearningSection
            state={state}
            snapshot={latestTodaysPlan}
            today={today}
            persist={persist}
            onStartLearning={beginPlannedTopicLearning}
          />
        )}
            {state &&
        latestTodaysPlan &&
        !planningMode &&
        activeSectionId === "topic_consolidation" && (
          <TopicConsolidationSection
            state={state}
            snapshot={latestTodaysPlan}
            today={today}
            persist={persist}
          />
        )}
            {state &&
        latestTodaysPlan &&
        !planningMode &&
        activeSectionId === "assignments" && (
          <AssignmentSection
            state={state}
            snapshot={latestTodaysPlan}
            today={today}
            persist={persist}
          />
        )}
          {state &&
        latestTodaysPlan &&
        !planningMode &&
        activeSectionId === "corrective" && (
          <CorrectiveSection
            state={state}
            snapshot={latestTodaysPlan}
            today={today}
            persist={persist}
          />
        )}
            {state &&
        latestTodaysPlan &&
        !planningMode &&
        activeSectionId === "recovery" && (
          <RecoverySection
            state={state}
            snapshot={latestTodaysPlan}
            today={today}
            persist={persist}
          />
        )}
            {state &&
        latestTodaysPlan &&
        !planningMode &&
        activeSectionId === "mixed_practice" && (
          <MixedPracticeSection
            state={state}
            snapshot={latestTodaysPlan}
            today={today}
            persist={persist}
          />
        )}
            {state &&
        latestTodaysPlan &&
        !planningMode &&
        activeSectionId === "sampler" && (
          <SamplerSection
            state={state}
            snapshot={latestTodaysPlan}
            today={today}
            persist={persist}
          />
        )}
      {isCatalogOpen && (
      <section
        id="catalog"
        className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <SectionHeading
              eyebrow="02 · Course data"
              title="Import and export your catalog"
              detail="Import a CSV or TSV catalogue. Changes are validated before saving."
            />
          </div>

          <button
            type="button"
            onClick={() => setIsCatalogOpen(false)}
            className="shrink-0 rounded-xl border border-[#d8ccb8] bg-white px-4 py-2.5 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCatalog}
            className="rounded-xl border border-[#23412f] px-4 py-2.5 text-sm font-extrabold text-[#23412f] hover:bg-[#dce8d8]"
          >
            Export catalog CSV
          </button>
          <button
            type="button"
            onClick={exportBackup}
            className="rounded-xl bg-[#23412f] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#1a2e24]"
          >
            Download full JSON backup
          </button>
        </div>

        <form onSubmit={importCatalog} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-stone-700">
              Select a catalog file
            </span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              onChange={readCatalogFile}
              className="block w-full rounded-xl border border-[#d8ccb8] bg-white p-3 text-sm font-semibold file:mr-3 file:rounded-lg file:border-0 file:bg-[#dce8d8] file:px-3 file:py-2 file:font-extrabold file:text-[#23412f]"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-extrabold text-stone-700">
              Or paste CSV / tab-separated spreadsheet data
            </span>
            <textarea
              rows={9}
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportDiagnostics([]);
                setImportCounts([]);
                setImportPreviewReady(false);
                setProblem("");
                setNotice("");
              }}
              placeholder="course_code,course_name,unit_code,unit_name,topic_number,topic_title,learning_objective,objective_type"
              className="w-full rounded-2xl border border-[#d8ccb8] bg-white p-3 font-mono text-xs font-medium leading-6 text-stone-700 outline-none focus:border-[#557c61] focus:ring-2 focus:ring-[#dce8d8]"
            />
          </label>

          <button
            type="submit"
            disabled={!importText.trim()}
            className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#1a2e24] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Validate and preview import
          </button>
        </form>

        {importCounts.length > 0 && (
          <div className={`mt-5 rounded-2xl border p-4 ${
            importPreviewReady
              ? "border-blue-200 bg-blue-50"
              : "border-emerald-200 bg-emerald-50"
          }`}>
            <h3 className={`font-extrabold ${
              importPreviewReady ? "text-blue-900" : "text-emerald-900"
            }`}>
              {importPreviewReady ? "Import preview" : "Import summary"}
            </h3>
            {importPreviewReady && (
              <p className="mt-2 text-sm font-semibold text-blue-900">
                Preview only — your catalog has not been changed. Applying will
                revalidate this file against your current study state.
              </p>
            )}
            <ul className={`mt-2 grid gap-1 text-sm font-semibold sm:grid-cols-2 ${
              importPreviewReady ? "text-blue-900" : "text-emerald-900"
            }`}>
              {importCounts.map((count) => (
                <li key={count}>{count}</li>
              ))}
            </ul>
            {importPreviewReady && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyCatalogImport}
                  disabled={!state || importHasErrors}
                  className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#1a2e24] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Apply import
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportPreviewReady(false);
                    setImportCounts([]);
                    setImportDiagnostics([]);
                    setNotice("Import preview cancelled. No catalog changes were saved.");
                    setProblem("");
                  }}
                  className="rounded-xl border border-[#d8ccb8] bg-white px-5 py-3 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
                >
                  Cancel preview
                </button>
              </div>
            )}
          </div>
        )}

        {importDiagnostics.length > 0 && (
          <div className="mt-5 rounded-2xl border border-[#e4dac9] bg-white p-4">
            <h3 className="font-extrabold text-[#23412f]">
              Validation diagnostics
            </h3>
            <ul className="mt-3 space-y-2">
              {importDiagnostics.map((diagnostic, index) => (
                <li
                  key={`${diagnostic.row}-${index}`}
                  className={`rounded-xl p-3 text-sm font-semibold ${
                    diagnostic.severity === "error"
                      ? "bg-rose-50 text-rose-900"
                      : "bg-amber-50 text-amber-900"
                  }`}
                >
                  <span className="font-extrabold uppercase">
                    {diagnostic.severity}
                    {diagnostic.row !== null
                      ? ` · Row ${diagnostic.row}`
                      : ""}
                  </span>
                  <span className="ml-2">{diagnostic.message}</span>
                </li>
              ))}
            </ul>
            {importHasErrors && (
              <p className="mt-3 text-xs font-bold text-rose-800">
                State was not changed by this rejected import.
              </p>
            )}
          </div>
        )}
      </section>
      )}

      {state &&
  latestTodaysPlan &&
  !planningMode &&
  activeSectionId === "topic_gate" && (
    <section
      id="gate"
      className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
    >
        <SectionHeading
          eyebrow="03 · Initial learning"
          title="Topic gate"
          detail="Answer the selected questions from memory."
        />

      <ItemWorkTimer
        itemId="study-section:gate"
        itemName="Topic gate"
        defaultMinutes={25}
      />
      
        {gateTopics.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm font-semibold text-stone-600">
            There are no topics awaiting an initial gate right now. Topics
            must be explicitly started for learning, and already-passed,
            archived, or maintenance topics do not need another initial gate.
          </p>
        ) : (
          <form onSubmit={submitGateAttempt} className="space-y-5">
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Topic
              </span>
              <select
                value={selectedGateTopic?.id ?? ""}
                onChange={(event) => changeGateTopic(event.target.value)}
                className={STUDY_FORM_CONTROL_CLASS}
              >
                {gateTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title} · {topic.status.replace(/_/g, " ")} · {topic.gate_result}
                  </option>
                ))}
              </select>
            </label>

            {selectedGateTopic && (
              <>
                <div className="rounded-2xl bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-extrabold text-[#23412f]">
                      {selectedGateTopic.title}
                    </h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-extrabold ${pillClass(
                        selectedGateTopic.gate_result,
                      )}`}
                    >
                      {selectedGateTopic.gate_result}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-stone-600">
                    {selectedGateTopic.learning_objective}
                  </p>
                </div>

                {gateReadiness && !gateReadiness.canAttempt ? (
                  <div
                    aria-live="polite"
                    className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
                  >
                    <p className="text-sm font-extrabold text-amber-950">
                      {gateReadiness.message}
                    </p>

                    {gateReadiness.status === "not_started" && (
                      <>
                        <p className="text-sm font-semibold text-amber-900">
                          Active questions found: {gateReadiness.activeQuestionCount}.
                          {gateReadiness.activeQuestionCount < 3
                            ? ` You can start learning now, but add or activate ${gateReadiness.missingQuestionCount} more question(s) before attempting the gate.`
                            : " The topic has enough active questions to prepare for its initial gate."}
                        </p>
                        <button
                          type="button"
                          onClick={beginSelectedTopicLearning}
                          className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#1a2e24]"
                        >
                          Start learning
                        </button>
                      </>
                    )}

                    {gateReadiness.status === "missing_questions" && (
                      <div className="space-y-2 text-sm font-semibold text-amber-900">
                        <p>
                          Add or activate {gateReadiness.missingQuestionCount} more
                          active question(s). The gate remains unavailable until
                          at least three are available.
                        </p>
                        <a
                          href="#catalog"
                          className="inline-flex rounded-xl border border-amber-800 px-4 py-2 font-extrabold text-amber-950 hover:bg-amber-100"
                          onClick={openCatalogTools}
                        >
                          Open catalog import
                        </a>
                      </div>
                    )}

                    {gateReadiness.status === "session_questions_unavailable" && (
                      <div className="space-y-3">
                        {canReactivateOriginalGateTasks ? (
                          <>
                            <p className="text-sm font-semibold text-amber-900">
                              The original questions still exist but some are inactive.
                              Reactivating them keeps the saved question set unchanged.
                            </p>
                            <button
                              type="button"
                              onClick={reactivateOriginalGateQuestions}
                              className="rounded-xl bg-[#23412f] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[#1a2e24]"
                            >
                              Reactivate original gate questions
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-amber-900">
                              At least one original question record is missing or belongs
                              to another topic. This session will not substitute a new
                              question set. Export a full JSON backup before recovering
                              the original catalog record.
                            </p>
                            <a
                              href="#catalog"
                              className="inline-flex rounded-xl border border-amber-800 px-4 py-2 font-extrabold text-amber-950 hover:bg-amber-100"
                              onClick={openCatalogTools}
                            >
                              Open catalog and backup tools
                            </a>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {gateReadiness && (
                      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                        {gateReadiness.message}
                      </p>
                    )}

                <fieldset className="rounded-2xl border border-[#e4dac9] p-4">
                  <legend className="px-2 text-sm font-extrabold text-stone-700">
                    Gate task selection
                  </legend>
                  <p className="mb-3 text-xs font-semibold text-stone-500">
                    Choose at least three distinct active tasks. An unfinished
                    session locks its original selection.
                  </p>

                  <div className="space-y-2">
                    {gateTasks.map((task) => (
                      <label
                        key={task.id}
                        className="flex items-start gap-3 rounded-xl bg-white p-3"
                      >
                        <input
                          type="checkbox"
                          checked={selectedGateIds.includes(task.id)}
                          disabled={Boolean(openGateSession)}
                          onChange={(event) => {
                            setGateSelectedTaskIds((current) =>
                              toggleId(
                                current.length
                                  ? current
                                  : gateTasks.slice(0, 3).map((item) => item.id),
                                task.id,
                                event.target.checked,
                              ),
                            );
                          }}
                          className="mt-1 accent-[#23412f]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-extrabold text-stone-800">
                            {task.prompt}
                          </span>
                          <span className="mt-1 block text-xs font-semibold text-stone-500">
                            {task.task_type} · {task.estimated_duration_min} min
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {openGateSession && (
                    <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
                      Resuming gate session {openGateSession.id}. The same
                      question set must be retained.
                    </p>
                  )}

                  <p className="mt-3 text-xs font-bold text-stone-500">
                    {selectedGateIds.length} question(s) selected ·{" "}
                    {remainingGateTasks.length} unanswered in this session
                  </p>
                </fieldset>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-extrabold text-stone-700">
                      Question to attempt
                    </span>
                    <select
                      value={
                        remainingGateTasks.some((task) => task.id === gateTaskId)
                          ? gateTaskId
                          : remainingGateTasks[0]?.id ?? ""
                      }
                      onChange={(event) => setGateTaskId(event.target.value)}
                      disabled={remainingGateTasks.length === 0}
                      className={STUDY_FORM_CONTROL_CLASS}
                    >
                      {remainingGateTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.prompt}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-extrabold text-stone-700">
                      Result
                    </span>
                    <select
                      value={gateResult}
                      onChange={(event) =>
                        setGateResult(event.target.value as AttemptResult)
                      }
                      className={STUDY_FORM_CONTROL_CLASS}
                    >
                      <option value="green">Green — secure</option>
                      <option value="yellow">Yellow — gap</option>
                      <option value="red">Red — not recalled</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-sm font-extrabold text-stone-700">
                      Actual duration (minutes)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={600}
                      value={gateDuration}
                      onChange={(event) =>
                        setGateDuration(Number(event.target.value))
                      }
                      className={STUDY_FORM_CONTROL_CLASS}
                    />
                  </label>

                  {gateResult === "yellow" && (
                    <label className="block">
                      <span className="mb-1 block text-sm font-extrabold text-stone-700">
                        Yellow gap
                      </span>
                      <select
                        value={gateYellowSeverity}
                        onChange={(event) =>
                          setGateYellowSeverity(
                            event.target.value as YellowGapSeverity,
                          )
                        }
                        className={STUDY_FORM_CONTROL_CLASS}
                      >
                        <option value="minor">Minor</option>
                        <option value="substantive">Substantive</option>
                      </select>
                    </label>
                  )}
                </div>

                <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm font-semibold text-stone-700">
                  <input
                    type="checkbox"
                    checked={gateCriticalError}
                    onChange={(event) =>
                      setGateCriticalError(event.target.checked)
                    }
                    className="mt-1 accent-[#23412f]"
                  />
                  Critical error occurred in this attempt.
                </label>

                {!openGateSession &&
                  selectedGateTopic.gate_result === "failed" && (
                    <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                      <input
                        type="checkbox"
                        checked={gateCorrectiveReady}
                        onChange={(event) =>
                          setGateCorrectiveReady(event.target.checked)
                        }
                        className="mt-1 accent-[#23412f]"
                      />
                      Corrective work is complete and explicitly ready for a
                      new gate attempt.
                    </label>
                  )}

                <fieldset className="rounded-2xl border border-[#e4dac9] p-4">
                  <legend className="px-2 text-sm font-extrabold text-stone-700">
                    Select Review 1 tasks in advance
                  </legend>
                  <p className="mb-3 text-xs font-semibold text-stone-500">
                    Select two or three active task IDs. These will be fixed
                    before the next review begins.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {gateTasks.map((task) => (
                      <label
                        key={task.id}
                        className="flex items-start gap-2 rounded-xl bg-white p-3 text-sm font-semibold text-stone-700"
                      >
                        <input
                          type="checkbox"
                          checked={displayedGateNextIds.includes(task.id)}
                          onChange={(event) => {
                            const next = toggleId(
                              displayedGateNextIds,
                              task.id,
                              event.target.checked,
                            );
                            setGateNextReviewTaskIds(next);
                          }}
                          className="mt-1 accent-[#23412f]"
                        />
                        <span>{task.prompt}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="block max-w-sm">
                  <span className="mb-1 block text-sm font-extrabold text-stone-700">
                    Review 1 estimated duration (minutes)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={nextReviewEstimate}
                    onChange={(event) =>
                      setNextReviewEstimate(Number(event.target.value))
                    }
                    className={STUDY_FORM_CONTROL_CLASS}
                  />
                </label>

                <button
                  type="submit"
                  disabled={
                    !gateReadiness?.canAttempt ||
                    remainingGateTasks.length === 0 ||
                    selectedGateIds.length < 3 ||
                    new Set(selectedGateIds).size !== selectedGateIds.length ||
                    (
                      !openGateSession &&
                      selectedGateTopic.gate_result === "failed" &&
                      !gateCorrectiveReady
                    )
                  }
                  className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#1a2e24] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Record gate attempt
                </button>
                  </>
                )}
              </>
            )}
          </form>
        )}
              <div className="mt-6 border-t border-[#e4dac9] pt-5">
          <p className="text-sm font-semibold text-stone-600">
            {gateSectionReadyToComplete
              ? "All allocated gate sessions have been completed today."
              : "Complete every allocated gate session today before continuing."}
          </p>
          <button
            type="button"
            disabled={!gateSectionReadyToComplete}
            onClick={finishTopicGateSection}
            className="mt-3 rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#31573f] disabled:cursor-not-allowed disabled:opacity-40 action-primary--forest"
          >
            Complete Topic Gate section
          </button>
        </div>
      </section>
      )}

            {state &&
        latestTodaysPlan &&
        !planningMode &&
        activeSectionId === "reviews" && (
          <section
            id="reviews"
            className="scroll-mt-6 rounded-3xl border border-[#d8ccb8] bg-[#fffaf1] p-5 sm:p-8"
          >
        <SectionHeading
          eyebrow="04 · Retrieval"
          title="Due reviews"
          detail="Answer from memory and record your result."
        />

      <ItemWorkTimer
        itemId="study-section:reviews"
        itemName="Due reviews"
        defaultMinutes={25}
      />
            
        {dueReviews.length === 0 ? (
          <p className="study-empty-info rounded-2xl p-4 text-sm font-medium">
            No review is due today ({today ? formatStudyDateLabel(today) : "today"}). A passed gate creates Review 1 automatically.
          </p>
        ) : (
          <div className="space-y-5">
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold text-stone-700">
                Review to continue
              </span>
              <select
                value={selectedReview?.id ?? ""}
                onChange={(event) => changeReview(event.target.value)}
                className={STUDY_FORM_CONTROL_CLASS}
              >
                {dueReviews.map((review) => {
                  const topic = state.topics.find(
                    (item) => item.id === review.topic_id,
                  );

                  return (
                    <option key={review.id} value={review.id}>
                      {topic?.title ?? review.topic_id} · Stage {review.stage}
                      {review.event_kind === "retry" ? " · Retry" : ""}
                      {" · "}
                      {formatStudyDateLabel(review.current_due_date)}
                    </option>
                  );
                })}
              </select>
            </label>

            {selectedReview && (
              <>
                <div className="rounded-2xl bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-extrabold text-[#23412f]">
                        {reviewTopic?.title ?? selectedReview.topic_id}
                      </h3>
                      <p className="mt-1 text-xs font-semibold text-stone-500">
                        Review {selectedReview.id} · Stage{" "}
                        {selectedReview.stage} · Due{" "}
                        {formatStudyDateLabel(selectedReview.current_due_date)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-extrabold ${pillClass(
                        selectedReview.status,
                      )}`}
                    >
                      {selectedReview.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-stone-600">
                    {reviewTopic?.learning_objective}
                  </p>
                  <p className="mt-2 text-xs font-bold text-stone-500">
                    Fixed selection: {selectedReview.selected_task_ids.length} ·
                    Attempted: {reviewAttemptedIds.size} ·
                    Remaining: {remainingReviewTasks.length}
                  </p>
                </div>

                {remainingReviewTasks.length === 0 ? (
                  <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
                    No unanswered questions remain for this review.
                  </p>
                ) : (
                  <form
                    onSubmit={submitReviewAttempt}
                    className="space-y-5"
                  >
                    <div className="rounded-2xl border border-[#e4dac9] bg-white p-4">
                      <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-stone-500">
                        Closed-book question
                      </p>
                      <label className="block">
                        <span className="mb-1 block text-sm font-extrabold text-stone-700">
                          Select an unanswered question
                        </span>
                        <select
                          value={
                            remainingReviewTasks.some(
                              (task) => task.id === reviewTaskId,
                            )
                              ? reviewTaskId
                              : remainingReviewTasks[0]?.id ?? ""
                          }
                          onChange={(event) =>
                            setReviewTaskId(event.target.value)
                          }
                          className="w-full rounded-xl border border-[#d8ccb8] bg-[#fffaf1] px-3 py-3 text-sm font-bold"
                        >
                          {remainingReviewTasks.map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.prompt}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="mt-3 text-xs font-semibold leading-5 text-stone-500">
                        Answer from memory first. Record your judgement only
                        after you have attempted the task. Expected-answer
                        criteria are not revealed on this screen.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-sm font-extrabold text-stone-700">
                          Result
                        </span>
                        <select
                          value={reviewResult}
                          onChange={(event) =>
                            setReviewResult(
                              event.target.value as AttemptResult,
                            )
                          }
                          className={STUDY_FORM_CONTROL_CLASS}
                        >
                          <option value="green">
                            Green — secure
                          </option>
                          <option value="yellow">
                            Yellow — gap
                          </option>
                          <option value="red">
                            Red — not recalled
                          </option>
                        </select>
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-sm font-extrabold text-stone-700">
                          Actual duration (minutes)
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={600}
                          value={reviewDuration}
                          onChange={(event) =>
                            setReviewDuration(Number(event.target.value))
                          }
                          className={STUDY_FORM_CONTROL_CLASS}
                        />
                      </label>

                      {reviewResult === "yellow" && (
                        <label className="block">
                          <span className="mb-1 block text-sm font-extrabold text-stone-700">
                            Yellow gap
                          </span>
                          <select
                            value={reviewYellowSeverity}
                            onChange={(event) =>
                              setReviewYellowSeverity(
                                event.target.value as YellowGapSeverity,
                              )
                            }
                            className={STUDY_FORM_CONTROL_CLASS}
                          >
                            <option value="minor">Minor</option>
                            <option value="substantive">Substantive</option>
                          </select>
                        </label>
                      )}
                    </div>

                    <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm font-semibold text-stone-700">
                      <input
                        type="checkbox"
                        checked={reviewCriticalError}
                        onChange={(event) =>
                          setReviewCriticalError(event.target.checked)
                        }
                        className="mt-1 accent-[#23412f]"
                      />
                      Critical error occurred in this attempt.
                    </label>

                    <fieldset className="rounded-2xl border border-[#e4dac9] p-4">
                      <legend className="px-2 text-sm font-extrabold text-stone-700">
                        Next review / retry selection
                      </legend>
                      <p className="mb-3 text-xs font-semibold text-stone-500">
                        These task IDs are selected before this attempt. Choose
                        two or three to make the next review ready to schedule.
                        A stage-5 success will instead await topic classification.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {activeTasksForReviewTopic.map((task) => (
                          <label
                            key={task.id}
                            className="flex items-start gap-2 rounded-xl bg-white p-3 text-sm font-semibold text-stone-700"
                          >
                            <input
                              type="checkbox"
                              checked={displayedReviewNextIds.includes(task.id)}
                              onChange={(event) => {
                                setReviewNextTaskIds(
                                  toggleId(
                                    displayedReviewNextIds,
                                    task.id,
                                    event.target.checked,
                                  ),
                                );
                              }}
                              className="mt-1 accent-[#23412f]"
                            />
                            <span>{task.prompt}</span>
                          </label>
                        ))}
                      </div>
                      <label className="mt-4 block max-w-sm">
                        <span className="mb-1 block text-sm font-extrabold text-stone-700">
                          Next review estimate (minutes)
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={600}
                          value={nextReviewEstimate}
                          onChange={(event) =>
                            setNextReviewEstimate(Number(event.target.value))
                          }
                          className={STUDY_FORM_CONTROL_CLASS}
                        />
                      </label>
                    </fieldset>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#1a2e24]"
                      >
                        Record review attempt
                      </button>
                      {selectedReview.status === "in_progress" &&
                        reviewAttemptedIds.size > 0 &&
                        remainingReviewTasks.length > 0 && (
                          <button
                            type="button"
                            onClick={pauseReview}
                            className="rounded-xl border border-[#d8ccb8] px-5 py-3 text-sm font-extrabold text-[#23412f] hover:bg-[#efe4d1]"
                          >
                            Pause until next study day
                          </button>
                        )}
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        )}
                    <div className="mt-6 border-t border-[#e4dac9] pt-5">
          {!reviewSectionReadyToComplete && (
            <p className="text-sm font-semibold text-stone-600">
              Complete every allocated review today before continuing.
            </p>
          )}
          <button
            type="button"
            disabled={!reviewSectionReadyToComplete}
            onClick={finishReviewSection}
            className="mt-3 rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#31573f] disabled:cursor-not-allowed disabled:opacity-40 action-primary--forest"
          >
            Complete Due Reviews section
          </button>
        </div>
                </section>
        )}
    </div>
  );
}
