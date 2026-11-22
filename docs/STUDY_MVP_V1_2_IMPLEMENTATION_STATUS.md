<!-- SUPERSEDED-CHECKPOINT-NOTICE-2026-11-21 -->
> **Current-status notice — 21 November 2026**
>
> This document retains detailed historical Study MVP implementation notes.
> Its 15 November 2026 branch, working-tree and next-action checkpoint is
> stale and must not be followed as current.
>
> Read `PROJECT_CONTEXT_AND_HANDOFF.md` for current project state,
> priorities and resumption instructions. Read
> `STUDY_SYSTEM_MVP_V1_2_FINAL.md` for locked Study requirements.
> This historical log is retained; its earlier checkpoints must not be
> deleted or mistaken for the latest repository state.


## Current continuity checkpoint — 22 November 2026 (consolidated patch pending Codespace application)

This checkpoint supersedes the historical 15 November working-branch
and next-action instructions below. Preserve the historical log.

### Git baseline and working-tree protection

- Repository: `MoreMaina/personal-assistant`.
- User's current Codespace branch: `feature/study-completion-and-palette6`.
- Local HEAD and `origin/main`: `051d9f61c9e122e004eb9fc8215439340a8ec7ca` (PR #13 merge).
- The feature branch is not present on GitHub; implementation changes
  are uncommitted and must stay on this branch.
- The supplied source bundle contains the changed application and
  library files, including two untracked readiness TS files. Other
  recovery/helper scripts, cache and the Supabase migration backup were
  not included in the bundle; preserve them untouched in the Codespace.
- The user reports more than 90% of Codespaces hours consumed. Do not
  create another Codespace, install packages unnecessarily or run
  repeated builds.

### Consolidated implementation included in the prepared patch

- Study preparation route with course/unit/topic selection, objective
  editing, readiness blockers, Draft/Ready/Excluded state and reversible
  unit exclusion.
- Question-bank add, version/replace, deactivate and restore operations.
  Replacements append a new question ID and version. A separate
  `available_for_new_sessions` flag keeps questions out of new selections
  while preserving `active=true` for open Review/Gate/Guided Practice
  sessions that need the exact original IDs.
- Planner, Gate, Review and Guided Practice new-selection paths use
  question availability. Existing selected-session attempts retain their
  question identities.
- Newly imported topics default to Draft; unclassified legacy topics
  remain planner-compatible until reviewed. Ready is demoted to Draft
  when an edit invalidates objective/question readiness.
- Append-only repeatable trial identity (`trial_periods`,
  `current_trial_id`), legacy normalization, engine/version metadata,
  non-overlap checks and trial-specific weekly metric identities.
- Trial-aware Metrics reporting, historical period selection,
  trial-scoped snapshots/comparison flags/exports, and unassigned legacy
  metric handling. The legacy date-reset UI path is removed.
- AI Copilot progress context includes trial history and distinguishes
  trial-attributed metrics from unassigned legacy snapshots.
- Preserve the user's previous Books, Essays, Settings, Today, Calendar,
  Palette 6, system dark-mode, TimeInput, utilities-menu and Study UI
  refinements. Full visual verification remains pending.

### Validation status and exact next action

- The 127 previously reported tests were from the earlier local work;
  they are not a validation of this consolidated patch.
- Additional regression tests are included for preparation readiness,
  question versioning/session preservation and trial-linked metrics.
- The supplied bundle did not contain `node_modules`; no full Vitest,
  ESLint or Next production build could be run in the patch-preparation
  environment. Global TypeScript checking was attempted but cannot
  resolve the project's missing Next/React/Vitest/Node dependencies.
- Apply the delivered patch to the existing Codespace only after
  `git apply --check` passes. Then run `git diff --check`,
  `npx tsc --noEmit`, focused Study tests, full `npm test`, lint and one
  final `npm run build` in a single validation cycle using existing
  dependencies. Fix any failures before staging.
- Do not start or reset a trial, change Supabase, merge `main` or deploy.
- Review and explicitly stage only intended named files. Preserve all
  untracked recovery files. Commit/push the feature branch only after the
  user reviews the final validation results.


Study MVP v1.2 — Implementation Status & Conversation Handoff
Last updated: 15 November 2026 (Africa/Nairobi)
Repository: MoreMaina/personal-assistant
Working branch: study-mvp-v1-2-completion
Last known branch base: origin/main at merge commit db139f52a139819184b4e5c44302e3c7dfe0aa93
Purpose: Preserve project intent, decisions, verified implementation state, risks, and the exact next action across conversations.

## Latest authoritative checkpoint — 15 November 2026

**This checkpoint supersedes older interim status statements and
immediate-next-action instructions below.** Earlier checkpoints are
retained as historical project evidence.

### Git and working-tree state

- Repository: MoreMaina/personal-assistant
- Branch: `study-mvp-v1-2-completion`
- Local HEAD: `78fb66037446`
- Local origin tracking reference: `78fb66037446`
- Latest implementation changes remain uncommitted.
- No commit, push, merge, deployment or database operation was
  performed during this implementation step.

Tracked files modified relative to HEAD:

- `app/settings/page.tsx`
- `app/study/metrics/page.tsx`
- `app/study/page.tsx`
- `docs/STUDY_MVP_V1_2_IMPLEMENTATION_STATUS.md`
- `lib/studyMvp/storage.test.ts`
- `lib/studyMvp/storage.ts`

Staged files at the time of this update:

- None

Full working-tree status after this handoff update:

```text
M app/settings/page.tsx
 M app/study/metrics/page.tsx
 M app/study/page.tsx
 M docs/STUDY_MVP_V1_2_IMPLEMENTATION_STATUS.md
 M lib/studyMvp/storage.test.ts
 M lib/studyMvp/storage.ts
?? __pycache__/apply-study-mobile-refinement.cpython-314.pyc
?? apply-consolidated-study-batches.py
?? apply-final-course-deletion-and-ui-polish.py
?? apply-next-ui-polish.py
?? apply-study-mobile-refinement.py
?? apply-today-calendar-palette6-batch.py
?? apply-today-palette6-pilot.py
?? apply-today-palette6-responsive-pilot.py
?? finalize_study_mvp_batch1_handoff.py
?? fix-consolidated-study-test-errors-v2.py
?? fix-jsx-apostrophe-lint.py
?? fix_study_mvp_batch1_review_findings.py
?? p6-backup-jsx-repair.py
?? p6-final-touch-targets-and-google-dot-v2.py
?? p6-global-consistency-batch-v3.py
?? p6-study-accessibility-refinement.py
?? p6-study-workflow-minimal-batch.py
?? rebased-study-ui-calendar-course-management.py
?? repair_study_mvp_batch1_handoff.py
?? study-mobile-mixed-course-menu-batch.py
?? study-mvp-batch1-review.patch
?? supabase/.gitignore
?? supabase/config.toml
```

All untracked helper scripts, Python cache files and local Supabase
configuration must be preserved. None has been staged or deleted.

### Implementation completed locally

1. Settings numeric validation:
   - Corrected both incorrectly escaped integer-validation
     regular expressions in `app/settings/page.tsx`.
   - Valid whole-number inputs can now pass the numeric regex checks.
   - Preview persistence and audit behaviour still require functional
     validation.

2. Metrics interface:
   - Redesigned `app/study/metrics/page.tsx` as a compact hybrid
     dashboard.
   - Includes eight metric summaries, expandable details,
     target-aware progress, duration readiness, four-week trends,
     and data-quality information.
   - Includes the individual Defer decisions trend.
   - Existing weekly flags, snapshots and CSV/JSON export behaviour
     remain in the implementation and require Preview verification.
   - This interface change is local and has not been deployed.

3. Trial-start audit:
   - Added pure helper `startStudyTrial()` in
     `lib/studyMvp/storage.ts`.
   - Uses the shared `applyStudySettingsChange()` audit mechanism.
   - Validates ISO calendar dates.
   - Rejects future dates and already-configured trial dates.
   - Calculates trial end at start + 27 days.
   - Calculates Week 4 evaluation start at start + 21 days.
   - Calculates Week 4 evaluation end at start + 27 days.
   - Records previous values, new values, timestamp and reason
     in settings audit history.
   - Integrated the helper into `app/study/page.tsx`.
   - Preserved the existing explicit date-selection and persistence
     workflow.
   - Added three tests in `lib/studyMvp/storage.test.ts` covering
     exact date calculations, audit history, future-date rejection
     and engine locking after trial start.

### Exact automated verification — 15 November 2026

| Check | Result |
|---|---|
| `git diff --check` | Passed |
| `npx tsc --noEmit` | Passed |
| `npm test` | 47 files, 490 tests passed |
| `npm run build` | Passed |
| Next.js routes | Includes `/settings`, `/study`, `/study/metrics` |

The existing Vite warning concerning native config loading and
CommonJS syntax remains non-blocking.

These results were supplied by the user from the Codespaces terminal
after the three-file trial-audit patch was applied.

### Still unverified

- The current local implementation has not yet been pushed to Preview.
- Settings save, reload persistence, audit history and all seven
  editable controls need functional Preview verification.
- Custom intervals need end-to-end verification for initial and
  subsequent review scheduling.
- Metrics selection, weekly flags, snapshots and CSV/JSON exports
  need functional Preview verification.
- Trial date persistence, audit history and engine lock need Preview
  verification.
- Preview and Production share the Supabase project. Obtain and
  verify a readable Study JSON backup before controlled write tests.
- H1-H5, I1-I5, J1-J4, K1-K3 and L1-L2 require explicit acceptance
  traceability.
- Attempt and decision logging times must be measured separately.
- Offline, slow-network, reconnect and retry behaviour remains
  unverified.
- Catalogue import and onboarding timing remain unverified.
- The 120-topic / 600-review-event performance requirement remains
  unverified.
- No claim of offline support or Week 1 readiness is justified yet.

No actual trial has been started. No Supabase writes, resets,
migrations, production deployment or merge to main were performed.

### Delivery status

**Batch 1 — implementation:** The latest local implementation patch
and automated verification passed. Final combined diff review,
explicit staging, commit, push and Preview preparation remain.

**Batch 2 — functional validation:** Not complete. Continue from
the user's existing Preview experience and focus on the outstanding
functional behaviours. Do not repeat basic page-loading checks
unnecessarily.

### One immediate next task

Review the complete six-file intended change set, including this
handoff update, and inspect the actual working tree. Stage only
individually reviewed intended files. Commit and push to the feature
branch only after reviewing the staged diff and confirming checks.

Do not stage helper scripts or local Supabase configuration.
Do not merge to main, deploy Production, or start the four-week
trial before the mandatory readiness checks pass.

Read STUDY_SYSTEM_MVP_V1_2_FINAL.md first. It is the complete locked normative reference. This file is a living implementation log; update it as code and verification results change. Never treat an unverified item as complete.
1. Project objective
Finish Study System App — MVP v1.2 inside the Personal Assistant repository, then run the locked four-week trial. Do not broaden scope or redesign unrelated parts of the product.
The Study system must:
manage curriculum hierarchy and retrieval tasks;
enforce topic gate before normal reviews;
schedule one review sequence per topic with intervals anchored to previous successful completion;
generate daily plans within one mechanically enforced 180-minute budget;
require explicit DO / DEFER / RELEARN / SKIP dispositions, with no silent drops;
preserve immutable event history and audit decisions;
compute and export all eight weekly measures from immutable TaskEvent history;
expose the seven required pre-trial settings and audit their changes;
meet mandatory acceptance, performance, and phone-logging requirements before Week 1.
The three load-bearing invariants are in the locked specification §0 and must not be weakened.
2. Source-of-truth documents
docs/STUDY_SYSTEM_MVP_V1_2_FINAL.md — locked product requirements §§0–17 plus clearly labelled, non-normative Appendix A implementation review.
docs/STUDY_MVP_V1_2_IMPLEMENTATION_STATUS.md — this living handoff.
The detailed Appendix A assessment describes the app at the time of the user's review. It is historical evidence and must be reverified against the current branch before treating it as current status.
3. Working agreement and safety rules
User works in GitHub Codespaces and runs shell commands locally; assistant supplies exact commands/patches and reviews outputs.
Never claim a local file was edited, tested, committed, pushed, migrated, or deployed unless the user's output or an available tool verifies it.
Inspect git status --short before each work batch. Do not assume the worktree is clean.
Never run git add . or git add -A. Stage only named intended files.
Preserve all untracked helper scripts and local Supabase configuration. Do not delete or stage them unintentionally.
Do not run supabase db reset.
Do not run production migrations, production deployment, or destructive/remote Supabase actions without explicit coordination.
Keep patches small, targeted, and tested. Do not introduce unrelated UI polish or scope expansion.
The Codespace did not have apply_patch or rg installed at the last checkpoint. Use Python scripts for carefully asserted text edits and grep/grep -nE for searches; do not install tools just for convenience.
User wants efficient progress. Ask only essential questions; use established project context rather than making the user repeat it.
4. Repository and branch checkpoint
Repository: MoreMaina/personal-assistant (Next.js, React, TypeScript, Tailwind, Supabase, Vercel, Vitest).
Known Git state from the user's prior terminal session:
Working branch: study-mvp-v1-2-completion, created from origin/main.
origin/main was at merge commit db139f52a139819184b4e5c44302e3c7dfe0aa93 (PR #7 merge, 14 Nov 2026).
Before the current patch, no tracked modifications were reported after switching branches; there were multiple untracked helper scripts and local Supabase files.
The six-file source patch described in §5 is currently uncommitted.
The current status and untracked-file list have not been rechecked after the patch. Run git status --short before proceeding.
Untracked files previously observed and to preserve:
__pycache__/
apply-consolidated-study-batches.py
apply-final-course-deletion-and-ui-polish.py
apply-next-ui-polish.py
apply-study-mobile-refinement.py
apply-today-calendar-palette6-batch.py
apply-today-palette6-pilot.py
apply-today-palette6-responsive-pilot.py
fix-consolidated-study-test-errors-v2.py
fix-jsx-apostrophe-lint.py
p6-backup-jsx-repair.py
p6-final-touch-targets-and-google-dot-v2.py
p6-global-consistency-batch-v3.py
p6-study-accessibility-refinement.py
p6-study-workflow-minimal-batch.py
p6-study-workspace-refinement.py
rebased-study-ui-calendar-course-management.py
remove-study-catalog-instructions.py
study-mobile-mixed-course-menu-batch.py
supabase/.gitignore
supabase/config.toml
This list is a historical snapshot, not a guarantee that every item is still present or that no new untracked files exist. Recheck current status.
5. Current in-progress patch — immutable review snapshots
Problem addressed
The event ledger needed a durable snapshot of the task IDs selected for each review and needed the planner to retain the review's original scheduling priority rather than substituting mutable current priority.
Six files changed (user applied via Python script)
lib/studyMvp/types.ts
Added optional review_selected_task_ids_snapshot?: EntityId[] to TaskEvent.
lib/studyMvp/reviewEngine.ts
review_scheduled TaskEvent records [...options.selectedTaskIds].
lib/studyMvp/workflow.ts
Review-attempt TaskEvent records [...review.selected_task_ids].
lib/studyMvp/dailyPlanner.ts
PlanningTaskBase gains optional priorityAtScheduling.
Planned review snapshot uses task.priorityAtScheduling ?? task.priority.
lib/studyMvp/dashboard.ts
Review planner input passes priorityAtScheduling: review.priority_at_scheduling separately from priority: review.current_priority.
lib/studyMvp/storage.ts
If review_selected_task_ids_snapshot is present, validates it as a string array with 2–3 distinct IDs.
For attempt events, requires the retrieval task ID to be non-empty and included in the snapshot.
Property is optional so pre-existing events without this field are not rejected by this new validation block.
Verification already reported by user
git diff --check — passed (no output).
npx tsc --noEmit — passed (no output).
Focused Study test command — 5 files passed, 116 tests passed:
npm test -- lib/studyMvp/reviewEngine.test.ts lib/studyMvp/workflow.test.ts lib/studyMvp/dailyPlanner.test.ts lib/studyMvp/storage.test.ts lib/studyMvp/dashboard.test.ts
Vite emitted a configuration warning (vitest.config.ts uses ESM syntax while loaded as CommonJS under configLoader: 'native'). It did not fail the tests.
The user shared all six file diffs. The visible portions confirm the intended field additions and the split between current priority and priority-at-scheduling. The storage snippet showed the new validation block, but its full test coverage has not yet been demonstrated.
Patch review status
Not yet fully approved. The code change looks coherent, but add focused storage tests for:
valid review_scheduled snapshot with 2 selected distinct IDs;
valid attempt snapshot where retrieval_task_id belongs to the selected set;
invalid snapshot with fewer than 2 IDs;
invalid snapshot with more than 3 IDs;
invalid duplicate IDs;
invalid attempt whose retrieval_task_id is missing or outside selected IDs;
legacy event with this optional property absent remains accepted.
Do not overvalidate unrelated event kinds. Ensure the tests match existing storage test patterns and appendTaskEvent validation entry point. Once added, run focused storage tests, then all 5 targeted files, then full suite/typecheck.
Immediate next command
The Codespace has no rg; use:
grep -nE 'appendTaskEvent|invalid-event|snapshot|gate_selected_task_ids_snapshot' lib/studyMvp/storage.test.ts
Then inspect relevant tests/helpers with sed -n '...p'. Do not ask for the output of the same command again if already provided.
6. Architecture map — main files
File
Responsibility / current understanding
lib/studyMvp/types.ts
Core domain types: StudySettings, ReviewEvent, TaskEvent, WeekMetrics, statuses and enums.
lib/studyMvp/reviewEngine.ts
Gate/review scheduling and progression; hard-coded REVIEW_INTERVALS_DAYS = [1,3,7,14,30] was present at last audit.
lib/studyMvp/workflow.ts
Review attempts, gate flow, retries/relearning, event construction.
lib/studyMvp/dailyPlanner.ts
Daily allocation, budget enforcement, plan finalization and disposition event generation.
lib/studyMvp/dashboard.ts
Builds daily dashboard/planner inputs from study state and review records.
lib/studyMvp/storage.ts
Local state/event validation, append-only event behavior, settings audit/lock, weekly metric snapshot persistence.
lib/studyMvp/cloudStorage.ts
Supabase-backed cloud loading and persistence.
lib/studyMvp/useCloudStudyState.ts
Cloud state initialization and local/cloud persistence behavior.
lib/studyMvp/csvImport.ts
CSV/paste curriculum import and validation.
app/study/page.tsx
Main Study experience (large page component).
app/settings/page.tsx
Main Settings page; Study MVP editor was not found during the last audit.
Relevant tests:
lib/studyMvp/dailyPlanner.test.ts
lib/studyMvp/dashboard.test.ts
lib/studyMvp/reviewEngine.test.ts
lib/studyMvp/workflow.test.ts
lib/studyMvp/planningWorkflow.test.ts
lib/studyMvp/storage.test.ts
lib/studyMvp/cloudStorage.test.ts
7. Implementation status against locked requirements
These statuses reflect the last code audit and test results in this conversation. They are deliberately conservative; recheck after subsequent commits.
Requirement
Status
Evidence / remaining work
Daily budget and allocator
Partially verified
Planner has robust allocation/finalization logic. H1/H2/H3/H5 tests exist; H4 includes deterministic 10,000-scenario fuzz. Full acceptance wording and all edge cases still need cross-checking.
No-silent-drop / exactly one disposition
Partially verified
Finalization rejects unresolved plans and emits defer/skip/relearn/forced events. Prove exactly-one disposition for every considered task against H5.
Gate/review/retry flow
Partially verified
Engine/workflow tests exist; review and gate behavior are implemented. Confirm every I1–I5 scenario and post-finals lifecycle against exact spec.
Immutable selected-task snapshots
Patch applied; focused new tests pending
Six-file patch adds schedule and attempt snapshots; test validation cases before approval.
Original scheduling priority
Patch applied; regression test pending
Planner input now carries priority_at_scheduling separately from current_priority; test after priority changes.
Eight-metric calculator
Not implemented at last audit
WeekMetrics type exists and appendWeeklyMetricsSnapshot() persists immutable snapshots, but a calculator for all eight metrics was not found.
Metrics dashboard and CSV/JSON exports
Not implemented / unverified at last audit
Full calculator, dashboard and combined exports were not found. This is trial-blocking.
Required Settings UI
Incomplete at last audit
changeStudySettings() audit logic and engine lock exist in storage, but required UI controls were not found in app/settings/page.tsx.
Editable review intervals
Not implemented end-to-end at last audit
StudySettings.intervals_days was a fixed [1,3,7,14,30] tuple; reviewEngine.ts used hard-coded REVIEW_INTERVALS_DAYS. Must make dynamic and validate interval data.
Last final date control
Partial
Model/logic recognize explicit setting or latest final; dedicated Study Settings UI was not found.
CSV/paste onboarding
Partial
csvImport.ts supports structured import, validation/diagnostics and atomic behavior; complete onboarding/time test remains.
Supabase/local resilience
Unverified / risk
Cloud bootstrap uses Supabase. Local persistence appears optimistic after remote revision initialization, but offline startup/reconnect/retry reliability is not proven.
Phone logging ≤30 sec
Unverified
Must measure attempt and decision separately on a phone-sized workflow.
120 topics / 600 events <200 ms
Unverified
Benchmark test/result not confirmed.
WorkSession rules
Existing implementation and tests observed; full acceptance still to verify
K1–K3 require explicit checks including no G/Y/R for work sessions, corrective ready-to-retry, assignment visibility.
Important design observations from prior audit
ReviewEvent has separate intended_due_date, current_due_date, priority_at_scheduling, and current_priority fields.
review_scheduled TaskEvent already held immutable review identity, intended date, current date, priority-at-event, and estimated duration; selected task ID snapshot was missing before this patch.
Attempt events held review/task links and estimate/type/duration/result snapshots; this patch adds the selected question set snapshot.
Metric calculations must use the immutable scheduling event for original due date and priority, then join explicit decision/attempt events by stable review ID.
The planner previously used current priority for its priority_at_scheduling; patch now passes the original scheduling priority separately.
appendWeeklyMetricsSnapshot() stores immutable weekly metric snapshots but does not itself calculate them.
Daily planning decision event creation was observed for forced/auto-capacity defer and explicit defer/skip/relearn; DO allocations are represented in plan history/state. Recheck H5's “exactly one disposition” semantics and resolve_unallocated_*() events.
Local/cloud persistence is not yet proven robust offline. Do not claim offline support until startup without connectivity, logging, reconnection and retry are tested.
8. The eight metrics — implementation cautions
Implement the exact definitions in the locked specification §11:
Overall on-time completion: reviews completed on intended due date ÷ review events intended due that week.
Priority 1–3 on-time completion: same denominator logic restricted to priority_at_scheduling 1–3.
Deferral rate: distinct review events intended due that week with at least one defer by week-end ÷ events due that week.
Deferral decisions: count individual DEFER TaskEvents during the week.
Duration error: APE = |actual - estimated| / estimated × 100; median separately by task type with n ≥ 5; exclude missing/zero estimates; exclude assignment work sessions, mixed practice and content preparation.
Overdue critical backlog: sum estimated minutes of overdue priority 1–3 events still pending/deferred/in-progress/missed at week-end.
Priority 1–3 skip count: explicitly skipped priority 1–3 events.
Priority 4–5 skip rate: distinct priority 4–5 events skipped ÷ priority 4–5 events due that week.
Metric invariants:
Measures 1–3 and 6–8 use immutable intended_due_date and priority_at_scheduling, never mutable current_due_date or current_priority.
An event deferred five times in one week is one deferred event for Measure 3 and five decision events for Measure 4.
Assignment completion is reported separately, never silently mixed into review denominators.
Preserve sample counts and report data-quality gaps rather than fabricating values where legacy events lack required snapshots.
Metric snapshots are immutable and deterministic for exact replay.
Do not guess at week-boundary, denominator, or event-attribution semantics if the exact spec does not resolve a case. Flag it for an explicit product decision before embedding an assumption.
9. Remaining work — shortest safe path
Finish focused storage tests for the six-file snapshot/priority patch; review full diff; re-run targeted tests.
Add a priority regression test proving that a change to current priority does not alter original priority_at_scheduling in planned/scheduled history.
Audit TaskEvent constructors and prove all required metrics inputs are reconstructible from immutable history.
Implement a deterministic pure metric calculator over immutable TaskEvent history; add independent tests for all eight measures and the J1–J4 cases.
Add the smallest complete Metrics Dashboard/weekly evidence view and CSV + JSON export.
Expose the seven required settings in Settings, backed by existing audit and trial-lock functions. Make interval scheduling read validated settings rather than a hard-coded constant.
Verify no ordinary review after finals and topic classification paths.
Run H1–H5, I1–I5, J1–J4, K1–K3, and L1–L2 explicitly. Add any missing tests.
Verify local/cloud resilience, CSV onboarding timing, all trial routes, 120-topic/600-event performance, and phone logging times.
Run full tests, TypeScript, lint/build checks as applicable; only then assess trial readiness.
The shortest route is to deliver the missing metrics and settings first after event-ledger correctness. Do not spend time on unrelated polish.
10. Current verified test/check record
Check
Latest reported result
Notes
Baseline full npm test
46 files, 460 tests passed
Reported before current six-file patch on this branch.
Current git diff --check
Passed
After six-file patch; no output.
Current npx tsc --noEmit
Passed
After six-file patch; no output.
Current focused Study tests
5 files, 116 tests passed
dailyPlanner, workflow, storage, dashboard, reviewEngine. Vite config warning only.
Focused new storage snapshot validation tests
Not yet added / not yet run
Immediate next testing task.
Full suite after patch
Not yet run
Run after focused validation tests.
Lint/build after patch
Not yet run
Not established by current checkpoint.
Exact command for the last targeted test run:
npm test -- lib/studyMvp/reviewEngine.test.ts lib/studyMvp/workflow.test.ts lib/studyMvp/dailyPlanner.test.ts lib/studyMvp/storage.test.ts lib/studyMvp/dashboard.test.ts
11. Codespace commands and workflow
# Always inspect working tree first
git status --short

# Safe diff checks
git diff --check
git diff --stat

# TypeScript
npx tsc --noEmit

# Full suite
npm test

# Focused Study tests
npm test -- lib/studyMvp/reviewEngine.test.ts lib/studyMvp/workflow.test.ts lib/studyMvp/dailyPlanner.test.ts lib/studyMvp/storage.test.ts lib/studyMvp/dashboard.test.ts

# Search (rg is not installed in this Codespace)
grep -nE 'pattern1|pattern2' path/to/file

# Inspect a known range
sed -n '120,220p' path/to/file
For Python-assisted source edits: make replacements only after asserting each old snippet occurs exactly once; prepare every modified file in memory before writing; do not overwrite unrelated work. Run git diff --check, typecheck, and relevant tests immediately after.
12. Continuity instructions for a new conversation
Paste or upload both project documents and say:
We are continuing development of MoreMaina/personal-assistant,
specifically Study System App — MVP v1.2.

Read STUDY_SYSTEM_MVP_V1_2_FINAL.md and
STUDY_MVP_V1_2_IMPLEMENTATION_STATUS.md before proposing changes.
The specification is authoritative; the status file is a living,
conservative implementation checkpoint.

Preserve existing work and untracked files. Never use git add . or
 git add -A. Do not run supabase db reset or production migrations/
deployments without explicit coordination. Work in small tested steps.
Do not claim code changes or test results unless actually verified.
Continue from the single immediate next task in the handoff.
The goal is to finish MVP v1.2 quickly, then run its four-week trial.
13. Session closeout checklist
At the end of each substantial work session, update this file with:
current branch and latest commit SHA;
exact git status --short summary, including untracked files (do not discard the old list without rechecking);
exact files changed and why;
tests actually run and exact results;
what remains unverified;
any new decisions or deviations, with the user's approval where required;
one immediate next task and its exact starting command.
Do not mark something complete merely because a related component exists. Mark complete only after its acceptance condition has been checked.
14. Explicit implementation divergence and operational caution
The original reference specifies local-first storage with no backend required. The built app diverged to Supabase-backed persistence. This divergence is acceptable only if logging remains responsive and does not block on network round-trips. Local persistence/optimistic updates and recovery behavior must be verified; do not claim robust offline support until reconnection and retry behavior are tested.
The app must not lose a recorded attempt or disposition because a network operation is slow or temporarily unavailable. Any queued/retried synchronization must preserve event identity and append-only semantics.
No production migration, production deployment, or destructive database operation is implied by this specification or handoff. Such operations require explicit coordination.

---

## Checkpoint: Weekly metrics dashboard implementation
Date: 2026-11-14

### Current development state
- Branch: study-mvp-v1-2-completion
- Work remains uncommitted and unpushed.
- Production has not been deployed.
- Locked specification remains unchanged.

### Completed in this development batch

1. Review-event data integrity:
   - Scheduled review events preserve selected retrieval-task IDs.
   - Individual review attempts preserve the same selected-task snapshot.
   - Storage validation checks selection size, uniqueness and attempt membership.
   - Legacy events without the optional snapshot remain accepted.
   - Original scheduling priority is preserved separately from current priority in planner task mapping.

2. Metrics calculation:
   - Added lib/studyMvp/metrics.ts.
   - Added lib/studyMvp/metrics.test.ts.
   - Implements all eight weekly metrics from immutable TaskEvent history.
   - Uses intended due date and priority at scheduling.
   - Counts repeated deferral decisions individually but distinct deferred reviews once.
   - Distinguishes historical skips from currently unresolved skips.
   - Reconstructs completion from attempt events and frozen selected-task snapshots.
   - Calculates duration error by task type, requiring at least five samples.
   - Reconstructs overdue priority 1–3 backlog.
   - Adds consecutive-week dashboard flags.
   - Preserves source events, timezone, sample counts and data-quality notices in weekly snapshots.

3. Metrics interface:
   - Added app/study/metrics/page.tsx.
   - Added navigation link from app/study/page.tsx.
   - Week selector for the four-week trial.
   - Displays all eight measures, targets and available sample counts.
   - CSV and JSON evidence export.
   - Saves weekly evidence through the existing cloud-backed persistence hook.
   - Weekly evidence can only be finalized after the reporting week has ended.

### Latest verified checks
- npm test: 47 files passed, 480 tests passed.
- npx tsc --noEmit: passed.
- git diff --check: passed.
- npm run build: passed.
- Next.js production build includes /study/metrics.
- Vite configLoader native/CommonJS warning remains non-blocking.

### Current limitations and outstanding work

1. Vercel Preview visual and functional review of /study/metrics has not yet been completed.
2. The seven required editable trial settings remain incomplete or unverified in the Settings interface:
   - daily_budget_min
   - review_reserve_min
   - repair_recovery_cap_min
   - gate_threshold_pct
   - defer_limit
   - intervals_days
   - last_final_exam_date
3. intervals_days is currently represented as the fixed tuple [1, 3, 7, 14, 30]; review its type and validation before exposing editing.
4. Phone logging speed still needs separate manual attempt and decision measurements (each <=30 seconds).
5. Offline behavior of the Supabase-backed persistence flow still needs explicit verification.
6. Acceptance IDs H1-H5, I1-I5, J1-J4, K1-K3 and L1-L2 still need a final traceability review; passing the full test suite does not by itself prove every manual acceptance check.
7. Do not start the four-week trial until all blocking pre-trial requirements in the locked specification are met.

### Immediate next steps
1. Stage only the intended Study implementation files and the two docs files.
2. Review the staged diff; do not stage helper scripts or local Supabase config.
3. Commit and push the feature branch to obtain a Vercel Preview deployment.
4. Test /study/metrics in Vercel Preview, including week selection, flags, evidence saving, CSV export and JSON export.
5. Implement and test the seven editable Settings controls with audit history and trial freeze behavior.
6. Complete remaining acceptance and manual logging/offline checks.
7. Update this handoff after each substantial milestone.

### Files changed/added in the metrics milestone
- app/study/page.tsx
- app/study/metrics/page.tsx
- lib/studyMvp/dailyPlanner.ts
- lib/studyMvp/dashboard.ts
- lib/studyMvp/metrics.ts
- lib/studyMvp/metrics.test.ts
- lib/studyMvp/reviewEngine.ts
- lib/studyMvp/storage.test.ts
- lib/studyMvp/storage.ts
- lib/studyMvp/types.ts
- lib/studyMvp/workflow.ts
- docs/STUDY_SYSTEM_MVP_V1_2_FINAL.md
- docs/STUDY_MVP_V1_2_IMPLEMENTATION_STATUS.md

Preserve all untracked helper scripts and local Supabase configuration.
Never use git add . or git add -A.
Do not reset Supabase, run production migrations, merge to main or deploy production without explicit coordination.

## Checkpoint: Batch 1 — implementation verification
Date: 2026-11-14 23:31 EAT

### Batch result
- Branch: `study-mvp-v1-2-completion`
- HEAD before handoff update: `89309e9e530cf760a658ae4331c0b2b3cd9f772a`
- Locked specification: unchanged.
- `git diff --check`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: passed — [22m [1m[32m47 passed[39m[22m[90m (47)[39m; [22m [1m[32m487 passed[39m[22m[90m (487)[39m.
- `npm run build`: passed; route summary includes `/study/metrics` and `/settings`.
- Vite may continue to print its existing `configLoader: native` / CommonJS warning; it is non-blocking when the command exits successfully.

### Implementation included in this batch
- The five review intervals are editable as positive, strictly increasing whole-day values.
- The configured intervals flow into first-review scheduling and subsequent review progression.
- Study settings updates use the pure audited state-update helper and the cloud-backed persistence path.
- The final-exam date is locked with the other engine settings during an active trial.
- The seven pre-trial controls are present in General Settings, with validation and recent audit history.
- Manual trial start-date selection and plain-English descriptions for the eight metrics are included in the current working changes.

### Tracked files changed at verification
- `app/settings/page.tsx`
- `app/study/metrics/page.tsx`
- `app/study/page.tsx`
- `lib/studyMvp/reviewEngine.test.ts`
- `lib/studyMvp/reviewEngine.ts`
- `lib/studyMvp/storage.test.ts`
- `lib/studyMvp/storage.ts`
- `lib/studyMvp/types.ts`
- `lib/studyMvp/workflow.test.ts`
- `lib/studyMvp/workflow.ts`

### Untracked files observed — preserve
- `__pycache__/`
- `apply-consolidated-study-batches.py`
- `apply-final-course-deletion-and-ui-polish.py`
- `apply-next-ui-polish.py`
- `apply-study-mobile-refinement.py`
- `apply-today-calendar-palette6-batch.py`
- `apply-today-palette6-pilot.py`
- `apply-today-palette6-responsive-pilot.py`
- `complete_study_mvp_batch1.py`
- `fix-consolidated-study-test-errors-v2.py`
- `fix-jsx-apostrophe-lint.py`
- `p6-backup-jsx-repair.py`
- `p6-final-touch-targets-and-google-dot-v2.py`
- `p6-global-consistency-batch-v3.py`
- `p6-study-accessibility-refinement.py`
- `p6-study-workflow-minimal-batch.py`
- `p6-study-workspace-refinement.py`
- `rebased-study-ui-calendar-course-management.py`
- `remove-study-catalog-instructions.py`
- `study-mobile-mixed-course-menu-batch.py`
- `supabase/.gitignore`
- `supabase/config.toml`

### Still outstanding before Week 1
- Vercel Preview review of Settings, audit history, interval behavior, metrics flags, evidence saving and JSON export.
- Full acceptance trace: H1–H5, I1–I5, J1–J4, K1–K3 and L1–L2.
- Separate phone timing for attempt and decision logging.
- Offline / slow-network behavior verification for the Supabase-backed persistence divergence.
- CSV catalogue import timing and 120-topic / 600-review-event performance benchmark.
- Do not start the four-week trial until the blocking pre-trial checks are complete.

### Final review checkpoint — Batch 1
Date: 2026-11-14

- Reviewed the complete staged implementation diff before final staging.
- Two narrow review corrections were applied and re-tested: a null `last_final_exam_date` now remains blank in Settings so the exam-register fallback stays dynamic; metric 3's explanation now correctly describes the deferral percentage it displays.
- After those corrections, `git diff --check`, `npx tsc --noEmit`, `npm test` (47 files / 487 tests), and `npm run build` all passed.
- The two review corrections are included in the staged Settings and metrics files.
- The final staged set contains exactly the 11 intended Batch 1 paths; `git diff --cached --check` passed.
- Helper scripts, the generated review patch, `__pycache__/`, and local Supabase configuration remain untracked and preserved.
- No commit, push, deployment, migration, or Supabase operation has been performed.

### Next action
Commit the reviewed Batch 1 changes on `study-mvp-v1-2-completion`, then push that feature branch to obtain a Vercel Preview. Record the resulting commit SHA and Preview URL/status in this handoff. Do not merge to `main` or deploy production. Batch 2 remains Preview validation and the pre-trial readiness checks; do not start the four-week trial until all blocking acceptance checks are complete.

## Checkpoint: Batch 2 — compact Study UI refinements
Date: 2026-11-15

### Implementation
- `app/settings/page.tsx`: Study System settings are now collapsed by default in a native disclosure panel. Trial/readiness status remains visible in the summary. Status distinguishes active, scheduled, completed, configured and pre-trial states, and unavailable Study data.
- `app/study/page.tsx`: compact responsive header places the Study system label, workspace title, cloud-sync status and weekly metrics/evidence link in a smaller layout.
- No study scheduling, event history, metrics calculation or persistence logic was changed.

### Verification
- `git diff --check`: passed.
- `npx tsc --noEmit`: passed.
- `npm test`: 47 files / 487 tests passed after the initial UI patch. The final trial-status label adjustment was subsequently checked with TypeScript and a successful production build.
- `npm run build`: passed after the final status-label adjustment; routes include `/settings`, `/study` and `/study/metrics`.
- Preview smoke check on the preceding deployment: `/study` and `/settings` loaded successfully.
- Preview and Production use the same Supabase project. No database writes or trial actions were performed during these UI checks.
- The two new UI changes have not yet been visually checked in a deployment containing this commit.

### Current tracked changes
- `app/settings/page.tsx` — collapsible settings panel and status labels.
- `app/study/page.tsx` — compact workspace header.
- This handoff — current Batch 2 progress and next actions.

### Current untracked files — preserve
- `__pycache__/`
- `apply-consolidated-study-batches.py`
- `apply-final-course-deletion-and-ui-polish.py`
- `apply-next-ui-polish.py`
- `apply-study-mobile-refinement.py`
- `apply-today-calendar-palette6-batch.py`
- `apply-today-palette6-pilot.py`
- `apply-today-palette6-responsive-pilot.py`
- `finalize_study_mvp_batch1_handoff.py`
- `fix-consolidated-study-test-errors-v2.py`
- `fix-jsx-apostrophe-lint.py`
- `fix_study_mvp_batch1_review_findings.py`
- `p6-backup-jsx-repair.py`
- `p6-final-touch-targets-and-google-dot-v2.py`
- `p6-global-consistency-batch-v3.py`
- `p6-study-accessibility-refinement.py`
- `p6-study-workflow-minimal-batch.py`
- `rebased-study-ui-calendar-course-management.py`
- `repair_study_mvp_batch1_handoff.py`
- `study-mobile-mixed-course-menu-batch.py`
- `study-mvp-batch1-review.patch`
- `supabase/.gitignore`
- `supabase/config.toml`

### Remaining Batch 2 validation
- Deploy these UI refinements to the feature-branch Preview and inspect both pages at desktop and phone widths.
- Verify all eight metrics, week selection, flags, CSV and JSON exports.
- Back up Study JSON before controlled write tests because Preview and Production share Supabase.
- Complete acceptance trace H1–H5, I1–I5, J1–J4, K1–K3 and L1–L2.
- Measure attempt and decision logging separately on a phone (each <=30 seconds).
- Verify offline and slow-network persistence/retry behavior.
- Benchmark CSV catalogue import and the 120-topic / 600-review-event workload.
- Do not start the four-week trial until all blocking acceptance checks pass.

### Immediate next action
Review the staged three-file diff, commit and push the two UI refinements plus this handoff to `study-mvp-v1-2-completion`, then inspect the resulting Vercel Preview. Do not merge to `main`, deploy production, run migrations or change Supabase configuration.
