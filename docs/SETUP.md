# Atrium setup (Google Calendar sync)

Names only. Never put values in code, commits, chat or screenshots.

## Server environment (Vercel project "atrium", or `.env.local` for `npm run dev`)

| Name | Required | What it is |
|---|---|---|
| `GOOGLE_CLIENT_ID` | yes | OAuth client ID (Google Cloud › APIs & Services › Credentials, type "Web application") |
| `GOOGLE_CLIENT_SECRET` | yes | That client's secret. Server only. |
| `CALENDAR_TOKEN_ENC_KEY` | yes | 32 random bytes (base64, base64url or hex). Seals Google refresh tokens at rest (AES-256-GCM). |
| `DATABASE_URL` | yes | Postgres connection string (Neon). |
| `CALENDAR_PUBLIC_ORIGIN` | yes | The public https origin, no path. Production: `https://atrium-swart-seven.vercel.app`. `http://localhost:8080` only in development. No fallback: when unset or wrong, sign-in is off (fails closed). |
| `VITE_CALENDAR_API_ORIGIN` | no | Build-time: where the desktop/Android app reaches the calendar API. Defaults to the production origin. Read by both the Vite build and the Rust build. |

`/api/calendar/status` lists any missing names (never values) when the server isn't configured.

## Database migrations (run in order, once per database)

1. `migrations/0002_calendar_connections.sql`
2. `migrations/0003_calendar_sessions.sql` (sessions + desktop hand-off)
3. `migrations/0004_calendar_claim_limit.sql` (per-IP limit on wrong hand-off codes; Card 174)

## Google Cloud OAuth client

- Authorised redirect URI: `{CALENDAR_PUBLIC_ORIGIN}/api/calendar/oauth/callback`, for example `https://atrium-swart-seven.vercel.app/api/calendar/oauth/callback`. Add `http://localhost:8080/api/calendar/oauth/callback` for local development.
- Scopes Atrium asks for: `openid`, `email`, Calendar events (`calendar.events`), calendar list (read-only).
- OAuth consent screen › Publishing status: set **In production** before people outside the test-user list sign in (Scout 169). Calendar scopes are sensitive, so Google may ask for verification.

## Client IP and rate limits

Rate limits key on `x-vercel-forwarded-for`, then `x-real-ip`. Vercel sets these at its edge and overwrites client `X-Forwarded-For` (https://vercel.com/docs/headers/request-headers). The leftmost `X-Forwarded-For` is used only off Vercel. If a CDN is ever put in front of Vercel, all users will share the CDN's IP. Revisit then.

## Desktop (Tauri)

- The refresh handle is claimed and rotated in Rust and never given to the WebView. On Windows it is sealed with DPAPI (current user) in the app's local data folder (`calendar-session.bin`).
- The CSP has no `'unsafe-eval'`.

## Calendar end-to-end check without Google (Card 177)

Runs the whole Google Calendar connection against a fake Google, with no network and no real keys:

```
npm install
npm run e2e:calendar
```

What it proves, step by step (it stops at the first failure and exits 1):

1. The app starts a sign-in hand-off (PKCE).
2. The browser goes to `/api/calendar/connect?hid=…` and gets sent to Google's consent page (faked).
3. The callback page shows the 6-character sign-in code and no Google tokens.
4. A wrong code gets "That code doesn't match…"; the right code is claimed. The claim reply is printed with the handles redacted. The refresh handle goes into the sealed session file and the app's web view only gets the 1-hour access handle. Claiming again says the code was already used.
5. Status, calendars and events load through the real app client.
6. The guest prompts and the "Finish syncing before deleting…" block behave as the app shows them.
7. Moving an event to another calendar uses Google's `events.move` (same event, guests and Meet kept, nobody emailed).
8. "Send cancellation" sends `sendUpdates=all` on both the shorten-the-series PATCH and the DELETE.

The real Windows sealed file (`calendar-session.bin`, DPAPI) is checked by the Rust tests:

```
cd src-tauri
cargo test --lib
```

On Windows this runs the DPAPI seal/unseal round trip; on other systems the same tests run against the plain-file fallback.

## Android builds on Windows (Card 197)

`tauri android build` links the compiled Rust library (`.so`) into `src-tauri/gen/android/app/src/main/jniLibs/` with a **symlink**. On Windows, creating symlinks needs **Developer Mode** (Settings → System → For developers → Developer Mode: On) or an elevated shell. Without it, the Rust step compiles and then fails while creating the link, and Gradle never packages the library.

- Turn Developer Mode on once, open a new terminal, and rebuild.
- Workaround if you can't: copy the `.so` from `src-tauri/target/<triple>/debug|release/` into the matching `jniLibs/<abi>/` folder, then run `gradlew assemble<Abi>Debug` in `src-tauri/gen/android`.
- macOS and Linux need nothing extra.

Calendar on Android needs Android System WebView 117+ before Card 197; from Card 197 the app targets Chrome/WebView 110 (TypeScript `lib` is ES2023, so newer built-ins such as `Object.groupBy` fail typecheck; use `src/lib/group-by.ts`).
