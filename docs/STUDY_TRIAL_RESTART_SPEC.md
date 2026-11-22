# Study Four-Week Trial Restart

Status: Repeatable-trial and trial-linked metric implementation prepared in consolidated patch; local validation and pre-trial acceptance pending.
Date: 21 November 2026.
The locked Study MVP v1.2 evaluation requirements remain authoritative.
This document defines safe support for multiple evaluation periods.

## 1. Objective

Allow a new four-week Study evaluation after the previous period has
ended, without deleting, overwriting or confusing any prior learning
history or metric evidence.

## 2. Existing implementation

Current StudySettings contains one set of dates:
- trial_start_date
- trial_end_date
- week4_evaluation_start
- week4_evaluation_end

The original `StudySettings` stores a single mutable set of trial dates.
The consolidated patch adds append-only `trial_periods` and
`current_trial_id`, with legacy normalization. `startStudyTrial()` can
append a second period only after the latest period has ended and only
when the selected first-use date is after the previous end date.
The conflicting UI reset path has been removed; it must not clear date
settings while leaving an append-only period record behind.

`WeekMetrics.trial_id` is optional for compatibility. New calculations
for a user-confirmed trial carry its ID; identity is unique by
trial ID + week number + week start. Older snapshots remain unassigned.

## 3. Repeatable trial model

Design a backwards-compatible, append-only trial-period record with:
- Unique trial ID.
- Actual start and calculated end dates.
- Week 4 evaluation start and end.
- Status: configured, active, completed, or explicitly abandoned.
- Creation timestamp and audit reason.
- Engine/settings version or reference to the applicable settings.
- Linkage to that trial's weekly metric snapshots.

The patch uses a `trial_periods` collection plus `current_trial_id`.
Each immutable period stores a unique ID, actual start/end dates,
Week 4 dates, creation timestamp, source, engine version when known,
and a human-readable creation reason. The settings dates remain a
compatibility projection for the current period, not the history.

The period records are normalized on load and included in the existing
Study state persistence/backup payload. No database schema migration is
required by this local model change. Cloud persistence and backup/restore
acceptance must still be verified in the existing Codespace.

Period status is derived from the configured timezone and date range
(active or completed); a separate abandoned-trial workflow is not
implemented in this batch.

## 4. Date rules

A trial lasts 28 calendar days inclusive:
- End = start + 27 calendar days.
- Week 4 starts = start + 21 calendar days.
- Week 4 ends = start + 27 calendar days.

The user chooses the actual first-use date. Future dates are rejected.
Do not backdate or invent a start date to make the timeline look right.

## 5. Evidence and metric integrity

Preserve all prior:
- TaskEvents.
- WorkSessions.
- Daily plan snapshots and executions.
- Settings audit records.
- Weekly metric snapshots and frozen source evidence.

Every new metric snapshot for a user-confirmed trial carries its trial
ID. The Metrics page selects a period and filters calculations, saved
snapshots, comparisons, exports and flags to that period. Historical
periods are read-only in the UI.

Old snapshots without a trial ID remain unassigned. The legacy report
may display them only when their original week dates match the legacy
period; it never rewrites or relabels them. A later trial cannot adopt
legacy metrics by date coincidence.

Do not clear curriculum or learning progress when starting another
evaluation unless separately and explicitly agreed.

## 6. Readiness gate

Do not start the new trial until:
- Existing trial evidence is backed up and inspected.
- Trial identity and metric linkage are implemented and tested.
- Agreed question-bank/readiness improvements are complete.
- All eight weekly metrics and frozen evidence are verified.
- Daily budget and explicit disposition invariants pass.
- Phone logging, persistence and recovery checks pass.
- The user confirms the actual new start date.

## 7. UI requirements

- Show the current trial and date range.
- Show previous trial periods and evaluation status.
- Offer Start new trial only when readiness checks pass.
- The start UI requires explicit user confirmation that a JSON backup and
  evidence review were completed; topic/question preparation was reviewed;
  the eight metrics, frozen evidence, daily budget and disposition rules
  were verified; and phone logging, persistence, offline/slow-network and
  recovery checks passed. These are manual attestations, not automatic
  claims inferred from application state.
- Explain that previous trial data will be preserved.
- Keep each trial's Week 1–4 reports distinct.
- Do not present old metrics as new-trial progress.

## 8. Acceptance tests

- [ ] Existing legacy single-trial state loads without data loss.
- [ ] Starting a second trial preserves the first trial's dates/evidence.
- [ ] Same week number in separate trials has distinct metric identity.
- [ ] Old metric snapshots remain byte-for-byte unchanged.
- [ ] Old TaskEvents and WorkSessions remain unchanged.
- [ ] New metrics reference only the intended trial and source evidence.
- [ ] Date calculations pass month/year boundary tests.
- [ ] Future start dates are rejected.
- [ ] Current trial is unambiguous after reload and cloud sync.
- [ ] Backup and restore preserve all trial periods and metric links.
- [ ] No trial starts before readiness acceptance and user confirmation.

## 9. Remaining pre-trial requirements and investigation

The repeatable-trial implementation is not permission to start a real
trial. Before the next first-use date, obtain a readable backup and
inspect actual persisted settings, audit records, trial periods, weekly
metrics, source event IDs and frozen evidence. Do not infer live dates
from tests or screenshots.

Complete the readiness gate in §6, full acceptance validation, phone
logging timing, offline/persistence recovery checks and the remaining
Study MVP v1.2 acceptance trace. User confirmation of the actual first-
use date is required. No trial has been started by this implementation.

Do not reset or overwrite anything during this investigation.
