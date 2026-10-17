import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

// Card 242: the flag is gone; F1's "flag off" behaviour is now the only behaviour.
test("C237 F1: calendars but nothing in range → just 'No events' (no helper, no button)", () => {
  const v = read("src/components/views/calendar-view.tsx");
  assert.match(v, /\) : \(\n\s*\/\/[^\n]*\n\s*<p className="text-sm text-muted-foreground">No events<\/p>\n\s*\)\}/);
  assert.doesNotMatch(v, /No events yet\. Use the command bar/);
});
// Card 242: C237 N1 asserted heading structure inside calendar-accounts-sheet.tsx. That sheet is
// removed (Form 241 puts the list inline in Options › Calendar under the card's own title), so
// N1 has nothing left to check; c242.test.ts covers the Options card.
