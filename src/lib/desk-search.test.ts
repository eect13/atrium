import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCommand, suggestCommands } from "./desk-search.ts";
import { WATCH_CATALOG } from "./types.ts";

test("BDO opens the ticker instead of creating an event", () => {
  const cmd = resolveCommand("BDO");
  assert.equal(cmd.type, "ticker");
  if (cmd.type === "ticker") {
    assert.equal(cmd.item.label, "BDO");
    assert.equal(cmd.tab, "all");
  }
});

test("go finance and bitcoin jump the desk", () => {
  assert.equal(resolveCommand("finance").type, "view");
  const btc = resolveCommand("bitcoin");
  assert.equal(btc.type, "ticker");
  if (btc.type === "ticker") assert.equal(btc.item.label, "BTC");
  const go = resolveCommand("go jollibee");
  assert.equal(go.type, "ticker");
  if (go.type === "ticker") assert.equal(go.item.label, "JFC");
  const gold = resolveCommand("gold");
  assert.equal(gold.type, "ticker");
  if (gold.type === "ticker") {
    assert.equal(gold.item.kind, "cmdty");
    assert.equal(gold.tab, "cmdty");
  }
  const aapl = resolveCommand("AAPL");
  assert.equal(aapl.type, "ticker");
  if (aapl.type === "ticker") assert.equal(aapl.tab, "global");
});

test("Lunch Friday stays an event", () => {
  const cmd = resolveCommand("Lunch Friday 1pm");
  assert.equal(cmd.type, "event");
});

test("unknown text is not an event", () => {
  assert.equal(resolveCommand("xyzzy").type, "search");
  assert.equal(WATCH_CATALOG.some((w) => w.label === "BDO"), true);
});

test("ambiguous names search the board instead of failing", () => {
  const cmd = resolveCommand("ayala");
  assert.equal(cmd.type, "search");
  if (cmd.type === "search") assert.equal(cmd.query.toLowerCase(), "ayala");
  const finance = resolveCommand("finance ayala");
  assert.equal(finance.type, "search");
});

test("prose does not become a market search", () => {
  assert.equal(resolveCommand("hello there").type, "unknown");
});

test("suggestCommands ranks tickers and views", () => {
  const hits = suggestCommands("bdo");
  assert.ok(hits.some((h) => h.label === "BDO"));
  const views = suggestCommands("fin");
  assert.ok(views.some((h) => h.fill === "finance"));
  const wx = suggestCommands("weather");
  assert.ok(wx.some((h) => h.fill === "weather"));
  assert.equal(resolveCommand("zip").type, "view");
});