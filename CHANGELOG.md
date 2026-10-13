# Changelog

All notable changes to Atrium. Versions match `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `src/lib/version.ts`.

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
