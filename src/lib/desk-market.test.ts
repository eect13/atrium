import assert from "node:assert/strict";
import { test } from "node:test";
import { deskMarket, deskYahooSymbols, digestUrl, homeBoardRows, isHomeSymbol, NIFTY_SYMBOL } from "./desk-market.ts";
import { PSEI_SYMBOL } from "./yahoo.ts";

test("Philippines All stays the factory PSE tape", () => {
  const ph = deskMarket("PH");
  assert.equal(ph.pseHome, true);
  assert.equal(ph.index.symbol, PSEI_SYMBOL);
  assert.equal(ph.names.length, 0);
  assert.ok(ph.tape.includes(NIFTY_SYMBOL));
});

test("US All is Yahoo names, not PSE", () => {
  const us = deskMarket("US");
  assert.equal(us.pseHome, false);
  assert.equal(us.index.symbol, "^GSPC");
  assert.equal(us.yahooRegion, "US");
  assert.ok(us.names.some((n) => n.symbol === "AAPL"));
  const rows = homeBoardRows({}, undefined, us, () => false);
  assert.ok(rows.some((r) => r.item.symbol === "AAPL"));
  assert.equal(rows.every((r) => r.item.kind === "global"), true);
});

test("HK and India seeds are exchange-suffixed", () => {
  assert.ok(deskMarket("HK").names.some((n) => n.symbol.endsWith(".HK")));
  assert.ok(deskMarket("IN").index.symbol === NIFTY_SYMBOL);
  assert.ok(deskMarket("IN").names.some((n) => n.symbol.endsWith(".NS")));
});

test("desk yahoo symbols always include PSEi and Nifty", () => {
  for (const id of ["PH", "US", "HK", "IN"]) {
    const syms = deskYahooSymbols(id);
    assert.ok(syms.includes(PSEI_SYMBOL), id);
    assert.ok(syms.includes(NIFTY_SYMBOL), id);
  }
});

test("digest url is region-local and daily-first", () => {
  const ph = decodeURIComponent(digestUrl("PH"));
  assert.match(ph, /when:1d/);
  assert.match(ph, /gl=PH/);
  const us = decodeURIComponent(digestUrl("US"));
  assert.match(us, /Wall Street|S&P 500|Nasdaq/);
  assert.match(us, /gl=US/);
  const hk = decodeURIComponent(digestUrl("HK", "7d"));
  assert.match(hk, /when:7d/);
  assert.match(hk, /Hang Seng/);
});

test("home symbol filter keeps the desk exchange", () => {
  assert.equal(isHomeSymbol("0700.HK", "HK"), true);
  assert.equal(isHomeSymbol("AAPL", "HK"), false);
  assert.equal(isHomeSymbol("AAPL", "US"), true);
  assert.equal(isHomeSymbol("0700.HK", "US"), false);
  assert.equal(isHomeSymbol("RELIANCE.NS", "IN"), true);
  const rows = homeBoardRows(
    {},
    [
      { id: "AAPL", label: "AAPL", kind: "global", price: 1, ccy: "USD" },
      { id: "0700.HK", label: "0700", kind: "global", price: 1, ccy: "HKD" },
    ],
    deskMarket("HK"),
    () => false,
  );
  assert.equal(rows.some((r) => r.item.symbol === "AAPL"), false);
  assert.equal(rows.some((r) => r.item.symbol === "0700.HK"), true);
});
