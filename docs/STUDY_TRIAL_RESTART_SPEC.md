# Study Four-Week Trial Restart

Status: Required design; not implemented.
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

`startStudyTrial()` rejects starting when dates are already configured.

The current reset path only works when no activity or weekly evidence
exists in the configured period and the current date is not later
than the trial end. It is not a completed-trial restart mechanism.

WeekMetrics snapshots are immutable. They currently use week number
and week start for duplicate detection, with frozen source event IDs
and source snapshots. There is no explicit trial ID.

## 3. Repeatable trial model

Design a backwards-compatible, append-only trial-period record with:
- Unique trial ID.
- Actual start and calculated end dates.
- Week 4 evaluation start and end.
- Status: configured, active, completed, or explicitly abandoned.
- Creation timestamp and audit reason.
- Engine/settings version or reference to the applicable settings.
- Linkage to that trial's weekly metric snapshots.

A `trial_periods` collection plus `current_trial_id` is one possible
design. Evaluate it against existing state persistence, validation,
cloud sync, backup/restore and migrations before choosing.

Do not rely solely on one mutable set of dates in StudySettings.

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

Every new metric snapshot must identify its trial. Duplicate identity
must distinguish the same week number in different trials.

Do not relabel old snapshots as new-trial evidence. Do not rewrite old
metric snapshots just to add a trial ID. Define a safe legacy attribution
strategy for earlier metrics.

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

## 9. Required investigation before implementation

The actual persisted trial dates and previous evidence have not yet
been inspected. Obtain a readable backup and inspect actual settings,
audit records, weekly metrics, source events and trial dates.

Do not assume dates in unit-test fixtures are the user's actual dates.
Do not reset or overwrite anything during this investigation.
