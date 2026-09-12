import assert from "node:assert/strict";
import { test } from "node:test";
import { fromManila, moneyShort, monthCells, notePlain, staleTagline } from "./format.ts";

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

test("monthCells fills a week-aligned grid", () => {
  const grid = monthCells(fromManila(2026, 9, 1, 12));
  assert.equal(grid.length % 7, 0);
  assert.ok(grid.some((c) => !c.out && c.day === 1));
  assert.ok(grid.some((c) => !c.out && c.day === 30));
});
