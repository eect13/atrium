/**
 * Card 168 (a): "Change a repeating event" — This event / This and following / All events.
 * Pure planning; the view applies the plan to the desk and queues Google writes.
 *
 * - This event: the master skips that date; a single event replaces it. Google: the instance id
 *   `${masterId}_${stamp}` is patched (or deleted), which Google stores as an exception.
 * - This and following: the master ends just before the occurrence; a new series starts there.
 * - All events: the master changes (or goes).
 */
import { googleId } from "../google-cal.ts";
import { deskZone, isoDate } from "../format.ts";
import type { CalendarEvent } from "../types.ts";

export type SeriesScope = "this" | "following" | "all";
export const DEFAULT_SERIES_SCOPE: SeriesScope = "following";

export type SeriesPlan = {
  update?: { id: string; patch: Partial<CalendarEvent> };
  add?: CalendarEvent;
  remove?: string;
  google: { kind: "create" | "update" | "delete"; event: CalendarEvent }[];
};

/** Google recurring instance id for an occurrence (timed: UTC basic format; all-day: date). */
export function instanceId(remoteId: string, occurrenceStart: string, allDay?: boolean, dayKey?: string) {
  if (allDay) return `${remoteId}_${(dayKey ?? isoDate(new Date(occurrenceStart))).replace(/-/g, "")}`;
  const s = new Date(occurrenceStart).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return `${remoteId}_${s}`;
}

const shift = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();
const isGoogle = (e: CalendarEvent) => e.source === "google" && Boolean(e.calId);

/**
 * `payload` is the dialog's values for the series (start/end as edited on the master's dates).
 * `occStart` is the clicked occurrence's start; `occDay` its desk date (YYYY-MM-DD).
 * `newId` mints ids for created rows.
 */
export function planSeriesSave(scope: SeriesScope, master: CalendarEvent, payload: Partial<CalendarEvent>, occStart: string, occDay: string, newId: () => string): SeriesPlan {
  const delta = new Date(occStart).getTime() - new Date(master.start).getTime();
  const first = delta <= 0;
  if (scope === "all" || (scope === "following" && first)) {
    const next = { ...master, ...payload };
    return { update: { id: master.id, patch: payload }, google: isGoogle(master) ? [{ kind: "update", event: next }] : [] };
  }
  const at = { start: shift(payload.start ?? master.start, delta), end: shift(payload.end ?? master.end, delta) };
  if (scope === "this") {
    const skip = [...new Set([...(master.skip ?? []), occDay])];
    const single: CalendarEvent = { ...master, ...payload, ...at, repeat: undefined, repeatInterval: undefined, repeatUntil: undefined, repeatCount: undefined, skip: undefined, seriesId: undefined, id: newId() };
    if (isGoogle(master) && master.remoteId) {
      const rid = instanceId(master.remoteId, occStart, master.allDay, occDay);
      const ev = { ...single, id: googleId(master.calId, rid), remoteId: rid, etag: undefined };
      return { update: { id: master.id, patch: { skip } }, add: ev, google: [{ kind: "update", event: ev }] };
    }
    return { update: { id: master.id, patch: { skip } }, add: single, google: [] };
  }
  // following
  const until = new Date(new Date(occStart).getTime() - 1000).toISOString();
  const head = { repeatUntil: until, repeatCount: undefined };
  const tail: CalendarEvent = { ...master, ...payload, ...at, skip: (master.skip ?? []).filter((d) => d > occDay), seriesId: undefined, id: newId(), remoteId: undefined, etag: undefined };
  if (tail.repeatCount) tail.repeatCount = undefined;
  if (isGoogle(master)) return { update: { id: master.id, patch: head }, add: tail, google: [{ kind: "update", event: { ...master, ...head } }, { kind: "create", event: tail }] };
  return { update: { id: master.id, patch: head }, add: tail, google: [] };
}

export function planSeriesDelete(scope: SeriesScope, master: CalendarEvent, occStart: string, occDay: string): SeriesPlan {
  const first = new Date(occStart).getTime() <= new Date(master.start).getTime();
  if (scope === "all" || (scope === "following" && first)) return { remove: master.id, google: isGoogle(master) ? [{ kind: "delete", event: master }] : [] };
  if (scope === "this") {
    const skip = [...new Set([...(master.skip ?? []), occDay])];
    if (isGoogle(master) && master.remoteId) {
      const rid = instanceId(master.remoteId, occStart, master.allDay, occDay);
      return { update: { id: master.id, patch: { skip } }, google: [{ kind: "delete", event: { ...master, id: googleId(master.calId, rid), remoteId: rid, etag: undefined } }] };
    }
    return { update: { id: master.id, patch: { skip } }, google: [] };
  }
  const head = { repeatUntil: new Date(new Date(occStart).getTime() - 1000).toISOString(), repeatCount: undefined };
  return { update: { id: master.id, patch: head }, google: isGoogle(master) ? [{ kind: "update", event: { ...master, ...head } }] : [] };
}

/** "Tuesday" for "repeats every Tuesday"; other cadences get a plain phrase. */
export function repeatPhrase(e: Pick<CalendarEvent, "repeat" | "repeatInterval" | "start">) {
  const n = e.repeatInterval && e.repeatInterval > 1 ? e.repeatInterval : 1;
  const wd = new Date(e.start).toLocaleDateString("en-GB", { weekday: "long", timeZone: deskZone().tz });
  if (e.repeat === "weekly") return n > 1 ? `repeats every ${n} weeks on ${wd}` : `repeats every ${wd}`;
  if (e.repeat === "daily") return n > 1 ? `repeats every ${n} days` : "repeats every day";
  if (e.repeat === "monthly") return n > 1 ? `repeats every ${n} months` : "repeats every month";
  if (e.repeat === "yearly") return "repeats every year";
  return "repeats";
}
