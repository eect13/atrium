import assert from "node:assert/strict";
import { test } from "node:test";
import { fromManila } from "./format.ts";
import { looksLikeWhen, parseWhen } from "./parse-when.ts";

const fridayNoon = fromManila(2026, 9, 4, 12);

test("keeps counts out of the clock and strips leftover at/on", () => {
  const ev = parseWhen("2 tickets Friday 7pm", fridayNoon);
  assert.equal(ev.title, "2 tickets");
  assert.equal(new Date(ev.start).toISOString(), fromManila(2026, 9, 4, 19).toISOString());
});

test("Lunch on Friday at 1pm becomes Lunch at 13:00", () => {
  const ev = parseWhen("Lunch on Friday at 1pm", fridayNoon);
  assert.equal(ev.title, "Lunch");
  assert.equal(new Date(ev.start).toISOString(), fromManila(2026, 9, 4, 13).toISOString());
});

test("Friday on Friday stays today unless next", () => {
  const same = parseWhen("Standup Friday 9am", fridayNoon);
  assert.equal(new Date(same.start).toISOString(), fromManila(2026, 9, 4, 9).toISOString());
  const next = parseWhen("Standup next Friday 9am", fridayNoon);
  assert.equal(new Date(next.start).toISOString(), fromManila(2026, 9, 11, 9).toISOString());
});

test("looksLikeWhen does not treat a ticker as an event", () => {
  assert.equal(looksLikeWhen("BDO"), false);
  assert.equal(looksLikeWhen("Lunch Friday 1pm"), true);
  assert.equal(looksLikeWhen("event: dentist"), true);
});
