import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, foldNoteChecks, fromManila, hexToHsv, hsvToHex, manilaParts, moneyShort, monthCells, notePlain, noteTitle, relativeDesk, setDeskZone, staleTagline } from "./format.ts";

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

test("noteTitle falls back to body then first to-do", () => {
  assert.equal(noteTitle({ title: " Milk ", text: "body" }), "Milk");
  assert.equal(noteTitle({ text: "Buy rice\nmore" }), "Buy rice");
  assert.equal(noteTitle({ text: "", checks: [{ text: "Call the bank" }] }), "Call the bank");
  assert.equal(noteTitle({ text: "" }), "Untitled");
});

test("foldNoteChecks writes leftover to-dos into the body", () => {
  assert.equal(foldNoteChecks({ text: "hi" }), null);
  const folded = foldNoteChecks({
    text: "Milk",
    checks: [
      { text: "Eggs", done: false },
      { text: "<script>", done: true },
    ],
  });
  assert.ok(folded);
  assert.match(folded.html, /note-checks/);
  assert.match(folded.html, /data-done="true"/);
  assert.match(folded.text, /Eggs/);
  assert.equal(folded.html.includes("<script>"), false);
  assert.ok(folded.html.includes("&" + "lt;script&" + "gt;"));
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

test("relativeDesk is desk-relative, not a month-old stamp", () => {
  const now = new Date("2026-09-18T12:00:00Z");
  assert.equal(relativeDesk("2026-09-18T10:00:00Z", now), "2h ago");
  assert.equal(relativeDesk("2026-09-17T12:00:00Z", now), "yesterday");
  assert.equal(relativeDesk("2026-09-06T12:00:00Z", now), "12d ago");
  assert.match(relativeDesk("2026-07-29T00:00:00Z", now), /Jul/);
  assert.equal(relativeDesk("", now), "");
});
