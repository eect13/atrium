import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DASH_CARDS,
  cycleDashSpan,
  dashSpanClass,
  moveDash,
  normalizeDash,
  normalizeDashSpan,
  shiftDash,
} from "./dash.ts";

test("normalizeDash fills missing cards and drops junk", () => {
  assert.deepEqual(normalizeDash(["news", "bogus", "weather"]), [
    "news",
    "weather",
    "agenda",
    "quote",
    "finance",
    "notes",
    "calendar",
    "clock",
  ]);
  assert.deepEqual(normalizeDash(undefined), [...DASH_CARDS]);
});

test("moveDash reorders by dropping on a target", () => {
  const next = moveDash(["weather", "agenda", "quote"], "quote", "weather");
  assert.deepEqual(next, ["quote", "weather", "agenda"]);
});

test("shiftDash steps one slot", () => {
  const order = ["weather", "agenda", "quote"] as const;
  assert.deepEqual(shiftDash([...order], "weather", 1), ["agenda", "weather", "quote"]);
  assert.deepEqual(shiftDash([...order], "weather", -1), [...order]);
});

test("cycleDashSpan walks the scale", () => {
  assert.equal(cycleDashSpan(3), 4);
  assert.equal(cycleDashSpan(12), 3);
  assert.equal(cycleDashSpan(undefined), 3);
});

test("normalizeDashSpan keeps known spans and drops junk", () => {
  assert.deepEqual(normalizeDashSpan({ weather: 8, bogus: 4, news: 99, finance: "nope" }), { weather: 8 });
  assert.deepEqual(normalizeDashSpan(undefined), {});
});

test("dashSpanClass uses override then default", () => {
  assert.equal(dashSpanClass("quote"), "lg:col-span-3");
  assert.equal(dashSpanClass("quote", 8), "lg:col-span-8");
  assert.equal(dashSpanClass("quote", 99), "lg:col-span-3");
});

test("Feed rename: dash + float labels say Feed, Quotes plural", async () => {
  const { DASH_LABEL } = await import("./dash.ts");
  const { WIDGET_LABEL } = await import("./types.ts");
  assert.equal(DASH_LABEL.news, "Feed");
  assert.equal(WIDGET_LABEL.news, "Feed");
  assert.equal(WIDGET_LABEL.quote, "Quotes");
});

test("registry: clock + calendar join the existing grid, appended after saved order", async () => {
  const { DASH_LABEL, DASH_SPAN_N } = await import("./dash.ts");
  const { WIDGET_LABEL } = await import("./types.ts");
  const saved = ["weather", "agenda", "quote", "finance", "notes", "news"];
  assert.deepEqual(normalizeDash(saved).slice(0, 6), saved);
  assert.deepEqual(normalizeDash(saved).slice(6), ["calendar", "clock"]);
  assert.equal(DASH_LABEL.clock, WIDGET_LABEL.clock);
  assert.equal(DASH_LABEL.calendar, WIDGET_LABEL.calendar);
  assert.equal(DASH_LABEL.agenda, WIDGET_LABEL.agenda);
  assert.equal(DASH_LABEL.weather, "Today");
  assert.equal(DASH_SPAN_N.weather, 5);
  assert.equal(DASH_SPAN_N.calendar + DASH_SPAN_N.clock, 12);
});

test("registry: removed cards drop out of saved orders", () => {
  assert.ok(!normalizeDash(["gone", "clock"]).includes("gone" as never));
});

test("dashVisible follows module toggles", async () => {
  const { dashVisible } = await import("./dash.ts");
  const all = normalizeDash(undefined);
  assert.deepEqual(dashVisible(all, { finance: false, notes: false, news: false, quotes: false, weather: false }), [
    "agenda",
    "calendar",
    "clock",
  ]);
  assert.deepEqual(dashVisible(all, { finance: true, notes: true, news: true }), all);
});
