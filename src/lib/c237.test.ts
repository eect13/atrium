import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("C237 F1: flag off + calendars but nothing in range → just 'No events' (no helper, no button); flag on keeps the helper", () => {
  const v = read("src/components/views/calendar-view.tsx");
  assert.match(v, /\) : !features\.googleCalendar \? \(\n\s*\/\/[^\n]*\n\s*<p className="text-sm text-muted-foreground">No events<\/p>\n\s*\) : \(\n\s*<p className="text-sm text-muted-foreground">\n\s*No events yet\. Use the command bar/);
});

test("C237 N1: flag off → no duplicate 'Calendars' h3; list section named by the visible sheet title", () => {
  const s = read("src/components/calendar/calendar-accounts-sheet.tsx");
  assert.doesNotMatch(s, /sr-only/);
  assert.match(s, /\{labelledBy \? null : <h3 className="text-sm font-semibold">\{title\}<\/h3>\}/);
  assert.match(s, /aria-labelledby=\{labelledBy\}/);
  assert.match(s, /\{g \? "Calendar accounts" : <span id=\{titleId\}>Calendars<\/span>\}/);
  assert.match(s, /labelledBy=\{g \? undefined : titleId\}/);
  assert.match(s, /const AddrHeading = g \? "h4" : "h3";/, "heading order h2 → h3 kept when off");
});
