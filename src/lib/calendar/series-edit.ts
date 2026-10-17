/**
 * Card 168 (a): "Change a repeating event" — This event / This and following / All events.
 * Pure planning; the view applies the plan to the desk.
 *
 * - This event: the master skips that date; a single event replaces it.
 * - This and following: the master ends just before the occurrence; a new series starts there.
 * - All events: the master changes (or goes).
 */
import { deskZone } from "../format.ts";
import type { CalendarEvent } from "../types.ts";

export type SeriesScope = "this" | "following" | "all";
export const DEFAULT_SERIES_SCOPE: SeriesScope = "following";

export type SeriesPlan = {
  update?: { id: string; patch: Partial<CalendarEvent> };
  add?: CalendarEvent;
  remove?: string;
};

const shift = (iso: string, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString();

/**
 * `payload` is the dialog's values for the series (start/end as edited on the master's dates).
 * `occStart` is the clicked occurrence's start; `occDay` its desk date (YYYY-MM-DD).
 * `newId` mints ids for created rows.
 */
export function planSeriesSave(scope: SeriesScope, master: CalendarEvent, payload: Partial<CalendarEvent>, occStart: string, occDay: string, newId: () => string): SeriesPlan {
  const delta = new Date(occStart).getTime() - new Date(master.start).getTime();
  const first = delta <= 0;
  if (scope === "all" || (scope === "following" && first)) return { update: { id: master.id, patch: payload } };
  const at = { start: shift(payload.start ?? master.start, delta), end: shift(payload.end ?? master.end, delta) };
  if (scope === "this") {
    const skip = [...new Set([...(master.skip ?? []), occDay])];
    const single: CalendarEvent = { ...master, ...payload, ...at, repeat: undefined, repeatInterval: undefined, repeatUntil: undefined, repeatCount: undefined, skip: undefined, seriesId: undefined, id: newId() };
    return { update: { id: master.id, patch: { skip } }, add: single };
  }
  // following
  const until = new Date(new Date(occStart).getTime() - 1000).toISOString();
  const head = { repeatUntil: until, repeatCount: undefined };
  const tail: CalendarEvent = { ...master, ...payload, ...at, skip: (master.skip ?? []).filter((d) => d > occDay), seriesId: undefined, id: newId() };
  if (tail.repeatCount) tail.repeatCount = undefined;
  return { update: { id: master.id, patch: head }, add: tail };
}

export function planSeriesDelete(scope: SeriesScope, master: CalendarEvent, occStart: string, occDay: string): SeriesPlan {
  const first = new Date(occStart).getTime() <= new Date(master.start).getTime();
  if (scope === "all" || (scope === "following" && first)) return { remove: master.id };
  if (scope === "this") return { update: { id: master.id, patch: { skip: [...new Set([...(master.skip ?? []), occDay])] } } };
  return { update: { id: master.id, patch: { repeatUntil: new Date(new Date(occStart).getTime() - 1000).toISOString(), repeatCount: undefined } } };
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
