import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalendarEvent } from "../types.ts";
import { instanceId, planSeriesDelete, planSeriesSave, repeatPhrase } from "./series-edit.ts";

// Weekly Tuesday 09:00–10:00 Manila (01:00Z), from Tue 6 Oct 2026.
const master = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({ id: "m", title: "Standup", start: "2026-10-06T01:00:00.000Z", end: "2026-10-06T02:00:00.000Z", cat: "work", loc: "", source: "local", repeat: "weekly", ...over });
const occ = "2026-10-13T01:00:00.000Z";
let n = 0;
const ids = () => `n${++n}`;

test("instance ids follow Google's recurring-instance format", () => {
  assert.equal(instanceId("abc", occ), "abc_20261013T010000Z");
  assert.equal(instanceId("abc", occ, true, "2026-10-13"), "abc_20261013");
});

test("This event (Atrium only): master skips the date, a single event replaces it at the occurrence", () => {
  const p = planSeriesSave("this", master(), { title: "Standup (late)", start: "2026-10-06T02:00:00.000Z", end: "2026-10-06T03:00:00.000Z" }, occ, "2026-10-13", ids);
  assert.deepEqual(p.update, { id: "m", patch: { skip: ["2026-10-13"] } });
  assert.equal(p.add!.title, "Standup (late)");
  assert.equal(p.add!.start, "2026-10-13T02:00:00.000Z");
  assert.equal(p.add!.repeat, undefined);
  assert.deepEqual(p.google, []);
});

test("This event (Google): patches the instance id, which Google keeps as an exception", () => {
  const p = planSeriesSave("this", master({ source: "google", calId: "me@x", remoteId: "abc", etag: '"1"' }), { title: "Moved" }, occ, "2026-10-13", ids);
  assert.equal(p.google.length, 1);
  assert.equal(p.google[0]!.kind, "update");
  assert.equal(p.google[0]!.event.remoteId, "abc_20261013T010000Z");
  assert.equal(p.google[0]!.event.etag, undefined);
  assert.equal(p.add!.id, "g-me@x-abc_20261013T010000Z", "matches the id the next pull gives the exception");
});

test("This and following: master ends before the occurrence; a new series starts there (Google: update + create)", () => {
  const p = planSeriesSave("following", master({ source: "google", calId: "me@x", remoteId: "abc", repeatCount: 10, skip: ["2026-10-06", "2026-10-20"] }), { title: "New standup" }, occ, "2026-10-13", ids);
  assert.equal(p.update!.patch.repeatUntil, "2026-10-13T00:59:59.000Z");
  assert.equal(p.update!.patch.repeatCount, undefined);
  assert.equal(p.add!.start, occ);
  assert.equal(p.add!.remoteId, undefined);
  assert.deepEqual(p.add!.skip, ["2026-10-20"]);
  assert.deepEqual(p.google.map((g) => g.kind), ["update", "create"]);
});

test("This and following on the first occurrence = All events", () => {
  const p = planSeriesSave("following", master(), { title: "X" }, "2026-10-06T01:00:00.000Z", "2026-10-06", ids);
  assert.deepEqual(p.update, { id: "m", patch: { title: "X" } });
  assert.equal(p.add, undefined);
});

test("Delete: this (Google instance delete), following (end the series), all (remove)", () => {
  const g = master({ source: "google", calId: "me@x", remoteId: "abc" });
  const one = planSeriesDelete("this", g, occ, "2026-10-13");
  assert.deepEqual(one.update!.patch, { skip: ["2026-10-13"] });
  assert.equal(one.google[0]!.kind, "delete");
  assert.equal(one.google[0]!.event.remoteId, "abc_20261013T010000Z");
  const tail = planSeriesDelete("following", g, occ, "2026-10-13");
  assert.equal(tail.update!.patch.repeatUntil, "2026-10-13T00:59:59.000Z");
  assert.equal(tail.google[0]!.kind, "update");
  assert.deepEqual(planSeriesDelete("all", master(), occ, "2026-10-13"), { remove: "m", google: [] });
});

test("repeatPhrase reads like the Card 168 body", () => {
  assert.equal(repeatPhrase(master()), "repeats every Tuesday");
  assert.equal(repeatPhrase(master({ repeat: "daily" })), "repeats every day");
});
