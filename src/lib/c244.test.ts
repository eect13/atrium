/** Card 244 (Form 243): F1 source badges + announced Lock; S1 Calendar float ⋯ "Calendar options…". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("C244 F1: badges 'iCal link' / 'ICS file'; meta kept; Lock announced as Read-only", () => {
  const s = read("src/components/calendar/calendar-sources.tsx");
  assert.match(s, /badge=\{s\.kind === "ical" \? "iCal link" : "ICS file"\}/);
  assert.doesNotMatch(s, /Read-only · (Secret address|ICS)/);
  assert.match(s, /`Refreshed \$\{fmtTime\(s\.refreshedAt\)\}`/);
  assert.match(s, /`Imported \$\{new Date\(s\.importedAt\)/);
  assert.match(s, /<Lock className="size-3" role="img" aria-label="Read-only" \/>/);
  assert.match(s, /\{badge \?\? "Read-only"\}/, "default badge stays");
});

test("C244 S1: Calendar float go = Open in Atrium, then Calendar options… (leaves, desk_focus_main path)", () => {
  const f = read("src/components/float-shell.tsx");
  assert.match(f, /go: \[goHome\(FLOAT_VIEW\[win\.kind\]\), \.\.\.\(win\.kind === "calendar" \? \[calendarOptionsRow\] : \[\]\)\]/);
  assert.match(f, /calendarOptionsRow = \{ label: "Calendar options…", leaves: true, onSelect: \(\) => void openInAtrium\("options", \(\) => openCalendarOptions\(\), CALENDAR_OPTIONS_ID\) \}/);
  assert.match(f, /label: "Open in Atrium", leaves: true/, "P2 fix intact");
  const o = read("src/lib/open-in-atrium.ts");
  assert.match(o, /await invoke\("desk_focus_main"\);\s*await emitTo\("main", OPEN_VIEW_EVENT, section \? \(\{ view, section \} satisfies OpenView\) : view\);/);
  assert.match(o, /typeof e\.payload === "string" \? onView\(e\.payload\) : onView\(e\.payload\.view, e\.payload\.section\)/);
  const app = read("src/components/atrium-app.tsx");
  assert.match(app, /if \(section === CALENDAR_OPTIONS_ID\) return openCalendarOptions\(\);/);
  assert.match(read("src/components/menu-window.tsx"), /void close\(!it\.leaves\)/);
});
