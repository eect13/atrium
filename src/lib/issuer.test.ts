import assert from "node:assert/strict";
import { test } from "node:test";
import { BOOK_CCY } from "./types.ts";
import { CCY_META, inferCcy, money } from "./format.ts";
import { inferIssuer, searchIssuers } from "./issuer.ts";

test("cash in PH is the peso", () => {
  const hit = inferIssuer({ id: "cash", name: "Wallet cash", kind: "cash" });
  assert.equal(hit.id, "php");
  assert.equal(hit.symbol, "₱");
});

test("detects PH banks and wallets from the name", () => {
  assert.equal(inferIssuer({ id: "bank", name: "BDO checking", kind: "bank" }).id, "bdo");
  assert.equal(inferIssuer({ id: "x", name: "BPI", kind: "bank" }).id, "bpi");
  assert.equal(inferIssuer({ id: "gcash", name: "GCash", kind: "ewallet" }).id, "gcash");
  assert.equal(inferIssuer({ id: "m", name: "Maya", kind: "ewallet" }).id, "maya");
});

test("unknown bank uses a hashed color face", () => {
  const a = inferIssuer({ id: "x", name: "Rural bank of nowhere", kind: "bank" });
  assert.match(a.face, /^tone-\d$/);
  assert.equal(inferIssuer({ id: "bank", name: "BDO checking", kind: "bank" }).face, "bdo");
  assert.equal(inferIssuer({ id: "x", name: "USD checking", kind: "bank", currency: "USD" }).id, "usd");
});

test("yen cash uses the yen mark", () => {
  const hit = inferIssuer({ id: "yen", name: "Japan cash", kind: "cash", currency: "JPY" });
  assert.equal(hit.face, "jpy");
  assert.equal(hit.symbol, "¥");
  assert.equal(hit.mark, "¥");
});

test("digital banks get color faces", () => {
  assert.equal(inferIssuer({ id: "t", name: "Tonik", kind: "ewallet" }).face, "tonik");
  assert.equal(inferIssuer({ id: "g", name: "GoTyme", kind: "ewallet" }).digital, true);
  assert.equal(inferIssuer({ id: "s", name: "SeaBank", kind: "bank" }).face, "mari");
  assert.equal(inferIssuer({ id: "m", name: "MariBank", kind: "ewallet" }).label, "MARI");
});

test("Zed is a credit card face", () => {
  const hit = inferIssuer({ id: "z", name: "Zed card", kind: "bank" });
  assert.equal(hit.face, "zed");
  assert.equal(hit.card, true);
  assert.equal(hit.mark, "Z");
});

test("searchIssuers filters as you type", () => {
  assert.ok(searchIssuers("", "bank").some((r) => r.id === "bdo"));
  assert.equal(searchIssuers("zed", "bank")[0]?.id, "zed");
  assert.equal(searchIssuers("sea", "ewallet")[0]?.id, "mari");
  assert.equal(searchIssuers("zzzz-unknown", "bank").length, 0);
});

test("covers more PH banks with brand faces", () => {
  assert.equal(inferIssuer({ id: "a", name: "AUB savings", kind: "bank" }).face, "aub");
  assert.equal(inferIssuer({ id: "d", name: "DBP", kind: "bank" }).face, "dbp");
  assert.equal(inferIssuer({ id: "h", name: "HSBC", kind: "bank" }).bg, "#6b1218");
  assert.equal(inferIssuer({ id: "m", name: "Maybank", kind: "bank" }).face, "maybank");
  assert.equal(inferIssuer({ id: "m", name: "Maya", kind: "ewallet" }).face, "maya");
  assert.equal(inferIssuer({ id: "o", name: "OFBank", kind: "ewallet" }).face, "ofbank");
});

test("blank unnamed bank uses the uniform face", () => {
  assert.equal(inferIssuer({ id: "x", name: "", kind: "bank" }).face, "blank");
});

test("every book currency has a glyph", () => {
  for (const c of BOOK_CCY) {
    assert.ok(CCY_META[c].symbol, c);
  }
  assert.equal(CCY_META.PHP.symbol, "₱");
  assert.equal(CCY_META.JPY.symbol, "¥");
  assert.equal(CCY_META.KRW.symbol, "₩");
  assert.equal(CCY_META.INR.symbol, "₹");
  assert.equal(CCY_META.THB.symbol, "฿");
  assert.equal(inferCcy("Yen stash"), "JPY");
  assert.equal(inferCcy("baht wallet"), "THB");
  assert.equal(inferCcy("won cash"), "KRW");
});

test("money prints the matching symbol", () => {
  assert.match(money(1200, "PHP"), /^₱/);
  assert.match(money(1200, "USD"), /^\$/);
  assert.match(money(1200, "EUR"), /^€/);
  assert.match(money(1200, "JPY"), /^¥/);
});
