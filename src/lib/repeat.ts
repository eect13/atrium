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
    const p = manilaParts(new Date(ev.repeatUntil));
    const pad = (n: number) => String(n).padStart(2, "0");
    bits.push(`UNTIL=${p.year}${pad(p.month)}${pad(p.day)}T235959Z`);
  }
  return `RRULE:${bits.join(";")}`;
}

function step(start: string, freq: RepeatFreq, interval: number, n: number) {
  const p = manilaParts(new Date(start));
  const k = n * Math.max(1, interval);
  if (freq === "daily") return fromManila(p.year, p.month, p.day + k, p.hour, p.minute);
  if (freq === "weekly") return fromManila(p.year, p.month, p.day + 7 * k, p.hour, p.minute);
  if (freq === "monthly") return fromManila(p.year, p.month + k, p.day, p.hour, p.minute);
  return fromManila(p.year + k, p.month, p.day, p.hour, p.minute);
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
  const count = ev.repeatCount && ev.repeatCount > 0 ? Math.min(500, Math.floor(ev.repeatCount)) : 500;
  let n = 0;
  if (ev.repeat === "daily" || ev.repeat === "weekly") {
    const span = dayNumber(new Date(fromMs).toISOString()) - dayNumber(ev.start);
    const stepDays = ev.repeat === "daily" ? interval : 7 * interval;
    if (span > stepDays) n = Math.floor(span / stepDays) - 1;
  }
  const out: CalendarEvent[] = [];
  for (let guard = 0; n < count && guard < 800; n += 1, guard += 1) {
    const at = step(ev.start, ev.repeat, interval, n);
    const atMs = at.getTime();
    if (Number.isFinite(untilMs) && atMs > untilMs) break;
    if (atMs >= toMs) break;
    if (atMs + duration >= fromMs) {
      out.push({
        ...ev,
        id: n === 0 ? ev.id : `${ev.id}#${n}`,
        seriesId: ev.id,
        start: at.toISOString(),
        end: new Date(atMs + duration).toISOString(),
      });
    }
  }
  return out;
}

export function expandEvents(events: CalendarEvent[], from: Date, to: Date) {
  return events.flatMap((ev) => expandEvent(ev, from, to));
}
