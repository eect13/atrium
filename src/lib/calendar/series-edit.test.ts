import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalendarEvent } from "../types.ts";
import { planSeriesDelete, planSeriesSave, repeatPhrase } from "./series-edit.ts";

// Weekly Tuesday 09:00–10:00 Manila (01:00Z), from Tue 6 Oct 2026.
const master = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({ id: "m", title: "Standup", start: "2026-10-06T01:00:00.000Z", end: "2026-10-06T02:00:00.000Z", cat: "work", loc: "", source: "local", repeat: "weekly", ...over });
const occ = "2026-10-13T01:00:00.000Z";
let n = 0;
const ids = () => `n${++n}`;

// Card 242: the Google instance-id / remote-write cases were removed with the Google client.

test("This event: master skips the date, a single event replaces it at the occurrence", () => {
  const p = planSeriesSave("this", master(), { title: "Standup (late)", start: "2026-10-06T02:00:00.000Z", end: "2026-10-06T03:00:00.000Z" }, occ, "2026-10-13", ids);
  assert.deepEqual(p.update, { id: "m", patch: { skip: ["2026-10-13"] } });
  assert.equal(p.add!.title, "Standup (late)");
  assert.equal(p.add!.start, "2026-10-13T02:00:00.000Z");
  assert.equal(p.add!.repeat, undefined);
  assert.equal(p.remove, undefined);
});

test("This and following: master ends before the occurrence; a new series starts there", () => {
  const p = planSeriesSave("following", master({ repeatCount: 10, skip: ["2026-10-06", "2026-10-20"] }), { title: "New standup" }, occ, "2026-10-13", ids);
  assert.equal(p.update!.patch.repeatUntil, "2026-10-13T00:59:59.000Z");
  assert.equal(p.update!.patch.repeatCount, undefined);
  assert.equal(p.add!.start, occ);
  assert.deepEqual(p.add!.skip, ["2026-10-20"]);
});

test("This and following on the first occurrence = All events", () => {
  const p = planSeriesSave("following", master(), { title: "X" }, "2026-10-06T01:00:00.000Z", "2026-10-06", ids);
  assert.deepEqual(p.update, { id: "m", patch: { title: "X" } });
  assert.equal(p.add, undefined);
});

test("Delete: this (skip), following (end the series), all (remove)", () => {
  const one = planSeriesDelete("this", master(), occ, "2026-10-13");
  assert.deepEqual(one.update!.patch, { skip: ["2026-10-13"] });
  const tail = planSeriesDelete("following", master(), occ, "2026-10-13");
  assert.equal(tail.update!.patch.repeatUntil, "2026-10-13T00:59:59.000Z");
  assert.deepEqual(planSeriesDelete("all", master(), occ, "2026-10-13"), { remove: "m" });
});

test("repeatPhrase reads like the Card 168 body", () => {
  assert.equal(repeatPhrase(master()), "repeats every Tuesday");
  assert.equal(repeatPhrase(master({ repeat: "daily" })), "repeats every day");
});
