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
