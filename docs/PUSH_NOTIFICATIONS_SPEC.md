# External Push Notifications — Specification

Status: Implemented and deployed to Production; one real Android delivery confirmed; remaining end-to-end acceptance tests are pending.
Last reviewed: 22 November 2026.

## Objective

Quiet Android Chrome / installed-PWA push notifications that work while
the website is closed, subject to browser and device permissions.
Notifications should arrive when relevant and link to the right page.

## Independent notification categories

| Category | Default |
|---|---|
| Class and lecture reminders | OFF |
| Other app-calendar events | ON |
| Google Calendar (read-only) | ON |
| Tasks and deadlines | ON |
| Unfinished Study Plan | ON |

Class reminders must remain separate from other calendar events.
The saved preferences for an existing device must not be silently
reset to the defaults. At the 22 November checkpoint, the existing
device's class reminder switch was ON; this is a current preference,
not a change to the new-subscription default.

## Default timing

- Timed calendar events: 30 and 10 minutes before.
- Classes: 30 and 10 minutes before, only when enabled.
- All-day events: 09:00 local device time.
- Tasks due today and overdue: 09:00 daily summary.
- Unfinished Study Plan: 08:00 daily summary.

Allow event lead times of 10, 30 or 60 minutes and custom daily
summary times. Use each device's stored IANA timezone.

## Settings

Provide per-device enable/disable, independent category switches,
separate class controls, editable timings, and browser permission
status. Disabling one device must not disable other devices.

## Tap destinations

Every notification must open the most relevant existing route.
Current implementation routes classes to `/`, calendar events and
task summaries to `/calendar`, and Study summaries to `/study`.
Review and improve these destinations where a more specific route
exists. Do not invent unsupported deep links.

## Technical design

- Android Chrome Web Push and PWA service worker.
- Store device subscription and preferences in Supabase.
- Scheduled server-side dispatcher identifies due notifications.
- Delivery claims prevent duplicate alerts.
- Permission requested only after a user action.
- Google Calendar connection remains read-only.
- `/api/push/dispatch` is exempted from browser-session redirects only
  for server-to-server dispatch; the route independently validates
  its bearer credential.

## Explicit exclusions

- No in-app notification centre.
- No unread badges.
- No in-app reminder pop-ups.
- No unnecessary repeated alerts or nagging.
- No ability to modify Google Calendar events.

## Launch acceptance

- [x] Merge reviewed feature branch and deploy Production.
- [x] Verify dispatcher route authentication and authenticated dispatch.
- [x] Verify Vercel deployment protection/bypass for scheduled requests.
- [x] Activate and verify Supabase scheduled dispatcher.
- [ ] Confirm class reminders are independently OFF by default on a newly created subscription. (Code/default contract is retained; this end-to-end default has not yet been separately retested in Production.)
- [ ] Test every notification category independently.
- [ ] Test timed app-calendar events at 30 and 10 minutes.
- [ ] Test all-day event timing.
- [ ] Test class reminders with the category enabled and disabled.
- [ ] Test Google Calendar read-only reminder flow.
- [ ] Test unfinished Study Plan digest.
- [x] Test a real task digest against actual saved data and confirm Android display.
- [x] Verify daily task-digest deduplication after the same day's notification was already sent.
- [ ] Test overlapping dispatcher claims/concurrent runs explicitly.
- [ ] Test timezone edge cases and daylight-saving transitions.
- [ ] Verify Android tap destinations on-device.
- [ ] Test permission denial, expired subscriptions and delivery errors.
- [x] Confirm at least one live Android device notification is displayed.

## Verified implementation checkpoint

### Git and deployment

- PR #11: `feat: add Android external push notifications`, merged to
  `main` at `a819b3407061080de7f840e50a66b7accfeb0e14`.
- PR #12: `Fix/push dispatch auth exemption`, merged to `main` at
  `bbb34cf4bac0bdd3e4bbdbf139146b7e5a729638`.
- Current verified `main` commit: `bbb34cf4bac0bdd3e4bbdbf139146b7e5a729638`.
- Production deployment: `dpl_9aF88gNyGnKCPZKzjio971wiotNR`, READY,
  deployed from that exact commit.
- PR #11 reported 511 tests across 52 files, TypeScript, targeted
  ESLint and production build passed. GitHub Actions run #157 on
  the post-PR-12 `main` commit completed successfully.

### Production database and scheduler

- Applied migrations: `20261121135043` and `20261121135053`.
- Supabase cron job `push-notification-dispatch` is active with
  schedule `* * * * *`.
- Five most recent inspected cron executions on 22 November
  (05:09–05:13 UTC) all succeeded.
- An unauthenticated production dispatch request returned HTTP 401;
  an authenticated server-to-server dispatch returned HTTP 200.
- Secret values are intentionally omitted from this document.

### Live Android delivery

- One real task digest with key `task-digest:2026-11-22` was stored
  as `sent`, with one attempt, `sent_at` 2026-11-22 05:03:03 UTC
  (08:03:03 Africa/Nairobi), and no recorded delivery error.
- The user confirmed that the notification appeared on the Android
  device. The notification was cleared before it could be tapped.
- Therefore delivery/display is verified, but notification-click
  navigation is still pending.
- At the last preference inspection, the device timezone was
  `Africa/Nairobi`; the device was enabled; event and class lead
  times were 30 and 10 minutes; saved all-day, task and Study times
  were 08:04, 08:06 and 08:02 respectively. The existing class
  reminder preference was ON. Preserve these values unless the
  user explicitly changes them.
- The daily task digest is date-keyed and is sent at most once per
  subscription per date. Changing its scheduled time after the
  digest has already been sent does not create a second notification.

See `PUSH_NOTIFICATIONS_IMPLEMENTATION_STATUS.md` for the detailed
verification ledger, pending tests and next action.
