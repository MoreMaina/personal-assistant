# Personal Assistant — Project Decisions Log

Add new decisions at the top. Preserve older entries.

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
