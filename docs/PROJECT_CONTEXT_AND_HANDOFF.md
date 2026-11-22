# Personal Assistant — Project Context and Handoff

Last verified: 22 November 2026 (Africa/Nairobi)
Repository: MoreMaina/personal-assistant
Production app: Vercel project `personal-assistant`
Supabase project: `fkjrhbkvwcdxmvsrwjuj`

> This is the starting point for every new ChatGPT conversation about
> this repository. Read it before making changes. Chat history is not
> the project source of truth; this repository is.

## 1. Resume instructions

At the beginning of every new conversation:

1. Read this file and `PROJECT_DECISIONS_LOG.md`.
2. Read the relevant locked specification and implementation status.
3. Inspect `git status --short`, current branch and HEAD.
4. Fetch remote references and verify the current `origin/main`.
5. Verify deployment and database state when relevant.
6. Continue from the latest recorded next action.
7. Never repeat an audit whose evidence is still current.

## 2. Current verified Git and deployment checkpoint

### GitHub state

- Repository default branch: `main`.
- Latest verified GitHub `main` commit: `bbb34cf4bac0bdd3e4bbdbf139146b7e5a729638` (`Fix/push dispatch auth exemption (#12)`).
- PR #10, `docs: establish project continuity and handoff`, is merged. Merge commit: `563f4c5c4a4bf6daf1003b258c7e67ed69a9e39f`.
- PR #11, `feat: add Android external push notifications`, is merged. Merge commit: `a819b3407061080de7f840e50a66b7accfeb0e14`.
- PR #12, `Fix/push dispatch auth exemption`, is merged. Squash commit: `bbb34cf4bac0bdd3e4bbdbf139146b7e5a729638`.
- PR #12 changed `lib/supabase/proxy.ts` and `.github/workflows/study-preview-ci.yml`.
- GitHub Actions run #157 for the push to `main` completed successfully: https://github.com/MoreMaina/personal-assistant/actions/runs/44986952605.

### Local workspace state — not verified

The local Codespace branch, local HEAD, `git status --short`, and whether earlier untracked helper files are still present were **not inspected** in this checkpoint. Do not assume the local working tree is clean or aligned with GitHub `main`.

The user previously reported that 90% of Codespaces hours had been used. Prefer GitHub's web editor for documentation-only changes and avoid opening a Codespace unless a task genuinely requires a local terminal. If a local workspace is used later, inspect its status first and preserve unrelated untracked files.

Earlier handoff notes mentioned untracked helper scripts, Python cache, Supabase temporary files and a migration backup in a Codespace. Their current existence was not rechecked; preserve them if they are still present.

### Production deployment

- Latest verified Production deployment: `dpl_9aF88gNyGnKCPZKzjio971wiotNR`.
- State: `READY`, target `production`.
- Deployment commit: `bbb34cf4bac0bdd3e4bbdbf139146b7e5a729638` on `main`.
- Deployment URL: `https://personal-assistant-28ifi6dbc-simon-0e59.vercel.app`.
- Stable alias observed: `https://personal-assistant-simon-0e59.vercel.app`.

## 3. Workstream status

| Priority | Workstream | Verified state |
|---|---|---|
| 0 | Project continuity documents | Established through merged PR #10; this checkpoint corrects stale push-release status. |
| 1 | Android external push | Merged and deployed to Production. Automated dispatch is active. One real Android task notification was delivered and visibly confirmed by the user. Tap navigation and remaining category acceptance tests are pending. See `PUSH_NOTIFICATIONS_IMPLEMENTATION_STATUS.md`. |
| 2 | Question-bank management and planner readiness | Not implemented. |
| 3 | Restart four-week Study trial | Required; current model supports one trial only. |
| 4 | Academic Details settings redesign | Not implemented. |
| 5 | Complete Palette 6 migration | Incomplete; legacy colours remain. |
| 6 | Study trial readiness verification | Must pass before a new trial starts. |

### Study MVP v1.2

Locked specification: `STUDY_SYSTEM_MVP_V1_2_FINAL.md`.
Released to `main` through PR #9. The locked specification remains
authoritative. Release does not prove every trial acceptance test
has been verified.

Detailed implementation log:
`STUDY_MVP_V1_2_IMPLEMENTATION_STATUS.md`.
Its 15 November 2026 checkpoint is stale. Retain its history, but
do not follow its old branch or next-action instructions blindly.

### Question bank and planner readiness

A 21 November audit found:
- Active/inactive retrieval-task support exists.
- Questions can be selected before some Gate and Review sessions.
- Unfinished Gate sessions can reactivate their original questions.
- Historical question selections and attempts have snapshots.
- Full add/edit/replace/deactivate/restore question management is absent.
- CSV import adds questions but rejects conflicting existing content.
- Topic Draft/Ready/Excluded controls are absent.
- Unit-level planner exclusion is absent.
- Meaningful objective and minimum usable-question readiness checks
  are not enforced by planner eligibility.

Design this as an additive improvement. Do not weaken the locked
Study v1.2 requirements or alter historical question attempts.

### New four-week Study trial

The previous trial period has passed. A new evaluation is required.

Current model stores only one set of trial dates:
`trial_start_date`, `trial_end_date`, `week4_evaluation_start`,
`week4_evaluation_end`.

`startStudyTrial()` rejects already-configured dates. The reset
path is restricted to a period with no activity/evidence and does
not support restarting after a completed trial.

Weekly metric snapshots are immutable and currently identified by
week number and week start. There is no explicit trial ID.

A safe repeatable-trial model is required. Preserve all previous
TaskEvents, WorkSessions, daily plan snapshots/executions, settings
audit records and weekly metrics. Do not clear or overwrite them.
Do not use dates from test fixtures as the user's actual dates.

A trial is 28 calendar days inclusive: end = start + 27 days.
Week 4 is start + 21 through start + 27 days.
Start only on the actual agreed first-use date after readiness
checks and user confirmation. Do not backdate.

### Academic Details

Current `app/settings/page.tsx` still uses a `<details>` wrapper
for Academic Details. Its chevron remains, and Save Settings is
not conditional on Academic Details being dirty.

Desired: ordinary settings section matching sibling sections,
no disclosure chevron, and Save Settings shown only when academic
values have changed. Do not couple this dirty state to unrelated
settings.

### Palette 6

A CSS audit still found legacy colours such as:
`#213b2b`, `#1d3527`, `#1a3023`, `#304e39`, `#3a6046`,
`#fffaf1`.

A full component-aware migration remains necessary. Do not claim
completion after changing only global CSS.

### Android external push notifications

Locked specification: `PUSH_NOTIFICATIONS_SPEC.md`.
Implementation checkpoint: `PUSH_NOTIFICATIONS_IMPLEMENTATION_STATUS.md`.

The feature was merged in PR #11 (`a819b3407061080de7f840e50a66b7accfeb0e14`). PR #12 then fixed the dispatcher authentication path and enabled the CI workflow to run on `main`; its squash merge is the current `main` commit `bbb34cf4bac0bdd3e4bbdbf139146b7e5a729638`.

Production deployment is READY for that exact commit. Production Supabase contains migrations `20261121135043` and `20261121135053`. The `push-notification-dispatch` cron job is active on `* * * * *`; the five latest inspected runs (05:09–05:13 UTC on 22 November) all succeeded.

The `/api/push/dispatch` route has its own bearer-secret guard. Production returned HTTP 401 to a request without the bearer credential and HTTP 200 to an authenticated server-to-server request. Secret values must never be printed or placed in documentation.

A real task digest `task-digest:2026-11-22` was recorded as sent once at 05:03:03 UTC (08:03:03 Africa/Nairobi), with no recorded delivery error. The user confirmed that the Android notification appeared. The user cleared the notification shade before tapping it, so the notification-click destination has not yet been device-tested.

The current device row last inspected on 22 November has timezone `Africa/Nairobi`, device enabled, app calendar / Google Calendar / tasks / Study categories enabled, and class reminders enabled. Its saved event reminder leads are 30 and 10 minutes, class leads are 30 and 10 minutes, all-day time is 08:04, task digest time is 08:06, and Study digest time is 08:02. Class reminders being enabled on this existing device is a saved preference; it does not change the locked OFF-by-default requirement for a new subscription. Do not silently reset the user's existing choice.

The task digest is deduplicated once per subscription and date. Moving its time from 08:03 to 08:06 after the 22 November digest had already been sent did not create a second alert; that is expected. The next task digest is expected Monday 23 November at 08:06 Nairobi time only if qualifying unfinished due/overdue tasks remain and the settings stay enabled.

Remaining Android checks: notification tap navigation; timed app-calendar event reminders at 30 and 10 minutes; all-day event reminder; class category behavior; Google Calendar category; Study Plan digest; overlapping-dispatch/dedup concurrency; permission-denial, expired-endpoint and failure handling; and broader timezone/daylight-saving coverage. The user plans to run a temporary calendar-event test on 23 November. Do not create or alter test data in Production without the user's action/approval.

## 4. Working agreement

- Prefer GitHub web editor for documentation-only work while Codespaces usage is constrained. If terminal access is needed, explain why and inspect status first.
- Give exact commands when a local terminal is needed; user returns terminal output.
- Save time: use this handoff and verified evidence instead of repeatedly reconstructing the project.
- Preserve all unrelated untracked files.
- Inspect Git status before every local work batch.
- Never run `git add .`, `git add -A`, `git clean`, `git reset`
  or `git stash`.
- Stage only individually reviewed, named files.
- Never run `supabase db reset`.
- No destructive database actions, Production migrations,
  Production deployment or trial reset without explicit coordination.
- Never expose credentials, tokens, private keys or decrypted secrets.
- Do not claim work is complete, tested, committed, pushed,
  migrated or deployed without verification.
- Keep patches targeted and tests focused.
- Historical learning events, review selections and metric snapshots
  must not be overwritten to make current state appear correct.

## 5. Mandatory continuity checkpoints

Documentation is part of implementation, not optional administration.

After every meaningful implementation batch:
1. Update the relevant implementation status.
2. Update this master handoff.
3. Record new or changed decisions in the decision log.
4. Record exact branch, commit, files, tests and results.
5. Record Preview, Production and database state where relevant.
6. Record blockers and one precise next action.
7. Review, commit and push the checkpoint with the work branch.

Do not wait until a conversation is nearly out of context.
A local uncommitted note is not a durable checkpoint.

## 6. Trial readiness gate

Do not start the new trial until:
- Prior trial evidence is backed up and inspected.
- Repeatable trial identity and metric linkage are implemented.
- Agreed question-bank/readiness work is complete.
- Eight weekly metrics and frozen evidence are verified.
- Daily budget and explicit disposition invariants pass.
- Phone logging, persistence and recovery checks pass.
- The user confirms the actual start date.

## 7. Current next action

For Android push, the next action is the user's planned live-device test on Monday, 23 November 2026:

1. Allow the next genuine task digest at the saved 08:06 Nairobi time to arrive, if there are still qualifying tasks; tap it and verify `/calendar`.
2. Create a temporary app-calendar event with enough lead time to observe the 30-minute and 10-minute reminders. Tap a reminder and verify `/calendar`.
3. Delete the temporary event after the test.
4. Record actual outcomes in `PUSH_NOTIFICATIONS_IMPLEMENTATION_STATUS.md`, then update this handoff and the decision log.

Do not re-trigger the 22 November task digest by deleting delivery claims or altering existing data. Do not change the active scheduler or saved device preferences merely to repeat a test.

For every new conversation, begin by reading this document.
