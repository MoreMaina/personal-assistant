# Personal Assistant — Project Decisions Log

Add new decisions at the top. Preserve older entries.

## 22 November 2026 — Consolidated Study completion implementation

- Keep the existing `feature/study-completion-and-palette6` working tree
  and all untracked recovery files. The user has used more than 90% of
  Codespaces hours; conserve the existing environment and avoid installs.
- Question edits/replacements append a new `RetrievalTask` ID/version;
  historical wording and IDs are never overwritten. Deactivation sets
  `available_for_new_sessions=false`. If an unfinished Review, Gate or
  Guided Practice session references the question, retain `active=true`
  so its exact selected set can finish. New selection paths must check
  the availability flag and version chain.
- A topic may be Ready only while its objective and usable question bank
  satisfy the readiness rules. If an edit invalidates readiness, move it
  back to Draft. Legacy topics without a preparation status stay
  planner-compatible until the user reviews them.
- Unit exclusion is reversible and applies to new planner selection;
  existing Review/Gate obligations and historical evidence are retained.
- Each new trial has an append-only unique ID and frozen dates. Weekly
  metrics are identified by trial ID, week number and week start. Legacy
  snapshots remain unassigned and must never be rewritten to fit a new
  trial. The UI reset path that clears the settings projection without
  reconciling append-only history is removed. Trial start is blocked
  until the user confirms backup/evidence review, preparation review,
  metrics/planner verification, and phone/persistence/recovery acceptance.
  These are explicit user attestations, not inferred test results.
- Keep the already agreed Books, Essays, Settings, Today, Calendar,
  Palette 6, dark-mode, time-input, utilities and Study UI refinements.
- The consolidated patch is prepared from the supplied source bundle;
  application and full Codespace validation are still pending. No trial
  has been started; no Production database change, merge or deployment
  is authorized by this checkpoint.

## 22 November 2026 — Android push Production release and verification

- The Android external push implementation was merged through PR #11. PR #12 is also merged and exempts only `/api/push/dispatch` from browser-session middleware; the route remains protected by its own bearer-secret check.
- The `push-notification-dispatch` Supabase cron job runs every minute. Server-to-server calls include the Vercel protection bypass and dispatcher authentication; secret values must remain in Vault/environment storage and must never be exposed in source control, logs copied into documentation, or chat.
- The dispatcher delivery claim is the duplicate-prevention authority. Daily task and Study digests are date-keyed; changing a digest time after that day's digest was sent must not create a second same-day alert.
- Production release, scheduler success and real Android delivery are separate from full acceptance. A real task digest appeared on the Android device on 22 November, but the user cleared it before tapping. Tap navigation and remaining category tests are still pending.
- Preserve the existing device's saved preferences. Class reminders being enabled on this existing device does not alter the locked requirement that class reminders default OFF for new subscriptions.

## 21 November 2026 — Project continuity

- The repository is the durable source of truth, not chat history.
- Update the master handoff after every meaningful implementation batch.
- Record branch, commit, files, tests, deployment and database state.
- Preserve old checkpoints as history; mark stale ones superseded.
- New conversations begin by reading the master handoff.
- Preserve unrelated untracked files. Never blanket-stage or clean.

## 21 November 2026 — New Study trial

- A new four-week evaluation is required because the previous period has passed.
- Preserve the previous trial's dates, events, work sessions, plans, audit records and weekly metrics.
- Give every trial a unique identity and link its weekly evidence to that identity.
- Do not clear old data, overwrite immutable snapshots or backdate the new trial.
- Start only after readiness checks and confirmation of the actual first-use date.
- Trial duration is 28 calendar days inclusive; Week 4 is days 22–28.

## 21 November 2026 — Question bank and readiness

- Support adding, editing, replacing, deactivating and restoring questions.
- Historical attempts must retain the exact question version they used.
- Preserve scheduled Review and unfinished Gate question selections.
- Add topic Draft / Ready / Excluded controls.
- Add reversible unit-level planner exclusion.
- Planner readiness must validate meaningful objectives and sufficient usable active questions.
- These are additive improvements; do not silently weaken the locked Study v1.2 specification.

## 21 November 2026 — External push notifications

- Android Chrome / PWA browser push, not an in-app notification centre.
- No unread badges, reminder pop-ups or unnecessary repeated alerts.
- Class reminders are separate and OFF by default.
- Other app-calendar events, Google Calendar read-only events, Tasks and Study reminders are independent settings.
- Defaults: event 30 and 10 minutes before; classes 30 and 10 minutes if enabled; all-day 09:00; tasks 09:00; Study 08:00.
- Use the device's stored timezone.
- Notification taps must open relevant destinations.
- Google Calendar remains read-only.

## 21 November 2026 — Settings and visual design

- Academic Details becomes a normal settings section without a disclosure chevron.
- Show Save Settings only when Academic Details have changed.
- Complete Palette 6 migration across the application, not only global CSS.

## Ongoing — Safety and release rules

- Never expose credentials or secret values.
- Never run `git clean`, `git reset`, `git stash`, `git add .` or `git add -A`.
- Preserve unrelated untracked scripts and files.
- No destructive production database operation without explicit coordination.
- Preview success is not Production release; Production release is not live-device verification.
- Never describe a proposal as implemented or an unverified change as complete.
