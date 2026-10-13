"use client";

import { eventCatLabel, eventCatTagStyle, type EventCategory } from "@/lib/event-cats";
import { fmtTime, isoDate } from "@/lib/format";
import { dayParts, spanWhen } from "@/lib/span-layout";
import type { CalendarEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/** Card 161 U5: Day view is an agenda for the day. No mini-grid, no second view switch. */
export function DayAgenda({ date, events, cats, now = new Date(), onEvent, onNew }: { date: Date; events: readonly CalendarEvent[]; cats: EventCategory[]; now?: Date; onEvent: (e: CalendarEvent) => void; onNew: () => void }) {
  const key = isoDate(date);
  const { strip, timed } = dayParts(events, key);
  const today = key === isoDate(now);
  const nowAt = timed.findIndex((e) => new Date(e.start) > now);
  const nowLine = (
    <li key="now" className="relative my-1 h-0 border-t-2 border-[var(--today-accent)]" aria-label={`Now, ${fmtTime(now.toISOString())}`}>
      <span aria-hidden className="absolute -left-1 -top-[5px] size-2 rounded-full bg-[var(--today-accent)]" />
    </li>
  );
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      {strip.length ? (
        <ul aria-label="All day" className="mb-3 flex flex-col gap-1 border-b border-border pb-3">
          {strip.map((e) => (
            <li key={e.id}>
              <button type="button" className={cn("flex min-h-8 w-full items-center rounded-full text-left", FOCUS)} aria-label={`${e.title}, ${spanWhen(e, key)}`} onClick={() => onEvent(e)}>
                <span className="cat-tag w-full" style={eventCatTagStyle(cats, e.cat, e.color)}>
                  <span>{e.title}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {timed.length ? (
        <ul aria-label="Events" className="flex flex-col">
          {timed.map((e, i) => [
            today && i === nowAt ? nowLine : null,
            <li key={e.id}>
              <button type="button" className={cn("flex min-h-8 w-full items-center gap-3 rounded-md py-1 text-left hover:bg-muted", FOCUS)} aria-label={`${fmtTime(e.start)}, ${e.title}, ${eventCatLabel(cats, e.cat)}`} onClick={() => onEvent(e)}>
                <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{fmtTime(e.start)}</span>
                <span className="cat-tag min-w-0" style={eventCatTagStyle(cats, e.cat, e.color)}>
                  <span>{e.title}</span>
                </span>
                {e.loc ? <span className="min-w-0 truncate text-xs text-muted-foreground">{e.loc}</span> : null}
              </button>
            </li>,
          ])}
          {today && nowAt < 0 ? nowLine : null}
        </ul>
      ) : !strip.length ? (
        <div className="flex min-h-24 flex-col items-start justify-center gap-2">
          <p className="text-sm text-muted-foreground">Nothing on this day.</p>
          <button type="button" className={cn("min-h-11 rounded-md px-1 text-sm underline-offset-2 hover:underline", FOCUS)} onClick={onNew}>
            New event
          </button>
        </div>
      ) : null}
    </div>
  );
}
