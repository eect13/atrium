import assert from "node:assert/strict";
import { test } from "node:test";
import { CAL_VIEWS, CAL_VIEW_LABEL, DEFAULT_CAL_VIEW, calViewFor, normalizeCalViews, pillBars } from "./cal-view.ts";

test("cal view: Today | Week | Month, default Month", () => {
  assert.deepEqual(CAL_VIEWS.map((v) => CAL_VIEW_LABEL[v]), ["Today", "Week", "Month"]);
  assert.equal(DEFAULT_CAL_VIEW, "month");
  assert.equal(calViewFor({}, "dash-calendar"), "month");
  assert.equal(calViewFor(undefined, "x"), "month");
});

test("cal view: remembered per widget id", () => {
  const map = { "dash-calendar": "week" as const, "float-calendar": "today" as const };
  assert.equal(calViewFor(map, "dash-calendar"), "week");
  assert.equal(calViewFor(map, "float-calendar"), "today");
  assert.equal(calViewFor(map, "page-day"), "month");
});

test("normalizeCalViews drops junk", () => {
  assert.deepEqual(normalizeCalViews({ a: "week", b: "auto", c: 3, "": "month" }), { a: "week" });
  assert.deepEqual(normalizeCalViews(null), {});
  assert.deepEqual(normalizeCalViews(["week"]), {});
});

test("pillBars caps with +N overflow", () => {
  assert.deepEqual(pillBars(0, 3), { bars: 0, more: 0 });
  assert.deepEqual(pillBars(3, 3), { bars: 3, more: 0 });
  assert.deepEqual(pillBars(4, 3), { bars: 2, more: 2 });
  assert.deepEqual(pillBars(9, 2), { bars: 1, more: 8 });
});
