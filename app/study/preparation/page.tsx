"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useCloudStudyState } from "@/lib/studyMvp/useCloudStudyState";
import { getTopicPreparationReadiness, isRetrievalTaskAvailableForNewSessions } from "@/lib/studyMvp/preparationReadiness";
import { getLatestGateSession } from "@/lib/studyMvp/dashboard";
import {
  addRetrievalQuestion,
  isReferencedByUnfinishedSession,
  createRetrievalQuestionVersion,
  renameTopic,
  setRetrievalQuestionActive,
  setTopicPreparationStatus,
  setUnitPlannerExcluded,
  updateTopicLearningObjective,
  type RetrievalQuestionDraft,
} from "@/lib/studyMvp/preparationManagement";
import type {
  ObjectiveType,
  RetrievalPurpose,
  RetrievalTask,
  RetrievalTaskType,
  TopicPreparationStatus,
} from "@/lib/studyMvp/types";

const OBJECTIVE_TYPES: ObjectiveType[] = ["recall", "explain", "compare", "solve", "argue"];
const TASK_TYPES: RetrievalTaskType[] = [
  "definition", "explanation", "comparison", "problem", "essay_plan", "application",
];
const PURPOSES: RetrievalPurpose[] = ["gate", "review", "retry", "corrective", "mixed", "sampler"];

function newQuestionId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

const fieldClass = "mt-1 block w-full rounded-xl border border-[var(--p6-border-control)] bg-[var(--p6-surface)] px-3 py-2.5 text-sm text-[var(--p6-text)]";
const primaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl bg-[var(--p6-primary)] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
const secondaryButton = "inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--p6-border-strong)] bg-[var(--p6-surface)] px-4 py-2.5 text-sm font-bold text-[var(--p6-text)] hover:bg-[var(--p6-surface-subtle)]";

function emptyDraft(): RetrievalQuestionDraft {
  return {
    prompt: "",
    expected_answer_criteria: "",
    task_type: "explanation",
    purpose: "gate",
    estimated_duration_min: 5,
  };
}

function displayStatus(status: TopicPreparationStatus | undefined): string {
  if (!status) return "Needs review (legacy)";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function StudyPreparationPage() {
  const {
    state,
    loadingError,
    notice,
    problem,
    cloudSyncStatus,
    persist,
  } = useCloudStudyState();

  const cloudSyncLabel =
    cloudSyncStatus === "synced" ? "Synced" :
    cloudSyncStatus === "syncing" ? "Saving" :
    cloudSyncStatus === "ready" ? "Cloud ready" :
    cloudSyncStatus === "loading" ? "Connecting" :
    cloudSyncStatus === "migration" ? "Migration needs approval" :
    cloudSyncStatus === "conflict" ? "Sync conflict" :
    "Sync issue";

  const [courseId, setCourseId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [topicTitleDraft, setTopicTitleDraft] = useState("");
  const [objectiveDraft, setObjectiveDraft] = useState("");
  const [objectiveTypeDraft, setObjectiveTypeDraft] = useState<ObjectiveType>("explain");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [questionDraft, setQuestionDraft] = useState<RetrievalQuestionDraft>(emptyDraft);
  const [formMessage, setFormMessage] = useState("");
  const [formProblem, setFormProblem] = useState("");

  const courses = useMemo(
    () => (state?.courses ?? []).filter((course) => !course.archived_at),
    [state],
  );
  const selectedCourse = courses.find((course) => course.id === courseId) ?? courses[0] ?? null;
  const units = useMemo(
    () => state?.units.filter((unit) => unit.course_id === selectedCourse?.id) ?? [],
    [state, selectedCourse],
  );
  const selectedUnit = units.find((unit) => unit.id === unitId) ?? units[0] ?? null;
  const topics = useMemo(
    () => state?.topics
      .filter((topic) => topic.unit_id === selectedUnit?.id)
      .sort((a, b) => a.order_index - b.order_index || a.topic_number - b.topic_number) ?? [],
    [state, selectedUnit],
  );
  const selectedTopic = topics.find((topic) => topic.id === topicId) ?? topics[0] ?? null;
  const questions = useMemo(
    () => (state?.retrieval_tasks ?? [])
      .filter((task) => task.topic_id === selectedTopic?.id)
      .sort((a, b) => (a.version_number ?? 1) - (b.version_number ?? 1)),
    [state, selectedTopic],
  );

  const currentQuestions = useMemo(
    () => questions.filter(
      (task) => !questions.some(
        (candidate) => candidate.supersedes_task_id === task.id,
      ),
    ),
    [questions],
  );

  const previousQuestions = useMemo(
    () => questions.filter(
      (task) => questions.some(
        (candidate) => candidate.supersedes_task_id === task.id,
      ),
    ),
    [questions],
  );

  const readiness = state && selectedTopic
    ? getTopicPreparationReadiness(selectedTopic, state.retrieval_tasks)
    : null;

  useEffect(() => {
    if (!selectedTopic) {
      setTopicTitleDraft("");
      setObjectiveDraft("");
      setObjectiveTypeDraft("explain");
      setEditingQuestionId(null);
      setIsAddingQuestion(false);
      setQuestionDraft(emptyDraft());
      return;
    }
    setTopicTitleDraft(selectedTopic.title);
    setObjectiveDraft(selectedTopic.learning_objective);
    setObjectiveTypeDraft(selectedTopic.objective_type);
    setEditingQuestionId(null);
    setIsAddingQuestion(false);
    setQuestionDraft(emptyDraft());
    setFormProblem("");
    setFormMessage("");
  }, [selectedTopic]);

  function commit(next: NonNullable<typeof state>, message: string): boolean {
    const accepted = persist(next, message);
    if (accepted) {
      setFormProblem("");
      setFormMessage(message);
    }
    return accepted;
  }

  function saveTopicTitle() {
    if (!state || !selectedTopic) return;
    try {
      const cleanTitle = topicTitleDraft.trim();
      const next = renameTopic(state, selectedTopic.id, cleanTitle);
      commit(next, `Topic renamed to "${cleanTitle}".`);
    } catch (error) {
      setFormProblem(error instanceof Error ? error.message : "Could not rename the topic.");
    }
  }

  function saveObjective() {
    if (!state || !selectedTopic) return;
    try {
      const next = updateTopicLearningObjective(
        state,
        selectedTopic.id,
        objectiveDraft,
        objectiveTypeDraft,
      );
      commit(next, `Learning objective saved for ${selectedTopic.title}.`);
    } catch (error) {
      setFormProblem(error instanceof Error ? error.message : "Could not save the learning objective.");
    }
  }

  function changeTopicStatus(status: TopicPreparationStatus) {
    if (!state || !selectedTopic) return;
    try {
      const next = setTopicPreparationStatus(state, selectedTopic.id, status);
      commit(next, `${selectedTopic.title} marked ${status}.`);
    } catch (error) {
      setFormProblem(error instanceof Error ? error.message : "Could not update topic readiness.");
    }
  }

  function toggleUnitExclusion() {
    if (!state || !selectedUnit) return;
    try {
      const excluded = !selectedUnit.planner_excluded;
      const next = setUnitPlannerExcluded(state, selectedUnit.id, excluded);
      commit(next, excluded
        ? `${selectedUnit.name} excluded from new planner selection.`
        : `${selectedUnit.name} restored to planner eligibility.`);
    } catch (error) {
      setFormProblem(error instanceof Error ? error.message : "Could not update unit eligibility.");
    }
  }

  function beginQuestionVersion(task: RetrievalTask) {
    setEditingQuestionId(task.id);
    setQuestionDraft({
      prompt: task.prompt,
      expected_answer_criteria: task.expected_answer_criteria,
      task_type: task.task_type,
      purpose: task.purpose,
      estimated_duration_min: task.estimated_duration_min,
    });
    setFormProblem("");
    setFormMessage(`Creating a new version of question ${task.version_number ?? 1}. The original will remain in history.`);
  }

  function cancelQuestionEdit() {
    setEditingQuestionId(null);
    setIsAddingQuestion(false);
    setQuestionDraft(emptyDraft());
    setFormProblem("");
    setFormMessage("");
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state || !selectedTopic) return;
    try {
      const next = editingQuestionId
        ? createRetrievalQuestionVersion(state, editingQuestionId, questionDraft, newQuestionId)
        : addRetrievalQuestion(state, selectedTopic.id, questionDraft, newQuestionId);
      const message = editingQuestionId
        ? "A new question version was saved. The previous wording and ID were retained."
        : "Retrieval question added to the topic bank.";
      if (commit(next, message)) cancelQuestionEdit();
    } catch (error) {
      setFormProblem(error instanceof Error ? error.message : "Could not save the question.");
    }
  }

  function toggleQuestionActive(task: RetrievalTask) {
    if (!state) return;
    try {
      const currentlyAvailable = isRetrievalTaskAvailableForNewSessions(task, state.retrieval_tasks);
      const next = setRetrievalQuestionActive(state, task.id, !currentlyAvailable);
      commit(next, currentlyAvailable
        ? "Question deactivated for future selection. Existing unfinished sessions retain the original question."
        : "Question restored for future sessions.");
    } catch (error) {
      setFormProblem(error instanceof Error ? error.message : "Could not update the question.");
    }
  }

  function beginNewQuestion() {
    setEditingQuestionId(null);
    setQuestionDraft(emptyDraft());
    setIsAddingQuestion(true);
    setFormProblem("");
    setFormMessage("");
  }

  function renderQuestionForm() {
    return (
      <form onSubmit={submitQuestion} id="question-editor" aria-label="Retrieval question editor" className="question-editor space-y-3">
        <div>
          <h3 className="font-extrabold text-[var(--p6-text)]">{editingQuestionId ? "Replace this question version" : "Add a retrieval question"}</h3>
          <p className="mt-1 text-xs text-[var(--p6-text-secondary)]">{editingQuestionId ? "Saving creates a new question ID; the previous question remains available for historical and unfinished-session references." : "A useful topic bank contains 3–5 active questions, including at least 3 Gate and 2 Review questions."}</p>
        </div>
        <label className="block text-sm font-bold text-[var(--p6-text)]">Question prompt
          <textarea required rows={2} className={fieldClass} value={questionDraft.prompt} onChange={(event) => setQuestionDraft((current) => ({ ...current, prompt: event.target.value }))} />
        </label>
        <label className="block text-sm font-bold text-[var(--p6-text)]">Expected answer criteria
          <textarea required rows={3} className={fieldClass} value={questionDraft.expected_answer_criteria} onChange={(event) => setQuestionDraft((current) => ({ ...current, expected_answer_criteria: event.target.value }))} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-bold text-[var(--p6-text)]">Question type
            <select className={fieldClass} value={questionDraft.task_type} onChange={(event) => setQuestionDraft((current) => ({ ...current, task_type: event.target.value as RetrievalTaskType }))}>
              {TASK_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-[var(--p6-text)]">Purpose
            <select className={fieldClass} value={questionDraft.purpose} onChange={(event) => setQuestionDraft((current) => ({ ...current, purpose: event.target.value as RetrievalPurpose }))}>
              {PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-[var(--p6-text)]">Estimated minutes
            <input type="number" min={1} max={180} step={1} required className={fieldClass} value={questionDraft.estimated_duration_min} onChange={(event) => setQuestionDraft((current) => ({ ...current, estimated_duration_min: Number(event.target.value) }))} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButton}>{editingQuestionId ? "Save new version" : "Add question"}</button>
          <button type="button" onClick={cancelQuestionEdit} className={secondaryButton}>
            {editingQuestionId ? "Cancel version edit" : "Cancel"}
          </button>
        </div>
      </form>
    );
  }

  if (loadingError) {
    return <main className="study-preparation-page mx-auto w-full max-w-6xl"><p role="alert" className="text-rose-700">{loadingError}</p><Link href="/study" className="mt-4 inline-block underline">Return to Study</Link></main>;
  }

  if (!state) {
    return <main className="study-preparation-page mx-auto w-full max-w-6xl text-[var(--p6-text-secondary)]">Connecting to your Study workspace…</main>;
  }

  return (
    <main className="study-preparation-page mx-auto w-full max-w-6xl space-y-4 pb-10">
      <section className="study-preparation-toolbar">
        <div className="study-preparation-toolbar__top">
          <div className="min-w-0">
            <Link href="/study" className="text-sm font-bold text-[var(--p6-primary)] hover:underline">← Study workspace</Link>
            <h1 className="mt-1 text-xl font-extrabold text-[var(--p6-text)]">Study Preparation</h1>
          </div>
          <span
            className="study-sync-status"
            data-status={cloudSyncStatus}
            role="status"
            aria-live="polite"
            aria-label={"Cloud sync: " + cloudSyncLabel}
            title={"Cloud sync: " + cloudSyncLabel}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7.5 18a4.5 4.5 0 1 1 .88-8.91A6.5 6.5 0 0 1 21 12.5 4.5 4.5 0 0 1 17 18Z" />
            </svg>
            <span className="sr-only">{cloudSyncLabel}</span>
          </span>
        </div>
        {courses.length > 0 && (
          <div className="study-preparation-selectors grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-bold text-[var(--p6-text)]">Course
              <select className={fieldClass} value={selectedCourse?.id ?? ""} onChange={(event) => { setCourseId(event.target.value); setUnitId(""); setTopicId(""); }}>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.code ? `${course.code} · ` : ""}{course.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold text-[var(--p6-text)]">Unit
              <select className={fieldClass} value={selectedUnit?.id ?? ""} onChange={(event) => { setUnitId(event.target.value); setTopicId(""); }}>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code ? `${unit.code} · ` : ""}{unit.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold text-[var(--p6-text)]">Topic
              <select className={fieldClass} value={selectedTopic?.id ?? ""} onChange={(event) => setTopicId(event.target.value)}>
                {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.topic_number}. {topic.title}</option>)}
              </select>
            </label>
          </div>
        )}
        {selectedUnit && (
          <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--p6-border-decorative)] bg-[var(--p6-surface)] p-4">
            <div>
              <h2 className="font-extrabold text-[var(--p6-text)]">Unit planner eligibility</h2>
              <p className="mt-1 text-sm text-[var(--p6-text-secondary)]">
                {selectedUnit.planner_excluded
                  ? "This unit is excluded from new initial-learning selections."
                  : "This unit may contribute eligible topics to new initial-learning plans."}
              </p>
              <p className="mt-1 text-xs text-[var(--p6-text-secondary)]">
                Exclusion does not delete topics, question banks, scheduled reviews or unfinished sessions.
              </p>
            </div>
            <button type="button" onClick={toggleUnitExclusion} className={secondaryButton}>
              {selectedUnit.planner_excluded ? "Restore unit to planner" : "Exclude unit from planner"}
            </button>
          </section>
        )}
      </section>

      {(notice || problem || formMessage || formProblem) && (
        <div role={problem || formProblem ? "alert" : "status"} className={`rounded-xl border p-3 text-sm font-semibold ${problem || formProblem ? "border-rose-300 bg-rose-50 text-rose-900" : "border-[var(--p6-border-decorative)] bg-[var(--p6-surface-subtle)] text-[var(--p6-text)]"}`}>
          {problem || formProblem || formMessage || notice}
        </div>
      )}

      {courses.length === 0 ? (
        <section className="rounded-2xl border border-[var(--p6-border-decorative)] bg-[var(--p6-surface)] p-5">
          <h2 className="font-extrabold text-[var(--p6-text)]">No course catalogue yet</h2>
          <p className="mt-2 text-sm text-[var(--p6-text-secondary)]">Import courses and topics before preparing the question bank.</p>
          <Link href="/study#catalog" className={`${primaryButton} mt-4`}>Open course catalogue</Link>
        </section>
      ) : (
        <>
          {!selectedTopic ? (
            <section className="rounded-2xl border border-[var(--p6-border-decorative)] bg-[var(--p6-surface)] p-5 text-sm text-[var(--p6-text-secondary)]">No topics are registered in this unit.</section>
          ) : (
            <>
              <details className="study-preparation-section">
                <summary className="study-preparation-section__summary">
                  <span className="text-base font-extrabold text-[var(--p6-text)]">Topic setup & readiness</span>
                  <span className={readiness?.ready ? "prep-readiness-status prep-readiness-status--ready" : "prep-readiness-status"}>
                    {readiness?.ready ? "Ready" : (readiness?.blockers.length ?? 0) + " blockers"}
                  </span>
                </summary>
                <div className="study-preparation-section__body">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="min-w-0 flex-1 text-sm font-bold text-[var(--p6-text)]">
                      Topic name
                      <input
                        className={fieldClass}
                        value={topicTitleDraft}
                        maxLength={180}
                        onChange={(event) => setTopicTitleDraft(event.target.value)}
                        aria-label="Topic name"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={saveTopicTitle}
                      disabled={!topicTitleDraft.trim() || topicTitleDraft.trim() === selectedTopic.title}
                      className={secondaryButton}
                    >
                      Save topic name
                    </button>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                    <label className="text-sm font-bold text-[var(--p6-text)]">Learning objective
                      <textarea className={fieldClass} rows={3} value={objectiveDraft} onChange={(event) => setObjectiveDraft(event.target.value)} placeholder="Describe what you must be able to retrieve, explain, compare or solve." />
                    </label>
                    <label className="text-sm font-bold text-[var(--p6-text)]">Objective type
                      <select className={fieldClass} value={objectiveTypeDraft} onChange={(event) => setObjectiveTypeDraft(event.target.value as ObjectiveType)}>
                        {OBJECTIVE_TYPES.map((type) => <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>)}
                      </select>
                      <button type="button" onClick={saveObjective} className={`${secondaryButton} mt-3 w-full`}>Save objective</button>
                    </label>
                  </div>

                  <div className="study-preparation-readiness">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-extrabold text-[var(--p6-text)]">Readiness assessment</h3>
                      <span className="text-xs font-bold text-[var(--p6-text-secondary)]">{readiness?.activeTaskCount ?? 0} active · {readiness?.activeGateQuestionCount ?? 0} Gate · {readiness?.activeReviewQuestionCount ?? 0} Review</span>
                    </div>
                    {readiness?.ready ? (
                      <p className="mt-2 text-sm font-semibold text-emerald-800">The objective and active question bank meet the preparation requirements.</p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm text-[var(--p6-text-secondary)]">
                        {readiness?.blockers.map((blocker) => <li key={blocker.code}>• {blocker.message}</li>)}
                      </ul>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" disabled={!readiness?.ready} onClick={() => changeTopicStatus("ready")} className={primaryButton}>Mark Ready</button>
                    <button type="button" onClick={() => changeTopicStatus("draft")} className={secondaryButton}>Mark Draft</button>
                    <button type="button" onClick={() => changeTopicStatus("excluded")} className={secondaryButton}>Exclude topic</button>
                    {selectedTopic.preparation_status === "excluded" && (
                      <button type="button" disabled={!readiness?.ready} onClick={() => changeTopicStatus("ready")} className={secondaryButton}>Restore as Ready</button>
                    )}
                  </div>
                  {!selectedTopic.preparation_status && (
                    <p className="mt-3 text-xs text-[var(--p6-text-secondary)]">This is a legacy topic without an explicit preparation status. It remains planner-compatible until you review it; it is not represented as Ready.</p>
                  )}
                </div>
              </details>

              <details className="study-preparation-section">
                <summary className="study-preparation-section__summary">
                  <span className="text-base font-extrabold text-[var(--p6-text)]">Question bank</span>
                  <span className="text-sm font-semibold text-[var(--p6-text-secondary)]">{questions.length} questions</span>
                </summary>
                <div className="study-preparation-section__body">
                  <div className="mb-3 flex justify-end">
                    <button type="button" onClick={beginNewQuestion} className={secondaryButton}>Add new question</button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {questions.length === 0 ? (
                      <p className="rounded-xl bg-[var(--p6-surface-subtle)] p-4 text-sm text-[var(--p6-text-secondary)]">No questions have been created for this topic yet.</p>
                    ) : currentQuestions.map((task) => {
                      const hasNewerVersion = questions.some((candidate) => candidate.supersedes_task_id === task.id);
                      const availableForNewSessions = isRetrievalTaskAvailableForNewSessions(task, state.retrieval_tasks);
                      const isInUnfinishedReview = state.review_events.some((review) =>
                        (review.status === "pending" || review.status === "in_progress" || review.status === "deferred" || review.status === "missed") && review.selected_task_ids.includes(task.id),
                      );
                      const isInUnfinishedGate = state.topics.some((topic) => {
                        const session = getLatestGateSession(state, topic.id);
                        return Boolean(session && !session.complete && session.selectedTaskIds.includes(task.id));
                      });
                      const isInUnfinishedGuidedPractice = isReferencedByUnfinishedSession(state, task.id) && !isInUnfinishedReview && !isInUnfinishedGate;
                      const questionStatus = hasNewerVersion
                        ? "Superseded"
                        : availableForNewSessions
                          ? "Available for new sessions"
                          : (isInUnfinishedReview || isInUnfinishedGate || isInUnfinishedGuidedPractice) && task.active
                            ? "Retained for unfinished session"
                            : "Inactive for new sessions";
                      return (
                        <article key={task.id} className="prep-question-row">
                          {editingQuestionId === task.id ? (
                            renderQuestionForm()
                          ) : (
                            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                                  <span className={availableForNewSessions ? "text-emerald-700" : "text-[var(--p6-text-secondary)]"}>{questionStatus}</span>
                                  <span className="text-[var(--p6-text-secondary)]">Version {task.version_number ?? 1}</span>
                                  <span className="rounded-full bg-[var(--p6-surface-subtle)] px-2 py-0.5 text-[var(--p6-text-secondary)]">{task.purpose}</span>
                                  <span className="text-[var(--p6-text-secondary)]">{task.task_type} · {task.estimated_duration_min} min</span>
                                </div>
                                <h3 className="mt-2 font-extrabold text-[var(--p6-text)]">{task.prompt}</h3>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--p6-text-secondary)]">{task.expected_answer_criteria}</p>
                                {task.supersedes_task_id && <p className="mt-1 text-xs text-[var(--p6-text-secondary)]">Replaces version ID: {task.supersedes_task_id}</p>}
                                {isInUnfinishedReview && <p className="mt-1 text-xs font-bold text-amber-800">Selected by an unfinished Review; its original selection is preserved.</p>}
                                {isInUnfinishedGate && <p className="mt-1 text-xs font-bold text-amber-800">Selected by an unfinished Gate; its original selection is preserved.</p>}
                                {isInUnfinishedGuidedPractice && <p className="mt-1 text-xs font-bold text-amber-800">Selected by unfinished guided practice; its original selection is preserved.</p>}
                                {hasNewerVersion && <p className="mt-1 text-xs text-[var(--p6-text-secondary)]">A newer version exists; this version is retained for history.</p>}
                              </div>
                              <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto sm:shrink-0">
                                {availableForNewSessions && !hasNewerVersion && <button type="button" onClick={() => beginQuestionVersion(task)} className={secondaryButton}>Edit / replace</button>}
                                {!hasNewerVersion && (
                                  <button type="button" onClick={() => toggleQuestionActive(task)} className={secondaryButton}>
                                    {availableForNewSessions ? "Deactivate" : "Restore for future sessions"}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  {previousQuestions.length > 0 && (
                    <details className="mt-4 rounded-xl border border-[var(--p6-border-decorative)]">
                      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--p6-text)]">
                        Previous versions ({previousQuestions.length})
                      </summary>
                      <div className="border-t border-[var(--p6-border-decorative)] px-4">
                        {previousQuestions.map((task) => (
                          <article key={task.id} className="prep-question-row">
                            <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--p6-text-secondary)]">
                              <span>Previous version</span>
                              <span>Version {task.version_number ?? 1}</span>
                              <span>{task.purpose}</span>
                            </div>
                            <h3 className="mt-2 font-bold text-[var(--p6-text)]">{task.prompt}</h3>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--p6-text-secondary)]">{task.expected_answer_criteria}</p>
                          </article>
                        ))}
                      </div>
                    </details>
                  )}
                  {isAddingQuestion && editingQuestionId === null && renderQuestionForm()}
                  <p className="mt-4 text-xs leading-5 text-[var(--p6-text-secondary)]">
                    Deactivation affects future question selection only. Scheduled Reviews and unfinished Gate sessions keep their original question IDs. Resuming an unfinished Gate can reactivate its exact original questions; no replacement is substituted automatically.
                  </p>
                </div>
              </details>
            </>
          )}
        </>
      )}
    </main>
  );
}
