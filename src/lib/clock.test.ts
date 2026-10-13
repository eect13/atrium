import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CLOCK_PREFS, cityFromTz, clockList, formatZoneTime, normalizeClockPrefs, resolveZoneId, withClockZone, withoutClockZone, zoneLabel, formatOffsetVsLocal, formatLocalOffsetLabel, differentCivilDay, reorderClockZones, normalizeWorkHours, zoneState, nextClockChange, clockChangeLabel, sharedWorkWindow } from "./clock.ts";

test("normalizeClockPrefs dedupes and keeps hour24 default on", () => {
  const p = normalizeClockPrefs({
    zones: ["Asia/Manila", "Asia/Manila", "bogus/zone", "Europe/London"],
    hour24: false,
  });
  assert.deepEqual(p.zones, ["Asia/Manila", "Europe/London"]);
  assert.equal(p.hour24, false);
  assert.equal(normalizeClockPrefs(undefined).hour24, true);
});

test("resolveZoneId accepts IANA and city hints from clockZones", () => {
  assert.equal(resolveZoneId("Asia/Manila"), "Asia/Manila");
  assert.ok(resolveZoneId("London"));
  assert.equal(resolveZoneId(""), null);
});

test("with / without zone and clockList primary-first", () => {
  let p = withClockZone(DEFAULT_CLOCK_PREFS, "Europe/London");
  p = withClockZone(p, "America/New_York");
  assert.deepEqual(p.zones, ["Europe/London", "America/New_York"]);
  assert.equal(withClockZone(p, "Europe/London"), p);
  p = withoutClockZone(p, "Europe/London");
  assert.deepEqual(p.zones, ["America/New_York"]);
  assert.deepEqual(clockList("Asia/Manila", p), ["Asia/Manila", "America/New_York"]);
  assert.deepEqual(clockList("America/New_York", p), ["America/New_York"]);
});

test("cityFromTz / zoneLabel / formatZoneTime hour cycle", () => {
  assert.equal(cityFromTz("Asia/Manila"), "Manila");
  assert.match(zoneLabel("Asia/Manila"), /Manila/);
  const d = new Date("2026-06-01T04:00:00Z");
  const h23 = formatZoneTime(d, "UTC", { hour24: true });
  const h12 = formatZoneTime(d, "UTC", { hour24: false });
  assert.match(h23, /0?4:00/);
  assert.notEqual(h23, h12);
});

test("offset vs local and civil day for Manila desk", () => {
  const d = new Date("2026-10-06T04:05:00Z");
  const local = "Asia/Manila";
  assert.equal(formatOffsetVsLocal(d, "Europe/London", local), "−7h");
  assert.equal(formatOffsetVsLocal(d, "America/New_York", local), "−12h");
  assert.equal(formatOffsetVsLocal(d, "Asia/Tokyo", local), "+1h");
  assert.equal(formatOffsetVsLocal(d, "Australia/Sydney", local), "+3h");
  assert.equal(formatLocalOffsetLabel(d, local), "UTC+8");
  assert.equal(differentCivilDay(d, "America/New_York", local), false);
  assert.equal(differentCivilDay(d, "America/Los_Angeles", local), true);
});

test("reorderClockZones moves ids", () => {
  const p = { zones: ["Europe/London", "America/New_York", "Asia/Tokyo"], hour24: true, workHours: { start: 9, end: 18 } };
  assert.deepEqual(reorderClockZones(p, "Asia/Tokyo", "Europe/London").zones, [
    "Asia/Tokyo",
    "Europe/London",
    "America/New_York",
  ]);
  assert.equal(reorderClockZones(p, "Europe/London", "Europe/London"), p);
});

test("Card 165 Clock A: work hours default 09–18 and normalise", () => {
  assert.deepEqual(DEFAULT_CLOCK_PREFS.workHours, { start: 9, end: 18 });
  assert.deepEqual(normalizeClockPrefs({ zones: [] }).workHours, { start: 9, end: 18 });
  assert.deepEqual(normalizeClockPrefs({ workHours: { start: 8, end: 17 } }).workHours, { start: 8, end: 17 });
  assert.deepEqual(normalizeWorkHours({ start: 18, end: 9 }), { start: 9, end: 18 });
  const noon = new Date("2026-10-13T04:00:00Z"); // 12:00 Manila
  assert.equal(zoneState(noon, "Asia/Manila"), "work");
  assert.equal(zoneState(noon, "America/New_York"), "night"); // 00:00
  assert.equal(zoneState(new Date("2026-10-13T11:00:00Z"), "Asia/Manila"), "night"); // 19:00
  assert.equal(zoneState(new Date("2026-10-12T22:30:00Z"), "Asia/Manila"), "day"); // 06:30
});

test("Card 165 Clock A: next clock change from Intl offsets, only within 30 days", () => {
  const now = new Date("2026-10-13T04:00:00Z");
  const london = nextClockChange("Europe/London", now);
  assert.ok(london, "London leaves BST on Sun 25 Oct 2026");
  assert.equal(london!.delta, -60);
  assert.equal(london!.at.toISOString(), "2026-10-25T01:00:00.000Z");
  assert.equal(clockChangeLabel(london!, "Europe/London"), "Clocks −1h Sun 25 Oct");
  assert.equal(nextClockChange("Asia/Manila", now), null);
  assert.equal(nextClockChange("America/New_York", now, 10), null, "1 Nov is more than 10 days away");
});

test("Card 165 Clock A: shared work hours overlap (or none)", () => {
  const now = new Date("2026-10-13T04:00:00Z");
  const w = sharedWorkWindow(["Asia/Manila", "Asia/Tokyo"], { start: 9, end: 18 }, now)!;
  assert.equal(w.from.toISOString(), "2026-10-13T01:00:00.000Z"); // 09:00 Manila
  assert.equal(w.to.toISOString(), "2026-10-13T09:00:00.000Z"); // 18:00 Tokyo
  assert.equal(sharedWorkWindow(["Asia/Manila"], undefined, now), null);
});
