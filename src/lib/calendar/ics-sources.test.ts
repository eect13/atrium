/**
 * Card 242: the iCal/ICS assertions kept from the removed Google client tests
 * (calendar-sync.test.ts, calendar-client.test.ts, google-cal.test.ts), unchanged in substance.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalendarEvent } from "../types.ts";
import { deskZone, eventCoverDays, inclusiveAllDayEnd, isoDate, setDeskZone } from "../format.ts";
import { eventsToICS, parseICS } from "../ics.ts";
import { scrubCalendarAccounts } from "../profile-desk.ts";
import { IcsSource, LEGACY_ICS, maskIcsUrl, withoutSource } from "./ics-source.ts";
import { assertWritable, ReadOnlyCalendarError } from "./source.ts";

const ev = (id: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title: id, start: "2026-10-13T01:00:00.000Z", end: "2026-10-13T02:00:00.000Z", cat: "work", loc: "", source: "local", ...over });

test("ICS is read-only and refuses writes; rows are tagged with their source", async () => {
  const ics = new IcsSource({ id: "s1", kind: "ical", name: "Gym" }, async () => [ev("x")]);
  assert.equal(ics.capabilities.write, false);
  assert.throws(() => assertWritable(ics), ReadOnlyCalendarError);
  await assert.rejects(ics.createEvent(), ReadOnlyCalendarError);
  const r = await ics.listEvents();
  assert.equal(r.events[0]!.source, "ics");
  assert.equal(r.events[0]!.srcId, "s1");
});

test("removing an ICS source drops only its events (legacy imports count as one source)", () => {
  const events = [ev("a", { source: "ics", srcId: "s1" }), ev("b", { source: "ics" }), ev("c", { source: "local" })];
  assert.deepEqual(withoutSource(events, "s1").map((e) => e.id), ["b", "c"]);
  assert.deepEqual(withoutSource(events, LEGACY_ICS).map((e) => e.id), ["a", "c"]);
});

test("maskIcsUrl: private secret address masked like Card 168; queries masked; junk fully masked", () => {
  const g = "https://calendar.google.com/calendar/ical/alex%40example.com/private-0123456789abcdef0123456789abcdef/basic.ics";
  assert.equal(maskIcsUrl(g), "calendar.google.com/calendar/ical/••••••••/basic.ics");
  assert.ok(!maskIcsUrl(g).includes("private") && !maskIcsUrl(g).includes("alex"));
  assert.equal(maskIcsUrl("webcal://p01-caldav.icloud.com/published/2/MTIzNDU2Nzg5MDEyMzQ1Njc4OTA"), "p01-caldav.icloud.com/published/••••••••");
  assert.equal(maskIcsUrl("https://example.com/cal.ics?token=abc123"), "example.com/cal.ics?••••••••");
  assert.equal(maskIcsUrl("not a url"), "••••••••");
});

test("profile backup never carries a secret iCal address or the v1 session", () => {
  const raw = JSON.stringify({ state: { session: "sid-1", email: "a@x", icsSources: [{ id: "ics-1", kind: "ical", name: "cal.example.com", url: "https://cal.example.com/ical/x/private-y/basic.ics" }] }, version: 2 });
  const out = scrubCalendarAccounts(raw);
  assert.ok(!out.includes("private-y") && !out.includes("sid-1"));
  assert.match(out, /"name":"cal.example.com"/);
  assert.equal(scrubCalendarAccounts("{bad"), "{}");
});

test("ICS TZID keeps New York wall time instead of Manila", () => {
  const text = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:ny@test", "DTSTART;TZID=America/New_York:20260315T090000", "DTEND;TZID=America/New_York:20260315T100000", "SUMMARY:Open", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const [e] = parseICS(text);
  assert.equal(e?.title, "Open");
  assert.equal(new Date(e!.start).toISOString(), "2026-03-15T13:00:00.000Z");
  assert.equal(new Date(e!.end).toISOString(), "2026-03-15T14:00:00.000Z");
});

test("ICS multi-day all-day parse, paint days, and export keep the full span", () => {
  const prev = deskZone();
  setDeskZone({ tz: "Asia/Manila", locale: "en-PH" });
  try {
    const text = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:stay@test", "DTSTART;VALUE=DATE:20261001", "DTEND;VALUE=DATE:20261005", "SUMMARY:Multi-day stay", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const [e] = parseICS(text);
    assert.ok(e);
    assert.equal(e!.allDay, true);
    assert.deepEqual(eventCoverDays(e!), ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    assert.equal(isoDate(inclusiveAllDayEnd("2026-01-15", "2026-01-16")), "2026-01-15");
    const ics = eventsToICS([e!]);
    assert.match(ics, /DTSTART;VALUE=DATE:20261001/);
    assert.match(ics, /DTEND;VALUE=DATE:20261005/);
    const [back] = parseICS(ics);
    assert.deepEqual(eventCoverDays(back!), ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  } finally {
    setDeskZone(prev);
  }
});
