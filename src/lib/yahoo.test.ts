import assert from "node:assert/strict";
import { test } from "node:test";
import { overlayYahoo, parseYahooQuote, type YahooLast } from "./yahoo.ts";

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
        },
        { symbol: "SKIP" },
      ],
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.symbol, "COST");
  assert.equal(rows[0]?.pe, 52.3);
  assert.ok((rows[0]?.marketCap ?? 0) > 400_000_000_000);
});

test("overlayYahoo fills missing PE and cap without clobbering last", () => {
  const prev: YahooLast = { symbol: "BDO.PS", price: 141, currency: "PHP", volume: 1_000 };
  const extra: YahooLast = { symbol: "BDO.PS", price: 999, currency: "PHP", pe: 9.2, marketCap: 1_200_000_000 };
  const next = overlayYahoo(prev, extra);
  assert.equal(next.price, 141);
  assert.equal(next.pe, 9.2);
  assert.equal(next.marketCap, 1_200_000_000);
  assert.equal(next.volume, 1_000);
});
