import assert from "node:assert/strict";
import { test } from "node:test";
import { BLUECHIPS } from "./market-board.ts";
import { buildResearch, collapseNearDup, fillRumorLane, isDeskStory, isRelatedStory, issuerDisplay, issuerSearchQuery, NEWS_LANE_KEEP, NEWS_LANE_MIN, pickNewsLanes, relatedNewsUrl, relatedNewsQuery, rumorFillUrls, rumorNewsUrl, rumorNewsUrls, rumorSiteUrls, researchPdf, storyLane, tapeBox } from "./research.ts";
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
  assert.match(decodeURIComponent(url), /when:1d/);
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
  assert.match(note.expert.join(" "), /2\.4× typical on the public tape/);
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
  assert.match(fill, /when:30d/);
  assert.doesNotMatch(fill, /when:1y/);
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
  const picked = pickNewsLanes([...facts, ...rumors], new Date("2026-09-09T12:00:00Z"));
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
  assert.equal(note.metrics.roe, "12.72%");
  assert.equal(note.metrics.nim, "4.20%");
  assert.match(note.valuation.join(" "), /H1 2026/);
  assert.match(note.cfaMethod, /Residual income/);
});

test("BDO with a book multiple gets a worked P/B identity, not a target", () => {
  const row: BoardRow = {
    key: "bdo",
    item: { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" },
    q: {
      price: 138,
      change: 0.4,
      kind: "stock",
      ccy: "PHP",
      php: 138,
      pe: 7.05,
      pb: 0.93,
      yieldPct: 3.85,
      forwardPe: 6.59,
    },
    watching: true,
  };
  const note = buildResearch(row);
  assert.equal(note.metrics.pe, "7.05");
  assert.equal(note.metrics.pb, "0.93");
  assert.equal(note.metrics.roe, "12.72%");
  assert.equal(note.metrics.cet1, "13.10%");
  assert.match(note.valuation.join(" "), /justified P\/B 1\.10/);
  assert.match(note.valuation.join(" "), /tape 0\.93/);
  assert.match(note.gap.join(" "), /public tape/);
  const body = new TextDecoder().decode(researchPdf(note));
  assert.match(body, /ROE 12.72%/);
});

test("MBT filing does not invent a NIM", () => {
  const row: BoardRow = {
    key: "mbt",
    item: { id: "mbt", symbol: "MBT", label: "MBT", name: "Metrobank", kind: "stock" },
    q: { price: 70, change: 0.2, kind: "stock", ccy: "PHP", php: 70 },
    watching: false,
  };
  const note = buildResearch(row);
  assert.equal(note.metrics.roe, "11.98%");
  assert.equal(note.metrics.nim, "—");
  assert.doesNotMatch(note.valuation.join(" "), /NIM /);
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
  assert.equal(storyLane({ title: "BDO eyeing P5 billion from sustainability bonds", src: "Philstar.com" }), "fact");
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

test("fillRumorLane keeps announced bond eyeing as fact and promotes real talk", () => {
  const now = new Date("2026-09-18T12:00:00Z");
  const rumors = [
    { title: "BDO reportedly seeks more collateral", link: "https://bilyonaryo.com/1", desc: "", date: "2026-09-17T00:00:00Z", src: "bilyonaryo.com", lane: "rumor" as const },
    { title: "Cebu Pacific gets BDO backing", link: "https://bilyonaryo.com/2", desc: "", date: "2026-07-21T00:00:00Z", src: "bilyonaryo.com", lane: "rumor" as const },
    { title: "BDO in talks for a Visayas push — Bilyonaryo", link: "https://bilyonaryo.com/3", desc: "", date: "2026-09-12T00:00:00Z", src: "bilyonaryo.com", lane: "rumor" as const },
  ];
  const facts = [
    { title: "BDO eyeing P5 billion from sustainability bonds", link: "https://philstar.com/1", desc: "", date: "2026-07-10T00:00:00Z", src: "Philstar.com", lane: "fact" as const },
    { title: "BDO to sell 70% stake in Dominion Holdings", link: "https://inquirer.net/1", desc: "", date: "2026-01-21T00:00:00Z", src: "Inquirer.net", lane: "fact" as const },
    { title: "Sources say BDO is in talks for a digital tie-up", link: "https://inquirer.net/2", desc: "", date: "2026-09-05T00:00:00Z", src: "Inquirer.net", lane: "fact" as const },
    { title: "BDO clients lose money due to alleged online banking hack", link: "https://rappler.com/1", desc: "", date: "2026-09-02T00:00:00Z", src: "Rappler", lane: "fact" as const },
    { title: "People familiar say BDO is mulling a regional push", link: "https://bworldonline.com/3", desc: "", date: "2026-08-25T00:00:00Z", src: "BusinessWorld", lane: "fact" as const },
    { title: "BDO posts record P87.2 billion profit in 2025", link: "https://philstar.com/2", desc: "", date: "2026-02-28T00:00:00Z", src: "Philstar.com", lane: "fact" as const },
    { title: "BDO Unibank Inc's Dividend Analysis", link: "https://finance.yahoo.com/1", desc: "", date: "2026-09-14T00:00:00Z", src: "Yahoo Finance", lane: "fact" as const },
  ];
  const filled = fillRumorLane([...facts, ...rumors], NEWS_LANE_MIN, now);
  assert.ok(filled.rumors.length >= 5);
  assert.ok(!filled.rumors.some((r) => /eyeing/i.test(r.title)));
  assert.ok(filled.earlier.some((r) => /eyeing/i.test(r.title)));
  assert.ok(filled.rumors.some((r) => /in talks/i.test(r.title)));
  assert.ok(filled.rumors.some((r) => /alleged/i.test(r.title)));
  assert.ok(filled.earlier.some((r) => /profit/i.test(r.title)));
  assert.ok(filled.facts.some((r) => /Dividend/i.test(r.title)));
});

test("July bond is earlier, September fact is latest", () => {
  const now = new Date("2026-09-18T12:00:00Z");
  const related = [
    { title: "BDO Unibank Inc's Dividend Analysis", link: "https://yahoo.com/1", desc: "", date: "2026-09-14T00:00:00Z", src: "Yahoo Finance", lane: "fact" as const },
    { title: "BDO raises P132 billion from sustainability bonds", link: "https://philstar.com/a", desc: "", date: "2026-07-29T00:00:00Z", src: "Philstar.com", lane: "fact" as const },
    { title: "BDO reportedly seeks more collateral", link: "https://bilyonaryo.com/1", desc: "", date: "2026-09-17T00:00:00Z", src: "bilyonaryo.com", lane: "rumor" as const },
  ];
  const picked = pickNewsLanes(related, now);
  assert.ok(picked.facts.some((r) => /Dividend/i.test(r.title)));
  assert.ok(!picked.facts.some((r) => /P132/i.test(r.title)));
  assert.ok(picked.earlier.some((r) => /P132/i.test(r.title)));
  assert.ok(picked.rumors.some((r) => /reportedly/i.test(r.title)));
});

test("tapeBox uses spark range when 52w is missing", () => {
  const spark = tapeBox({ spark: [100, 105, 110, 120, 110] }, "3M");
  assert.equal(spark?.kind, "spark");
  assert.equal(spark?.label, "3M");
  assert.equal(spark?.low, 100);
  assert.equal(spark?.high, 120);
  const week = tapeBox({ weekLow: 80, weekHigh: 140, spark: [100, 120] }, "3M");
  assert.equal(week?.kind, "52w");
  assert.equal(week?.label, "52w");
  const session = tapeBox({ spark: [114, 115] }, "3M");
  assert.equal(session?.label, "session");
});

test("research sheet labels spark range instead of inventing 52w", () => {
  const row: BoardRow = {
    key: "bdo",
    item: { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" },
    q: {
      price: 110,
      change: 0.4,
      kind: "stock",
      ccy: "PHP",
      php: 110,
      spark: [100, 104, 108, 110, 120],
    },
    watching: true,
  };
  const note = buildResearch(row, new Date("2026-09-18T04:00:00Z"), { sparkLabel: "3M" });
  assert.equal(note.metrics.week, "50%");
  assert.equal(note.metrics.weekLabel, "3M");
  assert.match(note.tape.join(" "), /3M spark range \(not a 52-week box\)/);
});

test("H1 bank filing is current on 18 Sep 2026 and hides after the next 17-Q window", () => {
  const row: BoardRow = {
    key: "bdo",
    item: { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" },
    q: { price: 115, change: 0.2, kind: "stock", ccy: "PHP", php: 115, pb: 0.93, roe: 13.82 },
    watching: true,
  };
  const now = buildResearch(row, new Date("2026-09-18T04:00:00Z"));
  assert.equal(now.metrics.roe, "12.72%");
  assert.doesNotMatch(now.valuation.join(" "), /Aging/);
  const aging = buildResearch(row, new Date("2026-10-20T04:00:00Z"));
  assert.equal(aging.metrics.roe, "12.72%");
  assert.match(aging.valuation.join(" "), /Aging/);
  const stale = buildResearch(row, new Date("2026-12-01T04:00:00Z"));
  assert.equal(stale.metrics.roe, "13.82%");
  assert.match(stale.valuation.join(" "), /past the next 17-Q/);
});

test("ICT public-tape ROE is flagged as distorted, not haircut", () => {
  const row: BoardRow = {
    key: "ict",
    item: { id: "ict", symbol: "ICT", label: "ICT", name: "International Container Terminal Services", kind: "stock" },
    q: { price: 540, change: 0.2, kind: "stock", ccy: "PHP", php: 540, pe: 26.96, pb: 12.5, roe: 57.4 },
    watching: false,
  };
  const note = buildResearch(row);
  assert.equal(note.metrics.roe, "57.40%");
  assert.equal(note.metrics.pb, "12.50");
  assert.match(note.valuation.join(" "), /distorted/);
  assert.match(note.valuation.join(" "), /do not haircut/);
});

test("research tape reads 52w change SMA50 RSI and typical volume", () => {
  const row: BoardRow = {
    key: "bdo",
    item: { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" },
    q: {
      price: 115,
      change: -0.5,
      kind: "stock",
      ccy: "PHP",
      php: 115,
      volume: 7_000_000,
      avgVolume: 3_487_926,
      weekChange: -18.34,
      sma50: 122.54,
      rsi: 35,
      beta: 0.42,
    },
    watching: true,
  };
  const note = buildResearch(row);
  assert.equal(note.metrics.ch1y, "-18.3%");
  assert.equal(note.metrics.rsi, "35");
  assert.match(note.metrics.sma50, /122/);
  assert.match(note.tape.join(" "), /52-week change -18\.3%/);
  assert.match(note.tape.join(" "), /50-day SMA/);
  assert.match(note.tape.join(" "), /RSI 35/);
  assert.match(note.tape.join(" "), /Beta 0\.42/);
  assert.match(note.tape.join(" "), /2\.0× typical/);
});

test("research PDF paginates and keeps a byte-accurate xref", () => {
  const row: BoardRow = {
    key: "bdo",
    item: { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" },
    q: { price: 120.1, change: 1.4, kind: "stock", ccy: "PHP", php: 120.1, volume: 1_000_000, spark: [118, 119, 120.1] },
    watching: true,
  };
  const note = buildResearch(row);
  note.expert = Array.from({ length: 8 }, (_, i) => `Expert line ${i} on valuation, tape, index factor, and the next filing window with enough words to wrap.`);
  note.watch = Array.from({ length: 10 }, (_, i) => `Watch item ${i} with enough words to wrap onto a second Helvetica line of the desk note.`);
  note.risk = Array.from({ length: 10 }, (_, i) => `Risk item ${i} with enough words to wrap onto a second Helvetica line of the desk note.`);
  note.next = Array.from({ length: 10 }, (_, i) => `Next item ${i} with enough words to wrap onto a second Helvetica line of the desk note.`);
  const bytes = researchPdf(note);
  const latin = new TextDecoder("latin1").decode(bytes);
  assert.match(latin, /%PDF-1\./);
  assert.match(latin, /\/Count [2-9]/);
  assert.match(latin, /52w chg/);
  assert.match(latin, /ATRIUM RESEARCH/);
  const at = Number(latin.match(/startxref\n(\d+)/)?.[1]);
  assert.equal(latin.slice(at, at + 4), "xref");
});
