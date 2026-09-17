import assert from "node:assert/strict";
import { test } from "node:test";
import { BLUECHIPS } from "./market-board.ts";
import {
  concentration,
  FMETF_WEIGHTS,
  parsePseiWeightTable,
  PSEI_WEIGHTS,
  sleeveWeight,
  tickerFromSecurityName,
  topWeights,
  weightTake,
} from "./psei-weight.ts";

test("FMETF table covers the official 30 and sums to about 100", () => {
  assert.equal(PSEI_WEIGHTS.length, 30);
  assert.equal(FMETF_WEIGHTS.length, 30);
  const sum = PSEI_WEIGHTS.reduce((s, w) => s + w.psei, 0);
  assert.ok(sum > 99.5 && sum < 100.6, `sum ${sum}`);
  for (const w of PSEI_WEIGHTS) assert.equal(BLUECHIPS.has(w.ticker), true, w.ticker);
});

test("ICT concentration and sleeves match the 16 Sep 2026 file", () => {
  const c = concentration();
  assert.equal(c.ict, 26.83);
  assert.ok(c.top5 > 55 && c.top5 < 56);
  assert.equal(sleeveWeight(["SM", "SMPH"]), 13.62);
  assert.ok(c.banks > 21 && c.banks < 22);
  assert.equal(topWeights(1)[0]?.ticker, "ICT");
});

test("weightTake reads as official PSEi weights, not a target", () => {
  const text = weightTake().join(" ");
  assert.match(text, /free-float/i);
  assert.match(text, /official PSEi weights/i);
  assert.match(text, /26\.83%/);
  assert.match(text, /CN-2026-0033/);
  assert.match(text, /not a target/i);
  assert.doesNotMatch(text, /buy|sell|price target|FMETF is the liquid proxy/i);
});

test("parsePseiWeightTable reads the First Metro PSEi weight column", () => {
  const names = [
    "ABOITIZ EQUITY VENTURES, INC.",
    "ACEN CORPORATION",
    "AREIT, INC.",
    "AYALA CORPORATION",
    "AYALA LAND, INC.",
    "BANK OF THE PHILIPPINE ISLANDS",
    "BDO UNIBANK, INC.",
    "CENTURY PACIFIC FOOD, INC.",
    "CHINA BANKING CORPORATION",
    "DIGIPLUS INTERACTIVE CORP.",
    "DMCI HOLDINGS, INC.",
    "EMPERADOR INC.",
    "GLOBE TELECOM, INC.",
    "GT CAPITAL HOLDINGS, INC.",
    "INTERNATIONAL CONTAINER TERMINAL SERVICES, INC.",
    "JG SUMMIT HOLDINGS, INC.",
    "JOLLIBEE FOODS CORPORATION",
    "LT GROUP, INC.",
    "MANILA ELECTRIC COMPANY",
    "MAYNILAD WATER SERVICES, INC.",
    "METROPOLITAN BANK & TRUST COMPANY",
    "MONDE NISSIN CORPORATION",
    "PHILIPPINE LONG DISTANCE TELEPHONE COMPANY COMMON",
    "PUREGOLD PRICE CLUB, INC.",
    "RL COMMERCIAL REIT, INC.",
    "SAN MIGUEL CORPORATION",
    "SEMIRARA MINING AND POWER CORPORATION",
    "SM INVESTMENTS CORPORATION",
    "SM PRIME HOLDINGS, INC.",
    "UNIVERSAL ROBINA CORPORATION",
  ];
  const rows = names
    .map((name, i) => `<tr><td>${name}</td><td>${(30 - i).toFixed(2)}</td><td>1.00</td><td>10</td></tr>`)
    .join("");
  const parsed = parsePseiWeightTable(`<h2>Underlying Securities as of 09/16/2026</h2><table>${rows}</table>`);
  assert.ok(parsed);
  assert.equal(parsed!.asOf, "2026-09-16");
  assert.equal(parsed!.rows.length, 30);
  assert.equal(parsed!.rows[0]?.ticker, "AEV");
  assert.equal(tickerFromSecurityName("PHILIPPINE LONG DISTANCE TELEPHONE COMPANY COMMON"), "TEL");
  assert.equal(tickerFromSecurityName("MAYNILAD WATER SERVICES, INC."), "MYNLD");
});
