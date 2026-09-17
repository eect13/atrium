import assert from "node:assert/strict";
import { test } from "node:test";
import { displayLast, downsample, findInstrument, kindBoardRows, matchQuery, queryScore, normalizeTab, pairLabel, positionPnl, positionValue, rankByQuery, sortRows, sparkFromMove, stockBoardRows, turnover, universeRows, BLUECHIPS } from "./market-board.ts";
import type { BoardRow } from "./market-board.ts";
import { withFactoryGlobals } from "./types.ts";

test("sparkFromMove is previous close to last", () => {
  const spark = sparkFromMove(110, 10);
  assert.ok(spark);
  assert.equal(spark.length, 2);
  assert.ok(Math.abs((spark[0] ?? 0) - 100) < 1e-9);
  assert.equal(spark[1], 110);
});

test("sparkFromMove skips junk", () => {
  assert.equal(sparkFromMove(0, 5), undefined);
  assert.equal(sparkFromMove(10, undefined), undefined);
});

test("downsample keeps ends", () => {
  const out = downsample([0, 1, 2, 3, 4, 5, 6, 7], 3);
  assert.deepEqual(out, [0, 4, 7]);
});

test("matchQuery hits ticker and name", () => {
  const item = { label: "BTC", symbol: "bitcoin", name: "Bitcoin" };
  assert.equal(matchQuery("bit", item), true);
  assert.equal(matchQuery("xyz", item), false);
  assert.equal(matchQuery("bdo uni", { label: "BDO", symbol: "BDO", name: "BDO Unibank" }), true);
  assert.equal(matchQuery("$BDO", { label: "BDO", symbol: "BDO", name: "BDO Unibank" }), true);
});

test("queryScore ranks exact tickers over name hits", () => {
  const bdo = { label: "BDO", symbol: "BDO", name: "BDO Unibank", kind: "stock" };
  const bpi = { label: "BPI", symbol: "BPI", name: "Bank of the PH Islands", kind: "stock" };
  assert.ok(queryScore("bdo", bdo) > queryScore("bdo", bpi));
  const rows = [
    { item: bpi, key: "bpi" },
    { item: bdo, key: "bdo" },
  ];
  assert.equal(rankByQuery(rows, "BDO")[0]?.item.label, "BDO");
  assert.equal(matchQuery("peso", { label: "USD/PHP", symbol: "USDPHP", name: "US Dollar", kind: "fx" }), true);
});

test("sortRows by change descending puts the gainer first", () => {
  const q = (id: string, change: number) => ({
    id,
    label: id,
    price: 1,
    change,
    kind: "stock" as const,
    ccy: "PHP",
  });
  const rows: BoardRow[] = [
    { key: "a", item: { id: "a", symbol: "A", label: "A", kind: "stock" }, q: q("A", -1), watching: false },
    { key: "b", item: { id: "b", symbol: "B", label: "B", kind: "stock" }, q: q("B", 3), watching: false },
  ];
  const sorted = sortRows(rows, "chg", -1);
  assert.equal(sorted[0]?.item.label, "B");
});

test("sortRows by PE puts missing last", () => {
  const q = (id: string, pe?: number) => ({
    id,
    label: id,
    price: 1,
    kind: "global" as const,
    ccy: "USD",
    pe,
  });
  const rows: BoardRow[] = [
    { key: "a", item: { id: "a", symbol: "A", label: "A", kind: "global" }, q: q("A", 40), watching: false },
    { key: "b", item: { id: "b", symbol: "B", label: "B", kind: "global" }, q: q("B"), watching: false },
    { key: "c", item: { id: "c", symbol: "C", label: "C", kind: "global" }, q: q("C", 8), watching: false },
  ];
  const cheap = sortRows(rows, "pe", 1);
  assert.equal(cheap[0]?.item.label, "C");
  assert.equal(cheap[2]?.item.label, "B");
  const rich = sortRows(rows, "pe", -1);
  assert.equal(rich[0]?.item.label, "A");
  assert.equal(rich[2]?.item.label, "B");
});

test("stock turnover is peso value", () => {
  assert.equal(
    turnover({ price: 10, php: 10, volume: 5, kind: "stock", ccy: "PHP" }),
    50,
  );
});

test("displayLast uses USD for coins when USDT last is on", () => {
  const shown = displayLast(
    { kind: "crypto", price: 5_000_000, ccy: "PHP", php: 5_000_000, usd: 80000 },
    { cryptoUsdt: true },
  );
  assert.equal(shown?.ccy, "USD");
  assert.equal(shown?.price, 80000);
  assert.equal(shown?.php, 5_000_000);
});

test("displayLast keeps PHP for stocks", () => {
  const shown = displayLast(
    { kind: "stock", price: 936.5, ccy: "PHP", php: 936.5 },
    { cryptoUsdt: true },
  );
  assert.equal(shown?.ccy, "PHP");
  assert.equal(shown?.price, 936.5);
});

test("normalizeTab maps pse to all", () => {
  assert.equal(normalizeTab("pse"), "all");
  assert.equal(normalizeTab("global"), "global");
  assert.equal(normalizeTab("cmdty"), "cmdty");
  assert.equal(normalizeTab("screen"), "screen");
});

test("pairLabel crypto with USDT last on", () => {
  assert.equal(pairLabel({ kind: "crypto", label: "BTC" }, undefined, true), "BTC / USDT");
});

test("pairLabel crypto with USDT last off uses quote ccy", () => {
  assert.equal(pairLabel({ kind: "crypto", label: "BTC" }, { ccy: "PHP" }, false), "BTC / PHP");
});

test("positionValue multiplies qty by php", () => {
  assert.equal(positionValue(2, 10), 20);
});

test("positionPnl is qty times last minus avg", () => {
  assert.equal(positionPnl(2, 12, 10), 4);
});

test("sortRows last with cryptoUsdt uses usd", () => {
  const rows: BoardRow[] = [
    {
      key: "a",
      item: { id: "a", symbol: "a", label: "A", kind: "crypto" },
      q: { price: 100, kind: "crypto", ccy: "PHP", usd: 2, php: 100 },
      watching: false,
    },
    {
      key: "b",
      item: { id: "b", symbol: "b", label: "B", kind: "crypto" },
      q: { price: 50, kind: "crypto", ccy: "PHP", usd: 10, php: 50 },
      watching: false,
    },
  ];
  const sorted = sortRows(rows, "last", -1, { cryptoUsdt: true });
  assert.equal(sorted[0]?.item.label, "B");
});

test("Bluechips board is the official PSEi 30 and never IMI", () => {
  const quotes = {
    IMI: { id: "IMI", label: "IMI", price: 2.5, change: 8, kind: "stock" as const, ccy: "PHP", php: 2.5 },
    BDO: { id: "BDO", label: "BDO", price: 120, change: -0.5, kind: "stock" as const, ccy: "PHP", php: 120 },
    bitcoin: { id: "bitcoin", label: "BTC", price: 1, kind: "crypto" as const, ccy: "USD" },
  };
  const catalog = [
    { id: "imi", symbol: "IMI", label: "IMI", kind: "stock" as const },
    { id: "mynld", symbol: "MYNLD", label: "MYNLD", name: "Maynilad", kind: "stock" as const },
    { id: "plus", symbol: "PLUS", label: "PLUS", kind: "stock" as const },
  ];
  const rows = stockBoardRows("blue", quotes, catalog, () => false);
  const labels = rows.map((r) => r.item.label);
  assert.equal(labels.includes("IMI"), false);
  assert.equal(labels.includes("MYNLD"), true);
  assert.equal(labels.includes("PLUS"), true);
  assert.equal(labels.includes("BDO"), true);
  assert.equal(rows.length, BLUECHIPS.size);
  assert.equal(BLUECHIPS.size, 30);
});

test("seed PSEi 30 matches the 3 Aug 2026 review (FMETF 16 Sep 2026)", () => {
  const live = [
    "AC",
    "ACEN",
    "AEV",
    "ALI",
    "AREIT",
    "BDO",
    "BPI",
    "CBC",
    "CNPF",
    "DMC",
    "EMI",
    "GLO",
    "GTCAP",
    "ICT",
    "JFC",
    "JGS",
    "LTG",
    "MBT",
    "MER",
    "MONDE",
    "MYNLD",
    "PGOLD",
    "PLUS",
    "RCR",
    "SCC",
    "SM",
    "SMC",
    "SMPH",
    "TEL",
    "URC",
  ];
  assert.deepEqual([...BLUECHIPS].toSorted(), live.toSorted());
});

test("findInstrument prefers an exact ticker", () => {
  const catalog = [
    { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" as const },
    { id: "btc", symbol: "bitcoin", label: "BTC", name: "Bitcoin", kind: "crypto" as const },
    { id: "jfc", symbol: "JFC", label: "JFC", name: "Jollibee", kind: "stock" as const },
  ];
  assert.equal(findInstrument("BDO", catalog)?.label, "BDO");
  assert.equal(findInstrument("jollibee", catalog)?.label, "JFC");
  assert.equal(findInstrument("xyzzy", catalog), undefined);
});

test("universeRows searches stocks and coins together", () => {
  const quotes = {
    BDO: { id: "BDO", label: "BDO", price: 120, kind: "stock" as const, ccy: "PHP", php: 120 },
    bitcoin: { id: "bitcoin", label: "BTC", price: 1, kind: "crypto" as const, ccy: "USD" },
  };
  const catalog = [
    { id: "bdo", symbol: "BDO", label: "BDO", kind: "stock" as const },
    { id: "btc", symbol: "bitcoin", label: "BTC", name: "Bitcoin", kind: "crypto" as const },
  ];
  const rows = universeRows(quotes, [], catalog, () => false);
  const labels = rows.map((r) => r.item.label);
  assert.equal(labels.includes("BDO"), true);
  assert.equal(labels.includes("BTC"), true);
});

test("kindBoardRows lists global and commodities from catalog", () => {
  const quotes = {
    "^GSPC": { id: "^GSPC", label: "S&P 500", price: 5700, kind: "global" as const, ccy: "USD" },
    "GC=F": { id: "GC=F", label: "Gold", price: 2650, kind: "cmdty" as const, ccy: "USD" },
  };
  const catalog = [
    { id: "spx", symbol: "^GSPC", label: "S&P 500", name: "S&P 500", kind: "global" as const },
    { id: "gold", symbol: "GC=F", label: "Gold", name: "Gold", kind: "cmdty" as const },
    { id: "aapl", symbol: "AAPL", label: "AAPL", name: "Apple", kind: "global" as const },
  ];
  const global = kindBoardRows("global", quotes, catalog, () => false);
  const cmdty = kindBoardRows("cmdty", quotes, catalog, () => false);
  assert.ok(global.some((r) => r.item.label === "S&P 500" && r.q?.price === 5700));
  assert.ok(global.some((r) => r.item.label === "AAPL"));
  assert.ok(cmdty.some((r) => r.item.label === "Gold" && r.q?.price === 2650));
  const uni = universeRows(quotes, [], catalog, () => false);
  assert.ok(uni.some((r) => r.item.symbol === "AAPL"));
  assert.ok(uni.some((r) => r.item.symbol === "GC=F"));
});

test("withFactoryGlobals adds S&P and Gold to a PH-only desk", () => {
  const next = withFactoryGlobals([{ id: "bdo", symbol: "BDO", label: "BDO", kind: "stock" }]);
  assert.ok(next.some((w) => w.id === "spx"));
  assert.ok(next.some((w) => w.id === "gold"));
});

test("withFactoryGlobals leaves a custom global list alone", () => {
  const src = [
    { id: "bdo", symbol: "BDO", label: "BDO", kind: "stock" as const },
    { id: "nvda", symbol: "NVDA", label: "NVDA", kind: "global" as const },
  ];
  assert.equal(withFactoryGlobals(src), src);
});
