import assert from "node:assert/strict";
import { test } from "node:test";
import { BLUECHIPS } from "./market-board.ts";
import { buildResearch, isRelatedStory, relatedNewsUrl, relatedNewsQuery, rumorNewsUrl, rumorNewsUrls, researchPdf, storyLane } from "./research.ts";
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
  assert.match(note.expert.join(" "), /tape and levels only/);
});

test("research expert reads PE yield and 52-week box", () => {
  const row: BoardRow = {
    key: "bdo",
    item: { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" },
    q: {
      price: 120,
      change: 1.4,
      kind: "stock",
      ccy: "PHP",
      php: 120,
      pe: 9.2,
      yieldPct: 4.5,
      weekLow: 100,
      weekHigh: 140,
    },
    watching: true,
  };
  const note = buildResearch(row);
  const expert = note.expert.join(" ");
  assert.match(expert, /Trailing PE 9.2/);
  assert.match(expert, /Earnings yield 10\.9%/);
  assert.match(expert, /Yield 4.5%/);
  assert.match(expert, /50% of the 52-week range/);
  assert.match(expert, /justified P\/B/);
  assert.match(expert, /7\.63%/);
  assert.match(expert, /not a DCF/i);
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
  assert.match(body, /EXPERT/);
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
  const psei = relatedNewsUrl({ label: "PSEi", symbol: "PSEI.PS", name: "PSEi INDEX", kind: "global" });
  assert.match(decodeURIComponent(psei), /PSE index/);
  assert.match(psei, /gl=PH/);
});

test("isRelatedStory keeps Lopez and drops noise", () => {
  const item = { label: "LPZ", symbol: "LPZ", name: "Lopez Holdings Corporation", kind: "stock" };
  assert.equal(
    isRelatedStory({ title: "Lopez Holdings Corporation Announces Schedule for 2026 Annual Stockholders Meeting", src: "mb.com.ph" }, item),
    true,
  );
  assert.equal(isRelatedStory({ title: "PSE index edges up as banks lead", src: "Inquirer" }, item), false);
  assert.equal(isRelatedStory({ title: "LPZ in talks for a power deal — Bilyonaryo", src: "Bilyonaryo" }, item), true);
  const psei = { label: "PSEi", symbol: "PSEI.PS", name: "PSEi INDEX", kind: "global" };
  assert.equal(isRelatedStory({ title: "PSE index edges up as banks lead", src: "Inquirer" }, psei), true);
  assert.equal(isRelatedStory({ title: "Lopez Holdings sets meeting", src: "mb.com.ph" }, psei), false);
});

test("storyLane splits facts from rumor copy", () => {
  assert.equal(storyLane({ title: "PSEi closes higher", src: "BusinessWorld" }), "fact");
  assert.equal(storyLane({ title: "ICT in talks for a port deal — sources say", src: "Bilyonaryo" }), "rumor");
  assert.equal(storyLane({ title: "BDO mulling a stake — Politiko", src: "Politiko" }), "rumor");
  assert.equal(storyLane({ title: "Markets wrap", src: "Google News" }), "wire");
});

test("rumor news harvests several gossip wires", () => {
  const urls = rumorNewsUrls({ label: "BDO", symbol: "BDO", name: "BDO Unibank" });
  assert.equal(urls.length, 4);
  const joined = urls.map((u) => decodeURIComponent(u)).join(" ");
  assert.match(joined, /site:bilyonaryo.com/);
  assert.match(joined, /site:politiko.com.ph/);
  assert.match(joined, /site:abante.com.ph/);
  assert.match(joined, /people familiar/);
  assert.match(joined, /BDO Unibank/);
  const first = rumorNewsUrl({ label: "BDO", symbol: "BDO", name: "BDO Unibank" });
  assert.match(decodeURIComponent(first), /site:bilyonaryo.com/);
  const psei = rumorNewsUrl({ label: "PSEi", symbol: "PSEI.PS", name: "PSEi INDEX", kind: "global" });
  assert.match(decodeURIComponent(psei), /PSEi/);
});

test("research expert reads volume vs typical on a US name", () => {
  const row: BoardRow = {
    key: "cost",
    item: { id: "cost", symbol: "COST", label: "COST", name: "Costco", kind: "global" },
    q: {
      price: 940,
      change: 1.1,
      kind: "global",
      ccy: "USD",
      volume: 4_800_000,
      avgVolume: 2_000_000,
      pe: 52,
      weekLow: 800,
      weekHigh: 1000,
    },
    watching: false,
  };
  const note = buildResearch(row);
  assert.match(note.expert.join(" "), /2\.4× the 10-day typical/);
});

test("research expert on the PSEi index uses the 52-week box", () => {
  const row: BoardRow = {
    key: "psei",
    item: { id: "psei", symbol: "PSEI.PS", label: "PSEi", name: "PSEi INDEX", kind: "global" },
    q: {
      price: 5958.64,
      change: 0.7,
      kind: "global",
      ccy: "PHP",
      weekLow: 5902,
      weekHigh: 7552.2,
    },
    watching: false,
  };
  const note = buildResearch(row);
  assert.match(note.index, /PSEi/);
  assert.match(note.expert.join(" "), /of the 52-week range/);
  assert.match(note.expert.join(" "), /free-float/i);
  assert.match(note.expert.join(" "), /26\.83%/);
  assert.match(note.next.join(" "), /dropped \.PS/);
});

test("BDO news is Banco de Oro, not Luxembourg or biomass", () => {
  const item = { label: "BDO", symbol: "BDO", name: "BDO Unibank", kind: "stock" };
  assert.equal(isRelatedStory({ title: "BDO Unibank net income rises", src: "Inquirer" }, item), true);
  assert.equal(isRelatedStory({ title: "Banco de Oro to open more branches", src: "BusinessWorld" }, item), true);
  assert.equal(
    isRelatedStory({ title: "BDO reportedly seeks more collateral as Villar lines up funding", src: "bilyonaryo.com" }, item),
    true,
  );
  assert.equal(isRelatedStory({ title: "BDO Luxembourg appoints four new partners", src: "Luxembourg Times" }, item), false);
  assert.equal(isRelatedStory({ title: "Bowie County, Texas Issued BDO Zone AA Rating for Woody Biomass", src: "Biomass Magazine" }, item), false);
  assert.equal(isRelatedStory({ title: "BDO: High-growth firms demand increased R&D support", src: "Accountancy Today" }, item), false);
  const q = decodeURIComponent(relatedNewsUrl(item));
  assert.match(q, /BDO Unibank/);
  assert.match(q, /Banco de Oro/);
  assert.match(q, /-Luxembourg/);
  assert.match(q, /BDO Zone/);
  assert.doesNotMatch(relatedNewsQuery(item), /^BDO OR/);
});

test("ICT news wants ICTSI, not the ICT sector", () => {
  const item = { label: "ICT", symbol: "ICT", name: "International Container Terminal Services", kind: "stock" };
  assert.equal(isRelatedStory({ title: "ICTSI port deal in talks — Bilyonaryo", src: "Bilyonaryo" }, item), true);
  assert.equal(isRelatedStory({ title: "ICT ministry rolls out broadband", src: "Reuters" }, item), false);
});
