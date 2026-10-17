# Restoring Google Calendar (removed in Cards 242, 246, 248)

Google Calendar sign-in and two-way sync were removed from the shipped Atrium app (web, exe, APK)
in Card 242, from Rust in Card 246 and from the web server in Card 248. The last complete version
(client + server + Rust) is preserved on GitHub:

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

## What was removed from the server (Card 248)

- Route `src/routes/api/calendar/$.ts` (`/api/calendar/*`: `status`, `connect`, `oauth/callback`,
  `calendars`, `events…`, `handoff/start|claim`, `session/refresh`, `signout`, `disconnect`), and its
  entry in the generated `src/routeTree.gen.ts`.
- `src/lib/calendar/api.server.ts`, `config.server.ts`, `crypto.server.ts`, `oauth.server.ts`,
  `store.server.ts`, `google-api.server.ts`, and `calendar-server.test.ts` (out of `test:src`).
- No dependency was removed: `pg`, `@electric-sql/pglite`, `jose` and `kysely` are still used by
  `src/lib/db.ts` / auth / `scripts/migrate.mjs`. Google OAuth was plain `fetch`, Node `crypto` only.

### Server env names (read only by the removed `config.server.ts`)

| Name | Required | What it is |
|---|---|---|
| `GOOGLE_CLIENT_ID` | yes | OAuth client ID (Google Cloud › APIs & Services › Credentials, type "Web application") |
| `GOOGLE_CLIENT_SECRET` | yes | That client's secret. Server only. |
| `CALENDAR_TOKEN_ENC_KEY` | yes | 32 random bytes (base64, base64url or hex). Seals Google refresh tokens at rest (AES-256-GCM). |
| `DATABASE_URL` | yes | Postgres connection string (Neon). Still used by auth / db. |
| `CALENDAR_PUBLIC_ORIGIN` | yes | Public https origin, no path (production `https://atrium-swart-seven.vercel.app`; `http://localhost:8080` in development). No fallback: unset or wrong → sign-in off. |
| `VITE_CALENDAR_API_ORIGIN` | no | Build-time origin the desktop/Android app calls (Vite + Rust builds). |

Card 248 did not touch the Vercel env or the Neon database; any of these still set there are unread.

### Migrations

- `0002_calendar_connections.sql`, `0003_calendar_sessions.sql` (sessions + desktop hand-off),
  `0004_calendar_claim_limit.sql` (per-IP wrong-code limit, Card 174) moved from `migrations/` to
  `docs/archive/google-calendar/migrations/`, so neither `scripts/migrate.mjs` (deploy) nor the
  PGLite glob in `src/lib/db.ts` applies them.
- The tables (`calendar_connection`, `calendar_session`, `calendar_handoff`, `calendar_claim_fail`)
  were **not dropped**; `_migrations` still records the three names on databases that ran them, so
  moving the files back is a no-op there and creates the tables on a fresh database.

### Google Cloud OAuth client

- Authorised redirect URI: `{CALENDAR_PUBLIC_ORIGIN}/api/calendar/oauth/callback` (add
  `http://localhost:8080/api/calendar/oauth/callback` for local development).
- Scopes: `openid`, `email`, `calendar.events`, calendar list read-only. Publishing status
  **In production** before people outside the test-user list sign in; Google may ask for verification.
- Rate limits keyed on `x-vercel-forwarded-for`, then `x-real-ip` (leftmost `X-Forwarded-For` only off
  Vercel). A CDN in front of Vercel would make all users share its IP.

## What stayed

- Rust: only `cal_session_clear` (`src-tauri/src/lib.rs`), which the client calls once (see below).
  Card 246 removed `cal_session_claim` / `cal_session_refresh` / `cal_session_adopt`, the server
  client (`cal_post`, `cal_api_base`), the DPAPI / Android Keystore sealers and the `jni` dependency;
  restore them from `archive/google-calendar` with the client.
- The calendar tables in the database (see Migrations).

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
3. Server: restore only the archived server files from `2320a4e` (this leaves the newer client
   calendar files alone):
   `git checkout 2320a4e -- 'src/routes/api/calendar/$.ts' src/lib/calendar/api.server.ts src/lib/calendar/config.server.ts src/lib/calendar/crypto.server.ts src/lib/calendar/oauth.server.ts src/lib/calendar/store.server.ts src/lib/calendar/google-api.server.ts src/lib/calendar/calendar-server.test.ts`
   then add `src/lib/calendar/calendar-server.test.ts` back to `test:src`; the router plugin regenerates
   `routeTree.gen.ts` on the next build.
4. Migrations: `git mv docs/archive/google-calendar/migrations/*.sql migrations/`.
5. Rust: restore the `cal_session_*` commands, sealers, the `jni` dep and the windows-sys
   `Win32_Security_Cryptography` feature from `2320a4e` (keep `#[cfg_attr(mobile, tauri::mobile_entry_point)]`).
6. Set the env names above (Vercel + Google Cloud redirect URI), then run `npm run e2e:calendar`.
