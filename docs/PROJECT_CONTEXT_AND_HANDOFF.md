# Personal Assistant — Project Context and Handoff

Last verified: 21 November 2026 (Africa/Nairobi)
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
4. Fetch remote references and verify `origin/main`.
5. Verify deployment and database state when relevant.
6. Continue from the latest recorded next action.
7. Never repeat an audit whose evidence is still current.

## 2. Current verified Git checkpoint

- `main`: `fc08cd9676f1b0d2e924544d51cf2b1f1a0cc2cc`
- Push feature: `feature/android-push-notifications`
- Push commit: `30837330403cbe8dde53398aeaf45ce2d124bdf5`
- Push branch is one commit ahead of main.
- Current working branch: `docs/project-continuity-handoff`
- Documentation branch was created from `origin/main`.
- Documentation changes have not yet been committed or pushed.

Untracked helper scripts, Python cache, Supabase temporary files and
the migration backup exist in the Codespace. Preserve all of them.
Never use blanket staging, `git clean`, `git reset` or `git stash`.

## 3. Workstream status

| Priority | Workstream | Verified state |
|---|---|---|
| 0 | Project continuity documents | Being established |
| 1 | Android external push | Implemented on feature branch; Preview READY; not live |
| 2 | Question-bank management and planner readiness | Not implemented |
| 3 | Restart four-week Study trial | Required; current model supports one trial only |
| 4 | Academic Details settings redesign | Not implemented |
| 5 | Complete Palette 6 migration | Incomplete; legacy colours remain |
| 6 | Study trial readiness verification | Must pass before new trial starts |

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

Branch: `feature/android-push-notifications`
Commit: `30837330403cbe8dde53398aeaf45ce2d124bdf5`
Preview deployment: `dpl_7pRmqF1fcNpy3ToEciHQTckG3Xu1` (READY)
Preview URL: `https://personal-assistant-ghrcm0i5n-simon-0e59.vercel.app`

Reported checks: TypeScript, targeted ESLint, 511 tests in 52
files, local production build and npm audit passed.

Production Supabase foundation and Production environment variables
were configured. Secret values must never be printed or documented.
Production cron was empty at the last check. Push is not activated
in Production.

Class reminders are a separate category and OFF by default.
Google Calendar is read-only. No in-app inbox, unread badges or
reminder pop-ups.

Remaining: review notification tap destinations, verify Vercel
protection/bypass, activate and verify Supabase scheduling, merge
and deploy, then test on Android. Preview READY is not Production
release or live-device activation.

## 4. Working agreement

- Use GitHub Codespaces terminal as the primary environment.
- Give exact commands; user returns terminal output.
- Save time: use this handoff and verified evidence instead of
  repeatedly reconstructing the project.
- Preserve all unrelated untracked files.
- Inspect Git status before every work batch.
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

Finish and review the project continuity documentation on
`docs/project-continuity-handoff`. Commit and push only the named
documentation files. Then continue the prioritised workstreams,
updating this handoff at every meaningful checkpoint.

Every new conversation must begin by reading this document.
