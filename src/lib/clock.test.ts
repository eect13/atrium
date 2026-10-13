import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_CLOCK_PREFS,
  cityFromTz,
  clockList,
  formatZoneTime,
  normalizeClockPrefs,
  resolveZoneId,
  withClockZone,
  withoutClockZone,
  zoneLabel,
  formatOffsetVsLocal,
  formatLocalOffsetLabel,
  differentCivilDay,
  reorderClockZones,
} from "./clock.ts";

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
  const p = { zones: ["Europe/London", "America/New_York", "Asia/Tokyo"], hour24: true };
  assert.deepEqual(reorderClockZones(p, "Asia/Tokyo", "Europe/London").zones, [
    "Asia/Tokyo",
    "Europe/London",
    "America/New_York",
  ]);
  assert.equal(reorderClockZones(p, "Europe/London", "Europe/London"), p);
});
