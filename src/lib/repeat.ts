import { fromManila, manilaParts } from "./format.ts";
import type { CalendarEvent } from "./types.ts";

export type RepeatFreq = "daily" | "weekly" | "monthly" | "yearly";

export type RepeatRule = {
  freq: RepeatFreq;
  interval: number;
  count?: number;
  until?: string;
};

const FREQS = new Set<RepeatFreq>(["daily", "weekly", "monthly", "yearly"]);

export function parseRrule(raw: string): RepeatRule | null {
  const body = raw.trim().replace(/^RRULE:/i, "");
  if (!body) return null;
  const parts = new Map<string, string>();
  for (const bit of body.split(";")) {
    const i = bit.indexOf("=");
    if (i < 1) continue;
    parts.set(bit.slice(0, i).trim().toUpperCase(), bit.slice(i + 1).trim());
  }
  const freq = parts.get("FREQ")?.toLowerCase() as RepeatFreq | undefined;
  if (!freq || !FREQS.has(freq)) return null;
  const interval = Math.min(30, Math.max(1, Number(parts.get("INTERVAL")) || 1));
  const countRaw = Number(parts.get("COUNT"));
  const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.min(500, Math.floor(countRaw)) : undefined;
  const until = parts.get("UNTIL");
  return { freq, interval, count, until: until ? untilToIso(until) : undefined };
}

function untilToIso(stamp: string) {
  const compact = stamp.replace(/[^0-9T]/gi, "");
  if (/^\d{8}$/.test(compact)) {
    return fromManila(+compact.slice(0, 4), +compact.slice(4, 6), +compact.slice(6, 8), 23, 59).toISOString();
  }
  if (compact.length >= 13) {
    const y = +compact.slice(0, 4);
    const mo = +compact.slice(4, 6);
    const d = +compact.slice(6, 8);
    const h = +compact.slice(9, 11) || 0;
    const mi = +compact.slice(11, 13) || 0;
    if (/Z$/i.test(stamp.trim())) return new Date(Date.UTC(y, mo - 1, d, h, mi)).toISOString();
    return fromManila(y, mo, d, h, mi).toISOString();
  }
  return undefined;
}

export function rruleOf(ev: Pick<CalendarEvent, "repeat" | "repeatInterval" | "repeatUntil" | "repeatCount">) {
  if (!ev.repeat || !FREQS.has(ev.repeat)) return "";
  const bits = [`FREQ=${ev.repeat.toUpperCase()}`];
  const interval = ev.repeatInterval && ev.repeatInterval > 1 ? Math.min(30, ev.repeatInterval) : 0;
  if (interval > 1) bits.push(`INTERVAL=${interval}`);
  if (ev.repeatCount && ev.repeatCount > 0) bits.push(`COUNT=${Math.min(500, Math.floor(ev.repeatCount))}`);
  else if (ev.repeatUntil) {
    const d = new Date(ev.repeatUntil);
    if (Number.isNaN(d.getTime())) return `RRULE:${bits.join(";")}`;
    const pad = (n: number) => String(n).padStart(2, "0");
    bits.push(
      `UNTIL=${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`,
    );
  }
  return `RRULE:${bits.join(";")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function step(start: string, freq: RepeatFreq, interval: number, n: number) {
  const p = manilaParts(new Date(start));
  const k = n * Math.max(1, interval);
  if (freq === "daily") return fromManila(p.year, p.month, p.day + k, p.hour, p.minute);
  if (freq === "weekly") return fromManila(p.year, p.month, p.day + 7 * k, p.hour, p.minute);
  if (freq === "monthly") {
    const index = p.month - 1 + k;
    const year = p.year + Math.floor(index / 12);
    const month = (index % 12) + 1;
    return fromManila(year, month, Math.min(p.day, daysInMonth(year, month)), p.hour, p.minute);
  }
  const year = p.year + k;
  return fromManila(year, p.month, Math.min(p.day, daysInMonth(year, p.month)), p.hour, p.minute);
}

function deskDay(d: Date) {
  const p = manilaParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function dayNumber(iso: string) {
  const p = manilaParts(new Date(iso));
  return Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86_400_000);
}

/** Paint a repeating event inside [from, to). One-offs pass through when they overlap. */
export function expandEvent(ev: CalendarEvent, from: Date, to: Date): CalendarEvent[] {
  const startMs = Date.parse(ev.start);
  const endMs = Date.parse(ev.end);
  if (!Number.isFinite(startMs)) return [];
  const fromMs = from.getTime();
  const toMs = to.getTime();
  const duration = Number.isFinite(endMs) && endMs > startMs ? endMs - startMs : 0;
  if (!ev.repeat || !FREQS.has(ev.repeat)) {
    const end = startMs + duration;
    if (end <= fromMs || startMs >= toMs) return [];
    return [ev];
  }
  const interval = Math.min(30, Math.max(1, ev.repeatInterval || 1));
  const untilMs = ev.repeatUntil ? Date.parse(ev.repeatUntil) : Number.NaN;
  const explicitCount = ev.repeatCount && ev.repeatCount > 0 ? Math.min(500, Math.floor(ev.repeatCount)) : undefined;
  const count = explicitCount ?? Number.POSITIVE_INFINITY;
  const skipped = new Set(ev.skip ?? []);
  let n = 0;
  if (ev.repeat === "daily" || ev.repeat === "weekly") {
    const span = dayNumber(new Date(fromMs).toISOString()) - dayNumber(ev.start);
    const stepDays = ev.repeat === "daily" ? interval : 7 * interval;
    if (span > stepDays) n = Math.floor(span / stepDays) - 1;
  } else if (!explicitCount) {
    const fromP = manilaParts(new Date(fromMs));
    const startP = manilaParts(new Date(ev.start));
    if (ev.repeat === "yearly") {
      const years = fromP.year - startP.year;
      if (years > interval) n = Math.floor((years - 1) / interval);
    } else {
      const months = (fromP.year - startP.year) * 12 + (fromP.month - startP.month);
      if (months > interval) n = Math.floor((months - 1) / interval);
    }
    if (n < 0) n = 0;
  }
  const out: CalendarEvent[] = [];
  for (let guard = 0; n < count && guard < 800; n += 1, guard += 1) {
    const at = step(ev.start, ev.repeat, interval, n);
    const atMs = at.getTime();
    if (Number.isFinite(untilMs) && atMs > untilMs) break;
    if (atMs >= toMs) break;
    if (atMs + duration < fromMs) continue;
    if (skipped.has(deskDay(at))) continue;
    out.push({
      ...ev,
      id: n === 0 ? ev.id : `${ev.id}#${n}`,
      seriesId: ev.id,
      start: at.toISOString(),
      end: new Date(atMs + duration).toISOString(),
    });
  }
  return out;
}

export function expandEvents(events: CalendarEvent[], from: Date, to: Date) {
  return events.flatMap((ev) => expandEvent(ev, from, to));
}
