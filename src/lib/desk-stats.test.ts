import assert from "node:assert/strict";
import { test } from "node:test";
import { BLUECHIPS } from "./market-board.ts";
import { corrBeta, deskSleeves, indexLink, PH_SLEEVES, rotationTake, sparkReturns, sleeveSession, vsIndex } from "./desk-stats.ts";

test("pearson is 1 on a matching path and -1 on a reverse", () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const y = [2, 4, 6, 8, 10, 12, 14, 16, 18];
  const same = corrBeta(x, y);
  assert.ok(same);
  assert.ok(Math.abs(same.r - 1) < 1e-9);
  assert.ok(Math.abs(same.beta - 2) < 1e-9);
  const flip = corrBeta(x, x.toReversed());
  assert.ok(flip);
  assert.ok(Math.abs(flip.r + 1) < 1e-9);
});

test("indexLink needs a real spark, not a short session path", () => {
  assert.equal(indexLink([100, 101], [200, 201]), undefined);
  const home = Array.from({ length: 12 }, (_, i) => 100 + i);
  const peer = Array.from({ length: 12 }, (_, i) => 200 + i * 2);
  const link = indexLink(home, peer);
  assert.ok(link);
  assert.equal(link.n, 11);
  assert.ok(link.r > 0.99);
});

test("vsIndex is the name's beta on the index, not the other way around", () => {
  const index = Array.from({ length: 12 }, (_, i) => 100 + i);
  const name = Array.from({ length: 12 }, (_, i) => 50 + i * 2);
  const link = vsIndex(name, index);
  const reversed = vsIndex(index, name);
  assert.ok(link && reversed);
  assert.ok(link.r > 0.99);
  assert.deepEqual(link, indexLink(name, index));
  assert.ok(Math.abs(link.beta - reversed.beta) > 0.5);
});

test("sparkReturns drops non-positive prints", () => {
  assert.deepEqual(sparkReturns([100, 110, 99]), [0.1, -0.1]);
  assert.equal(sparkReturns([0, 1, 2]).length, 1);
});

test("PH banks sleeve leads when only banks are green", () => {
  const quotes = {
    BDO: { change: 2 },
    BPI: { change: 1 },
    MBT: { change: 1 },
    CBC: { change: 1 },
    ALI: { change: -3 },
    SMPH: { change: -2 },
    ICT: { change: 0.1 },
  };
  const rows = sleeveSession(PH_SLEEVES, quotes, () => 1);
  const live = rows.filter((r) => Number.isFinite(r.chg));
  assert.equal(rows[0]?.id, "banks");
  assert.equal(live.at(-1)?.id, "property");
  assert.ok((rows[0]?.chg ?? 0) > 0);
  assert.ok((live.at(-1)?.chg ?? 0) < 0);
  assert.ok(rows[0]?.tickers.includes("BDO"));
  const take = rotationTake(rows);
  assert.ok(take && /Banks lead/i.test(take) && /Property lag/i.test(take));
});

test("rotationTake stays quiet when sleeves are close", () => {
  const rows = sleeveSession(
    PH_SLEEVES,
    { BDO: { change: 0.1 }, ALI: { change: 0.05 }, ICT: { change: 0.08 } },
    () => 1,
  );
  const take = rotationTake(rows);
  assert.ok(take && /still close/i.test(take));
});

test("desk sleeves are region-local", () => {
  assert.ok(deskSleeves("PH", true).some((s) => s.id === "banks"));
  assert.ok(deskSleeves("US").some((s) => s.id === "tech"));
  assert.equal(deskSleeves("SG").length, 0);
});

test("index-weighted sleeves skip names without a weight in the average, not the list", () => {
  const quotes = { ICT: { change: 1 }, PLUS: { change: 50 }, BDO: { change: 2 } };
  const weightOf = (t: string) => (t === "ICT" ? 26.83 : t === "BDO" ? 7.63 : undefined);
  const rows = sleeveSession(PH_SLEEVES, quotes, weightOf);
  const other = rows.find((r) => r.id === "other");
  const banks = rows.find((r) => r.id === "banks");
  assert.ok(other);
  assert.equal(other.n, 3);
  assert.equal(other.nLive, 1);
  assert.deepEqual(other.tickers, ["ICT", "PLUS", "SCC"]);
  assert.ok(Math.abs(other.chg - 1) < 1e-9);
  assert.ok(banks);
  assert.equal(banks.n, 4);
  assert.deepEqual(banks.tickers, ["BDO", "BPI", "MBT", "CBC"]);
  assert.equal(banks.nLive, 1);
});

test("PH sleeves list every official 30 once", () => {
  const listed = PH_SLEEVES.flatMap((s) => s.tickers);
  assert.equal(listed.length, BLUECHIPS.size);
  assert.equal(new Set(listed).size, listed.length);
  for (const t of BLUECHIPS) assert.ok(listed.includes(t), t);
  const banks = PH_SLEEVES.find((s) => s.id === "banks");
  assert.deepEqual(banks?.tickers, ["BDO", "BPI", "MBT", "CBC"]);
});

test("empty tape still lists the sleeve names", () => {
  const rows = sleeveSession(PH_SLEEVES, {});
  assert.equal(rows.length, PH_SLEEVES.length);
  assert.equal(rows.find((r) => r.id === "banks")?.n, 4);
  assert.ok(rows.every((r) => !Number.isFinite(r.chg)));
  assert.equal(rotationTake(rows), undefined);
});
