import assert from "node:assert/strict";
import { test } from "node:test";
import { DASH_CARDS, moveDash, normalizeDash, shiftDash } from "./dash.ts";

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
