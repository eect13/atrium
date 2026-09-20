import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultGcalOff, gcalLane, visibleCalEvents } from "./google-cal.ts";

test("primary calendar is Mine; Family and holidays start hidden", () => {
  const mine = gcalLane({ id: "me@gmail.com", summary: "Eric", primary: true });
  const family = gcalLane({ id: "family@group.calendar.google.com", summary: "Family" });
  const holidays = gcalLane({ id: "en.ph#holiday@group.v.calendar.google.com", summary: "Holidays in Philippines" });
  assert.equal(mine.lane, "mine");
  assert.equal(mine.label, "Mine");
  assert.equal(family.lane, "family");
  assert.equal(holidays.lane, "other");
  const off = defaultGcalOff([mine, family, holidays]);
  assert.deepEqual(off, [family.id, holidays.id]);
});

test("visibleCalEvents hides only tagged Google calendars that are off", () => {
  const events = [
    { id: "1", source: "local" as const, calId: undefined },
    { id: "2", source: "google" as const, calId: "mine" },
    { id: "3", source: "google" as const, calId: "family" },
    { id: "4", source: "google" as const },
  ];
  const shown = visibleCalEvents(events, ["family"]);
  assert.deepEqual(
    shown.map((e) => e.id),
    ["1", "2", "4"],
  );
});
