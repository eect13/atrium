/** Desk event ↔ Google event body (client-safe; the mapping from Google reuses google-cal.ts). */
import { exclusiveAllDayEnd, isoDate } from "../format.ts";
import { googleId, mapGoogleEvents, type GCalEvent } from "../google-cal.ts";
import { rruleOf } from "../repeat.ts";
import type { ListEventsResult, EventWrite } from "./source.ts";

/** PATCH/POST body. Only fields Atrium edits; guests, Meet links, colours stay as Google has them. */
export function toGoogleBody(ev: EventWrite): Record<string, unknown> {
  const body: Record<string, unknown> = { summary: ev.title.trim() || "Untitled", location: ev.loc ?? "" };
  if (ev.allDay) {
    body.start = { date: isoDate(new Date(ev.start)), dateTime: null };
    body.end = { date: exclusiveAllDayEnd(ev), dateTime: null };
  } else {
    body.start = { dateTime: new Date(ev.start).toISOString(), date: null };
    body.end = { dateTime: new Date(ev.end).toISOString(), date: null };
  }
  const rule = rruleOf(ev);
  body.recurrence = rule ? [rule] : [];
  body.reminders = ev.reminder && ev.reminder > 0 ? { useDefault: false, overrides: [{ method: "popup", minutes: ev.reminder }] } : { useDefault: true };
  return body;
}

/** One list response → desk events plus desk ids that Google removed. */
export function fromGoogleList(items: GCalEvent[], calendarId: string): Pick<ListEventsResult, "events" | "deleted"> {
  const deleted = items.filter((g) => g.status === "cancelled" && !g.recurringEventId && g.id).map((g) => googleId(calendarId, g.id!));
  return { events: mapGoogleEvents(items, calendarId), deleted };
}
