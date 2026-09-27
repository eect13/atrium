import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultGcalOff, gcalLane, visibleCalEvents } from "./google-cal.ts";
import { parseICS } from "./ics.ts";

test("primary calendar is Mine; Family and holidays start hidden", () => {
  const mine = gcalLane({ id: "me@gmail.com", summary: "Eric", primary: true });
  const family = gcalLane({ id: "family@group.calendar.google.com", summary: "Family" });
  const holidays = gcalLane({ id: "en.ph#holiday@group.v.calendar.google.com", summary: "Holidays in Philippines" });
  const owned = gcalLane({ id: "trips@group.calendar.google.com", summary: "Trips", accessRole: "owner" });
  assert.equal(mine.lane, "mine");
  assert.equal(mine.label, "Mine");
  assert.equal(family.lane, "family");
  assert.equal(holidays.lane, "other");
  assert.equal(owned.lane, "other");
  const off = defaultGcalOff([mine, family, holidays, owned]);
  assert.deepEqual(off, [family.id, holidays.id, owned.id]);
});

test("visibleCalEvents treats untagged Google rows as Mine", () => {
  const events = [
    { id: "1", source: "local" as const, calId: undefined },
    { id: "2", source: "google" as const, calId: "mine" },
    { id: "3", source: "google" as const, calId: "family" },
    { id: "4", source: "google" as const },
  ];
  assert.deepEqual(
    visibleCalEvents(events, ["family"], "mine").map((e) => e.id),
    ["1", "2", "4"],
  );
  assert.deepEqual(
    visibleCalEvents(events, ["mine"], "mine").map((e) => e.id),
    ["1", "3"],
  );
});

test("ICS TZID keeps New York wall time instead of Manila", () => {
  const text = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:ny@test",
    "DTSTART;TZID=America/New_York:20260315T090000",
    "DTEND;TZID=America/New_York:20260315T100000",
    "SUMMARY:Open",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const [ev] = parseICS(text);
  assert.equal(ev?.title, "Open");
  assert.equal(new Date(ev!.start).toISOString(), "2026-03-15T13:00:00.000Z");
  assert.equal(new Date(ev!.end).toISOString(), "2026-03-15T14:00:00.000Z");
});
