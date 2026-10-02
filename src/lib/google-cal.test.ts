import assert from "node:assert/strict";
import { test } from "node:test";
import { deskZone, setDeskZone } from "./format.ts";
import { defaultGcalOff, gcalLane, gcalRange, noteGcalPage, visibleCalEvents } from "./google-cal.ts";
import { parseICS } from "./ics.ts";

test("primary calendar is Mine; Family and holidays start hidden", () => {
  const mine = gcalLane({ id: "me@gmail.com", summary: "Eric", primary: true });
  const family = gcalLane({ id: "family@group.calendar.google.com", summary: "Family" });
  const holidays = gcalLane({ id: "en.ph#holiday@group.v.calendar.google.com", summary: "Holidays in Philippines" });
  const owned = gcalLane({ id: "trips@group.calendar.google.com", summary: "Trips", accessRole: "owner" });
  const birthdays = gcalLane({ id: "addressbook#contacts@group.v.calendar.google.com", summary: "Birthdays" });
  assert.equal(mine.lane, "mine");
  assert.equal(mine.label, "Mine");
  assert.equal(family.lane, "family");
  assert.equal(holidays.lane, "other");
  assert.equal(owned.lane, "other");
  assert.equal(birthdays.lane, "other");
  const off = defaultGcalOff([mine, family, holidays, owned, birthdays]);
  assert.deepEqual(off, [family.id, holidays.id, owned.id]);
  assert.equal(off.includes(birthdays.id), false);
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

test("a later Google page that fails is a partial list, not a full one", () => {
  const state = {
    events: [{ id: "a" }],
    token: "p2",
    seen: new Set(["p2"]),
    truncated: false,
  };
  noteGcalPage(state, { ok: false, events: [] });
  assert.equal(state.truncated, true);
  assert.equal(state.token, undefined);
  assert.deepEqual(state.events.map((e) => e.id), ["a"]);
});

test("an empty later page ends the list without calling it partial", () => {
  const state = {
    events: [{ id: "a" }],
    token: "p2",
    seen: new Set(["p2"]),
    truncated: false,
  };
  noteGcalPage(state, { ok: true, events: [] });
  assert.equal(state.truncated, false);
  assert.equal(state.token, undefined);
});

test("Google window is desk midnight, not UTC midnight", () => {
  const prev = deskZone();
  setDeskZone({ tz: "America/New_York", locale: "en-US" });
  try {
    const october = gcalRange(new Date("2026-10-15T16:00:00.000Z"));
    assert.equal(october.timeMin, "2026-09-01T04:00:00.000Z");
    assert.equal(october.timeMax, "2026-12-01T05:00:00.000Z");
    const january = gcalRange(new Date("2026-01-15T17:00:00.000Z"));
    assert.equal(january.timeMin, "2025-12-01T05:00:00.000Z");
    assert.equal(january.timeMax, "2026-03-01T05:00:00.000Z");
  } finally {
    setDeskZone(prev);
  }
});

