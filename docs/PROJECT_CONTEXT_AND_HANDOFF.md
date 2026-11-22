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
- Latest verified GitHub `main` commit: `051d9f61c9e122e004eb9fc8215439340a8ec7ca` (`Merge pull request #13 from MoreMaina/docs/push-notifications-production-checkpoint`).
- PR #10, `docs: establish project continuity and handoff`, is merged. Merge commit: `563f4c5c4a4bf6daf1003b258c7e67ed69a9e39f`.
- PR #11, `feat: add Android external push notifications`, is merged. Merge commit: `a819b3407061080de7f840e50a66b7accfeb0e14`.
- PR #12, `Fix/push dispatch auth exemption`, is merged. Squash commit: `bbb34cf4bac0bdd3e4bbdbf139146b7e5a729638`.
- PR #12 changed `lib/supabase/proxy.ts` and `.github/workflows/study-preview-ci.yml`.
- GitHub Actions run #157 for the push to `main` completed successfully: https://github.com/MoreMaina/personal-assistant/actions/runs/44986952605.

### Local workspace state — verified from the user's 22 November terminal output

- Current local branch: `feature/study-completion-and-palette6`.
- Local HEAD and `origin/main` both resolve to `051d9f6` (the PR #13 merge above).
- The feature branch has not been pushed; GitHub branch search did not find a remote branch with this name.
- The user reported 22 modified tracked files and two untracked Study readiness TypeScript files (`lib/studyMvp/preparationReadiness.ts` and `.test.ts`).
- Additional untracked recovery scripts, Python cache, a review patch and a Supabase migration backup were listed. Preserve them all; they were excluded from the transferable source bundle and must not be deleted or staged.
- The source bundle was successfully decoded and integrity-checked. The consolidated implementation patch has been prepared and delivered against that exact snapshot; it has not yet been applied or validated in the Codespace.

The user reports that more than 90% of Codespaces hours have been used. Treat the remaining allowance as a hard constraint: no new Codespace, avoid installations and repeated builds, and batch validation. Keep the existing Codespace intact.

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
| 2 | Question-bank management and planner readiness | A consolidated local implementation now includes a Preparation route, readiness controls, versioned question management and future-session eligibility rules. Apply and validate the patch before treating it as complete. |
| 3 | Restart four-week Study trial | Repeatable trial identity and trial-linked metric foundations are included in the consolidated patch; interface/report integration and validation remain pending. No trial has been started. |
| 4 | Academic Details settings redesign | The agreed layout and dirty-state Save behaviour are present in the local uncommitted changes; final visual/functional validation remains pending. |
| 5 | Complete Palette 6 migration | Existing local CSS and component refinements are retained; full component and PWA verification remains pending. |
| 6 | Study trial readiness verification | Manual and technical pre-trial acceptance must pass before a real trial starts. No activation during implementation. |

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

The 21 November baseline audit found that full authoring controls and
planner readiness enforcement were absent. The current consolidated
local patch adds:

- `/study/preparation` with course/unit/topic selection, learning
  objective editing, actionable readiness blockers, Draft/Ready/
  Excluded controls and reversible unit exclusion.
- Add and restore question controls; editing/replacement appends a new
  question ID/version and preserves the prior question record.
- A separate `available_for_new_sessions` flag. A question selected by
  an unfinished Review, Gate or Guided Practice session remains active
  for that session but is excluded from new selections.
- Readiness checks for a meaningful objective, valid objective type,
  3–5 eligible questions, at least three Gate and two Review questions,
  plus non-empty prompts and answer criteria.
- Newly imported topics default to Draft. Legacy topics with no explicit
  preparation status remain planner-compatible and are shown as needing
  review until the user explicitly classifies them.
- Ready is automatically downgraded to Draft if an objective/question
  bank edit makes the readiness checks fail.

The patch is prepared against the supplied source bundle but has not
been applied or validated in the Codespace. Preserve the locked Study
v1.2 requirements. Do not alter selected IDs, old TaskEvents, question
wording snapshots or historical attempts.

### New four-week Study trial

The previous trial period has passed. The local implementation adds
append-only `trial_periods` and `current_trial_id` data, backward-
compatible legacy normalization, per-trial metric identity, and a
repeatable `startStudyTrial()` storage operation. Each new trial records
its unique ID, date range, source, timestamp, engine version and
creation reason. The old single set of settings dates remains as the
current-period compatibility projection; prior periods remain in the
append-only history.

The reporting-page changes add trial selection, trial-specific metric
calculation and snapshot lookup, trial-scoped comparison flags and
exports. Historical snapshots without a `trial_id` remain unassigned;
they are shown only against the matching legacy dates and are never
rewritten or attributed to a later trial. Historical trial reports are
read-only. The old UI reset path that cleared dates while retaining
append-only trial history has been removed. The Start trial UI is
blocked until the user explicitly confirms four manual readiness items:
backup/evidence review, topic/question preparation review, verification of
all eight metrics plus planner/budget/disposition invariants, and phone
logging/persistence/offline/recovery acceptance. These are attestations;
the application does not claim to have run those external checks.

These changes are in the consolidated patch and still require local
validation. A new trial has **not** been started. The actual persisted
Production/Cloud Study dates and evidence must still be backed up and
inspected before the user confirms a future first-use date. A trial is
28 calendar days inclusive: end = start + 27 days; Week 4 is start + 21
through start + 27 days. Do not backdate, overlap periods or rewrite
legacy metrics.

### Academic Details

The user's current local uncommitted Settings changes implement the
agreed ordinary Academic Details section and conditional Save button.
They must be preserved. Final visual/functional validation remains
pending; do not follow older status statements claiming this redesign
is still absent.

### Palette 6 and dark appearance

The user's current uncommitted changes include the agreed application
UI refinements and a system dark-mode CSS pass with browser theme-color
metadata. Preserve the Books, Essays, Settings, Today, Calendar, time
input, utilities menu and Study layout changes. Full component-aware
Palette 6 review and installed-PWA appearance verification remain
pending; do not claim the migration is complete based only on the CSS
pass.

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

## 6. Immediate implementation next action

Apply the delivered `personal-assistant-consolidated-completion.patch`
only after `git apply --check` succeeds in the existing Codespace.
Then run `git diff --check`, `npx tsc --noEmit`, focused Study tests,
full `npm test`, lint and one final production build in a single
consolidated validation cycle. Dependencies already present in the
Codespace should be reused; do not install packages merely for this
checkpoint. Review the final diff and explicitly stage only intended
files. Commit and push the feature branch only after the user reviews
the validation results. Do not merge, deploy or start a Study trial.

## 7. Trial readiness gate

Do not start the new trial until:
- Prior trial evidence is backed up and inspected.
- Repeatable trial identity and metric linkage are implemented.
- Agreed question-bank/readiness work is complete.
- Eight weekly metrics and frozen evidence are verified.
- Daily budget and explicit disposition invariants pass.
- Phone logging, persistence and recovery checks pass.
- The user confirms the actual start date.

## 8. Current next action

For Android push, the next action is the user's planned live-device test on Monday, 23 November 2026:

1. Allow the next genuine task digest at the saved 08:06 Nairobi time to arrive, if there are still qualifying tasks; tap it and verify `/calendar`.
2. Create a temporary app-calendar event with enough lead time to observe the 30-minute and 10-minute reminders. Tap a reminder and verify `/calendar`.
3. Delete the temporary event after the test.
4. Record actual outcomes in `PUSH_NOTIFICATIONS_IMPLEMENTATION_STATUS.md`, then update this handoff and the decision log.

Do not re-trigger the 22 November task digest by deleting delivery claims or altering existing data. Do not change the active scheduler or saved device preferences merely to repeat a test.

For every new conversation, begin by reading this document.
