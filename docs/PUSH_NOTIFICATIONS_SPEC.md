# External Push Notifications — Specification

Status: Implemented on feature branch; Preview READY; not activated in Production.
Last reviewed: 21 November 2026.

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

## Explicit exclusions

- No in-app notification centre.
- No unread badges.
- No in-app reminder pop-ups.
- No unnecessary repeated alerts or nagging.
- No ability to modify Google Calendar events.

## Launch acceptance

- [ ] Merge reviewed feature branch and deploy Production.
- [ ] Verify production service worker and API endpoints.
- [ ] Verify Vercel deployment protection/bypass for scheduled requests.
- [ ] Activate and verify Supabase scheduled dispatcher.
- [ ] Confirm class reminders are independently OFF by default.
- [ ] Test every category independently.
- [ ] Test deduplication and overlapping scheduler runs.
- [ ] Test timezone, all-day and daylight-saving cases.
- [ ] Test task and Study summaries against actual saved data.
- [ ] Verify Android tap destinations.
- [ ] Test permission denial, expired subscriptions and delivery errors.
- [ ] Complete live Android device test.

## Verified implementation checkpoint

Branch: `feature/android-push-notifications`
Commit: `30837330403cbe8dde53398aeaf45ce2d124bdf5`
Preview: `dpl_7pRmqF1fcNpy3ToEciHQTckG3Xu1` (READY)
Reported local checks: TypeScript, targeted ESLint, 511 tests across
52 files, production build and npm audit passed.
Production cron was empty at last verification. This is not yet live.
