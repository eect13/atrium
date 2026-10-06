/**
 * Continuous multi-day spans (Card 138 §5) — one layout shared by the Calendar
 * widget (`CalendarPeek`) and the full Calendar page.
 *
 * Input: events + visible week rows (desk-day keys `YYYY-MM-DD`, consecutive).
 * Output per row: one segment per span event (start col, end col, lane, true or
 * squared ends), the row's visible lane count, and per-day marks (singles shown
 * under the lanes + a "+N" overflow count) under a cap the caller picks.
 */
import { dayLabel, deskZone, fmtWhen, isoDate, manilaAt } from "./format.ts";

export type SpanEvent = { id: string; title: string; start: string; end: string };

/** Inclusive desk days of an event (same rule as `eventCoversDay`; all-day ends are stored inclusive). */
export function eventDayRange(e: { start: string; end: string }) {
  const first = isoDate(new Date(e.start));
  const end = isoDate(new Date(e.end));
  return { first, last: end < first ? first : end };
}

/** A span is any event covering more than one desk day — timed or all-day. */
export function isSpanEvent(e: { start: string; end: string }) {
  const r = eventDayRange(e);
  return r.last > r.first;
}

export type SpanSegment<E> = {
  e: E;
  /** 0-based lane within the row (lanes are reserved for the whole row). */
  lane: number;
  /** 0-based first / last column the segment covers in this row. */
  c0: number;
  c1: number;
  /** Rounded start (event begins in this row) vs squared start (continues from an earlier row / period). */
  trueStart: boolean;
  /** Rounded end (event ends in this row) vs squared end (continues past the row / period). */
  trueEnd: boolean;
  first: string;
  last: string;
};

export type DayMarks<E> = {
  key: string;
  /** Every event on the day: spans (lane order) then singles (start order) — for labels and agendas. */
  all: E[];
  singles: E[];
  /** Singles drawn in the cell under the lanes. */
  shown: E[];
  /** Hidden singles + spans in lanes past the cap. */
  more: number;
};

export type SpanRow<E> = {
  days: string[];
  /** Visible segments only (lane < cap.maxLanes). */
  segs: SpanSegment<E>[];
  /** Visible lane count `L` shared by every day of the row. */
  lanes: number;
  cells: DayMarks<E>[];
};

export type SpanCap = {
  /** Mark rows per day: lanes + singles. */
  rows: number;
  /** Most span lanes drawn; spans in later lanes count into "+N". */
  maxLanes: number;
  /** True when "+N" takes one of the mark rows (widget bars); false when it sits in its own row (page). */
  moreTakesRow: boolean;
};

/** Widget: 3 rows total, ≤2 span lanes, "+N" replaces the last bar. */
export const WIDGET_SPAN_CAP: SpanCap = { rows: 3, maxLanes: 2, moreTakesRow: true };
/** Full Calendar: 3 mark rows (lanes + singles) plus a separate "+N more" row. */
export const PAGE_SPAN_CAP: SpanCap = { rows: 3, maxLanes: 3, moreTakesRow: false };
/** No cap (full Calendar week: every lane and every single is listed). */
export const UNCAPPED_SPAN: SpanCap = { rows: Number.POSITIVE_INFINITY, maxLanes: Number.POSITIVE_INFINITY, moreTakesRow: false };

const byStart = <E extends SpanEvent>(a: E, b: E) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

/** Lay out visible week rows. Each row is one segment per span event, never one per day. */
export function layoutSpanRows<E extends SpanEvent>(events: readonly E[], rows: readonly (readonly string[])[], cap: SpanCap): SpanRow<E>[] {
  const ranged = events.map((e) => ({ e, ...eventDayRange(e) }));
  const spans = ranged.filter((r) => r.last > r.first);
  const singles = ranged.filter((r) => r.last === r.first);
  return rows.map((daysIn) => {
    const days = [...daysIn];
    const rowFirst = days[0]!;
    const rowLast = days[days.length - 1]!;
    const segs: SpanSegment<E>[] = spans
      .filter((r) => r.last >= rowFirst && r.first <= rowLast)
      .map((r) => ({
        e: r.e,
        lane: 0,
        c0: r.first < rowFirst ? 0 : days.indexOf(r.first),
        c1: r.last > rowLast ? days.length - 1 : days.indexOf(r.last),
        trueStart: r.first >= rowFirst,
        trueEnd: r.last <= rowLast,
        first: r.first,
        last: r.last,
      }))
      // Continuing first, then start day, longer first, title, id (stable).
      .sort(
        (a, b) =>
          Number(a.trueStart) - Number(b.trueStart) ||
          a.first.localeCompare(b.first) ||
          b.last.localeCompare(a.last) ||
          a.e.title.localeCompare(b.e.title) ||
          a.e.id.localeCompare(b.e.id),
      );
    const laneEnd: number[] = [];
    for (const s of segs) {
      let lane = laneEnd.findIndex((end) => end < s.c0);
      if (lane < 0) lane = laneEnd.length;
      laneEnd[lane] = s.c1;
      s.lane = lane;
    }
    const lanes = Math.min(laneEnd.length, cap.maxLanes);
    const room = Math.max(0, cap.rows - lanes);
    const cells = days.map((key, col): DayMarks<E> => {
      const here = segs.filter((s) => s.c0 <= col && s.c1 >= col).sort((a, b) => a.lane - b.lane);
      const hidden = here.filter((s) => s.lane >= cap.maxLanes).length;
      const own = singles
        .filter((r) => r.first === key)
        .map((r) => r.e)
        .sort(byStart);
      let shown: E[];
      if (cap.moreTakesRow) shown = own.length <= room && !hidden ? own : own.slice(0, Math.max(0, room - 1));
      else shown = own.slice(0, room);
      return { key, all: [...here.map((s) => s.e), ...own], singles: own, shown, more: own.length - shown.length + hidden };
    });
    return { days, segs: segs.filter((s) => s.lane < cap.maxLanes), lanes, cells };
  });
}

/** Day `n` of `total` for a span on a desk day (agenda line "day 1 of 3"). */
export function spanDayOf(e: { start: string; end: string }, key: string) {
  const { first, last } = eventDayRange(e);
  const dayMs = 86_400_000;
  const n = Math.round((+manilaAt(key, 12) - +manilaAt(first, 12)) / dayMs) + 1;
  const total = Math.round((+manilaAt(last, 12) - +manilaAt(first, 12)) / dayMs) + 1;
  return { n, total };
}

/** "6 – 8 Oct" style range for a span, in the desk locale / zone. */
export function spanRangeLabel(e: { start: string; end: string }) {
  const { first, last } = eventDayRange(e);
  const { locale, tz } = deskZone();
  const a = manilaAt(first, 12);
  const b = manilaAt(last, 12);
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: tz }).formatRange(a, b);
  } catch {
    return `${first} – ${last}`;
  }
}

/** Agenda "when" line: `fmtWhen`, plus "· 14 – 16 Oct · day 1 of 3" for spans. */
export function spanWhen(e: { start: string; end: string; allDay?: boolean }, key: string) {
  const base = fmtWhen(e);
  if (!isSpanEvent(e)) return base;
  const { n, total } = spanDayOf(e, key);
  return `${base} · ${spanRangeLabel(e)} · day ${n} of ${total}`;
}

/** Day-cell label lists every event on the day, spans included ("Thu 15 Oct, 2 events: Workshop, Run"). */
export function spanCellLabel(d: Date, all: readonly { title: string }[]) {
  const base = dayLabel(d, all.length);
  return all.length ? `${base}: ${all.map((e) => e.title).join(", ")}` : base;
}
