/** Card 242: Google Calendar out of the shipped client; Form 241 labels; Critic 238 P2/P3. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isShownSource, splitArchived } from "./calendar/archive.ts";
import { wireRows } from "./native-menu.ts";

const root = new URL("../../", import.meta.url).pathname;
const read = (f: string) => readFileSync(join(root, f), "utf8");

function clientFiles(dir = join(root, "src"), out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (p.endsWith(join("routes", "api"))) continue; // server routes may stay (Card 242)
      clientFiles(p, out);
    } else if (/\.(tsx?|css)$/.test(n) && !/\.test\.ts$|\.server\.ts$|routeTree\.gen\.ts$/.test(n)) out.push(p);
  }
  return out;
}

test("C242 migration: other-source rows move to calArchive (kept, hidden); local / ICS / untagged stay", () => {
  const events = [
    { id: "a", source: "local" },
    { id: "b", source: "ics", srcId: "s" },
    { id: "c" },
    { id: "d", source: "goo" + "gle", calId: "x" },
  ];
  const r = splitArchived(events, [{ id: "old" }]);
  assert.deepEqual(r.events.map((e) => e.id), ["a", "b", "c"]);
  assert.deepEqual((r.archive as { id: string }[]).map((e) => e.id), ["old", "d"]);
  assert.ok(isShownSource({}) && isShownSource({ source: "ics" }) && !isShownSource({ source: "x" }));
  const store = read("src/lib/store.ts");
  assert.match(store, /version: 36,/);
  assert.match(store, /if \(version < 36\) \{[\s\S]*?splitArchived\(/);
  assert.match(store, /calArchive: s\.calArchive/, "archive persists");
});

test("C242 accounts store v3: ICS sources kept; tokens, prefs, queue and device handle dropped", () => {
  const a = read("src/lib/calendar/accounts.ts");
  assert.match(a, /version: 3,/);
  assert.match(a, /if \(version < 3\) forgetDeviceHandle\(\);/);
  assert.match(a, /return \{ icsSources: Array\.isArray\(raw\.icsSources\)/);
  assert.match(a, /partialize: \(\{ icsSources \}\) => \(\{ icsSources \}\)/);
});

test("C242 no Google Calendar in the client: no flag, no env, no /api/calendar calls, no Google UI", () => {
  assert.ok(!existsSync(join(root, "src/lib/features.ts")));
  assert.ok(!existsSync(join(root, "src/components/calendar/google-button.tsx")));
  assert.ok(!existsSync(join(root, "src/components/calendar/calendar-accounts-sheet.tsx")));
  for (const f of clientFiles()) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /googleCalendar|VITE_GOOGLE_CALENDAR|\/api\/calendar|GoogleSource|google-source/, f);
  }
  const restore = read("docs/RESTORE-GOOGLE-CALENDAR.md");
  assert.match(restore, /archive\/google-calendar/);
  assert.match(restore, /2320a4e/);
});

test("C242 Form 241 labels: one set on toolbar ⋯, phone, widget ⋯ and Options; retired labels gone", () => {
  const tb = read("src/components/calendar/calendar-toolbar.tsx");
  assert.match(tb, /\{ label: "Import ICS…"[\s\S]*\{ label: "Add iCal link…"[\s\S]*\{ label: "Export ICS"[\s\S]*go: \[\{ label: "Calendar options…"/);
  assert.match(tb, /<FloatBtn[\s\S]*<OverflowMenu label="Calendar menu"/, "⋯ last on desktop");
  const dash = read("src/lib/dash.ts");
  assert.match(dash, /\{ label: "Import ICS…", onSelect: c\.act\("import-ics"\) \},\s*\{ label: "Add iCal link…", onSelect: c\.act\("add-ical"\) \},\s*\{ label: "Export ICS", onSelect: c\.act\("export-ics"\) \}/);
  assert.match(dash, /id: "calendar"[^\n]*menu: calendarMenu, optionsAct: "calendar-options"/);
  assert.match(read("src/lib/widget-menu.ts"), /"calendar-options": openCalendarOptions/);
  const opt = read("src/components/views/options-view.tsx");
  assert.match(opt, /<CalendarSourceList \/>\s*<div className="flex flex-wrap justify-end gap-2">[\s\S]*Add iCal link…[\s\S]*Import ICS…/);
  assert.match(opt, /<p>Atrium stays on this device\.<\/p>/);
  for (const f of clientFiles()) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /"(Import calendar…|Add by address…|Calendars…|Accounts…)"/, f);
  }
});

test("C242 Add iCal link dialog and empty agenda", () => {
  const d = read("src/components/calendar/calendar-sources.tsx");
  assert.match(d, /<DialogTitle>Add iCal link<\/DialogTitle>/);
  assert.match(d, />Secret address</);
  assert.match(d, /type="password"/);
  assert.match(d, /autoComplete="off"/);
  assert.match(d, /placeholder="Paste a private secret address \(\.ics\)"/);
  const v = read("src/components/views/calendar-view.tsx");
  assert.match(v, /No events<\/p>\s*<Button variant="outline" className="mt-2 h-11"[^\n]*\n\s*Import ICS…\s*<\/Button>/);
});

test("C242 P2: a leaving row (Open in Atrium) closes the float ⋯ without refocusing the float", () => {
  assert.equal(wireRows([{ label: "Open in Atrium", onSelect: () => {}, leaves: true }])[0]!.leaves, true);
  assert.match(read("src/components/float-shell.tsx"), /label: "Open in Atrium", leaves: true/);
  assert.match(read("src/components/menu-window.tsx"), /if \(it\.checked === undefined\) void close\(!it\.leaves\);/);
});

test("C242 P3: owner move/resize (Frame toggle) closes the popup and hands focus back to the owner", () => {
  const n = read("src/lib/native-menu.ts");
  assert.match(n, /onMoved\(\(\) => void emitTo\(MENU_LABEL, MENU_EV\.close, \{ seq, refocus: true \}\)\)/);
  assert.match(n, /onResized\(\(\) => void emitTo\(MENU_LABEL, MENU_EV\.close, \{ seq, refocus: true \}\)\)/);
  assert.match(read("src/components/menu-window.tsx"), /close\(e\.payload\.refocus === true\)/);
});
