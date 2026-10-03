import assert from "node:assert/strict";
import { test } from "node:test";
import { deskZone, fromManila, manilaParts, setDeskZone } from "./format.ts";
import { eventsToICS, parseICS } from "./ics.ts";
import { expandEvent, parseRrule, rruleOf } from "./repeat.ts";
import type { CalendarEvent } from "./types.ts";

function ev(partial: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "start" | "end">): CalendarEvent {
  return {
    title: "Rent",
    cat: "personal",
    loc: "",
    source: "local",
    ...partial,
  };
}

test("monthly and yearly paint inside the window and keep one master", () => {
  const prev = deskZone();
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
  try {
    const start = fromManila(2026, 1, 15, 9);
    const end = fromManila(2026, 1, 15, 10);
    const monthly = ev({
      id: "m",
      start: start.toISOString(),
      end: end.toISOString(),
      repeat: "monthly",
    });
    const march = expandEvent(monthly, fromManila(2026, 3, 1, 0), fromManila(2026, 4, 1, 0));
    assert.equal(march.length, 1);
    assert.equal(march[0]!.seriesId, "m");
    assert.notEqual(march[0]!.id, "m");
    const painted = manilaParts(new Date(march[0]!.start));
    assert.equal(painted.year, 2026);
    assert.equal(painted.month, 3);
    assert.equal(painted.day, 15);
    const year = expandEvent(
      { ...monthly, id: "b", title: "Birthday", repeat: "yearly" },
      fromManila(2027, 1, 1, 0),
      fromManila(2027, 2, 1, 0),
    );
    assert.equal(year.length, 1);
    assert.equal(manilaParts(new Date(year[0]!.start)).year, 2027);
    assert.equal(expandEvent({ ...monthly, repeat: undefined }, fromManila(2026, 2, 1, 0), fromManila(2026, 3, 1, 0)).length, 0);
  } finally {
    setDeskZone(prev);
  }
});

test("count and until stop a daily series", () => {
  const prev = deskZone();
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
  try {
    const start = fromManila(2026, 1, 15, 9);
    const end = fromManila(2026, 1, 15, 10);
    const base = ev({ id: "d", start: start.toISOString(), end: end.toISOString(), repeat: "daily" });
    const counted = expandEvent(
      { ...base, repeatCount: 3 },
      fromManila(2026, 1, 1, 0),
      fromManila(2026, 6, 1, 0),
    );
    assert.equal(counted.length, 3);
    assert.equal(counted[0]!.id, "d");
    const until = fromManila(2026, 1, 16, 23, 59).toISOString();
    const stopped = expandEvent(
      { ...base, repeatUntil: until },
      fromManila(2026, 1, 1, 0),
      fromManila(2026, 2, 1, 0),
    );
    assert.equal(stopped.length, 2);
  } finally {
    setDeskZone(prev);
  }
});

test("31 January monthly stays in February, and a birthday paints years later from one master", () => {
  const prev = deskZone();
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
  try {
    const start = fromManila(2026, 1, 31, 9);
    const end = fromManila(2026, 1, 31, 10);
    const monthly = ev({ id: "rent", start: start.toISOString(), end: end.toISOString(), repeat: "monthly" });
    const feb = expandEvent(monthly, fromManila(2026, 2, 1, 0), fromManila(2026, 3, 1, 0));
    assert.equal(feb.length, 1);
    assert.equal(manilaParts(new Date(feb[0]!.start)).month, 2);
    assert.equal(manilaParts(new Date(feb[0]!.start)).day, 28);
    const march = expandEvent(monthly, fromManila(2026, 3, 1, 0), fromManila(2026, 4, 1, 0));
    assert.equal(manilaParts(new Date(march[0]!.start)).day, 31);
    const birthday = ev({
      id: "ada",
      title: "Ada birthday",
      start: fromManila(1990, 1, 15, 0).toISOString(),
      end: fromManila(1990, 1, 15, 23, 59).toISOString(),
      repeat: "yearly",
      allDay: true,
    });
    const later = expandEvent(birthday, fromManila(2029, 12, 1, 0), fromManila(2030, 1, 20, 0));
    assert.equal(later.length, 1);
    const painted = manilaParts(new Date(later[0]!.start));
    assert.equal(painted.year, 2030);
    assert.equal(painted.month, 1);
    assert.equal(painted.day, 15);
    const skipped = expandEvent(
      { ...birthday, skip: ["2030-01-15"] },
      fromManila(2029, 12, 1, 0),
      fromManila(2030, 1, 20, 0),
    );
    assert.equal(skipped.length, 0);
  } finally {
    setDeskZone(prev);
  }
});

test("RRULE parses, exports, and comes back on import", () => {
  const prev = deskZone();
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
  try {
    const parsed = parseRrule("RRULE:FREQ=YEARLY;COUNT=10");
    assert.equal(parsed?.freq, "yearly");
    assert.equal(parsed?.count, 10);
    assert.equal(parsed?.interval, 1);
    const start = fromManila(2026, 1, 15, 9);
    const end = fromManila(2026, 1, 15, 10);
    const master = ev({
      id: "w",
      start: start.toISOString(),
      end: end.toISOString(),
      repeat: "weekly",
      repeatInterval: 2,
      repeatUntil: fromManila(2026, 6, 1, 23, 59).toISOString(),
    });
    assert.equal(rruleOf(master), "RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20260601T155900Z");
    const [back] = parseICS(eventsToICS([master]));
    assert.equal(back?.repeat, "weekly");
    assert.equal(back?.repeatInterval, 2);
    assert.ok(back?.repeatUntil);
    assert.equal(manilaParts(new Date(back!.repeatUntil!)).month, 6);
  } finally {
    setDeskZone(prev);
  }
});
