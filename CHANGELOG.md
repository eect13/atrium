# Changelog

All notable changes to Atrium. Versions match `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `src/lib/version.ts`.

## Unreleased — Card 165 (branch `c165/atrium-cal-topic-sync`, not packed)

### Calendar (Cards 161, 162, 164)
- Month grid: the row owns the height and the card fills it (U1); phone rows use 8px bar slots with 2 bars + "+N" on overflow (U2); singles fill the first free slot of their own cell, 28px date track, whole-cell day button (U6).
- One CalendarToolbar (U3): desktop title · ‹ Today › · view switch · Import ICS · Export · Accounts · New event · Float; phone title + New event + ⋯ (Import ICS, Export, Calendar accounts…, Float), nav row, full-width switch.
- Day view is a day agenda: all-day/span strip, timed rows with a mono time column, now line on today; no embedded month grid or second switch (U5). Widget selected-day bars get a 2px keyline (U4).
- Calendar accounts sheet (Card 164) from the toolbar, the phone ⋯ menu and Options › Calendar: Google (sign in, connecting, connected, sync now, disconnect with confirm), Google calendar picker with Atrium-only colours and show/hide, Other calendars (iCal URL / ICS, read-only, refresh, remove with confirm, subscribe / import), sync banners (failed, expired, offline, read-only access).
- Real Google two-way sync behind a `CalendarSource` interface: Google read + write, ICS / iCal read-only. Tokens stay on the server (refresh tokens sealed with AES-256-GCM in Postgres); the web app uses an httpOnly cookie, desktop signs in in the system browser and claims a one-time hand-off. Incremental sync tokens with a full re-sync on 410; writes use If-Match and queue locally when Google is unreachable.
- Events from read-only calendars open view-only; New event offers only writable calendars, primary first.
- Without the server settings the sheet says Google Calendar isn't set up and lists the missing setting names; nothing is faked. The old connector-gateway "Connect calendar" path is removed.

### Widgets (Card 161 A)
- Clock: 44px mono hero, a 24h day/night band per city with work hours (new `clockPrefs.workHours`, default 09:00–18:00, editable in the Clock tab), work/off/night status, a clock-change notice when one is ≤30 days away, optional shared work hours.
- Calendar: + quick add into the New event dialog, Up next with a minute countdown, 08:00–20:00 free/busy strip with a text summary; an empty day reads "Free".
- Clock and Calendar widgets get a ⋯ options menu (`dashPrefs.widgets`); helper text is off by default.

### Topic Finder (Card 161 A)
- Topic Finder replaces the Resource hub: stories grouped across sources and ranked by value with a why-this list; Following = Feed interests, Saved = the hub (same .md / PDF export), Dismissed kept 30 days with Undo and "Less like this".

### Quotes
- Citation lines that name a reporter or source ("Quoted by Legge") are no longer taken as the author; quote caches move to `atrium.quotes.v2` and the old ones are dropped once.

## 1.2.48 — 2026-10-12

Covers Cards 134–154 on `c134/atrium-clock-tab` (since the 1.2.47 pack at `a76307a`).

### Clock (Cards 134, 139)
- Clock sidebar module after Weather (hideable) and a Clock tab: local time, world-clock cards (drag reorder, confirm remove), city search, 24h switch; Options › World clock links to it. Dashboard widget and Clock float share one zone list (`a76307a`).
- Clock widget option A: list rows, 6 shown plus "+N more in Clock tab" (`1248393`).
- 44px targets for Clock remove-confirm, Dashboard header and Float buttons; whole Options switch row toggles (`1248393`).
- The Clock view persists across reloads (`da5cdc6`).

### Calendar (Cards 140, 147, 149)
- Continuous multi-day bars in the Calendar widget and full Calendar from one shared span layout; spans cross week rows and month edges, Card 122 ICS exclusive ends kept (`c931a48`).
- Timed events of 12 hours or more keep their time range; only true all-day events say "All day" (N2).
- Event Delete and agenda Remove ask first with the shared ConfirmRow (N1).
- Event colour swatches get an input-colour ring, a check when selected and hue names (Lavender, Sage, Banana, Flamingo, Grape); selects use the shared field style.
- Range labels show the year outside the current desk year; phone month shows 6px bars instead of one-letter pills; view segments use `rounded-xl`; empty day reads "Nothing scheduled".

### Form 142 hit areas and shared controls (Card 144)
- `--spacing-hit` (44px) token and hit-area utility; 44px Button, Input and Switch hit areas; shared CloseButton and ConfirmRow (Feed source remove, hub, categories, cities); digest pill, Sources dialog, Hub Save, theme toggle, Notes Float and Windows at 44; taller Float title bars (`b9caf5d`, `b5a4f3b`, `a29d3e9`).
- New `--color-input` token: input and select borders reach 3:1 against cards and fills (Form 149).
- Esc cancels an open confirm first; a second Esc closes the dialog (Form 149).

### Quotes (Cards 144, 147, 148, 149)
- Wikiquote MediaWiki API replaces BrainyQuote as the only live source: daily, topics, author, search; 7-day per-view cache that survives reloads and is never replaced by an empty answer; Refresh rechecks the current view only; 42 built-ins stay as the offline set (`d6a157d`).
- Every Wikiquote quote carries its own attribution on the Quotes page, Dashboard widget and float: Wikiquote page link · CC BY-SA 4.0 link · "excerpt edited" (B1, Scout S1).
- The footer gives the true reason when only built-ins show: filter matched none, Wikiquote didn't answer, or offline (N3).
- Day-seeded order instead of A–Z, "Showing N of M" and Show more (16, or 24 for authors), and a "Search Wikiquote for …" step when a filter finds only built-ins. All adds one rotating live topic per day.
- Requests follow Wikimedia etiquette: versioned User-Agent with an issue-tracker contact, `maxlag=5`, one at a time at least 1 s apart, Retry-After or 5 s doubling backoff (3 tries) before falling back to the cache, gzip on desktop.
- Funny reads Wikiquote's Comedy page; four built-ins re-sourced or re-attributed (Will Durant, Marcus Aurelius, Seneca, Nelson Mandela).

### Finance (Cards 147, 149)
- Transaction Remove (dialog and register), watcher Remove, and Account and Budget Delete all ask first with ConfirmRow (N1, Form 149).
- Quote dialog peer tickers and the Quote widget's Random button are 44px (N4, N6).

### Card 154 (Critic 150, Form 152, Scout 153)
- Quote float: the quote and Random scroll; a pinned 44px footer (top border) keeps "— author" (truncated, tooltip), Wikiquote and CC BY-SA always visible. `QuoteAttribution` has stack and inline layouts (B1).
- Selects get the same focus-visible ring as inputs (B2).
- The Dashboard quote widget and its float show the same session quote; Random in one updates the other. Stored in localStorage per app launch (N9).
- Account cards get a 44px ⋯ menu (Edit, Show/Hide number), shared with Hub cards as `ui/overflow-menu`; Enter on the active card opens Edit, Shift+F10 opens the menu (N11).
- The web build sends `AtriumDesk/1.2.48 (…/issues) Node.js/22 undici` to Wikiquote; desktop keeps `reqwest/0.12` (N10).
- Retry-After also accepts an HTTP-date, and waits are capped at 15 minutes on web and desktop (N12).
- Seven built-in quotes corrected per Scout 153: Einstein re-worded (LIFE 1955); Twain ×2, Buddha, Sun Tzu, Confucius, Gandhi swapped for Wikiquote-sourced lines.

### Tests
- Card 154: session-quote mirror and stale-launch tests; Retry-After seconds, HTTP-date and cap tests (TS and Rust).
- `event-cats.test.ts` import fixed so `test:src` runs under Node strip-types (`737db05`).
