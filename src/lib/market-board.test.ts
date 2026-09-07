import assert from "node:assert/strict";
import { test } from "node:test";
import { displayLast, downsample, matchQuery, normalizeTab, pairLabel, positionPnl, positionValue, sortRows, sparkFromMove, stockBoardRows, turnover, BLUECHIPS } from "./market-board.ts";
import type { BoardRow } from "./market-board.ts";

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
