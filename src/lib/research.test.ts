import assert from "node:assert/strict";
import { test } from "node:test";
import { BLUECHIPS } from "./market-board.ts";
import { buildResearch, collapseNearDup, fillRumorLane, isDeskStory, isRelatedStory, issuerDisplay, issuerSearchQuery, NEWS_LANE_KEEP, NEWS_LANE_MIN, pickNewsLanes, relatedNewsUrl, relatedNewsQuery, rumorFillUrls, rumorNewsUrl, rumorNewsUrls, rumorSiteUrls, researchPdf, storyLane } from "./research.ts";
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
  assert.ok(urls.length >= 6);
  const joined = urls.map((u) => decodeURIComponent(u)).join(" ");
  assert.match(joined, /site:bilyonaryo.com/);
  assert.match(joined, /site:politiko.com.ph/);
  assert.match(joined, /site:abante.com.ph/);
  assert.match(joined, /site:insiderph.com/);
  assert.match(joined, /people familiar/);
  assert.match(joined, /BDO Unibank/);
  const first = rumorNewsUrl({ label: "BDO", symbol: "BDO", name: "BDO Unibank" });
  assert.match(decodeURIComponent(first), /site:bilyonaryo.com/);
  const year = rumorSiteUrls({ label: "BDO", symbol: "BDO", name: "BDO Unibank" }, "1y");
  assert.ok(year.some((u) => decodeURIComponent(u).includes("when:1y")));
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
  assert.equal(
    isRelatedStory(
      { title: "Peso sinks while BSP officials hit a bonus jackpot", desc: "BDO shares and other banks also in the roundup", src: "bilyonaryo.com" },
      item,
    ),
    false,
  );
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
  assert.equal(isRelatedStory({ title: "Musk’s SpaceX, Uy’s Converge ICT in talks for PH broadband satellite venture", src: "Inquirer" }, item), false);
  assert.equal(isRelatedStory({ title: "PH-Israel partnership on ICT, defense up for talks in Duterte’s visit", src: "Philippine News Agency" }, item), false);
});

test("issuer display uses legal names, not a ticker collision", () => {
  const bdo = issuerDisplay({ label: "BDO", symbol: "BDO", name: "BDO Unibank", kind: "stock" });
  assert.equal(bdo.ticker, "BDO");
  assert.match(bdo.line, /BDO Unibank/);
  assert.match(bdo.line, /Banco de Oro/);
  const q = issuerSearchQuery({ label: "SM", symbol: "SM", name: "SM Investments", kind: "stock" });
  assert.match(q.q, /SM Investments/);
  assert.doesNotMatch(q.q, /^\(SM OR/);
  assert.match(q.minus, /SM Entertainment/);
});

test("short tickers reject the foreign collision", () => {
  const sm = { label: "SM", symbol: "SM", name: "SM Investments", kind: "stock" };
  assert.equal(isRelatedStory({ title: "SM Investments raises dividend", src: "Inquirer" }, sm), true);
  assert.equal(isRelatedStory({ title: "SM Entertainment unveils SM Town concert", src: "Reuters" }, sm), false);
  const ac = { label: "AC", symbol: "AC", name: "Ayala Corp", kind: "stock" };
  assert.equal(isRelatedStory({ title: "Ayala Corp posts higher profit", src: "BusinessWorld" }, ac), true);
  assert.equal(isRelatedStory({ title: "Air Canada expands Asia routes", src: "Reuters" }, ac), false);
  const cbc = { label: "CBC", symbol: "CBC", name: "China Bank", kind: "stock" };
  assert.equal(isRelatedStory({ title: "China Bank net income rises", src: "Inquirer" }, cbc), true);
  assert.equal(isRelatedStory({ title: "CBC News covers the election", src: "CBC News" }, cbc), false);
  const plus = { label: "PLUS", symbol: "PLUS", name: "DigiPlus Interactive", kind: "stock" };
  assert.equal(isRelatedStory({ title: "DigiPlus Interactive GGR jumps", src: "BusinessWorld" }, plus), true);
  assert.equal(isRelatedStory({ title: "Google Plus shuts down leftovers", src: "TechCrunch" }, plus), false);
  const mer = { label: "MER", symbol: "MER", name: "Meralco", kind: "stock" };
  assert.equal(isRelatedStory({ title: "Meralco rate reset", src: "Inquirer" }, mer), true);
  assert.equal(isRelatedStory({ title: "Merrill Lynch raises target", src: "Bloomberg" }, mer), false);
  const ali = { label: "ALI", symbol: "ALI", name: "Ayala Land", kind: "stock" };
  assert.equal(isRelatedStory({ title: "Ayala Land launches estate", src: "Inquirer" }, ali), true);
  assert.equal(isRelatedStory({ title: "Alibaba cloud outage", src: "Reuters" }, ali), false);
});

test("rumor harvest covers gossip wires and talk copy", () => {
  const urls = rumorNewsUrls({ label: "BDO", symbol: "BDO", name: "BDO Unibank" });
  assert.ok(urls.length >= 6);
  const joined = urls.map((u) => decodeURIComponent(u)).join(" ");
  assert.match(joined, /site:bilyonaryo.com/);
  assert.match(joined, /site:politiko.com.ph/);
  assert.match(joined, /site:abante.com.ph/);
  assert.match(joined, /site:manilatimes.net/);
  assert.match(joined, /site:insiderph.com/);
  assert.match(joined, /merger talks/);
  assert.match(joined, /BDO Unibank/);
  const fill = rumorFillUrls({ label: "BDO", symbol: "BDO", name: "BDO Unibank" }).map((u) => decodeURIComponent(u)).join(" ");
  assert.match(fill, /site:philstar.com/);
  assert.match(fill, /site:tribune.net.ph/);
});

test("pickNewsLanes keeps at least five facts and five rumors when the wires have copy", () => {
  assert.equal(NEWS_LANE_KEEP, 8);
  assert.equal(NEWS_LANE_MIN, 5);
  const facts = Array.from({ length: 12 }, (_, i) => ({
    title: `BDO Unibank fact ${i}`,
    link: `https://inquirer.net/bdo-${i}`,
    desc: "",
    date: `2026-09-0${(i % 9) + 1}T00:00:00Z`,
    src: "Inquirer",
    lane: "fact" as const,
  }));
  const rumors = Array.from({ length: 12 }, (_, i) => ({
    title: `BDO Unibank in talks ${i} — Bilyonaryo`,
    link: `https://bilyonaryo.com/bdo-${i}`,
    desc: "",
    date: `2026-09-0${(i % 9) + 1}T00:00:00Z`,
    src: "Bilyonaryo",
    lane: "rumor" as const,
  }));
  const picked = pickNewsLanes([...facts, ...rumors]);
  assert.equal(picked.facts.length, 8);
  assert.equal(picked.rumors.length, 8);
  assert.ok(picked.facts.length >= 5);
  assert.ok(picked.rumors.length >= 5);
});

test("CFA desk splits valuation tape index and gap", () => {
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
  assert.match(note.cfaMethod, /not a DCF/i);
  assert.match(note.issuerLine, /Banco de Oro/);
  assert.equal(note.metrics.pe, "9.2");
  assert.equal(note.metrics.ep, "10.9%");
  assert.match(note.valuation.join(" "), /Trailing PE 9.2/);
  assert.match(note.tape.join(" "), /52-week range/);
  assert.match(note.indexFactor.join(" "), /7\.63%/);
  assert.match(note.gap.join(" "), /not a DCF/i);
});
test("InsiderPH BDO copy is this issuer, ads and charts are not desk copy", () => {
  const item = { label: "BDO", symbol: "BDO", name: "BDO Unibank", kind: "stock" };
  assert.equal(isRelatedStory({ title: "BDO Unibank net income rises", src: "InsiderPH" }, item), true);
  assert.equal(isRelatedStory({ title: "SM Group’s BDO raises P115B in 4 days", src: "InsiderPH" }, item), true);
  assert.equal(isDeskStory({ title: "BDO Stock Price and Chart — PSE:BDO", src: "TradingView" }), false);
  assert.equal(isDeskStory({ title: "Live better with BDO credit cards", src: "The Manila Times" }), false);
  assert.equal(isDeskStory({ title: "All transactions no fees, kaya BDO Pay Mo Na!", src: "The Manila Times" }), false);
  assert.equal(isDeskStory({ title: "BDO Unibank net income rises", src: "Inquirer" }), true);
  assert.equal(isDeskStory({ title: "Rappler. . BDO Unibank account holders reportedly lost thousands. Full story: https://www.rappler.com/x", src: "facebook.com" }), false);
  assert.equal(storyLane({ title: "BDO eyeing P5 billion from sustainability bonds", src: "Philstar.com" }), "rumor");
  assert.equal(storyLane({ title: "BDO clients lose money due to alleged online banking hack", src: "Rappler" }), "rumor");
});

test("collapseNearDup keeps the latest of the same bond print", () => {
  const rows = [
    { title: "BDO raises P132 billion from sustainability bonds", link: "https://philstar.com/a", desc: "", date: "2026-07-29T00:00:00Z", src: "Philstar.com", lane: "fact" as const },
    { title: "BDO raises P132B from bond offering", link: "https://manilatimes.net/b", desc: "", date: "2026-07-29T00:00:00Z", src: "The Manila Times", lane: "wire" as const },
    { title: "BDO Q2 net income slips 1.43%", link: "https://bworldonline.com/c", desc: "", date: "2026-07-28T00:00:00Z", src: "BusinessWorld", lane: "fact" as const },
  ];
  const out = collapseNearDup(rows);
  assert.equal(out.length, 2);
  assert.match(out[0].title, /P132/);
});

test("fillRumorLane promotes talk copy so the rumor lane can hit five", () => {
  const rumors = [
    { title: "BDO reportedly seeks more collateral", link: "https://bilyonaryo.com/1", desc: "", date: "2026-09-17T00:00:00Z", src: "bilyonaryo.com", lane: "rumor" as const },
    { title: "Cebu Pacific gets BDO backing", link: "https://bilyonaryo.com/2", desc: "", date: "2026-07-21T00:00:00Z", src: "bilyonaryo.com", lane: "rumor" as const },
  ];
  const facts = [
    { title: "BDO eyeing P5 billion from sustainability bonds", link: "https://philstar.com/1", desc: "", date: "2026-07-10T00:00:00Z", src: "Philstar.com", lane: "fact" as const },
    { title: "BDO to sell 70% stake in Dominion Holdings", link: "https://inquirer.net/1", desc: "", date: "2026-01-21T00:00:00Z", src: "Inquirer.net", lane: "fact" as const },
    { title: "Smooth elections could draw foreign funds — BDO Capital", link: "https://bworldonline.com/1", desc: "", date: "2026-09-02T00:00:00Z", src: "BusinessWorld", lane: "fact" as const },
    { title: "BDO posts record P87.2 billion profit in 2025", link: "https://philstar.com/2", desc: "", date: "2026-02-28T00:00:00Z", src: "Philstar.com", lane: "fact" as const },
    { title: "BDO Q1 profit climbs to P20.1 billion", link: "https://bworldonline.com/2", desc: "", date: "2026-04-24T00:00:00Z", src: "BusinessWorld", lane: "fact" as const },
  ];
  const filled = fillRumorLane([...facts, ...rumors]);
  assert.ok(filled.rumors.length >= 5);
  assert.ok(filled.facts.length >= 1);
  assert.ok(filled.rumors.some((r) => /eyeing/i.test(r.title)));
  assert.ok(filled.facts.some((r) => /profit/i.test(r.title)));
});
