"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useCloudStudyState } from "@/lib/studyMvp/useCloudStudyState";
import {
  buildWeeklyMetricFlags,
  calculateWeeklyMetrics,
} from "@/lib/studyMvp/metrics";
import { getStudyTrialPeriods } from "@/lib/studyMvp/storage";

import type {
  RetrievalTaskType,
  StudyTrialPeriod,
  WeekMetrics,
} from "@/lib/studyMvp/types";

const TASK_TYPES: RetrievalTaskType[] = [
  "definition",
  "explanation",
  "comparison",
  "problem",
  "essay_plan",
  "application",
];

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function todayInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
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
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");

  // Prevent spreadsheet formula execution from free-text event fields.
  if (/^[=+@]/.test(text)) text = `'${text}`;

  return `"${text.replace(/"/g, '""')}"`;
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}


type MetricTrendPoint = {
  week_number: number;
  week_start: string;
  week_end: string;
  snapshot: WeekMetrics | null;
  saved: boolean;
  closed: boolean;
};


function metricBelongsToTrial(metric: WeekMetrics, trial: StudyTrialPeriod): boolean {
  if (trial.source === "legacy") {
    // Legacy snapshots remain unassigned in storage. A precise week/date
    // match lets the legacy report display them without rewriting identity.
    return metric.trial_id == null;
  }
  return metric.trial_id === trial.id;
}

function formatShortDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function MetricProgress({
  value,
  target,
  lowerIsBetter = false,
}: {
  value: number | null;
  target: number;
  lowerIsBetter?: boolean;
}) {
  if (value === null) {
    return (
      <p className="mt-2 text-xs text-stone-500">
        No due reviews available to measure yet.
      </p>
    );
  }

  const bounded = Math.max(0, Math.min(100, value));
  const onTarget = lowerIsBetter ? value <= target : value >= target;

  return (
    <div
      className="relative mt-2 h-2 overflow-hidden rounded-full bg-stone-100"
      role="img"
      aria-label={`${value.toFixed(1)} percent; target ${lowerIsBetter ? "at most" : "at least"} ${target} percent`}
    >
      <div
        className={`h-full rounded-full ${
          onTarget ? "bg-teal-600" : "bg-amber-500"
        }`}
        style={{ width: `${bounded}%` }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-y-0 w-0.5 bg-stone-800"
        style={{ left: `${target}%` }}
      />
    </div>
  );
}

function MetricRow({
  number,
  label,
  value,
  target,
  sample,
  description,
  progressValue,
  progressTarget,
  lowerIsBetter,
  valueTone = "default",
  children,
}: {
  number: string;
  label: string;
  value: string;
  target: string;
  sample: string;
  description: string;
  progressValue?: number | null;
  progressTarget?: number;
  lowerIsBetter?: boolean;
  valueTone?: "default" | "danger";
  children?: ReactNode;
}) {
  return (
    <details className="group px-3 py-3 sm:px-4">
      <summary className="flex cursor-pointer list-none items-center gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-600">
          {number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-stone-900">
            {label}
          </span>
          <span className="mt-0.5 block text-xs text-stone-500">
            {target} · {sample}
          </span>
          {progressValue !== undefined && progressTarget !== undefined && (
            <MetricProgress
              value={progressValue}
              target={progressTarget}
              lowerIsBetter={lowerIsBetter}
            />
          )}
        </span>
        <span
          className={`shrink-0 text-right text-lg font-extrabold tabular-nums ${
            valueTone === "danger" ? "text-rose-700" : "text-stone-950"
          }`}
        >
          {value}
        </span>
        <span
          aria-hidden="true"
          className="ml-1 shrink-0 text-sm text-stone-400 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>

      <div className="ml-10 mt-3 space-y-2 border-t border-stone-100 pt-3">
        <p className="text-sm leading-5 text-stone-600">{description}</p>
        <p className="text-xs text-stone-500">
          Target: {target}. Sample: {sample}.
        </p>
        {children}
      </div>
    </details>
  );
}

function DurationErrorBreakdown({ snapshot }: { snapshot: WeekMetrics }) {
  return (
    <div className="mt-3 space-y-3">
      {TASK_TYPES.map((type) => {
        const count = snapshot.duration_error_sample_counts[type] ?? 0;
        const value = snapshot.median_duration_error_pct[type];
        const enoughData = count >= 5 && value !== null && value !== undefined;
        const bounded = enoughData
          ? Math.max(0, Math.min(100, value))
          : 0;

        return (
          <div key={type} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold capitalize text-stone-700">
                {type.replace(/_/g, " ")}
              </span>
              <span className="text-xs font-bold tabular-nums text-stone-800">
                {enoughData ? `${value.toFixed(1)}%` : "Insufficient data"}
                <span className="ml-2 font-normal text-stone-500">
                  n={count}
                </span>
              </span>
            </div>
            <div
              className="relative h-2 overflow-hidden rounded-full bg-stone-100"
              role="img"
              aria-label={
                enoughData
                  ? `${type}: ${value.toFixed(1)} percent median duration error from ${count} samples`
                  : `${type}: insufficient data, ${count} samples`
              }
            >
              {enoughData && (
                <div
                  className={`h-full rounded-full ${
                    value <= 25 ? "bg-teal-600" : "bg-amber-500"
                  }`}
                  style={{ width: `${bounded}%` }}
                />
              )}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 w-0.5 bg-stone-800"
                style={{ left: "25%" }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-stone-500">
        Each question type needs at least five attempts. The dark marker shows
        the 25% target.
      </p>
    </div>
  );
}

function FourWeekScorecard({ points }: { points: MetricTrendPoint[] }) {
  if (points.length === 0) return null;

  const rateRows = [
    {
      label: "On-time completion",
      target: "Target ≥80%",
      values: points.map((point) =>
        point.snapshot ? point.snapshot.overall_on_time_completion_pct : null
      ),
    },
    {
      label: "Reviews deferred",
      target: "Target ≤20%",
      values: points.map((point) =>
        point.snapshot ? point.snapshot.deferral_rate_pct : null
      ),
    },
  ];

  const backlogValues = points.map((point) =>
    point.snapshot ? point.snapshot.overdue_critical_backlog_min : null
  );
  const availableBacklog = backlogValues.filter(
    (value): value is number => value !== null
  );
  const backlogScale = Math.max(1, ...availableBacklog) * 1.15;
  const x = (index: number) =>
    10 + (index / Math.max(1, points.length - 1)) * 300;
  const y = (value: number) =>
    30 - (Math.max(0, Math.min(backlogScale, value)) / backlogScale) * 18;

  const segments: string[] = [];
  let currentSegment: string[] = [];
  backlogValues.forEach((value, index) => {
    if (value === null) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment.join(" "));
        currentSegment = [];
      }
      return;
    }
    currentSegment.push(`${x(index)},${y(value)}`);
  });
  if (currentSegment.length > 0) segments.push(currentSegment.join(" "));

  return (
    <section className="study-metric-scorecard">
      <div className="study-metric-section-heading">
        <h2>Four-week progress</h2>
        <p>
          Compare the same measures across the trial. Saved snapshots remain
          authoritative; other weeks are calculated from immutable events.
        </p>
      </div>

      <div
        className="study-metric-scorecard__grid"
        role="table"
        aria-label="Four-week progress scorecard"
      >
        <div className="study-metric-scorecard__header" role="row">
          <div className="study-metric-scorecard__measure-heading" role="columnheader">
            Measure
          </div>
          {points.map((point) => (
            <div className="study-metric-scorecard__week" role="columnheader" key={point.week_number}>
              <strong>W{point.week_number}</strong>
              <small>
                {point.saved
                  ? "Saved"
                  : point.closed
                    ? "Calculated"
                    : point.snapshot
                      ? "Live"
                      : "Upcoming"}
              </small>
            </div>
          ))}
        </div>

        {rateRows.map((row) => (
          <div className="study-metric-scorecard__row" role="row" key={row.label}>
            <div className="study-metric-scorecard__measure" role="rowheader">
              <strong>{row.label}</strong>
              <small>{row.target}</small>
            </div>
            {row.values.map((value, index) => (
              <div
                className="study-metric-scorecard__value"
                role="cell"
                key={`${row.label}-${points[index].week_number}`}
              >
                {value === null ? "—" : `${value.toFixed(1)}%`}
              </div>
            ))}
          </div>
        ))}

        <div className="study-metric-scorecard__row" role="row">
          <div className="study-metric-scorecard__measure" role="rowheader">
            <strong>Important overdue backlog</strong>
            <small>No increase for 2 weeks</small>
          </div>
          <div className="study-metric-scorecard__backlog" role="cell">
            <svg
              viewBox="0 0 320 42"
              role="img"
              aria-label={`Important overdue backlog: ${backlogValues.map((value) => value === null ? "no value" : `${Math.round(value)} minutes`).join(", ")}`}
            >
              {segments.map((segment, index) => (
                <polyline
                  key={index}
                  points={segment}
                  className="study-metric-scorecard__line"
                />
              ))}
              {backlogValues.map((value, index) =>
                value === null ? null : (
                  <circle
                    key={points[index].week_number}
                    cx={x(index)}
                    cy={y(value)}
                    r="5"
                    className="study-metric-scorecard__point"
                  >
                    <title>
                      Week {points[index].week_number}: {Math.round(value)} min
                    </title>
                  </circle>
                )
              )}
            </svg>
            <div className="study-metric-scorecard__backlog-values">
              {backlogValues.map((value, index) => (
                <strong key={points[index].week_number}>
                  {value === null ? "—" : `${Math.round(value)} min`}
                </strong>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="study-metric-scorecard__note">
        A dash means no recorded value is available; it does not mean zero.
      </p>
    </section>
  );
}

function MetricSummaryCard({
  label,
  value,
  target,
  sample,
}: {
  label: string;
  value: string;
  target: string;
  sample: string;
}) {
  return (
    <article className="study-metric-summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{target}</span>
      <small>{sample}</small>
    </article>
  );
}

function MetricDashboard({
  snapshot,
  trend,
  children,
}: {
  snapshot: WeekMetrics;
  trend: MetricTrendPoint[];
  children?: ReactNode;
}) {
  const counts = snapshot.sample_counts;

  const durationTypesWithEnoughData = TASK_TYPES.filter((type) => {
    const count = snapshot.duration_error_sample_counts[type] ?? 0;
    const value = snapshot.median_duration_error_pct[type];
    return count >= 5 && value !== null && value !== undefined;
  }).length;

  return (
    <div className="study-metric-dashboard space-y-5">
      <section className="study-metric-summary-grid">
        <MetricSummaryCard
          label="On-time completion"
          value={formatPercent(snapshot.overall_on_time_completion_pct)}
          target="Target ≥80%"
          sample={counts
            ? `${counts.overall_on_time.completed}/${counts.overall_on_time.due} reviews`
            : "Sample unavailable"}
        />
        <MetricSummaryCard
          label="Deferral rate"
          value={formatPercent(snapshot.deferral_rate_pct)}
          target="Target ≤20%"
          sample={counts
            ? `${counts.deferral_rate.deferred_events}/${counts.deferral_rate.due_events} reviews deferred`
            : "Sample unavailable"}
        />
        <MetricSummaryCard
          label="Important overdue backlog"
          value={`${snapshot.overdue_critical_backlog_min} min`}
          target="No increase for 2 weeks"
          sample={`${counts?.overdue_critical_backlog_events ?? "—"} unfinished reviews`}
        />
      </section>

      <FourWeekScorecard points={trend} />

      {children}

      <section className="study-metric-list">
        <div className="study-metric-list__heading">
          <div>
            <h2>Eight trial measures</h2>
            <p>Expand a measure to see its definition, target and sample.</p>
          </div>
          <span>Week {snapshot.week_number}</span>
        </div>
        <div className="divide-y">
          <MetricRow
            number="1"
            label="Reviews finished on time"
            value={formatPercent(snapshot.overall_on_time_completion_pct)}
            target="≥80%"
            sample={counts
              ? `${counts.overall_on_time.completed}/${counts.overall_on_time.due} on time`
              : "Sample unavailable"}
            description="Of the reviews due this week, what percentage did you complete on the day they were due? The original intended due date is used, even if a review was later deferred."
            progressValue={snapshot.overall_on_time_completion_pct}
            progressTarget={80}
          />
          <MetricRow
            number="2"
            label="Important reviews finished on time"
            value={formatPercent(snapshot.priority_1_3_on_time_completion_pct)}
            target="≥80%"
            sample={counts
              ? `${counts.priority_1_3_on_time.completed}/${counts.priority_1_3_on_time.due} on time`
              : "Sample unavailable"}
            description="The on-time completion measure limited to reviews whose priority was 1–3 when they were scheduled."
            progressValue={snapshot.priority_1_3_on_time_completion_pct}
            progressTarget={80}
          />
          <MetricRow
            number="3"
            label="Reviews you postponed"
            value={formatPercent(snapshot.deferral_rate_pct)}
            target="≤20%"
            sample={counts
              ? `${counts.deferral_rate.deferred_events}/${counts.deferral_rate.due_events} deferred`
              : "Sample unavailable"}
            description="The percentage of distinct reviews due this week that you deferred at least once. Repeated deferrals of the same review count once here."
            progressValue={snapshot.deferral_rate_pct}
            progressTarget={20}
            lowerIsBetter
          />
          <MetricRow
            number="4"
            label="Times you pressed Defer"
            value={String(snapshot.total_deferral_decisions)}
            target="Track"
            sample="Individual defer decisions"
            description="Counts each DEFER decision separately. Deferring one review three times counts as three decisions."
          />
          <MetricRow
            number="5"
            label="How close your time estimates were"
            value={`${durationTypesWithEnoughData}/6 ready`}
            target="≤25% · n≥5"
            sample="Median error by question type"
            description="Compares estimated and actual attempt duration separately for each retrieval-task type. A smaller percentage means the estimate was closer. A result is shown only after at least five valid attempts of that type."
          >
            <DurationErrorBreakdown snapshot={snapshot} />
          </MetricRow>
          <MetricRow
            number="6"
            label="Important overdue work still waiting"
            value={`${snapshot.overdue_critical_backlog_min} min`}
            target="No increase for 2 weeks"
            sample={`${counts?.overdue_critical_backlog_events ?? "—"} unfinished reviews`}
            description="The estimated minutes of priority 1–3 reviews that were overdue and still unfinished at the end of this reporting week. Compare the four-week trend below."
          />
          <MetricRow
            number="7"
            label="Important reviews you skipped"
            value={String(snapshot.priority_1_3_skip_count)}
            target="0"
            sample={`${counts?.priority_1_3_skips ?? snapshot.priority_1_3_skip_count} skipped reviews`}
            description="The number of priority 1–3 reviews you explicitly chose to skip. Reopening a skipped review later does not erase the historical skip."
            valueTone={snapshot.priority_1_3_skip_count > 0 ? "danger" : "default"}
          />
          <MetricRow
            number="8"
            label="Less urgent reviews you skipped"
            value={formatPercent(snapshot.priority_4_5_skip_rate_pct)}
            target="≤15%"
            sample={counts
              ? `${counts.priority_4_5_skip_rate.skipped_events}/${counts.priority_4_5_skip_rate.due_events} skipped`
              : "Sample unavailable"}
            description="Of the priority 4–5 reviews due this week, what percentage did you explicitly skip?"
            progressValue={snapshot.priority_4_5_skip_rate_pct}
            progressTarget={15}
            lowerIsBetter
          />
        </div>
      </section>
    </div>
  );
}

export default function StudyMetricsPage() {
  const {
    state,
    loadingError,
    notice,
    problem,
    cloudSyncStatus,
    persist,
  } = useCloudStudyState();

  const [weekNumber, setWeekNumber] = useState(1);
  const [selectedTrialId, setSelectedTrialId] = useState("");
  const [today, setToday] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const timezone = state?.settings.timezone || "UTC";
  const trialPeriods = useMemo(
    () => state ? getStudyTrialPeriods(state) : [],
    [state],
  );

  useEffect(() => {
    if (!state || trialPeriods.length === 0) {
      setSelectedTrialId("");
      return;
    }
    const selectedStillExists = trialPeriods.some((period) => period.id === selectedTrialId);
    if (!selectedStillExists) {
      const preferredId = state.current_trial_id &&
        trialPeriods.some((period) => period.id === state.current_trial_id)
        ? state.current_trial_id
        : [...trialPeriods].sort((a, b) => b.start_date.localeCompare(a.start_date))[0].id;
      setSelectedTrialId(preferredId);
    }
  }, [state, trialPeriods, selectedTrialId]);

  const selectedTrial: StudyTrialPeriod | null =
    trialPeriods.find((period) => period.id === selectedTrialId) ??
    (state?.current_trial_id
      ? trialPeriods.find((period) => period.id === state.current_trial_id) ?? null
      : [...trialPeriods].sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null);
  const trialStart = selectedTrial?.start_date ?? null;
  const trialEnd = selectedTrial?.end_date ?? null;
  const selectedTrialIsLegacy = selectedTrial?.source === "legacy";
  const snapshotTrialId = selectedTrial && !selectedTrialIsLegacy
    ? selectedTrial.id
    : undefined;

  useEffect(() => {
    if (!state) return;

    try {
      setToday(todayInTimezone(timezone));
    } catch {
      setToday(todayInTimezone("UTC"));
    }
  }, [state, timezone]);

  useEffect(() => {
    if (!trialStart || !trialEnd || !today) return;

    const elapsed =
      (Date.parse(`${today}T00:00:00Z`) -
        Date.parse(`${trialStart}T00:00:00Z`)) /
      86_400_000;

    const currentWeek = Math.floor(Math.max(0, elapsed) / 7) + 1;
    setWeekNumber(today > trialEnd ? 4 : Math.min(4, Math.max(1, currentWeek)));
  }, [trialStart, trialEnd, today, selectedTrialId]);

  const period = useMemo(() => {
    if (!trialStart) return null;

    const start = addDays(trialStart, (weekNumber - 1) * 7);
    const end = addDays(start, 6);

    return { start, end };
  }, [trialStart, weekNumber]);

  const calculation = useMemo(() => {
    if (!state || !period || !selectedTrial) return { snapshot: null, error: "" };

    try {
      const result = calculateWeeklyMetrics({
        ...(snapshotTrialId ? { trial_id: snapshotTrialId } : {}),
        week_number: weekNumber,
        week_start: period.start,
        week_end: period.end,
        timezone,
        events: state.task_events,
      });

      return { snapshot: result.snapshot, error: "" };
    } catch (error) {
      return {
        snapshot: null,
        error: error instanceof Error
          ? error.message
          : "Could not calculate weekly metrics.",
      };
    }
  }, [state, period, selectedTrial, snapshotTrialId, weekNumber, timezone]);

  const weeklyTrend = useMemo<MetricTrendPoint[]>(() => {
    if (!state || !trialStart || !trialEnd || !selectedTrial || !today) return [];

    return [1, 2, 3, 4].map((week) => {
      const weekStart = addDays(trialStart, (week - 1) * 7);
      const weekEnd = addDays(weekStart, 6);
      const saved = state.weekly_metrics.find(
        (item) =>
          Boolean(selectedTrial && metricBelongsToTrial(item, selectedTrial)) &&
          item.week_number === week &&
          item.week_start === weekStart,
      ) ?? null;
      const closed = today > weekEnd;

      if (saved) {
        return { week_number: week, week_start: weekStart, week_end: weekEnd, snapshot: saved, saved: true, closed };
      }

      if (weekStart > today) {
        return { week_number: week, week_start: weekStart, week_end: weekEnd, snapshot: null, saved: false, closed: false };
      }

      try {
        const result = calculateWeeklyMetrics({
          ...(snapshotTrialId ? { trial_id: snapshotTrialId } : {}),
          week_number: week,
          week_start: weekStart,
          week_end: weekEnd,
          timezone,
          events: state.task_events,
        });
        return { week_number: week, week_start: weekStart, week_end: weekEnd, snapshot: result.snapshot, saved: false, closed };
      } catch {
        return { week_number: week, week_start: weekStart, week_end: weekEnd, snapshot: null, saved: false, closed };
      }
    });
  }, [state, trialStart, trialEnd, today, timezone, selectedTrial, snapshotTrialId]);

  const savedSnapshot = state && period && selectedTrial
    ? state.weekly_metrics.find(
        (item) =>
          Boolean(selectedTrial && metricBelongsToTrial(item, selectedTrial)) &&
          item.week_number === weekNumber &&
          item.week_start === period.start,
      ) ?? null
    : null;

  // Once saved, the immutable snapshot remains the displayed source of truth.
  const snapshot = savedSnapshot ?? calculation.snapshot;

  const previousSnapshots = state && period && selectedTrial
    ? state.weekly_metrics.filter(
        (item) =>
          Boolean(selectedTrial && metricBelongsToTrial(item, selectedTrial)) &&
          item.week_start >= (trialStart ?? item.week_start) &&
          item.week_end < period.start,
      )
    : [];

  const flags = snapshot
    ? buildWeeklyMetricFlags(snapshot, previousSnapshots)
    : [];

  const weekClosed = Boolean(today && period && today > period.end);
  const canSave = Boolean(
    state &&
    selectedTrial &&
    !selectedTrialIsLegacy &&
    state.current_trial_id === selectedTrial.id &&
    calculation.snapshot &&
    !savedSnapshot &&
    weekClosed,
  );

  function saveEvidence() {
    if (!state || !calculation.snapshot || !canSave) return;

    const nextState = {
      ...state,
      weekly_metrics: [
        ...state.weekly_metrics,
        calculation.snapshot,
      ],
    };

    const accepted = persist(
      nextState,
      `Trial ${selectedTrial?.start_date ?? "legacy"}, Week ${weekNumber} metrics evidence saved.`,
    );

    setActionMessage(
      accepted
        ? "Weekly evidence was saved locally and queued for cloud synchronization."
        : "The save was not accepted. Check the Study sync status and message above.",
    );
  }

  function exportJson() {
    if (!snapshot) return;

    downloadFile(
      `study-trial-${selectedTrial?.id ?? "legacy-unassigned"}-week-${weekNumber}-evidence.json`,
      JSON.stringify(
        {
          export_schema_version: 1,
          exported_at: new Date().toISOString(),
          trial_id: snapshot.trial_id ?? null,
          trial_start_date: selectedTrial?.start_date ?? null,
          trial_end_date: selectedTrial?.end_date ?? null,
          week_number: snapshot.week_number,
          week_start: snapshot.week_start,
          week_end: snapshot.week_end,
          timezone: snapshot.timezone ?? timezone,
          metrics: snapshot,
          source_event_count: snapshot.source_snapshot.length,
          source_event_ids: snapshot.source_event_ids,
          source_events: snapshot.source_snapshot,
        },
        null,
        2,
      ),
      "application/json",
    );
  }

  function exportCsv() {
    if (!snapshot) return;

    const rows: unknown[][] = [
      [
        "record_type",
        "trial_id",
        "week_number",
        "week_start",
        "week_end",
        "timezone",
        "metric",
        "value",
        "target",
        "sample",
        "event_id",
        "logged_at",
        "event_type",
        "event_json",
      ],
    ];

    const counts = snapshot.sample_counts;

    const metricRows: Array<[string, unknown, string, string]> = [
      [
        "Overall on-time completion",
        snapshot.overall_on_time_completion_pct,
        ">=80%",
        counts
          ? `${counts.overall_on_time.completed}/${counts.overall_on_time.due}`
          : "",
      ],
      [
        "Priority 1–3 on-time completion",
        snapshot.priority_1_3_on_time_completion_pct,
        ">=80%",
        counts
          ? `${counts.priority_1_3_on_time.completed}/${counts.priority_1_3_on_time.due}`
          : "",
      ],
      [
        "Deferral rate",
        snapshot.deferral_rate_pct,
        "<=20%",
        counts
          ? `${counts.deferral_rate.deferred_events}/${counts.deferral_rate.due_events}`
          : "",
      ],
      [
        "Total deferral decisions",
        snapshot.total_deferral_decisions,
        "Track",
        String(snapshot.total_deferral_decisions),
      ],
      [
        "Overdue critical backlog minutes",
        snapshot.overdue_critical_backlog_min,
        "No increase for 2 consecutive weeks",
        String(counts?.overdue_critical_backlog_events ?? ""),
      ],
      [
        "Priority 1–3 skip count",
        snapshot.priority_1_3_skip_count,
        "0",
        String(snapshot.priority_1_3_skip_count),
      ],
      [
        "Priority 4–5 skip rate",
        snapshot.priority_4_5_skip_rate_pct,
        "<=15%",
        counts
          ? `${counts.priority_4_5_skip_rate.skipped_events}/${counts.priority_4_5_skip_rate.due_events}`
          : "",
      ],
    ];

    for (const [label, value, target, sample] of metricRows) {
      rows.push([
        "metric",
        snapshot.trial_id ?? "",
        snapshot.week_number,
        snapshot.week_start,
        snapshot.week_end,
        snapshot.timezone ?? timezone,
        label,
        value,
        target,
        sample,
        "",
        "",
        "",
        "",
      ]);
    }

    for (const type of TASK_TYPES) {
      const count = snapshot.duration_error_sample_counts[type] ?? 0;
      rows.push([
        "metric",
        snapshot.trial_id ?? "",
        snapshot.week_number,
        snapshot.week_start,
        snapshot.week_end,
        snapshot.timezone ?? timezone,
        `Median duration error: ${type}`,
        count >= 5 ? snapshot.median_duration_error_pct[type] : null,
        "<=25% when n>=5",
        `${count} samples`,
        "",
        "",
        "",
        "",
      ]);
    }

    for (const event of snapshot.source_snapshot) {
      rows.push([
        "task_event",
        snapshot.trial_id ?? "",
        snapshot.week_number,
        snapshot.week_start,
        snapshot.week_end,
        snapshot.timezone ?? timezone,
        "",
        "",
        "",
        "",
        event.id,
        event.logged_at,
        event.event_type,
        JSON.stringify(event),
      ]);
    }

    const csv = rows
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    downloadFile(
      `study-trial-${selectedTrial?.id ?? "legacy-unassigned"}-week-${weekNumber}-evidence.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }

  if (loadingError) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-bold">Study metrics</h1>
        <p className="mt-4 text-rose-800">{loadingError}</p>
        <Link className="mt-5 inline-block underline" href="/study">
          Return to Study
        </Link>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="mx-auto max-w-5xl p-6 text-stone-600">
        Connecting to your Study workspace…
      </main>
    );
  }

  return (
    <main className="study-metrics-page mx-auto max-w-6xl space-y-3 px-0 pt-2 pb-8 sm:px-0 sm:pt-3">
      <Link href="/study" className="study-metrics-page__back">
        ← Study workspace
      </Link>
      <header className="rounded-2xl bg-[var(--p6-surface)] p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-stone-950">Weekly metrics</h1>
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
            {cloudSyncStatus === "synced"
              ? "Cloud synced"
              : cloudSyncStatus === "syncing"
                ? "Syncing"
                : cloudSyncStatus === "ready"
                  ? "Cloud ready"
                  : "Cloud status needs attention"}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          Eight measures from immutable TaskEvent history. Saved snapshots preserve evaluation evidence.
        </p>
        <div className="mt-3 flex flex-wrap justify-end gap-3">
          {trialPeriods.length > 1 && (
            <label className="study-metrics-week-picker">
              Trial period
              <select
                value={selectedTrial?.id ?? ""}
                onChange={(event) => {
                  setSelectedTrialId(event.target.value);
                  setActionMessage("");
                }}
                className="study-metrics-week-select"
              >
                {[...trialPeriods].sort((a, b) => b.start_date.localeCompare(a.start_date)).map((trial) => (
                  <option key={trial.id} value={trial.id}>
                    {trial.start_date} – {trial.end_date}{trial.source === "legacy" ? " · Legacy" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="study-metrics-week-picker">
            Reporting week
            <select
              value={weekNumber}
              onChange={(event) => {
                setWeekNumber(Number(event.target.value));
                setActionMessage("");
              }}
              className="study-metrics-week-select"
            >
              {[1, 2, 3, 4].map((week) => (
                <option key={week} value={week}>Week {week}</option>
              ))}
            </select>
          </label>
        </div>
        {period && selectedTrial && (
          <p className="mt-2 text-xs text-stone-500">
            {formatShortDate(period.start)} – {formatShortDate(period.end)} · {timezone} · Trial {selectedTrial.id}
          </p>
        )}
        {selectedTrialIsLegacy && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
            This is a reconstructed legacy trial. Historical snapshots without a trial ID remain unassigned in storage and are displayed only when their week dates match. They are not rewritten or attributed to a newer trial.
          </p>
        )}
      </header>

      {(notice || problem || actionMessage) && (
        <div
          role={problem ? "alert" : "status"}
          className={`rounded-xl border p-4 text-sm ${
            problem
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-stone-200 bg-stone-50 text-stone-800"
          }`}
        >
          {problem || actionMessage || notice}
        </div>
      )}

      {!selectedTrial ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-950">The four-week trial has not started</h2>
          <p className="mt-2 text-sm text-amber-900">
            Start a trial in the Study workspace before generating Week 1–4 evidence.
          </p>
        </section>
      ) : calculation.error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h2 className="font-bold text-rose-950">Metrics could not be calculated</h2>
          <p className="mt-2 text-sm text-rose-900">{calculation.error}</p>
        </section>
      ) : !snapshot ? (
        <section className="rounded-2xl border bg-white p-5">
          No metrics are available for this week.
        </section>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <MetricDashboard snapshot={snapshot} trend={weeklyTrend}>
              <section className="study-metric-evidence-panel">
                <div className="study-metric-evidence-panel__heading">
                  <div>
                    <h2>Weekly evidence</h2>
                    <p>
                      Week {weekNumber} · {savedSnapshot
                        ? "Immutable saved evidence"
                        : weekClosed
                          ? "Calculated; not yet saved"
                          : "Live calculation"}
                    </p>
                  </div>
                </div>

                <div className="study-metric-evidence-actions">
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-bold hover:bg-stone-50"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={exportJson}
                    className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-bold hover:bg-stone-50"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={saveEvidence}
                    disabled={!canSave}
                    className="study-metric-evidence-save rounded-xl bg-[#23412f] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1a2e24] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {savedSnapshot ? "Evidence saved" : "Save weekly evidence"}
                  </button>
                </div>

                {!savedSnapshot && !weekClosed && (
                  <p className="study-metric-evidence-panel__note">
                    The snapshot becomes available after {period?.end}. You can
                    still inspect and export the live calculation.
                  </p>
                )}
                {!canSave && !savedSnapshot && weekClosed && selectedTrial && state.current_trial_id !== selectedTrial.id && (
                  <p className="study-metric-evidence-panel__note">
                    Historical trial reports are read-only here. Their existing evidence is preserved; this page will not backfill or relabel old snapshots.
                  </p>
                )}
                {selectedTrialIsLegacy && savedSnapshot && (
                  <p className="study-metric-evidence-panel__note">
                    This is an unassigned legacy snapshot matched by its original week dates. Its stored trial ID remains empty.
                  </p>
                )}
                {savedSnapshot && (
                  <p className="study-metric-evidence-panel__note">
                    This saved snapshot cannot be replaced. Its source event
                    history is included in both exports.
                  </p>
                )}
              </section>
            </MetricDashboard>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
            <h2 className="font-bold text-stone-950">Dashboard flags</h2>
            {flags.length === 0 ? (
              <p className="mt-3 text-sm text-stone-600">
                No dashboard flags are triggered by this week&apos;s available evidence.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {flags.map((flag) => (
                  <li
                    key={flag.code}
                    className={`rounded-xl border p-3 text-sm ${
                      flag.severity === "critical"
                        ? "border-rose-200 bg-rose-50 text-rose-900"
                        : "border-amber-200 bg-amber-50 text-amber-950"
                    }`}
                  >
                    <strong>{flag.severity === "critical" ? "Action required: " : "Review: "}</strong>
                    {flag.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {snapshot.data_quality_issues &&
            snapshot.data_quality_issues.length > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <h2 className="font-bold text-amber-950">
                  Evidence quality notices
                </h2>
                <p className="mt-1 text-sm text-amber-900">
                  These records could not be reconstructed completely. Review
                  them before relying on the affected measures.
                </p>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
                  {snapshot.data_quality_issues.map((issue, index) => (
                    <li key={`${index}-${issue}`}>{issue}</li>
                  ))}
                </ul>
              </section>
            )}

          <p className="text-xs leading-5 text-stone-500">
            Reporting uses the immutable intended due date and scheduling
            priority. Current queue dates and priorities do not change historical
            results. A missing denominator is shown as “—”, not zero.
          </p>
        </>
      )}
    </main>
  );
}
