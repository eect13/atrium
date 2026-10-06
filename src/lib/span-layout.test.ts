import assert from "node:assert/strict";
import { test } from "node:test";
import { fromManila, inclusiveAllDayEnd, isoDate, manilaAt, monthCells } from "./format.ts";
import { PAGE_SPAN_CAP, WIDGET_SPAN_CAP, eventDayRange, isSpanEvent, layoutSpanRows, spanCellLabel, spanDayOf, spanRangeLabel, spanWhen } from "./span-layout.ts";

type Ev = { id: string; title: string; start: string; end: string };
const allDay = (id: string, first: string, last: string, title = id): Ev => ({
  id,
  title,
  start: manilaAt(first, 0).toISOString(),
  end: manilaAt(last, 23, 59).toISOString(),
});
const timed = (id: string, day: string, h0: number, endDay: string, h1: number, title = id): Ev => ({
  id,
  title,
  start: manilaAt(day, h0).toISOString(),
  end: manilaAt(endDay, h1).toISOString(),
});
/** October 2026 month grid: Sun 27 Sep … Sat 31 Oct, 5 week rows. */
const OCT = (() => {
  const keys = monthCells(fromManila(2026, 10, 1, 12)).map((c) => isoDate(c.date));
  return Array.from({ length: keys.length / 7 }, (_, w) => keys.slice(w * 7, w * 7 + 7));
})();
const rowOf = (key: string) => OCT.findIndex((r) => r.includes(key));

test("span layout: grid fixture is Oct 2026 (5 rows, Sun-first)", () => {
  assert.equal(OCT.length, 5);
  assert.equal(OCT[0]![0], "2026-09-27");
  assert.equal(OCT[4]![6], "2026-10-31");
});

test("span layout: single-day events stay singles (no segment, one cell)", () => {
  const rows = layoutSpanRows([timed("a", "2026-10-07", 9, "2026-10-07", 10), allDay("b", "2026-10-07", "2026-10-07")], OCT, WIDGET_SPAN_CAP);
  const r = rows[rowOf("2026-10-07")]!;
  assert.equal(r.segs.length, 0);
  assert.equal(r.lanes, 0);
  const cell = r.cells[r.days.indexOf("2026-10-07")]!;
  assert.deepEqual(cell.singles.map((e) => e.id), ["b", "a"]);
  assert.equal(cell.more, 0);
  assert.equal(rows.flatMap((x) => x.cells).filter((c) => c.all.length).length, 1);
});

test("span layout: one segment per row, never one per day", () => {
  const rows = layoutSpanRows([allDay("sprint", "2026-10-06", "2026-10-08")], OCT, WIDGET_SPAN_CAP);
  const r = rows[rowOf("2026-10-06")]!;
  assert.equal(r.segs.length, 1);
  const s = r.segs[0]!;
  assert.deepEqual([s.c0, s.c1, s.lane, s.trueStart, s.trueEnd], [2, 4, 0, true, true]);
  // The span is listed on each covered day (for labels), but is not a single.
  for (const k of ["2026-10-06", "2026-10-07", "2026-10-08"]) {
    const c = r.cells[r.days.indexOf(k)]!;
    assert.deepEqual(c.all.map((e) => e.id), ["sprint"]);
    assert.equal(c.singles.length, 0);
  }
});

test("span layout: cross-week bar breaks at Saturday and resumes Sunday with squared ends", () => {
  const rows = layoutSpanRows([allDay("trip", "2026-10-16", "2026-10-19")], OCT, WIDGET_SPAN_CAP);
  const a = rows[rowOf("2026-10-16")]!.segs[0]!;
  const b = rows[rowOf("2026-10-19")]!.segs[0]!;
  assert.deepEqual([a.c0, a.c1, a.trueStart, a.trueEnd], [5, 6, true, false]);
  assert.deepEqual([b.c0, b.c1, b.trueStart, b.trueEnd], [0, 1, false, true]);
});

test("span layout: cross-month spans clip at the grid edges with squared ends", () => {
  const prior = allDay("prior", "2026-09-20", "2026-09-29"); // starts before the visible grid
  const next = allDay("next", "2026-10-30", "2026-11-04"); // ends after the visible grid
  const inGrid = allDay("edge", "2026-09-29", "2026-10-02"); // starts in the prior month, inside the grid
  const rows = layoutSpanRows([prior, next, inGrid], OCT, WIDGET_SPAN_CAP);
  const first = rows[0]!.segs;
  const p = first.find((s) => s.e.id === "prior")!;
  assert.deepEqual([p.c0, p.c1, p.trueStart, p.trueEnd], [0, 2, false, true]);
  const g = first.find((s) => s.e.id === "edge")!;
  assert.deepEqual([g.c0, g.c1, g.trueStart, g.trueEnd], [2, 5, true, true]);
  const n = rows[4]!.segs.find((s) => s.e.id === "next")!;
  assert.deepEqual([n.c0, n.c1, n.trueStart, n.trueEnd], [5, 6, true, false]);
  // Continuing span takes lane 0 even though "edge" starts in the same row.
  assert.equal(p.lane, 0);
  assert.equal(g.lane, 1);
});

test("span layout: all-day exclusive end (ICS/Google DTEND) — next day = 1 day, 3-day = 3 cells", () => {
  const one = { id: "bday", title: "Birthday", start: manilaAt("2026-10-12", 0).toISOString(), end: inclusiveAllDayEnd("2026-10-12", "2026-10-13").toISOString() };
  const three = { id: "off", title: "Offsite", start: manilaAt("2026-10-13", 0).toISOString(), end: inclusiveAllDayEnd("2026-10-13", "2026-10-16").toISOString() };
  assert.equal(isSpanEvent(one), false);
  assert.deepEqual(eventDayRange(three), { first: "2026-10-13", last: "2026-10-15" });
  const r = layoutSpanRows([one, three], OCT, WIDGET_SPAN_CAP)[rowOf("2026-10-12")]!;
  assert.equal(r.segs.length, 1);
  assert.deepEqual([r.segs[0]!.c0, r.segs[0]!.c1], [2, 4]);
  assert.deepEqual(r.cells[1]!.singles.map((e) => e.id), ["bday"]);
  assert.equal(r.cells.filter((c) => c.all.some((e) => e.id === "off")).length, 3);
});

test("span layout: timed multi-day events span too (start day → end day)", () => {
  const ev = timed("flight", "2026-10-21", 22, "2026-10-23", 6, "Flight");
  assert.equal(isSpanEvent(ev), true);
  const s = layoutSpanRows([ev], OCT, PAGE_SPAN_CAP)[rowOf("2026-10-21")]!.segs[0]!;
  assert.deepEqual([s.c0, s.c1, s.trueStart, s.trueEnd], [3, 5, true, true]);
  assert.deepEqual(spanDayOf(ev, "2026-10-22"), { n: 2, total: 3 });
});

test("span layout: lanes — overlaps stack, gaps reuse lanes, longer first on ties, stable per row", () => {
  const evs = [
    allDay("workshop", "2026-10-14", "2026-10-16", "Workshop"),
    allDay("trip", "2026-10-16", "2026-10-19", "Family trip"),
    allDay("short", "2026-10-11", "2026-10-12", "Short"),
    allDay("long", "2026-10-11", "2026-10-13", "Long"),
  ];
  const r = layoutSpanRows(evs, OCT, PAGE_SPAN_CAP)[rowOf("2026-10-14")]!;
  const lane = (id: string) => r.segs.find((s) => s.e.id === id)!.lane;
  assert.equal(lane("long"), 0); // same start, longer first
  assert.equal(lane("short"), 1);
  assert.equal(lane("workshop"), 0); // starts after "long" ends → reuses lane 0
  assert.equal(lane("trip"), 1); // overlaps workshop on the 16th
  assert.equal(r.lanes, 2);
  // Next row: the continuing trip claims lane 0.
  const next = layoutSpanRows(evs, OCT, PAGE_SPAN_CAP)[rowOf("2026-10-18")]!;
  assert.equal(next.segs.find((s) => s.e.id === "trip")!.lane, 0);
  // Same input → same output (stable).
  assert.deepEqual(layoutSpanRows([...evs].reverse(), OCT, PAGE_SPAN_CAP), layoutSpanRows(evs, OCT, PAGE_SPAN_CAP));
});

test("span layout: widget cap — 3 rows total, '+N' takes the last row", () => {
  const sprint = allDay("sprint", "2026-10-06", "2026-10-08");
  const busy = Array.from({ length: 6 }, (_, i) => timed(`s${i}`, "2026-10-08", 9 + i, "2026-10-08", 10 + i));
  const three = Array.from({ length: 3 }, (_, i) => timed(`t${i}`, "2026-10-06", 9 + i, "2026-10-06", 10 + i));
  const r = layoutSpanRows([sprint, ...busy, ...three], OCT, WIDGET_SPAN_CAP)[rowOf("2026-10-06")]!;
  assert.equal(r.lanes, 1);
  const tue = r.cells[2]!; // 3 singles, room 2 → 1 bar + "+2"
  assert.deepEqual([tue.shown.length, tue.more], [1, 2]);
  const thu = r.cells[4]!; // 6 singles → 1 bar + "+5"
  assert.deepEqual([thu.shown.length, thu.more], [1, 5]);
  // Without lanes, 3 singles fit and 4 become 2 + "+2" (R3: week shows 2 bars + "+N").
  const free = layoutSpanRows(busy.slice(0, 4), OCT, WIDGET_SPAN_CAP)[rowOf("2026-10-08")]!.cells[4]!;
  assert.deepEqual([free.shown.length, free.more], [2, 2]);
  const fit = layoutSpanRows(busy.slice(0, 3), OCT, WIDGET_SPAN_CAP)[rowOf("2026-10-08")]!.cells[4]!;
  assert.deepEqual([fit.shown.length, fit.more], [3, 0]);
});

test("span layout: widget cap — spans past 2 lanes count into '+N'", () => {
  const evs = [allDay("a", "2026-10-13", "2026-10-15"), allDay("b", "2026-10-13", "2026-10-15"), allDay("c", "2026-10-14", "2026-10-16")];
  const r = layoutSpanRows(evs, OCT, WIDGET_SPAN_CAP)[rowOf("2026-10-14")]!;
  assert.equal(r.lanes, 2);
  assert.deepEqual(r.segs.map((s) => s.e.id).sort(), ["a", "b"]);
  const wed = r.cells[3]!;
  assert.deepEqual([wed.shown.length, wed.more], [0, 1]);
  assert.equal(wed.all.length, 3);
  const mon = r.cells[1]!;
  assert.equal(mon.more, 0);
});

test("span layout: page cap — 3 mark rows, '+N more' sits in its own row", () => {
  const sprint = allDay("sprint", "2026-10-06", "2026-10-08");
  const busy = Array.from({ length: 6 }, (_, i) => timed(`s${i}`, "2026-10-08", 9 + i, "2026-10-08", 10 + i));
  const r = layoutSpanRows([sprint, ...busy], OCT, PAGE_SPAN_CAP)[rowOf("2026-10-08")]!;
  const thu = r.cells[4]!;
  assert.deepEqual([thu.shown.length, thu.more], [2, 4]);
  const four = Array.from({ length: 4 }, (_, i) => allDay(`x${i}`, "2026-10-20", "2026-10-21"));
  const r2 = layoutSpanRows(four, OCT, PAGE_SPAN_CAP)[rowOf("2026-10-20")]!;
  assert.equal(r2.lanes, 3);
  assert.equal(r2.cells[2]!.more, 1);
});

test("span layout: agenda helpers — day n of N and range label", () => {
  const ev = allDay("trip", "2026-10-16", "2026-10-19");
  assert.deepEqual(spanDayOf(ev, "2026-10-16"), { n: 1, total: 4 });
  assert.deepEqual(spanDayOf(ev, "2026-10-19"), { n: 4, total: 4 });
  assert.match(spanRangeLabel(ev), /16\D+19/);
  assert.match(spanWhen(ev, "2026-10-17"), /^All day · \D*16\D+19\D* · day 2 of 4$/);
  const one = timed("x", "2026-10-17", 9, "2026-10-17", 10);
  assert.equal(spanWhen(one, "2026-10-17").includes("day"), false);
  assert.equal(spanCellLabel(manilaAt("2026-10-17", 12), [ev, one]), "Sat 17 Oct, 2 events: trip, x");
});
