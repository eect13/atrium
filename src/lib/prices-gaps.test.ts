import assert from "node:assert/strict";
import { test } from "node:test";
import { sourceGaps } from "./source-gaps.ts";

test("a quiet price source is named, not treated as an empty board", () => {
  assert.deepEqual(sourceGaps({ fx: false, pse: false, yahoo: false, crypto: false, screen: false }), []);
  assert.deepEqual(
    sourceGaps({ fx: true, pse: false, yahoo: true, crypto: false, screen: false }),
    ["FX", "Yahoo"],
  );
  assert.deepEqual(
    sourceGaps({ fx: false, pse: true, yahoo: false, crypto: true, screen: true }),
    ["PSE", "Crypto", "Screener"],
  );
});
