import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDeskProfile, applyDeskRegion, DESK_REGIONS, isoCountry, normalizeMarkets, regionOf, toggleMarket } from "./region.ts";
import { deskZone, fromManila, hexColor, inkOnPaper, manilaParts, setDeskZone } from "./format.ts";

test("Philippines is the factory desk region", () => {
  const ph = regionOf("PH");
  assert.equal(ph.factory, true);
  assert.equal(ph.tz, "Asia/Manila");
  assert.equal(regionOf("nope").id, "PH");
  assert.ok(DESK_REGIONS.some((r) => r.id === "US"));
  assert.ok(DESK_REGIONS.some((r) => r.id === "JP"));
  assert.ok(DESK_REGIONS.some((r) => r.id === "VN"));
  assert.equal(regionOf("VN").tz, "Asia/Ho_Chi_Minh");
  assert.equal(regionOf("VN").ccy, "VND");
  assert.equal(isoCountry("PH"), "PH");
  assert.equal(isoCountry("EU"), "");
  assert.equal(isoCountry("nope"), "PH");
});

test("desk zone follows region then restores Manila", () => {
  applyDeskRegion("US");
  assert.equal(deskZone().tz, "America/New_York");
  applyDeskRegion("PH");
  assert.equal(deskZone().tz, "Asia/Manila");
  const noon = fromManila(2026, 9, 13, 12, 0);
  const parts = manilaParts(noon);
  assert.equal(parts.hour, 12);
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
});

test("clock and markets are independent of each other", () => {
  applyDeskProfile({ region: "PH", tz: "Asia/Ho_Chi_Minh" });
  assert.equal(deskZone().tz, "Asia/Ho_Chi_Minh");
  applyDeskProfile({ region: "US", tz: "Asia/Manila" });
  assert.equal(deskZone().tz, "Asia/Manila");
  assert.deepEqual(normalizeMarkets(undefined, "VN"), ["VN"]);
  assert.deepEqual(normalizeMarkets(["VN", "US", "VN"]), ["VN", "US"]);
  assert.deepEqual(toggleMarket(["PH"], "VN"), ["PH", "VN"]);
  assert.deepEqual(toggleMarket(["PH", "VN"], "VN"), ["PH"]);
  assert.deepEqual(toggleMarket(["PH"], "PH"), ["PH"]);
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
});

test("a 9am seed follows the desk clock, not a frozen Manila offset", () => {
  applyDeskProfile({ region: "US", tz: "America/New_York", locale: "en-US" });
  assert.equal(fromManila(2026, 9, 27, 9, 0).toISOString(), "2026-09-27T13:00:00.000Z");
  applyDeskProfile({ region: "VN", tz: "Asia/Ho_Chi_Minh", locale: "en-US" });
  assert.equal(fromManila(2026, 9, 27, 9, 0).toISOString(), "2026-09-27T02:00:00.000Z");
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
});

test("hexColor normalizes and inkOnPaper picks contrast", () => {
  assert.equal(hexColor("#AbC"), "#aabbcc");
  assert.equal(hexColor("#e8e4d4"), "#e8e4d4");
  assert.equal(inkOnPaper("#e8e4d4"), "#1c1b16");
  assert.equal(inkOnPaper("#111111"), "#f6f3ea");
});
