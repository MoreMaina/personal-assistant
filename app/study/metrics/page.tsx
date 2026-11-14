"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useCloudStudyState } from "@/lib/studyMvp/useCloudStudyState";
import {
  buildWeeklyMetricFlags,
  calculateWeeklyMetrics,
} from "@/lib/studyMvp/metrics";

import type {
  RetrievalTaskType,
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

function MetricTable({ snapshot }: { snapshot: WeekMetrics }) {
  const counts = snapshot.sample_counts;

  const rows = [
    {
      number: "1",
      label: "Overall on-time completion",
      value: formatPercent(snapshot.overall_on_time_completion_pct),
      target: "≥80%",
      sample: counts
        ? `${counts.overall_on_time.completed} / ${counts.overall_on_time.due} completed on time`
        : "Sample counts unavailable",
    },
    {
      number: "2",
      label: "Priority 1–3 on-time completion",
      value: formatPercent(snapshot.priority_1_3_on_time_completion_pct),
      target: "≥80%",
      sample: counts
        ? `${counts.priority_1_3_on_time.completed} / ${counts.priority_1_3_on_time.due} completed on time`
        : "Sample counts unavailable",
    },
    {
      number: "3",
      label: "Deferral rate",
      value: formatPercent(snapshot.deferral_rate_pct),
      target: "≤20%",
      sample: counts
        ? `${counts.deferral_rate.deferred_events} / ${counts.deferral_rate.due_events} distinct reviews deferred`
        : "Sample counts unavailable",
    },
    {
      number: "4",
      label: "Total deferral decisions",
      value: String(snapshot.total_deferral_decisions),
      target: "Track",
      sample: "Individual DEFER and override-defer events",
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
            <th className="px-3 py-3">#</th>
            <th className="px-3 py-3">Measure</th>
            <th className="px-3 py-3">Result</th>
            <th className="px-3 py-3">Target</th>
            <th className="px-3 py-3">Sample / denominator</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.number} className="border-b border-stone-100">
              <td className="px-3 py-4 font-bold text-stone-500">{row.number}</td>
              <td className="px-3 py-4 font-semibold text-stone-900">{row.label}</td>
              <td className="px-3 py-4 font-bold tabular-nums">{row.value}</td>
              <td className="px-3 py-4 text-stone-600">{row.target}</td>
              <td className="px-3 py-4 text-stone-600">{row.sample}</td>
            </tr>
          ))}

          <tr className="border-b border-stone-100">
            <td className="px-3 py-4 font-bold text-stone-500">5</td>
            <td className="px-3 py-4 font-semibold text-stone-900">
              Median duration error by task type
              <p className="mt-1 text-xs font-normal text-stone-500">
                Absolute percentage error; minimum five samples per type.
              </p>
            </td>
            <td colSpan={3} className="px-3 py-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TASK_TYPES.map((type) => {
                  const count = snapshot.duration_error_sample_counts[type] ?? 0;
                  const value = snapshot.median_duration_error_pct[type];

                  return (
                    <div key={type} className="rounded-lg bg-stone-50 px-3 py-2">
                      <p className="text-xs font-semibold capitalize text-stone-600">
                        {type.replace(/_/g, " ")}
                      </p>
                      <p className="mt-1 font-bold tabular-nums text-stone-900">
                        {count < 5 || value === null || value === undefined
                          ? "Insufficient data"
                          : formatPercent(value)}
                      </p>
                      <p className="text-xs text-stone-500">{count} / 5 samples</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-stone-500">Target: ≤25%</p>
            </td>
          </tr>

          <tr className="border-b border-stone-100">
            <td className="px-3 py-4 font-bold text-stone-500">6</td>
            <td className="px-3 py-4 font-semibold text-stone-900">
              Overdue critical backlog
            </td>
            <td className="px-3 py-4 font-bold tabular-nums">
              {snapshot.overdue_critical_backlog_min} min
            </td>
            <td className="px-3 py-4 text-stone-600">
              No increase for 2 consecutive weeks
            </td>
            <td className="px-3 py-4 text-stone-600">
              {counts?.overdue_critical_backlog_events ?? "—"} unfinished priority 1–3 reviews
            </td>
          </tr>

          <tr className="border-b border-stone-100">
            <td className="px-3 py-4 font-bold text-stone-500">7</td>
            <td className="px-3 py-4 font-semibold text-stone-900">
              Priority 1–3 skip count
            </td>
            <td className="px-3 py-4 font-bold tabular-nums">
              {snapshot.priority_1_3_skip_count}
            </td>
            <td className="px-3 py-4 text-stone-600">0</td>
            <td className="px-3 py-4 text-stone-600">
              Distinct priority 1–3 reviews explicitly skipped
            </td>
          </tr>

          <tr className="border-b border-stone-100">
            <td className="px-3 py-4 font-bold text-stone-500">8</td>
            <td className="px-3 py-4 font-semibold text-stone-900">
              Priority 4–5 skip rate
            </td>
            <td className="px-3 py-4 font-bold tabular-nums">
              {formatPercent(snapshot.priority_4_5_skip_rate_pct)}
            </td>
            <td className="px-3 py-4 text-stone-600">≤15%</td>
            <td className="px-3 py-4 text-stone-600">
              {counts
                ? `${counts.priority_4_5_skip_rate.skipped_events} / ${counts.priority_4_5_skip_rate.due_events} distinct reviews skipped`
                : "Sample counts unavailable"}
            </td>
          </tr>
        </tbody>
      </table>
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
  const [today, setToday] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const timezone = state?.settings.timezone || "UTC";
  const trialStart = state?.settings.trial_start_date ?? null;

  useEffect(() => {
    if (!state) return;

    try {
      setToday(todayInTimezone(timezone));
    } catch {
      setToday(todayInTimezone("UTC"));
    }
  }, [state, timezone]);

  useEffect(() => {
    if (!trialStart || !today) return;

    const elapsed =
      (Date.parse(`${today}T00:00:00Z`) -
        Date.parse(`${trialStart}T00:00:00Z`)) /
      86_400_000;

    const currentWeek = Math.floor(Math.max(0, elapsed) / 7) + 1;
    setWeekNumber(Math.min(4, Math.max(1, currentWeek)));
  }, [trialStart, today]);

  const period = useMemo(() => {
    if (!trialStart) return null;

    const start = addDays(trialStart, (weekNumber - 1) * 7);
    const end = addDays(start, 6);

    return { start, end };
  }, [trialStart, weekNumber]);

  const calculation = useMemo(() => {
    if (!state || !period) return { snapshot: null, error: "" };

    try {
      const result = calculateWeeklyMetrics({
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
  }, [state, period, weekNumber, timezone]);

  const savedSnapshot = state && period
    ? state.weekly_metrics.find(
        (item) =>
          item.week_number === weekNumber &&
          item.week_start === period.start,
      ) ?? null
    : null;

  // Once saved, the immutable snapshot remains the displayed source of truth.
  const snapshot = savedSnapshot ?? calculation.snapshot;

  const previousSnapshots = state && period
    ? state.weekly_metrics.filter(
        (item) => item.week_end < period.start,
      )
    : [];

  const flags = snapshot
    ? buildWeeklyMetricFlags(snapshot, previousSnapshots)
    : [];

  const weekClosed = Boolean(today && period && today > period.end);
  const canSave = Boolean(
    state &&
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
      `Week ${weekNumber} metrics evidence saved.`,
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
      `study-week-${weekNumber}-evidence.json`,
      JSON.stringify(
        {
          export_schema_version: 1,
          exported_at: new Date().toISOString(),
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
      `study-week-${weekNumber}-evidence.csv`,
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
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <header className="rounded-3xl border border-[#d5e1e4] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">
              Study system · Trial evidence
            </p>
            <h1 className="mt-2 text-3xl font-bold text-stone-950">
              Weekly metrics
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-stone-600">
              Eight measures calculated from immutable TaskEvent history.
              Saved weekly snapshots preserve the evidence used at evaluation time.
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs font-semibold text-stone-600">
            {cloudSyncStatus === "synced"
              ? "Cloud synced"
              : cloudSyncStatus === "syncing"
                ? "Syncing"
                : cloudSyncStatus === "ready"
                  ? "Cloud ready"
                  : "Cloud status needs attention"}
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/study"
            className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-bold text-stone-800 hover:bg-stone-50"
          >
            ← Study workspace
          </Link>
          <label className="flex items-center gap-3 text-sm font-semibold text-stone-700">
            Reporting week
            <select
              value={weekNumber}
              onChange={(event) => {
                setWeekNumber(Number(event.target.value));
                setActionMessage("");
              }}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2"
            >
              {[1, 2, 3, 4].map((week) => (
                <option key={week} value={week}>Week {week}</option>
              ))}
            </select>
          </label>
        </div>

        {period && (
          <p className="mt-3 text-sm text-stone-600">
            {period.start} – {period.end} · {timezone}
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

      {!trialStart ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-950">The four-week trial has not started</h2>
          <p className="mt-2 text-sm text-amber-900">
            Start the trial in the Study workspace before generating Week 1–4 evidence.
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
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-stone-950">
                  Week {weekNumber} results
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  {savedSnapshot
                    ? "Immutable saved evidence"
                    : weekClosed
                      ? "Calculated from current event history; not yet saved"
                      : "Live calculation; this week has not closed"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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
                  className="rounded-xl bg-[#23412f] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1a2e24] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savedSnapshot ? "Evidence saved" : "Save weekly evidence"}
                </button>
              </div>
            </div>

            {!savedSnapshot && !weekClosed && (
              <p className="mt-3 text-xs text-stone-500">
                The snapshot becomes available after {period?.end}. You can still
                inspect and export the live calculation.
              </p>
            )}
            {savedSnapshot && (
              <p className="mt-3 text-xs text-stone-500">
                This saved snapshot cannot be replaced. Its source event history
                is included in both exports.
              </p>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <div className="border-b border-stone-200 px-5 py-4">
              <h2 className="font-bold text-stone-950">Eight trial measures</h2>
            </div>
            <MetricTable snapshot={snapshot} />
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="font-bold text-stone-950">Dashboard flags</h2>
            {flags.length === 0 ? (
              <p className="mt-3 text-sm text-stone-600">
                No dashboard flags are triggered by this week's available evidence.
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
