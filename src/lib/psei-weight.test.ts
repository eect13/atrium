import assert from "node:assert/strict";
import { test } from "node:test";
import { BLUECHIPS } from "./market-board.ts";
import { concentration, FMETF_WEIGHTS, sleeveWeight, topWeights, weightTake } from "./psei-weight.ts";

test("FMETF table covers the official 30 and sums to about 100", () => {
  assert.equal(FMETF_WEIGHTS.length, 30);
  const sum = FMETF_WEIGHTS.reduce((s, w) => s + w.psei, 0);
  assert.ok(sum > 99.5 && sum < 100.6, `sum ${sum}`);
  for (const w of FMETF_WEIGHTS) assert.equal(BLUECHIPS.has(w.ticker), true, w.ticker);
});

test("ICT concentration and sleeves match the 16 Sep 2026 file", () => {
  const c = concentration();
  assert.equal(c.ict, 26.83);
  assert.ok(c.top5 > 55 && c.top5 < 56);
  assert.equal(sleeveWeight(["SM", "SMPH"]), 13.62);
  assert.ok(c.banks > 21 && c.banks < 22);
  assert.equal(topWeights(1)[0]?.ticker, "ICT");
});

test("weightTake reads as a methodology note, not a target", () => {
  const text = weightTake().join(" ");
  assert.match(text, /free-float/i);
  assert.match(text, /26\.83%/);
  assert.match(text, /CN-2026-0033/);
  assert.match(text, /not a target/i);
  assert.doesNotMatch(text, /buy|sell|price target/i);
});
