import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSparkRange, pointsToPath, sessionSpark } from "./sparks.ts";

test("normalizeSparkRange defaults to 3m", () => {
  assert.equal(normalizeSparkRange(undefined), "3m");
  assert.equal(normalizeSparkRange("1w"), "1w");
  assert.equal(normalizeSparkRange("nope"), "3m");
});

test("sessionSpark is a curve, not a 2-point line", () => {
  const pts = sessionSpark(110, 10, "BDO:3m:2026-09-07", 36);
  assert.equal(pts.length, 36);
  assert.ok(Math.abs((pts[0] ?? 0) - 100) < 1e-6);
  assert.equal(pts[pts.length - 1], 110);
  const unique = new Set(pts.map((n) => n.toFixed(4)));
  assert.ok(unique.size > 4, "must wobble, not collinear");
});

test("sessionSpark is stable for the same seed", () => {
  const a = sessionSpark(50, -2, "TEL:1d", 20);
  const b = sessionSpark(50, -2, "TEL:1d", 20);
  assert.deepEqual(a, b);
});

test("pointsToPath uses cubics for a curve", () => {
  const pts = sessionSpark(120, 1.4, "BDO", 16);
  const { line, area } = pointsToPath(pts, 120, 36);
  assert.match(line, /^M/);
  assert.match(line, /C/);
  assert.match(area, /Z$/);
});
