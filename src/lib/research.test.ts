import assert from "node:assert/strict";
import { test } from "node:test";
import { BLUECHIPS } from "./market-board.ts";
import { buildResearch, relatedNewsUrl, researchPdf } from "./research.ts";
import type { BoardRow } from "./market-board.ts";

test("IMI is not a PSEi blue chip after Aug 2026", () => {
  assert.equal(BLUECHIPS.has("IMI"), false);
  assert.equal(BLUECHIPS.has("BDO"), true);
  assert.equal(BLUECHIPS.has("MYNLD"), true);
  assert.equal(BLUECHIPS.has("PLUS"), true);
  assert.equal(BLUECHIPS.has("CNVRG"), false);
  assert.equal(BLUECHIPS.size, 30);
});

test("research note marks non-index names", () => {
  const row: BoardRow = {
    key: "imi",
    item: { id: "imi", symbol: "IMI", label: "IMI", name: "Integrated Micro-Electronics", kind: "stock" },
    q: { price: 2.5, change: -3.2, kind: "stock", ccy: "PHP", php: 2.5, volume: 1000 },
    watching: false,
  };
  const note = buildResearch(row, new Date("2026-09-08T04:00:00Z"));
  assert.equal(note.bias, "Bearish");
  assert.match(note.thesis.join(" "), /Not a PSEi/);
  assert.equal(note.ticker, "IMI");
});

test("research PDF is a real PDF", () => {
  const row: BoardRow = {
    key: "bdo",
    item: { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" },
    q: { price: 120.1, change: 1.4, kind: "stock", ccy: "PHP", php: 120.1, volume: 1_000_000, spark: [118, 119, 120.1] },
    watching: true,
  };
  const note = buildResearch(row);
  assert.equal(note.bias, "Bullish");
  assert.match(note.index, /PSEi/);
  assert.ok(note.technical.length >= 1);
  assert.ok(note.suggestions.length >= 2);
  const bytes = researchPdf(note);
  const head = new TextDecoder().decode(bytes.slice(0, 8));
  assert.equal(head.startsWith("%PDF-1."), true);
  const body = new TextDecoder().decode(bytes);
  assert.match(body, /PSEi/);
  assert.match(body, /STANDPOINT/);
  assert.match(body, /WATCH/);
  assert.match(body, /RISK/);
  assert.match(body, /ATRIUM RESEARCH/);
});

test("related news query is ticker-aware", () => {
  const url = relatedNewsUrl({ label: "BDO", symbol: "BDO", name: "BDO Unibank", kind: "stock" });
  assert.match(url, /news\.google\.com\/rss\/search/);
  assert.match(decodeURIComponent(url), /BDO Unibank/);
  assert.match(url, /gl=PH/);
  const crypto = relatedNewsUrl({ label: "BTC", symbol: "bitcoin", name: "Bitcoin", kind: "crypto" });
  assert.match(crypto, /gl=US/);
});

