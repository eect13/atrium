import assert from "node:assert/strict";
import { test } from "node:test";
import { deskZone, eventCoverDays, eventCoversDay, exclusiveAllDayEnd, inclusiveAllDayEnd, isoDate, manilaParts, setDeskZone } from "./format.ts";
import { defaultGcalOff, gcalLane, gcalRange, mapGoogleEvents, noteGcalPage, preferGoogleRules, visibleCalEvents } from "./google-cal.ts";
import { eventsToICS, parseICS } from "./ics.ts";

test("primary calendar is Mine; Family and holidays start hidden", () => {
  const mine = gcalLane({ id: "me@gmail.com", summary: "Eric", primary: true });
  const family = gcalLane({ id: "family@group.calendar.google.com", summary: "Family" });
  const holidays = gcalLane({ id: "en.ph#holiday@group.v.calendar.google.com", summary: "Holidays in Philippines" });
  const owned = gcalLane({ id: "trips@group.calendar.google.com", summary: "Trips", accessRole: "owner" });
  const birthdays = gcalLane({ id: "addressbook#contacts@group.v.calendar.google.com", summary: "Birthdays" });
  const contacts = gcalLane({ id: "addressbook#contacts@group.v.calendar.google.com", summary: "Contacts" });
  assert.equal(mine.lane, "mine");
  assert.equal(mine.label, "Mine");
  assert.equal(family.lane, "family");
  assert.equal(holidays.lane, "other");
  assert.equal(owned.lane, "other");
  assert.equal(birthdays.lane, "other");
  assert.equal(contacts.lane, "other");
  const off = defaultGcalOff([mine, family, holidays, owned, birthdays, contacts]);
  assert.deepEqual(off, [family.id, holidays.id, owned.id]);
  assert.equal(off.includes(birthdays.id), false);
  assert.equal(off.includes(contacts.id), false);
});

test("a Google birthday is one yearly master, and the exclusive end stays on that day", () => {
  const prev = deskZone();
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
  try {
    const rows = mapGoogleEvents(
      [
        {
          id: "ada",
          summary: "Ada birthday",
          start: { date: "1990-01-15" },
          end: { date: "1990-01-16" },
          recurrence: ["RRULE:FREQ=YEARLY"],
        },
        {
          id: "ada_ex",
          status: "cancelled",
          recurringEventId: "ada",
          originalStartTime: { date: "2030-01-15" },
        },
      ],
      "cal",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.repeat, "yearly");
    assert.equal(rows[0]!.repeatUntil, undefined);
    assert.equal(rows[0]!.repeatCount, undefined);
    assert.deepEqual(rows[0]!.skip, ["2030-01-15"]);
    const start = manilaParts(new Date(rows[0]!.start));
    const end = manilaParts(new Date(rows[0]!.end));
    assert.equal(start.day, 15);
    assert.equal(end.day, 15);
    assert.equal(end.month, 1);
    const existing = [
      {
        id: "g-cal-old",
        title: "Ada birthday",
        start: rows[0]!.start,
        end: rows[0]!.end,
        cat: "personal" as const,
        loc: "",
        source: "google" as const,
        calId: "cal",
      },
    ];
    assert.equal(preferGoogleRules(existing, rows).length, 0);
  } finally {
    setDeskZone(prev);
  }
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

test("a Google multi-day all-day stay keeps the exclusive end as an inclusive span", () => {
  const prev = deskZone();
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
  try {
    const rows = mapGoogleEvents(
      [
        {
          id: "stay",
          summary: "Multi-day stay",
          start: { date: "2026-10-01" },
          end: { date: "2026-10-05" },
        },
      ],
      "cal",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.allDay, true);
    const start = manilaParts(new Date(rows[0]!.start));
    const end = manilaParts(new Date(rows[0]!.end));
    assert.equal(start.day, 1);
    assert.equal(start.month, 10);
    assert.equal(end.day, 4);
    assert.equal(end.month, 10);
    assert.equal(end.hour, 23);
    assert.equal(end.minute, 59);
    const days = eventCoverDays(rows[0]!);
    assert.deepEqual(days, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    assert.equal(eventCoversDay(rows[0]!, "2026-10-03"), true);
    assert.equal(eventCoversDay(rows[0]!, "2026-10-05"), false);
    assert.equal(exclusiveAllDayEnd(rows[0]!), "2026-10-05");
  } finally {
    setDeskZone(prev);
  }
});

test("ICS multi-day all-day parse, paint days, and export keep the full span", () => {
  const prev = deskZone();
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
  try {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:stay@test",
      "DTSTART;VALUE=DATE:20261001",
      "DTEND;VALUE=DATE:20261005",
      "SUMMARY:Multi-day stay",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const [ev] = parseICS(text);
    assert.ok(ev);
    assert.equal(ev!.allDay, true);
    assert.deepEqual(eventCoverDays(ev!), ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    const birthday = inclusiveAllDayEnd("2026-01-15", "2026-01-16");
    assert.equal(isoDate(birthday), "2026-01-15");
    const ics = eventsToICS([ev!]);
    assert.match(ics, /DTSTART;VALUE=DATE:20261001/);
    assert.match(ics, /DTEND;VALUE=DATE:20261005/);
    const [back] = parseICS(ics);
    assert.deepEqual(eventCoverDays(back!), ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  } finally {
    setDeskZone(prev);
  }
});
