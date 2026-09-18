import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPublicStats, bankFiling, distortedPublicTape, filingFreshness, justifiedPb, liveBankFiling, overlayStats, parseStockAnalysisStats, seededStats } from "./pse-fundamentals.ts";

test("stockanalysis stats parse PE P/B yield and cap", () => {
  const html = `{id:"marketCap",title:"Market Cap",value:"610.37B",hover:"610,365,646,519",url:"market-cap"},{id:"peRatio",title:"PE Ratio",value:"7.05",hover:"7.048"},{id:"peForward",title:"Forward PE",value:"6.59",hover:"6.586"},{id:"pb",title:"PB Ratio",value:"0.93",hover:"0.931"},{id:"dividendYield",title:"Dividend Yield",value:"3.85%",hover:"3.846%"}`;
  const s = parseStockAnalysisStats(html, "BDO");
  assert.equal(s.pe, 7.05);
  assert.equal(s.forwardPe, 6.59);
  assert.equal(s.pb, 0.93);
  assert.equal(s.yieldPct, 3.85);
  assert.equal(s.marketCap, 610_365_646_519);
  assert.equal(s.source, "stockanalysis");
});

test("empty stockanalysis html is an empty sheet, not invented multiples", () => {
  const s = parseStockAnalysisStats("<html></html>", "BDO");
  assert.equal(s.pe, undefined);
  assert.equal(s.pb, undefined);
  assert.equal(s.source, undefined);
});

test("H1 2026 bank filings are last reported, not a live tape", () => {
  const bdo = bankFiling("BDO.PS");
  assert.equal(bdo?.roe, 12.72);
  assert.equal(bdo?.nim, 4.2);
  assert.equal(bdo?.npl, 1.64);
  assert.equal(bdo?.cet1, 13.1);
  assert.equal(bdo?.asOfDate, "2026-06-30");
  assert.equal(bankFiling("BPI")?.roe, 13.8);
  assert.equal(bankFiling("MBT")?.nim, undefined);
  assert.equal(bankFiling("CBC")?.cet1, 14.68);
  assert.equal(bankFiling("ICT"), undefined);
});

test("justified P/B is the residual-income identity", () => {
  const pb = justifiedPb(12.72, 0.12, 0.05);
  assert.ok(pb != null);
  assert.equal(Number(pb.toFixed(2)), 1.1);
  assert.equal(justifiedPb(12, 0.05, 0.05), null);
});

test("parser tolerates spaces around stockanalysis keys", () => {
  const html = '{id: "peRatio", title: "PE Ratio", value: "7.05"}';
  assert.equal(parseStockAnalysisStats(html, "BDO").pe, 7.05);
});

test("live stockanalysis ids are pe and marketcap, not peRatio", () => {
  const html = `ratios:{text:"The trailing PE ratio is 7.05 and the forward PE ratio is 6.59.",data:[{id:"pe",title:"PE Ratio",value:"7.05",hover:"7.048"},{id:"peForward",title:"Forward PE",value:"6.59",hover:"6.586"},{id:"pb",title:"PB Ratio",value:"0.93",hover:"0.931"},{id:"dividendYield",title:"Dividend Yield",value:"3.85%",hover:"3.846%"},{id:"roe",title:"Return on Equity (ROE)",value:"13.82%",hover:"13.823%"}]},{id:"marketcap",title:"Market Cap",value:"610.37B",hover:"610,365,646,519"}`;
  const s = parseStockAnalysisStats(html, "BDO");
  assert.equal(s.pe, 7.05);
  assert.equal(s.forwardPe, 6.59);
  assert.equal(s.pb, 0.93);
  assert.equal(s.yieldPct, 3.85);
  assert.equal(s.marketCap, 610_365_646_519);
  assert.equal(s.roe, 13.82);
});

test("overlayStats fills empty multiples and keeps Yahoo when present", () => {
  const filled = overlayStats({ price: 1, pe: undefined as number | undefined, pb: undefined as number | undefined }, { pe: 7.05, pb: 0.93 });
  assert.equal(filled.pe, 7.05);
  assert.equal(filled.pb, 0.93);
  const keep = overlayStats({ price: 1, pe: 9.2 }, { pe: 7.05 });
  assert.equal(keep.pe, 9.2);
});

test("PSEi public-tape seed fills BDO PE on the board", () => {
  const bdo = seededStats("BDO.PS");
  assert.equal(bdo?.pe, 7.05);
  assert.equal(bdo?.pb, 0.93);
  assert.equal(seededStats("ICT")?.pe, 26.96);
  assert.equal(seededStats("COST"), undefined);
});

test("applyPublicStats lets live tape win over seed", () => {
  const seeded = overlayStats({ pe: undefined as number | undefined, pb: undefined as number | undefined }, seededStats("BDO"));
  assert.equal(seeded.pe, 7.05);
  const live = applyPublicStats(seeded, { pe: 7.1, pb: 0.95 });
  assert.equal(live.pe, 7.1);
  assert.equal(live.pb, 0.95);
});

test("H1 2026 filings stay current on 18 Sep and age out after the next 17-Q window", () => {
  const bdo = bankFiling("BDO");
  assert.ok(bdo);
  assert.equal(filingFreshness(bdo, new Date("2026-09-18T00:00:00Z")), "current");
  assert.equal(filingFreshness(bdo, new Date("2026-10-20T00:00:00Z")), "aging");
  assert.equal(filingFreshness(bdo, new Date("2026-12-01T00:00:00Z")), "stale");
  assert.equal(liveBankFiling("BDO", new Date("2026-09-18T00:00:00Z"))?.roe, 12.72);
  assert.equal(liveBankFiling("BDO", new Date("2026-12-01T00:00:00Z")), undefined);
});

test("stockanalysis parses 52w change RSI SMA and average volume", () => {
  const html = `{id:"ch1y",title:"52-Week Change",value:"-18.34%"},{id:"sma50",title:"50-Day Moving Average",value:"122.54"},{id:"rsi",title:"RSI",value:"35.06"},{id:"averageVolume",title:"Average Volume",value:"3,487,926"},{id:"beta",title:"Beta",value:"0.42"}`;
  const s = parseStockAnalysisStats(html, "BDO");
  assert.equal(s.weekChange, -18.34);
  assert.equal(s.sma50, 122.54);
  assert.equal(s.rsi, 35.06);
  assert.equal(s.avgVolume, 3_487_926);
  assert.equal(s.beta, 0.42);
});

test("distortedPublicTape flags ICT TTM, not BDO", () => {
  assert.equal(distortedPublicTape({ roe: 57.4, pb: 12.5 }), true);
  assert.equal(distortedPublicTape({ roe: 13.82, pb: 0.93 }), false);
  assert.equal(distortedPublicTape(seededStats("ICT")), true);
  assert.equal(distortedPublicTape(seededStats("BDO")), false);
});
