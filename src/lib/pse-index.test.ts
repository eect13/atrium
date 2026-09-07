import assert from "node:assert/strict";
import { test } from "node:test";
import { BLUECHIPS } from "./market-board.ts";
import { parsePseWikitext } from "./pse-index.ts";

const SAMPLE = `
== Current components ==
{| class="wikitable"
|-
| {{Pse|BDO}} || [[BDO Unibank]]
|-
| {{Pse|MYNLD}} || [[Maynilad Water Services|Maynilad]]
|-
| {{Pse|PLUS}} || [[DigiPlus]]
|-
| {{Pse|AC}} || [[Ayala Corporation|Ayala Corp]]
|-
| {{Pse|SM}} || [[SM Investments]]
|}
== Former components ==
{| class="wikitable"
|-
| {{Pse|IMI}} || Integrated Micro-Electronics
|-
| {{Pse|CNVRG}} || Converge
|}
`;

test("parsePseWikitext reads Current components only", () => {
  const rows = parsePseWikitext(SAMPLE);
  const ticks = rows.map((r) => r.ticker);
  assert.deepEqual(ticks, ["BDO", "MYNLD", "PLUS", "AC", "SM"]);
  assert.equal(ticks.includes("IMI"), false);
  assert.equal(ticks.includes("CNVRG"), false);
  assert.equal(rows.find((r) => r.ticker === "MYNLD")?.name, "Maynilad");
});

test("seed bluechips is the official 30 without IMI", () => {
  assert.equal(BLUECHIPS.size, 30);
  assert.equal(BLUECHIPS.has("IMI"), false);
  assert.equal(BLUECHIPS.has("CNVRG"), false);
  assert.equal(BLUECHIPS.has("MYNLD"), true);
  assert.equal(BLUECHIPS.has("PLUS"), true);
  assert.equal(BLUECHIPS.has("BDO"), true);
});
