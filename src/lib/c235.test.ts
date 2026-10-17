import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { features } from "./features.ts";
import { visibleCalEvents } from "./google-cal.ts";
import { calendarsSummary } from "./calendar/calendars-summary.ts";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const ON = process.env.VITE_GOOGLE_CALENDAR === "true";

test("C235 flag: features.googleCalendar follows VITE_GOOGLE_CALENDAR, default off", () => {
  assert.equal(features.googleCalendar, ON);
  assert.match(read("src/lib/features.ts"), /googleCalendar: env\.VITE_GOOGLE_CALENDAR === "true"/);
  // One gate: nothing outside features.ts reads the env var.
  for (const f of ["src/lib/calendar/accounts.ts", "src/lib/google-cal.ts", "src/components/views/calendar-view.tsx", "src/components/views/options-view.tsx", "src/components/calendar/calendar-accounts-sheet.tsx", "src/components/calendar/calendar-toolbar.tsx", "src/components/calendar-tiles.tsx", "src/components/widgets.tsx", "src/components/atrium-app.tsx"]) {
    assert.doesNotMatch(read(f), /VITE_GOOGLE_CALENDAR/, f);
    assert.match(read(f), /features\.googleCalendar/, `${f} is gated`);
  }
});

test("C235 off: cached Google events are hidden (not deleted); on: unchanged", () => {
  const events = [
    { id: "g1", source: "google", calId: "mine" },
    { id: "i1", source: "ics", srcId: "x" },
    { id: "l1", source: "local" },
  ];
  assert.deepEqual(visibleCalEvents(events, [], "mine", false).map((e) => e.id), ["i1", "l1"]);
  assert.equal(events.length, 3, "the stored array is not touched");
  assert.deepEqual(visibleCalEvents(events, [], "mine", true).map((e) => e.id), ["g1", "i1", "l1"]);
  assert.deepEqual(visibleCalEvents(events, []).map((e) => e.id), ON ? ["g1", "i1", "l1"] : ["i1", "l1"]);
});

test("C235 off: status/sync return before any request; new events default to Atrium", () => {
  const a = read("src/lib/calendar/accounts.ts");
  assert.match(a, /export async function refreshStatus\(\): Promise<ConnStatus> \{\n[^\n]*\n {2}if \(!features\.googleCalendar\) return \{ state: "disconnected" \};\n {2}const c = await client\(\);/);
  assert.match(a, /export function syncNow\(\): Promise<void> \{\n {2}if \(!features\.googleCalendar\) return Promise\.resolve\(\);/);
  assert.match(a, /export function defaultEventTarget\(writable: GCalDesk\[\], pref = get\(\)\.newEventsTo\) \{\n {2}if \(!features\.googleCalendar\) return "local";/);
});

test("C235 move-ups: menu, toolbar, sheet, Options and empty states (Form 234 §3)", () => {
  const tb = read("src/components/calendar/calendar-toolbar.tsx");
  for (const s of ['"Import calendar…"', '"Add by address…"', '"Calendars…"']) assert.ok(tb.includes(s), s);
  const sh = read("src/components/calendar/calendar-accounts-sheet.tsx");
  assert.match(sh, /\{g \? "Calendar accounts" : "Calendars"\}/);
  assert.match(sh, /title=\{g \? "Other calendars" : "Calendars"\} hint=\{g \? "Read-only\. Edit these where they come from\." : undefined\}/);
  assert.match(sh, /\{g \? "Import ICS" : "Import calendar…"\}/);
  assert.match(sh, /Treat it like a password/, "Card 168 safety copy kept");
  assert.match(sh, /type="password"/);
  const o = read("src/components/views/options-view.tsx");
  assert.match(o, /if \(!features\.googleCalendar\) return <CalendarsOptionsCard \/>;/);
  assert.match(o, /under Calendar › Calendars\.<\/p>/);
  assert.match(read("src/components/widgets.tsx"), /: "Nothing today\."/);
  assert.match(read("src/components/views/calendar-view.tsx"), /No events<\/p>/);
  assert.equal(calendarsSummary([], String), "None yet");
  assert.equal(
    calendarsSummary([{ kind: "ical", refreshedAt: "2026-10-17T06:02:00Z" }, { kind: "ical", refreshedAt: "2026-10-17T05:00:00Z" }, { kind: "ics" }], () => "14:02"),
    "2 by address · 1 imported · refreshed 14:02",
  );
});

test("C235 docs: SETUP.md documents VITE_GOOGLE_CALENDAR", () => {
  assert.match(read("docs/SETUP.md"), /VITE_GOOGLE_CALENDAR/);
});
