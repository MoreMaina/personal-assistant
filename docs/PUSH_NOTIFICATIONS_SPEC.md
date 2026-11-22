# Android External Push Notifications — Implementation Status

Last verified: 22 November 2026 (Africa/Nairobi)
Locked requirements: `PUSH_NOTIFICATIONS_SPEC.md`
Repository: `MoreMaina/personal-assistant`

## 1. Overall status

Status: Production deployed; partial live-device acceptance verified.

The feature implementation is merged to `main` and deployed to Vercel
Production. Supabase scheduling is active. A real task digest was
sent through the Production dispatcher and the user confirmed that it
appeared on their Android device.

This is not yet full acceptance. The notification was cleared before
the user tapped it, and the remaining notification categories and
edge cases have not all been tested end-to-end.

## 2. GitHub and release record

| Item | Verified value |
|---|---|
| Feature PR | [#11](https://github.com/MoreMaina/personal-assistant/pull/11) — merged |
| Feature merge commit | `a819b3407061080de7f840e50a66b7accfeb0e14` |
| Dispatch-auth fix PR | [#12](https://github.com/MoreMaina/personal-assistant/pull/12) — merged |
| Current `main` commit | `bbb34cf4bac0bdd3e4bbdbf139146b7e5a729638` |
| Production deployment | `dpl_9aF88gNyGnKCPZKzjio971wiotNR` — READY |
| Production deployment URL | `https://personal-assistant-28ifi6dbc-simon-0e59.vercel.app` |
| Stable observed alias | `https://personal-assistant-simon-0e59.vercel.app` |
| Post-merge GitHub Actions | [Run #157](https://github.com/MoreMaina/personal-assistant/actions/runs/44986952605) — success |

PR #12 changed:

- `lib/supabase/proxy.ts`: the exact `/api/push/dispatch` path skips
  browser-session middleware. The dispatch route still authenticates
  the server-to-server bearer credential itself.
- `.github/workflows/study-preview-ci.yml`: workflow push triggers
  include `main`; the existing pull-request triggers are retained.

The latest verified Vercel Production deployment uses the exact
current `main` commit listed above.

## 3. Production Supabase state

Project: `fkjrhbkvwcdxmvsrwjuj`

Applied migrations:

- `20261121135043_android_push_notifications`
- `20261121135053_enable_push_scheduler_extensions`

Scheduler:

- Job name: `push-notification-dispatch`
- Job ID: `1`
- Schedule: `* * * * *` (every minute)
- Active: `true`
- The five most recent inspected runs at 05:09, 05:10, 05:11,
  05:12 and 05:13 UTC on 22 November 2026 all had status `succeeded`.

Production dispatcher authentication checks:

- Request without the bearer credential reached the API route and
  returned HTTP 401 `Unauthorized`.
- Authenticated server-to-server request returned HTTP 200 with
  `ok: true` and dispatch statistics.
- Scheduled requests also include the required Vercel protection
  bypass. No credential values are recorded here.

No database schema changes or preference changes were made as part
of this documentation checkpoint.

## 4. Actual Android delivery evidence

This was a real notification based on existing user data, not a
synthetic test push.

| Field | Result |
|---|---|
| Notification | Task digest for 22 November 2026 |
| Delivery key | `task-digest:2026-11-22` |
| Database status | `sent` |
| Attempts | `1` |
| Recorded send time | `2026-11-22 05:03:03 UTC` = 08:03:03 Africa/Nairobi |
| Last delivery error | None (`last_error` was null) |
| Android display | User confirmed: “it appeared” |
| Tap/navigation | Not tested; user cleared the notification shade before tapping |

This confirms the Production dispatcher, Web Push send, and Android
notification display path for a task digest. It does not, by itself,
prove every category or tap destination.

## 5. Existing device preferences at last inspection

The inspected device subscription was enabled and stored timezone
`Africa/Nairobi`. Its current saved choices were:

| Setting | Saved value |
|---|---|
| Device enabled | Yes |
| Other app-calendar events | Enabled |
| Google Calendar (read-only) | Enabled |
| Tasks and deadlines | Enabled |
| Study Plan | Enabled |
| Class reminders | Enabled |
| Event reminder lead times | 30 and 10 minutes |
| Class reminder lead times | 30 and 10 minutes |
| All-day event time | 08:04 |
| Task digest time | 08:06 |
| Study digest time | 08:02 |

The class-reminders preference shown above is the current setting
for this existing subscription. The locked new-subscription default
remains OFF. Do not overwrite the existing saved preference just to
make it match the default.

## 6. Deduplication behavior already observed

The task digest delivery key is date-specific. The 22 November digest
was sent at the earlier saved time of 08:03. The user later changed
the saved task digest time to 08:06 and did not receive a second
notification that same day.

The database still showed exactly one sent delivery record for
`task-digest:2026-11-22`, with one attempt. A later dispatcher call
skipped the already-claimed candidate. This is expected daily
deduplication, not evidence that the schedule change failed.

Expected next task digest: Monday, 23 November 2026 at 08:06
Africa/Nairobi time, provided qualifying unfinished due/overdue
tasks still exist and the device/category remain enabled.

## 7. Acceptance matrix

| Test | Status | Evidence / next action |
|---|---|---|
| Feature merged to `main` | Verified | PR #11 merged |
| Dispatch auth exemption and route guard | Verified | PR #12 merged; unauthenticated request returned 401 |
| Authenticated Production dispatch | Verified | HTTP 200 response |
| Vercel protection bypass for scheduler | Verified | Scheduled requests reached Production dispatcher |
| Supabase cron active | Verified | Active every-minute job; recent runs succeeded |
| Real task digest delivery | Verified | User confirmed Android notification appeared |
| Daily task-digest deduplication | Verified | One date-keyed sent record; later duplicate skipped |
| Notification tap opens `/calendar` | Pending | Test with next genuine task digest or calendar event reminder |
| Timed app-calendar event at 30 minutes | Pending | User will create a temporary event on 23 November |
| Timed app-calendar event at 10 minutes | Pending | Keep event long enough to receive both configured reminders |
| All-day app-calendar event | Pending | Verify at saved local all-day reminder time |
| Class reminders enabled/disabled independently | Pending | Existing preference is ON; test category behavior without altering the default contract |
| Google Calendar read-only reminder | Pending | Requires an eligible connected event |
| Unfinished Study Plan digest | Pending | Requires a saved current-day plan with unfinished sections |
| New-subscription class default OFF | Pending end-to-end verification | Do not infer from the existing device row |
| Concurrent/overlapping dispatcher claims | Pending explicit test | No concurrency stress test recorded yet |
| Timezone edge cases / DST | Partially covered | Nairobi local-time scheduling used for the real task digest; broader DST cases pending |
| Permission denied behavior | Pending | Test only on a suitable test device or with user approval |
| Expired endpoint cleanup and delivery failures | Pending | No expired endpoint or failure scenario deliberately induced |

## 8. Next action

The user plans to test on Monday, 23 November 2026.

1. Leave the notification shade open/available when the next genuine
   task digest is due at 08:06 Nairobi time. If it arrives, tap it and
   verify it opens `/calendar`.
2. In the app Calendar, create a temporary event sufficiently far in
   the future to observe both the 30-minute and 10-minute reminders.
3. Tap a reminder and verify it opens `/calendar`.
4. Delete the temporary event after the test.
5. Report the actual arrival and tap outcomes. Update this status,
   the master handoff and the decision log with the observed result.

Do not delete delivery rows, reset claims, alter production user data,
or create an event on the user's behalf to manufacture another
notification. The user is performing the event test.

## 9. Security and operational notes

- Never print or document VAPID private keys, dispatcher secrets,
  Vercel bypass secrets, subscription endpoints, or auth keys.
- Do not disable the active cron job merely to pause a test; use the
  device's category settings only when the user asks to change them.
- Do not repeat a same-day daily digest by removing its deduplication
  claim.
- Production release and one successful live delivery are not a
  substitute for the remaining category and failure-mode tests.
