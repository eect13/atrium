import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, fromManila, hexToHsv, hsvToHex, manilaParts, moneyShort, monthCells, notePlain, setDeskZone, staleTagline } from "./format.ts";

test("moneyShort compact last for large notionals", () => {
  assert.equal(moneyShort(4_850_048, "PHP"), "₱4.85M");
  assert.equal(moneyShort(12_500_000, "PHP"), "₱12.5M");
  assert.equal(moneyShort(150_000, "PHP"), "₱150K");
  assert.match(moneyShort(42.5, "USD"), /42\.50/);
});

test("notePlain strips tags and decodes entities", () => {
  assert.equal(notePlain("<b>Buy rice</b>", ""), "Buy rice");
  assert.equal(notePlain("a<br>b", ""), "a\nb");
  assert.equal(notePlain("A &amp; B", ""), "A & B");
  assert.equal(notePlain(undefined, "plain"), "plain");
});

test("staleTagline folds the old desk copy", () => {
  assert.equal(staleTagline("Local-first desk"), "");
  assert.equal(staleTagline("Local-first · Asia/Manila"), "");
  assert.equal(staleTagline("  my desk  "), "my desk");
});

test("hsvToHex round-trips a paper color", () => {
  const hsv = hexToHsv("#cfd2d6");
  assert.equal(hsvToHex(hsv.h, hsv.s, hsv.v), "#cfd2d6");
  assert.equal(hsvToHex(0, 0, 1), "#ffffff");
  assert.equal(hsvToHex(0, 0, 0), "#000000");
});

test("monthCells fills a week-aligned grid", () => {
  const grid = monthCells(fromManila(2026, 9, 1, 12));
  assert.equal(grid.length % 7, 0);
  assert.ok(grid.some((c) => !c.out && c.day === 1));
  assert.ok(grid.some((c) => !c.out && c.day === 30));
});

test("addDays walks civil dates across US DST", () => {
  setDeskZone({ tz: "America/New_York", locale: "en-US" });
  try {
    const spring = fromManila(2026, 3, 8, 1, 30);
    const next = addDays(spring, 1);
    const p = manilaParts(next);
    assert.equal(p.year, 2026);
    assert.equal(p.month, 3);
    assert.equal(p.day, 9);
    assert.equal(p.hour, 1);
    const fall = addDays(fromManila(2026, 11, 1, 1, 30), 1);
    assert.equal(manilaParts(fall).day, 2);
  } finally {
    setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
  }
});
