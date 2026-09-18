import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyScreenFilters,
  capBand,
  capLabel,
  isPseScreen,
  isYahooScreen,
  normalizeScreen,
  normalizeScreenYld,
  peLabel,
  screensOn,
  yldLabel,
} from "./screener.ts";
import { parseYieldPct, parseYahooSearch } from "./yahoo.ts";
import { PSE_STATS_SEED } from "./pse-fundamentals.ts";

test("normalizeScreen accepts style and sector lists", () => {
  assert.equal(normalizeScreen("undervalued_large_caps"), "undervalued_large_caps");
  assert.equal(normalizeScreen("growth_technology_stocks"), "growth_technology_stocks");
  assert.equal(normalizeScreen("ms_healthcare"), "ms_healthcare");
  assert.equal(normalizeScreen("ms_financial_services"), "ms_financial_services");
  assert.equal(normalizeScreen("junk"), "day_gainers");
});

test("capBand splits mega mid micro", () => {
  assert.equal(capBand(80_000_000), "micro");
  assert.equal(capBand(800_000_000), "small");
  assert.equal(capBand(5_000_000_000), "mid");
  assert.equal(capBand(80_000_000_000), "large");
  assert.equal(capBand(400_000_000_000), "mega");
});

test("applyScreenFilters keeps PE under 15", () => {
  const rows = [
    { id: "a", pe: 8, marketCap: 20_000_000_000, volume: 2_000_000 },
    { id: "b", pe: 40, marketCap: 20_000_000_000, volume: 2_000_000 },
    { id: "c", pe: undefined, marketCap: 20_000_000_000, volume: 2_000_000 },
  ];
  const hit = applyScreenFilters(rows, { pe: "lt15" });
  assert.deepEqual(
    hit.map((r) => r.id),
    ["a"],
  );
});

test("applyScreenFilters stacks cap, volume, and yield", () => {
  const rows = [
    { id: "mega-quiet", pe: 12, marketCap: 500_000_000_000, volume: 100_000, yieldPct: 5 },
    { id: "mega-hot", pe: 12, marketCap: 500_000_000_000, volume: 30_000_000, yieldPct: 0.4 },
    { id: "mega-div", pe: 12, marketCap: 500_000_000_000, volume: 30_000_000, yieldPct: 4.2 },
    { id: "micro-hot", pe: 12, marketCap: 80_000_000, volume: 30_000_000, yieldPct: 5 },
  ];
  const hit = applyScreenFilters(rows, { cap: "mega", vol: "m20", yld: "gt4" });
  assert.deepEqual(
    hit.map((r) => r.id),
    ["mega-div"],
  );
});

test("capLabel peLabel yldLabel skip junk", () => {
  assert.equal(capLabel(82_400_000_000), "82.4B");
  assert.equal(peLabel(32.005), "PE 32.0");
  assert.equal(peLabel(-4), "");
  assert.equal(capLabel(0), "");
  assert.equal(yldLabel(1.01), "1.0% yld");
  assert.equal(yldLabel(0), "");
});

test("screensOn ignores any-any-any", () => {
  assert.equal(screensOn({ pe: "any", cap: "any", vol: "any", yld: "any" }), false);
  assert.equal(screensOn({ pe: "lt15" }), true);
  assert.equal(normalizeScreenYld("gt2"), "gt2");
  assert.equal(normalizeScreenYld("nope"), "any");
});

test("parseYieldPct prefers trailing fraction and keeps screener percent", () => {
  assert.equal(Number(parseYieldPct(0.010105034, 0.92)?.toFixed(4)), 1.0105);
  assert.equal(parseYieldPct(undefined, 0.92)?.toFixed(2), "0.92");
  assert.equal(parseYieldPct(undefined, 2.4), 2.4);
  assert.equal(parseYieldPct(0, 0), undefined);
});

test("parseYahooSearch drops options and maps quote rows", () => {
  const hits = parseYahooSearch({
    quotes: [
      { symbol: "COST", shortname: "Costco", quoteType: "EQUITY", exchDisp: "NASDAQ" },
      { symbol: "COST260117C00100000", quoteType: "OPTION" },
      { symbol: "BDO.PS", shortname: "BDO Unibank", quoteType: "EQUITY", exchDisp: "Philippine" },
    ],
  });
  assert.equal(hits.length, 2);
  assert.equal(hits[0]?.symbol, "COST");
  assert.equal(hits[1]?.symbol, "BDO.PS");
  assert.equal(hits[1]?.exch, "Philippine");
});

test("PSEi 30 is a local screen, not a Yahoo US list", () => {
  assert.equal(normalizeScreen("psei_30"), "psei_30");
  assert.equal(isPseScreen("psei_30"), true);
  assert.equal(isYahooScreen("psei_30"), false);
  assert.equal(isYahooScreen("day_gainers"), true);
  const rows = Object.values(PSE_STATS_SEED).map((s) => ({ id: s.ticker, pe: s.pe, yieldPct: s.yieldPct }));
  const cheap = applyScreenFilters(rows, { pe: "lt15" });
  assert.ok(cheap.some((r) => r.id === "BDO"));
  assert.ok(!cheap.some((r) => r.id === "ICT"));
  assert.ok(cheap.length >= 20);
  assert.ok(cheap.length < rows.length);
});

