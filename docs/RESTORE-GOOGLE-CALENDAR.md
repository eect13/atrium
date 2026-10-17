# Restoring Google Calendar (removed in Card 242)

Google Calendar sign-in and two-way sync were removed from the shipped Atrium app (web, exe, APK)
in Card 242. The last complete version is preserved on GitHub:

- Branch: `archive/google-calendar`
- Commit: `2320a4e` (`2320a4ebd5583d86746b88eedddcbd101c3bc1d9`), the `c228/atrium-audit-fixes` tip
  with the Card 235 `VITE_GOOGLE_CALENDAR` flag (default off) and Card 237 fixes.

## What was removed from the client

- `src/lib/features.ts` (`features.googleCalendar`, the only reader of `VITE_GOOGLE_CALENDAR`)
- `src/lib/google-cal.ts`; `src/lib/calendar/` `google-source.ts`, `google-map.ts`,
  `google-status.ts`, `sync.ts`, `session-renew.ts`, `device-secret.ts`, `claim-errors.ts`,
  `move.ts`, `calendars-summary.ts`
- `src/components/calendar/google-button.tsx`, `calendar-accounts-sheet.tsx` (the Calendars /
  Accounts sheet; its iCal rows now live in `calendar-sources.tsx`, unchanged)
- Google branches in `calendar-view.tsx`, `calendar-tiles.tsx`, `options-view.tsx`, `store.ts`,
  `calendar/accounts.ts`, `calendar/series-edit.ts`, `types.ts`
- Tests tied to the removed modules (`google-cal`, `calendar-sync`, `calendar-client`, `c177`,
  `c235`, parts of `c192`/`c197`/`c204`/`c228`/`c237`/`series-edit`) and `scripts/e2e-calendar-mock.ts`
  (`npm run e2e:calendar`). The iCal/ICS assertions from them moved to `calendar/ics-sources.test.ts`.

## What stayed

- Server: `src/routes/api/calendar/$.ts` and `src/lib/calendar/*.server.ts`, `migrations/0002–0004`.
- Rust: only `cal_session_clear` (`src-tauri/src/lib.rs`), which the client calls once (see below).
  Card 246 removed `cal_session_claim` / `cal_session_refresh` / `cal_session_adopt`, the server
  client (`cal_post`, `cal_api_base`), the DPAPI / Android Keystore sealers and the `jni` dependency;
  restore them from `archive/google-calendar` with the client.
- Server env names in `docs/SETUP.md`.

## Data on existing devices

- Desk store `atrium.v1` v36: cached Google events are moved out of `events` into `calArchive`.
  They are kept on the device, never shown, never deleted. The Google lane prefs (`gcalCals`,
  `gcalOff`) are dropped. Local and ICS events are untouched.
- Calendar store `atrium.calendar.v1` v3: keeps `icsSources` only. Dropped: Google email, session,
  access handle, sync tokens, calendar list, queued Google writes, "New events go to". On desktop /
  Android the sealed refresh handle is cleared once via `cal_session_clear`. No server call is made;
  the server-side session simply expires unused.

## To restore

1. `git checkout -b restore-gcal archive/google-calendar` (or cherry-pick from it onto the current line).
2. Re-apply later calendar work on top. A restored client should move `calArchive` rows back into
   `events` (source `"google"`) in a new store migration, and re-add `VITE_GOOGLE_CALENDAR`.
3. Set the server env names in `docs/SETUP.md` and run `npm run e2e:calendar`.
