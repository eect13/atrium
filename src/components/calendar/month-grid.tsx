"use client";

import { SpanBar } from "@/components/widgets";
import { eventCatLabel, eventCatTagStyle, type EventCategory } from "@/lib/event-cats";
import { manilaAt, manilaParts, monthName, sameDay, WEEKDAY_NAMES } from "@/lib/format";
import { spanCellLabel, spanRangeLabel, type SpanRow, type SpanSegment } from "@/lib/span-layout";
import type { CalendarEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One button per week-row segment (32px, like the pills); bar centred, focus ring around the bar. */
export function SpanButton({ seg, cats, onOpen, row }: { seg: SpanSegment<CalendarEvent>; cats: EventCategory[]; onOpen: (e: CalendarEvent) => void; row?: number }) {
  const label = `${seg.e.title}, ${eventCatLabel(cats, seg.e.cat)}, ${spanRangeLabel(seg.e)}`;
  return (
    <button
      type="button"
      className="group z-[1] flex min-h-8 min-w-0 cursor-pointer items-center rounded-md hover:bg-accent focus-visible:outline-none"
      style={{ gridColumn: `${seg.c0 + 1} / ${seg.c1 + 2}`, gridRow: row ?? 2 + seg.lane }}
      aria-label={label}
      title={label}
      onClick={() => onOpen(seg.e)}
    >
      <SpanBar
        seg={seg}
        cats={cats}
        className={`flex-1 group-focus-visible:shadow-[0_0_0_2px_var(--color-card),0_0_0_4px_var(--color-ring)] ${seg.trueStart ? "" : "ml-px"} ${seg.trueEnd ? "" : "mr-px"}`}
      />
    </button>
  );
}

type Props = {
  cursor: Date;
  rows: SpanRow<CalendarEvent>[];
  phoneRows: SpanRow<CalendarEvent>[];
  outside: Set<string>;
  cats: EventCategory[];
  now?: Date;
  onDay: (key: string) => void;
  onShowDay: (key: string) => void;
  onEvent: (e: CalendarEvent) => void;
};

/**
 * Card 161 U1/U2/U6. The row owns the height and the card fills it; singles fill the first
 * free slot of their own cell; ≥sm pills are 32px, phone bars 8px with 2 + "+N" on overflow.
 */
export function MonthGrid({ cursor, rows, phoneRows, outside, cats, now = new Date(), onDay, onShowDay, onEvent }: Props) {
  return (
    <div role="grid" aria-label={monthName(cursor)}>
      <div role="row" className="mb-1 grid grid-cols-7 gap-x-1 sm:gap-x-1.5">
        {WEEKDAYS.map((d, i) => (
          <div key={d} role="columnheader" className="px-1 pb-1 text-center text-xs text-muted-foreground">
            <span aria-hidden="true" className="sm:hidden">{d[0]}</span>
            <span aria-hidden="true" className="hidden sm:inline">{d}</span>
            <abbr className="sr-only">{WEEKDAY_NAMES[i]}</abbr>
          </div>
        ))}
      </div>
      {rows.map((row, w) => {
        const over = row.cells.some((c) => c.more > 0);
        const tracks = `28px${row.marks ? ` repeat(${row.marks}, 32px)` : ""}${over ? " 32px" : ""} minmax(6px, 1fr)`;
        const phone = phoneRows[w]!;
        const phoneTracks = `24px${phone.marks ? ` repeat(${phone.marks}, 8px)` : ""} minmax(8px, 1fr)`;
        return (
          <div key={row.days[0]} className="contents">
            {/* ≥sm */}
            <div role="row" className="mb-1.5 hidden min-h-24 grid-cols-7 gap-x-1.5 sm:grid" style={{ gridTemplateRows: tracks }}>
              {row.days.map((key, i) => {
                const cell = row.cells[i]!;
                const date = manilaAt(key, 12);
                const out = outside.has(key);
                const isToday = sameDay(date, now);
                return (
                  <div key={key} role="gridcell" className="contents">
                    <div
                      aria-hidden="true"
                      style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                      className={cn("h-full min-h-0 rounded-md border", out ? "border-dashed" : "bg-card", isToday ? "border-[var(--today-accent)] ring-1 ring-[var(--today-accent)]" : "border-border")}
                    />
                    <button
                      type="button"
                      style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                      className={cn("z-0 flex h-full w-full items-start rounded-md px-2 pt-2 text-left text-xs leading-none", out ? "text-muted-foreground/60" : "text-muted-foreground", FOCUS)}
                      aria-label={spanCellLabel(date, cell.all)}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => onDay(key)}
                    >
                      {manilaParts(date).day}
                    </button>
                    {cell.shown.map((e, n) => (
                      <button
                        key={e.id}
                        type="button"
                        style={{ gridColumn: i + 1, gridRow: 2 + cell.slots[n]! }}
                        className={cn("z-[1] mx-1.5 flex min-h-8 min-w-0 items-center rounded-full text-left", FOCUS)}
                        aria-label={`${e.title}, ${eventCatLabel(cats, e.cat)}`}
                        title={`${e.title} · ${eventCatLabel(cats, e.cat)}`}
                        onClick={() => onEvent(e)}
                      >
                        <span className="cat-tag w-full" style={eventCatTagStyle(cats, e.cat, e.color)}>
                          <span>{e.title}</span>
                        </span>
                      </button>
                    ))}
                    {cell.more ? (
                      <button
                        type="button"
                        style={{ gridColumn: i + 1, gridRow: 2 + row.marks }}
                        className={cn("z-[1] mx-1.5 flex min-h-8 min-w-0 items-center rounded-full", FOCUS)}
                        aria-label={`${cell.more} more`}
                        onClick={() => onShowDay(key)}
                      >
                        <span className="cat-tag cat-tag-more w-full">+{cell.more} more</span>
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {row.segs.map((s) => (
                <SpanButton key={s.e.id} seg={s} cats={cats} onOpen={onEvent} />
              ))}
            </div>
            {/* Phone: label-less 8px bars; the whole cell is the target (Card 161 U2). */}
            <div role="row" className="mb-1 grid min-h-12 grid-cols-7 gap-x-1 sm:hidden" style={{ gridTemplateRows: phoneTracks }}>
              {phone.days.map((key, i) => {
                const cell = phone.cells[i]!;
                const date = manilaAt(key, 12);
                const out = outside.has(key);
                const isToday = sameDay(date, now);
                return (
                  <div key={key} role="gridcell" className="contents">
                    <div
                      aria-hidden="true"
                      style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                      className={cn("h-full min-h-0 rounded-md border", out ? "border-dashed" : "bg-card", isToday ? "border-[var(--today-accent)] ring-1 ring-[var(--today-accent)]" : "border-border")}
                    />
                    {cell.shown.map((e, n) => (
                      <span key={e.id} aria-hidden className="mx-1 block h-1.5 self-center rounded-full bg-[var(--tag-bg)]" style={{ gridColumn: i + 1, gridRow: 2 + cell.slots[n]!, ...eventCatTagStyle(cats, e.cat, e.color) }} />
                    ))}
                    {cell.more ? (
                      <span aria-hidden className="z-[1] self-center text-center text-[11px] font-semibold leading-none text-foreground tabular-nums" style={{ gridColumn: i + 1, gridRow: cell.moreSlot != null ? 2 + cell.moreSlot : -2 }}>
                        +{cell.more}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                      className={cn("z-[2] flex h-full w-full items-start justify-center rounded-md pt-1.5 text-xs leading-none", out ? "text-muted-foreground/60" : "text-muted-foreground", FOCUS)}
                      aria-label={spanCellLabel(date, cell.all)}
                      aria-current={isToday ? "date" : undefined}
                      onClick={() => onDay(key)}
                    >
                      {manilaParts(date).day}
                    </button>
                  </div>
                );
              })}
              {phone.segs.map((s) => (
                <span
                  key={s.e.id}
                  aria-hidden
                  className={cn("z-[1] block h-1.5 self-center bg-[var(--tag-bg)]", s.trueStart ? "ml-1 rounded-l-full" : "", s.trueEnd ? "mr-1 rounded-r-full" : "")}
                  style={{ gridColumn: `${s.c0 + 1} / ${s.c1 + 2}`, gridRow: 2 + s.lane, ...eventCatTagStyle(cats, s.e.cat, s.e.color) }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
