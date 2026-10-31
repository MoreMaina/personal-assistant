"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  applyGuidedPracticeAttempt,
  getGuidedPracticeSessionSelection,
  type GuidedPracticeKind,
} from "@/lib/studyMvp/guidedPractice";

import { localDateOfTimestamp } from "@/lib/studyMvp/reviewEngine";

import type {
  AttemptResult,
  StudyMvpState,
  TaskEvent,
} from "@/lib/studyMvp/types";

interface GuidedPracticeRunnerProps {
  state: StudyMvpState;
  purpose: GuidedPracticeKind;
  subjectId: string;
  plannedMinutes: number;
  today: string;
  persist: (
    next: StudyMvpState,
    successMessage?: string,
  ) => boolean;
}

export default function GuidedPracticeRunner({
  state,
  purpose,
  subjectId,
  plannedMinutes,
  today,
  persist,
}: GuidedPracticeRunnerProps) {
  const [responseText, setResponseText] = useState("");
  const [criteriaRevealed, setCriteriaRevealed] =
    useState(false);
  const [result, setResult] =
    useState<AttemptResult>("yellow");
  const [error, setError] = useState("");

  const selection = getGuidedPracticeSessionSelection(
    state,
    purpose,
    subjectId,
    today,
    plannedMinutes,
  );

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

  const attemptsByTask = new Map<string, TaskEvent>(
    sessionEvents
      .filter(
        (event) => event.retrieval_task_id !== null,
      )
      .map((event) => [
        event.retrieval_task_id!,
        event,
      ]),
  );

  const currentQuestion =
    selection.questions.find(
      (question) =>
        !attemptsByTask.has(question.taskId),
    ) ?? null;

  const answeredCount =
    selection.attemptedTaskIds.length;

  const allQuestionsAnswered =
    selection.selectedTaskIds.length > 0 &&
    selection.missingTaskIds.length === 0 &&
    selection.selectedTaskIds.every((id) =>
      selection.attemptedTaskIds.includes(id),
    );

  useEffect(() => {
    setResponseText("");
    setCriteriaRevealed(false);
    setResult("yellow");
    setError("");
  }, [currentQuestion?.taskId]);

  function saveAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!currentQuestion) return;

    try {
      const recorded = applyGuidedPracticeAttempt(
        state,
        {
          purpose,
          subjectId,
          taskId: currentQuestion.taskId,
          responseText,
          result,
          loggedAt: new Date().toISOString(),
          selectedTaskIdsSnapshot:
            selection.selectedTaskIds,
        },
      );

      if (recorded.outcome === "duplicate") {
        setError(
          "This answer was already saved. The question sequence will resume from the next unanswered question.",
        );
        return;
      }

      const saved = persist(
        recorded.state,
        `Saved your ${result.toUpperCase()} guided-practice answer.`,
      );

      if (!saved) {
        setError(
          "The answer could not be accepted. Resolve the Study storage or cloud-sync issue before trying again.",
        );
        return;
      }

      setResponseText("");
      setCriteriaRevealed(false);
      setResult("yellow");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save this guided-practice answer.",
      );
    }
  }

  const activityName =
    purpose === "mixed" ? "Mixed practice" : "Saturday Sampler";

  return (
    <section className="mt-6 rounded-2xl border border-[#d8ccb8] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-[#23412f]">
            Guided questions
          </h3>
          <p className="mt-1 text-sm text-stone-600">
            {activityName} · {answeredCount} of{" "}
            {selection.selectedTaskIds.length} answered
          </p>
        </div>

        {selection.selectedTaskIds.length > 0 && (
          <span className="rounded-full bg-[#efe4d1] px-3 py-1 text-sm font-bold text-[#23412f]">
            {Math.round(
              (answeredCount /
                selection.selectedTaskIds.length) *
                100,
            )}
            % complete
          </span>
        )}
      </div>

      {selection.selectedTaskIds.length === 0 && (
        <p className="mt-4 rounded-xl bg-[#f7f1e7] p-4 text-sm font-semibold text-stone-700">
          {purpose === "mixed"
            ? "No suitable mixed-practice question set fits this allocation. Prepare active mixed-practice questions across at least two active topics."
            : "No eligible Sampler questions are prepared. Add or activate at least one retrieval question with purpose Sampler."}
        </p>
      )}

      {selection.missingTaskIds.length > 0 && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-rose-100 p-4 text-sm font-semibold text-rose-900"
        >
          This saved question set contains questions that are no
          longer eligible. Restore the original questions or their
          active topic/course status before continuing. The saved
          selection has not been replaced.
        </p>
      )}

      {selection.questions.length > 0 && (
        <ol className="mt-4 space-y-2">
          {selection.questions.map((question, index) => {
            const attempt = attemptsByTask.get(
              question.taskId,
            );

            return (
              <li
                key={question.taskId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f7f1e7] px-3 py-2 text-sm"
              >
                <span className="font-semibold text-stone-700">
                  {index + 1}. {question.topicTitle}
                </span>
                <span className="font-bold text-[#23412f]">
                  {attempt?.result
                    ? attempt.result.toUpperCase()
                    : "Not answered"}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {allQuestionsAnswered && (
        <p className="mt-4 rounded-xl bg-[#edf4ed] p-4 text-sm font-bold text-[#23412f]">
          All selected questions have saved answers. You can
          continue to the time-recording and section-completion
          requirements.
        </p>
      )}

      {currentQuestion && (
        <div className="mt-5 border-t border-[#e4dac9] pt-5">
          <p className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
            {currentQuestion.courseName} ·{" "}
            {currentQuestion.unitName}
          </p>

          <h4 className="mt-2 text-base font-extrabold text-[#23412f]">
            {currentQuestion.topicTitle}
          </h4>

          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-800">
            {currentQuestion.prompt}
          </p>

          <form onSubmit={saveAnswer} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-extrabold text-stone-700">
                Your answer
              </span>
              <textarea
                value={responseText}
                onChange={(event) => {
                  setResponseText(event.target.value);
                  setError("");
                }}
                rows={5}
                maxLength={20_000}
                placeholder="Answer from memory before revealing the criteria..."
                className="w-full rounded-xl border border-[#d8ccb8] bg-white px-3 py-3 text-sm"
              />
            </label>

            <button
              type="button"
              disabled={!responseText.trim()}
              onClick={() => {
                setCriteriaRevealed(true);
                setError("");
              }}
              className="rounded-xl border border-[#23412f] px-4 py-2 text-sm font-extrabold text-[#23412f] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reveal expected answer criteria
            </button>

            {criteriaRevealed && (
              <div className="rounded-xl bg-[#f7f1e7] p-4">
                <h5 className="text-sm font-extrabold text-[#23412f]">
                  Expected answer criteria
                </h5>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">
                  {currentQuestion.expectedAnswerCriteria}
                </p>
              </div>
            )}

            {criteriaRevealed && (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm font-extrabold text-stone-700">
                    Assess your answer
                  </span>
                  <select
                    value={result}
                    onChange={(event) =>
                      setResult(
                        event.target.value as AttemptResult,
                      )
                    }
                    className="w-full rounded-xl border border-[#d8ccb8] bg-white px-3 py-3 text-sm font-semibold"
                  >
                    <option value="green">
                      Green — I met the criteria
                    </option>
                    <option value="yellow">
                      Yellow — I partly met the criteria
                    </option>
                    <option value="red">
                      Red — I missed important criteria
                    </option>
                  </select>
                </label>

                <button
                  type="submit"
                  disabled={!responseText.trim()}
                  className="rounded-xl bg-[#23412f] px-5 py-3 text-sm font-extrabold text-white hover:bg-[#31573f] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save answer and continue
                </button>
              </>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-rose-100 p-3 text-sm font-bold text-rose-900"
              >
                {error}
              </p>
            )}
          </form>
        </div>
      )}
    </section>
  );
}
