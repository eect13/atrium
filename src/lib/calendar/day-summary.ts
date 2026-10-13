/** Calendar A widget pieces (Card 161): Up next + today's free/busy, as pure helpers. */
import { isAllDayEvent, manilaAt } from "../format.ts";

type Ev = { id: string; title: string; start: string; end: string; allDay?: boolean };

/** Next timed event that starts later today (desk day). Null when nothing is left. */
export function upNext<E extends Ev>(events: readonly E[], dayKey: string, now: Date): E | null {
  const end = manilaAt(dayKey, 23, 59).getTime();
  return (
    events
      .filter((e) => !isAllDayEvent(e) && new Date(e.start).getTime() > now.getTime() && new Date(e.start).getTime() <= end)
      .sort((a, b) => a.start.localeCompare(b.start))[0] ?? null
  );
}

export function minutesUntil(iso: string, now: Date) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 60_000));
}

/** "25 min", "1 h 5 min". */
export function countdownLabel(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
}

export type Block = { from: number; to: number };

export const BAND_FROM = 8;
export const BAND_TO = 20;

/** Busy blocks (hours, fractional, desk zone) clipped to [fromH, toH] on `dayKey`; merged. */
export function busyBlocks(events: readonly Ev[], dayKey: string, fromH = BAND_FROM, toH = BAND_TO): { blocks: (Block & { id: string; clipFrom: boolean; clipTo: boolean })[]; merged: Block[] } {
  const base = manilaAt(dayKey, 0).getTime();
  const lo = fromH;
  const hi = toH;
  const blocks = events
    .filter((e) => !isAllDayEvent(e))
    .map((e) => ({ id: e.id, from: (new Date(e.start).getTime() - base) / 3_600_000, to: (new Date(e.end).getTime() - base) / 3_600_000 }))
    .filter((b) => b.to > lo && b.from < hi)
    .map((b) => ({ ...b, from: Math.max(lo, b.from), to: Math.min(hi, b.to), clipFrom: b.from < lo, clipTo: b.to > hi }))
    .sort((a, b) => a.from - b.from);
  const merged: Block[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (last && b.from <= last.to) last.to = Math.max(last.to, b.to);
    else merged.push({ from: b.from, to: b.to });
  }
  return { blocks, merged };
}

/**
 * Card 168 (b): timed events that fall wholly outside the band (before `fromH` / after `toH`),
 * so the strip can say "‹ N" / "N ›" instead of clipping them away silently.
 */
export function outsideBand<E extends Ev>(events: readonly E[], dayKey: string, fromH = BAND_FROM, toH = BAND_TO): { before: E[]; after: E[] } {
  const base = manilaAt(dayKey, 0).getTime();
  const hours = (iso: string) => (new Date(iso).getTime() - base) / 3_600_000;
  const timed = events.filter((e) => !isAllDayEvent(e)).toSorted((a, b) => a.start.localeCompare(b.start));
  return { before: timed.filter((e) => hours(e.end) <= fromH), after: timed.filter((e) => hours(e.start) >= toH) };
}

/** Longest free window from `startH` (now, or the strip start) to the strip end. */
export function longestFree(merged: Block[], startH: number, endH = 20): Block | null {
  let cur = startH;
  let best: Block | null = null;
  for (const b of merged) {
    if (b.to <= cur) continue;
    if (b.from > cur && (!best || b.from - cur > best.to - best.from)) best = { from: cur, to: b.from };
    cur = Math.max(cur, b.to);
  }
  if (endH > cur && (!best || endH - cur > best.to - best.from)) best = { from: cur, to: endH };
  return best && best.to - best.from >= 0.25 ? best : null;
}

const hhmm = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** "4 events · free 15:30–17:00" / "Free". */
export function freeBusyText(count: number, free: Block | null) {
  if (!count) return "Free";
  const n = `${count} event${count === 1 ? "" : "s"}`;
  return free ? `${n} · free ${hhmm(free.from)}–${hhmm(free.to)}` : `${n} · no free time left`;
}

/** Quick add start: the next half hour. */
export function nextHalfHour(now: Date) {
  const d = new Date(now.getTime());
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(m < 30 ? 30 : 60);
  return d;
}
