import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isYahooIndex,
  overlayYahoo,
  parseYahooQuote,
  parseYahooSpark,
  pseTickerFromYahoo,
  PSEI_SYMBOL,
  YAHOO_CORE_TAPE,
  type YahooLast,
} from "./yahoo.ts";

test("parseYahooQuote reads trailingPE and marketCap", () => {
  const rows = parseYahooQuote({
    quoteResponse: {
      result: [
        {
          symbol: "COST",
          regularMarketPrice: 940.12,
          currency: "USD",
          trailingPE: 52.3,
          marketCap: 417_000_000_000,
          shortName: "Costco",
          averageDailyVolume10Day: 2_400_000,
        },
        { symbol: "SKIP" },
      ],
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.symbol, "COST");
  assert.equal(rows[0]?.pe, 52.3);
  assert.ok((rows[0]?.marketCap ?? 0) > 400_000_000_000);
  assert.equal(rows[0]?.avgVolume, 2_400_000);
});

test("overlayYahoo fills missing PE and cap without clobbering last", () => {
  const prev: YahooLast = { symbol: "BDO.PS", price: 141, currency: "PHP", volume: 1_000 };
  const extra: YahooLast = { symbol: "BDO.PS", price: 999, currency: "PHP", pe: 9.2, marketCap: 1_200_000_000, avgVolume: 50_000 };
  const next = overlayYahoo(prev, extra);
  assert.equal(next.price, 141);
  assert.equal(next.pe, 9.2);
  assert.equal(next.marketCap, 1_200_000_000);
  assert.equal(next.volume, 1_000);
  assert.equal(next.avgVolume, 50_000);
});

test("PSEi is an index and never maps onto the listed PSE stock", () => {
  assert.equal(isYahooIndex(PSEI_SYMBOL), true);
  assert.equal(isYahooIndex("^GSPC"), true);
  assert.equal(isYahooIndex("BDO.PS"), false);
  assert.equal(pseTickerFromYahoo(PSEI_SYMBOL), null);
  assert.equal(pseTickerFromYahoo("BDO.PS"), "BDO");
  assert.equal(pseTickerFromYahoo("^GSPC"), null);
  assert.ok(YAHOO_CORE_TAPE.includes(PSEI_SYMBOL));
});

test("parseYahooSpark keeps the PSEi index and drops empty .PS shells", () => {
  const rows = parseYahooSpark({
    spark: {
      result: [
        { symbol: "BDO.PS", response: [{ meta: { symbol: "BDO.PS", exchangeName: "YHD" } }] },
        {
          symbol: PSEI_SYMBOL,
          response: [
            {
              meta: {
                symbol: PSEI_SYMBOL,
                shortName: "PSEi INDEX",
                regularMarketPrice: 5958.64,
                regularMarketChangePercent: 0.705,
                currency: "PHP",
                fiftyTwoWeekHigh: 7552.2,
                fiftyTwoWeekLow: 5902,
              },
              indicators: { quote: [{ close: [5916.94, 5958.64] }] },
            },
          ],
        },
      ],
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.symbol, PSEI_SYMBOL);
  assert.equal(rows[0]?.price, 5958.64);
  assert.equal(rows[0]?.weekHigh, 7552.2);
  assert.equal(rows[0]?.weekLow, 5902);
  assert.ok((rows[0]?.spark?.length ?? 0) >= 2);
});
