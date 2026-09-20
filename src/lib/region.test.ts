import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDeskRegion, DESK_REGIONS, isoCountry, regionOf } from "./region.ts";
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

test("hexColor normalizes and inkOnPaper picks contrast", () => {
  assert.equal(hexColor("#AbC"), "#aabbcc");
  assert.equal(hexColor("#e8e4d4"), "#e8e4d4");
  assert.equal(inkOnPaper("#e8e4d4"), "#1c1b16");
  assert.equal(inkOnPaper("#111111"), "#f6f3ea");
});
