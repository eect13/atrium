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
