"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CalendarPeek, SpanBar } from "@/components/widgets";
import { FloatBtn } from "@/components/desk-chrome";
import { EventCatManager } from "@/components/event-cat-manager";
import { redirectToLoginIfRequired } from "@/lib/app-data";
import {
  addDays,
  eventCoverDays,
  fmtDate,
  fmtWhen,
  fromManila,
  isoDate,
  isoMonth,
  isAllDayEvent,
  manilaAt,
  manilaParts,
  monthName,
  monthCells,
  sameDay,
  toManilaInput,
  fromZoneInput,
  resolveEventTz,
  WORLD_ZONES,
  uid,
  weekRangeLabel,
  WEEKDAY_NAMES,
} from "@/lib/format";
import { fetchIcsUrl } from "@/lib/feeds";
import { gcalRange, googleNeedsInstances, listGoogleCalendars, listGoogleEvents, mapGoogleEvents, mineCalId, visibleCalEvents } from "@/lib/google-cal";
import { downloadICS } from "@/lib/ics";
import { parseICSAsync } from "@/lib/parse-ics-async";
import { expandEvents } from "@/lib/repeat";
import { catsWithOrphans, eventCatLabel, eventCatTagStyle, type EventCategory } from "@/lib/event-cats";
import { PAGE_SPAN_CAP, UNCAPPED_SPAN, layoutSpanRows, spanCellLabel, spanRangeLabel, spanWhen, type SpanSegment } from "@/lib/span-layout";
import { useAtrium } from "@/lib/store";
import type { CalMode, CalendarEvent } from "@/lib/types";

function shiftCursor(cursor: Date, mode: CalMode, dir: -1 | 1) {
  const p = manilaParts(cursor);
  if (mode === "week") return addDays(cursor, dir * 7);
  if (mode === "day") return addDays(cursor, dir);
  return fromManila(p.year, p.month + dir, 1, 12);
}

function sourceLine(e: CalendarEvent) {
  if (e.source === "google") return "Connected calendar";
  return e.source;
}

function importedToast(n: number) {
  toast(n ? `Imported ${n} event${n === 1 ? "" : "s"}` : "Already up to date");
}

function heading(cursor: Date, mode: CalMode) {
  if (mode === "week") return weekRangeLabel(cursor);
  if (mode === "day") return fmtDate(cursor.toISOString());
  return monthName(cursor);
}

function paintSpan(cursor: Date, mode: CalMode) {
  const p = manilaParts(cursor);
  if (mode === "day") {
    const from = manilaAt(isoDate(cursor), 0);
    return { from, to: addDays(from, 1) };
  }
  if (mode === "week") {
    const from = fromManila(p.year, p.month, p.day - p.weekdayIndex, 0);
    return { from, to: addDays(from, 7) };
  }
  const first = fromManila(p.year, p.month, 1, 0);
  const lead = manilaParts(first).weekdayIndex;
  const from = fromManila(p.year, p.month, 1 - lead, 0);
  return { from, to: addDays(from, 42) };
}

type RepeatChoice = "none" | "daily" | "weekly" | "monthly" | "yearly";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/** Full Calendar span: one button per week-row segment (32px, like the pills), bar centred, focus ring around the bar. */
function SpanButton({ seg, cats, onOpen }: { seg: SpanSegment<CalendarEvent>; cats: EventCategory[]; onOpen: (e: CalendarEvent) => void }) {
  const label = `${seg.e.title}, ${eventCatLabel(cats, seg.e.cat)}, ${spanRangeLabel(seg.e)}`;
  return (
    <button
      type="button"
      className="group z-[1] flex min-h-8 min-w-0 cursor-pointer items-center rounded-md hover:bg-accent focus-visible:outline-none"
      style={{ gridColumn: `${seg.c0 + 1} / ${seg.c1 + 2}`, gridRow: 2 + seg.lane }}
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

export function CalendarView() {
  const { events, eventCats, addEvent, updateEvent, removeEvent, importEvents, calMode, calCursor, setCalMode, setCalCursor, gcalCals, gcalOff, setGcalCals, toggleGcal } = useAtrium(
    useShallow((s) => ({
      events: s.events,
      eventCats: s.eventCats,
      addEvent: s.addEvent,
      updateEvent: s.updateEvent,
      removeEvent: s.removeEvent,
      importEvents: s.importEvents,
      calMode: s.calMode,
      calCursor: s.calCursor,
      setCalMode: s.setCalMode,
      setCalCursor: s.setCalCursor,
      gcalCals: s.gcalCals,
      gcalOff: s.gcalOff,
      setGcalCals: s.setGcalCals,
      toggleGcal: s.toggleGcal,
    })),
  );
  const listed = useMemo(
    () => visibleCalEvents(events, gcalOff, mineCalId(gcalCals)),
    [events, gcalOff, gcalCals],
  );
  const [cursor, setCursor] = useState(() => {
    if (calCursor && !Number.isNaN(+new Date(calCursor))) return new Date(calCursor);
    return new Date();
  });
  const [mode, setMode] = useState<CalMode>(() =>
    calMode === "week" || calMode === "day" || calMode === "agenda" || calMode === "month" ? calMode : "month",
  );
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(() => toManilaInput(manilaAt(isoDate(), 9)));
  const [end, setEnd] = useState(() => toManilaInput(manilaAt(isoDate(), 10)));
  const [cat, setCat] = useState("work");
  const [loc, setLoc] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [eventTz, setEventTz] = useState("desk");
  const [repeat, setRepeat] = useState<RepeatChoice>("none");
  const [repeatEvery, setRepeatEvery] = useState("1");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [repeatCount, setRepeatCount] = useState("");
  const [reminder, setReminder] = useState("");
  const [color, setColor] = useState("");
  const [guests, setGuests] = useState("");
  const [meet, setMeet] = useState("");
  const [occurDay, setOccurDay] = useState<string | null>(null);
  const [fromGoogle, setFromGoogle] = useState(false);
  const seenMonth = useRef("");
  /** FORM-WCAG #13 / O5: restore focus to the control that opened the dialog. */
  const returnFocus = useRef<HTMLElement | null>(null);
  const shown = useMemo(() => {
    const span = paintSpan(cursor, mode);
    return expandEvents(listed, span.from, span.to);
  }, [listed, cursor, mode]);

  useEffect(() => {
    setCalMode(mode);
  }, [mode, setCalMode]);
  useEffect(() => {
    setCalCursor(isoDate(cursor));
  }, [cursor, setCalCursor]);
  const [subUrl, setSubUrl] = useState("");
  const [catsOpen, setCatsOpen] = useState(false);
  const catOptions = useMemo(
    () => catsWithOrphans(eventCats, events.map((e) => e.cat).concat(cat)),
    [eventCats, events, cat],
  );
  const legendCats = useMemo(() => catsWithOrphans(eventCats, events.map((e) => e.cat)), [eventCats, events]);

  function showDay(date: string) {
    setCursor(manilaAt(date, 12));
    setMode("day");
  }

  function openDay(date: string) {
    setEditId(null);
    setStart(toManilaInput(manilaAt(date, 9)));
    setEnd(toManilaInput(manilaAt(date, 10)));
    setTitle("");
    setLoc("");
    setCat(eventCats[0]?.id ?? "work");
    setAllDay(false);
    setEventTz("desk");
    setRepeat("none");
    setRepeatEvery("1");
    setRepeatUntil("");
    setRepeatCount("");
    setReminder("");
    setColor("");
    setGuests("");
    setMeet("");
    setOccurDay(null);
    setFromGoogle(false);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }

  function openEvent(ev: CalendarEvent) {
    const master = ev.seriesId ? (events.find((e) => e.id === ev.seriesId) ?? ev) : ev;
    setEditId(master.id);
    setTitle(master.title);
    setStart(toManilaInput(master.start));
    setEnd(toManilaInput(master.end));
    setCat(master.cat);
    setLoc(master.loc);
    setAllDay(Boolean(master.allDay) || isAllDayEvent(master));
    setEventTz("desk");
    setRepeat(master.repeat ?? "none");
    setRepeatEvery(String(master.repeatInterval ?? 1));
    setRepeatUntil(master.repeatUntil ? isoDate(new Date(master.repeatUntil)) : "");
    setRepeatCount(master.repeatCount ? String(master.repeatCount) : "");
    setReminder(master.reminder ? String(master.reminder) : "");
    setColor(master.color ?? "");
    setGuests(master.guests ?? "");
    setMeet(master.meet ?? "");
    setOccurDay(ev.seriesId ? isoDate(new Date(ev.start)) : null);
    setFromGoogle(master.source === "google");
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }

  async function subscribe() {
    if (!subUrl.trim()) return;
    try {
      const text = await fetchIcsUrl({ data: { url: subUrl.trim() } });
      importedToast(importEvents(await parseICSAsync(text)));
      setSubUrl("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not fetch calendar");
    }
  }


  async function mapGoogle(res: Awaited<ReturnType<typeof listGoogleEvents>>, calendarId?: string, quiet = false) {
    if (res.loginRequired) {
      if (!quiet) {
        redirectToLoginIfRequired({ ok: false, data: null, loginRequired: true, loginUrl: res.loginUrl });
        toast("Connect a calendar account, then try again.");
      }
      return null;
    }
    if (res.error) {
      if (!quiet) toast(res.error);
      return null;
    }
    const rows = mapGoogleEvents(res.events, calendarId);
    return { rows, truncated: Boolean(res.truncated) };
  }

  async function pullGoogle(ids?: string[], opts?: { quiet?: boolean; knownOnly?: boolean }) {
    const quiet = Boolean(opts?.quiet);
    const range = gcalRange(cursor);
    let cals = useAtrium.getState().gcalCals;
    if (!opts?.knownOnly) {
      const listedCals = await listGoogleCalendars();
      if (listedCals.loginRequired) {
        if (!quiet) {
          redirectToLoginIfRequired({ ok: false, data: null, loginRequired: true, loginUrl: listedCals.loginUrl });
          toast("Connect a calendar account, then try again.");
        }
        return;
      }
      if (listedCals.calendars.length) {
        setGcalCals(listedCals.calendars);
        cals = useAtrium.getState().gcalCals.length ? useAtrium.getState().gcalCals : listedCals.calendars;
      }
    }
    const off = useAtrium.getState().gcalOff;
    const selected = ids?.length ? ids : cals.filter((c) => !off.includes(c.id)).map((c) => c.id);
    if (!selected.length) {
      if (!quiet) toast(cals.length ? "Those calendars are hidden" : "No connected calendars yet");
      return;
    }
    const mapped: CalendarEvent[] = [];
    let truncated = false;
    for (const calendarId of selected) {
      let res = await listGoogleEvents({
        data: { ...range, calendarId, singleEvents: false },
      });
      if (!res.loginRequired && !res.error && googleNeedsInstances(res.events)) {
        res = await listGoogleEvents({
          data: { ...range, calendarId, singleEvents: true },
        });
      }
      const page = await mapGoogle(res, calendarId, quiet);
      if (page === null) return;
      truncated = truncated || page.truncated;
      mapped.push(...page.rows);
    }
    const n = importEvents(mapped);
    if (!quiet || n) importedToast(n);
    if (truncated) toast("Calendar sync stopped early. Later events in this window may be missing.");
  }

  useEffect(() => {
    const key = isoMonth(cursor);
    if (seenMonth.current === key) return;
    const ids = gcalCals.filter((c) => !gcalOff.includes(c.id)).map((c) => c.id);
    if (!ids.length) return;
    seenMonth.current = key;
    void pullGoogle(ids, { quiet: true, knownOnly: true });
  }, [cursor, gcalCals, gcalOff]);

  async function flipCal(id: string) {
    const turningOn = gcalOff.includes(id);
    toggleGcal(id);
    if (turningOn) await pullGoogle([id]);
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const grid = useMemo(() => monthCells(cursor), [cursor]);
  const outside = useMemo(() => new Set(grid.filter((c) => c.out).map((c) => isoDate(c.date))), [grid]);
  // One shared span layout (lib/span-layout) for Month rows and the Week strip; spans are one bar per week row.
  const monthRows = useMemo(() => {
    const keys = grid.map((c) => isoDate(c.date));
    return layoutSpanRows(shown, Array.from({ length: keys.length / 7 }, (_, w) => keys.slice(w * 7, w * 7 + 7)), PAGE_SPAN_CAP);
  }, [shown, grid]);
  const weekRow = useMemo(() => {
    const o = manilaParts(cursor);
    const keys = Array.from({ length: 7 }, (_, i) => isoDate(fromManila(o.year, o.month, o.day - o.weekdayIndex + i, 12)));
    return layoutSpanRows(shown, [keys], UNCAPPED_SPAN)[0]!;
  }, [shown, cursor]);

  const agendaMonth = isoMonth(cursor);
  const agenda = Object.groupBy(
    shown
      .flatMap((e) =>
        eventCoverDays(e)
          .filter((day) => day.startsWith(agendaMonth))
          .map((day) => ({ day, e })),
      )
      .toSorted((a, b) => a.day.localeCompare(b.day) || a.e.start.localeCompare(b.e.start)),
    (row) => row.day,
  );
  const agendaDays = Object.entries(agenda).slice(0, 20);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-medium tracking-tight">{heading(cursor, mode)}</h2>
        <Button variant="outline" size="sm" className="h-11" onClick={() => setCursor(shiftCursor(cursor, mode, -1))}>
          Prev
        </Button>
        <Button variant="outline" size="sm" className="h-11" onClick={() => setCursor(new Date())}>
          Today
        </Button>
        <Button variant="outline" size="sm" className="h-11" onClick={() => setCursor(shiftCursor(cursor, mode, 1))}>
          Next
        </Button>
        <div className="flex flex-wrap rounded-md border border-border">
          {(["month", "week", "day", "agenda"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-11 shrink-0 px-3 text-xs capitalize ${mode === m ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="grow" />
        <label className="inline-flex">
          <input
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void f.text().then(async (text) => {
                try {
                  importedToast(importEvents(await parseICSAsync(text)));
                } catch {
                  toast("Could not read that calendar file");
                }
              });
              e.target.value = "";
            }}
          />
          <span className="inline-flex h-11 cursor-pointer items-center rounded-sm border border-border px-3 text-sm">
            Import ICS
          </span>
        </label>
        <Button variant="outline" size="sm" className="h-11" onClick={() => downloadICS(listed)}>
          Export
        </Button>
        <Button variant="outline" className="h-11" onClick={() => void pullGoogle()}>
          Connect calendar
        </Button>
        <Button size="sm" className="h-11" onClick={() => openDay(isoDate())}>
          New event
        </Button>
        <FloatBtn kind="calendar" />
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Integrate by importing an .ics, pasting a public iCal URL, exporting Atrium, or connecting a calendar account when signed in.
      </p>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <Input
          className="h-11"
          placeholder="Public iCal URL (secret iCal address, Outlook, Apple…)"
          value={subUrl}
          onChange={(e) => setSubUrl(e.target.value)}
        />
        <Button variant="secondary" className="h-11" onClick={() => void subscribe()}>
          Subscribe
        </Button>
      </div>
      {gcalCals.length ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Connected calendars</p>
          {gcalCals.map((c) => {
            const on = !gcalOff.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => void flipCal(c.id)}
                className={`min-h-11 rounded-md border px-3 text-sm ${on ? "border-ring bg-muted text-foreground" : "border-border text-muted-foreground"}`}
              >
                {c.label}
              </button>
            );
          })}
          <p className="text-xs text-muted-foreground">Mine and birthdays start on, including Contacts birthdays. Family and holidays start hidden.</p>
        </div>
      ) : null}

      {mode === "month" && (
        <div role="grid" aria-label={monthName(cursor)}>
          <div role="row" className="mb-1 grid grid-cols-7 gap-x-1.5">
          {weekdays.map((d, i) => (
            <div key={d} role="columnheader" className="px-1 pb-1 text-center text-xs text-muted-foreground">
              <span aria-hidden="true" className="sm:hidden">{d[0]}</span>
              <span aria-hidden="true" className="hidden sm:inline">{d}</span>
              <abbr className="sr-only">{WEEKDAY_NAMES[i]}</abbr>
            </div>
          ))}
          </div>
          {monthRows.map((row) => {
            // Lanes, then single pills, then an optional "+N more" row (pills / "+N more" 32px, Eric's call).
            const singles = Math.max(0, ...row.cells.map((c) => c.shown.length));
            const over = row.cells.some((c) => c.more > 0);
            const tracks = `44px${row.lanes ? ` repeat(${row.lanes}, 32px)` : ""}${singles ? ` repeat(${singles}, 32px)` : ""}${over ? " 32px" : ""} 6px`;
            return (
          <div key={row.days[0]} role="row" className="mb-1.5 grid grid-cols-7 gap-x-1.5" style={{ gridTemplateRows: tracks }}>
          {row.days.map((key, i) => {
            const cell = row.cells[i]!;
            const date = manilaAt(key, 12);
            const out = outside.has(key);
            const isToday = sameDay(date, new Date());
            return (
              <div key={key} role="gridcell" className="contents">
                <div
                  aria-hidden="true"
                  style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                  className={`min-h-16 rounded-md border sm:min-h-24 ${out ? "border-dashed" : "bg-card"} ${isToday ? "border-[var(--today-accent)] ring-1 ring-[var(--today-accent)]" : "border-border"}`}
                />
                <button
                  type="button"
                  style={{ gridColumn: i + 1, gridRow: 1 }}
                  className={`z-[1] flex min-h-11 w-full items-start rounded-md px-1.5 pt-1.5 text-left text-xs leading-none sm:px-2 sm:pt-2 ${out ? "text-muted-foreground/60" : "text-muted-foreground"} ${FOCUS}`}
                  aria-label={spanCellLabel(date, cell.all)}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => openDay(key)}
                >
                  {manilaParts(date).day}
                </button>
                {cell.shown.length || cell.more ? (
                  <div className="z-[1] flex min-w-0 flex-col px-1 sm:px-1.5" style={{ gridColumn: i + 1, gridRow: `${2 + row.lanes} / -2` }}>
                    {cell.shown.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className={`flex min-h-8 w-full min-w-0 items-center rounded-full text-left ${FOCUS}`}
                        aria-label={`${e.title}, ${eventCatLabel(eventCats, e.cat)}`}
                        title={`${e.title} · ${eventCatLabel(eventCats, e.cat)}`}
                        onClick={() => openEvent(e)}
                      >
                        <span className="cat-tag w-full" style={eventCatTagStyle(eventCats, e.cat, e.color)}>
                          <span>{e.title}</span>
                        </span>
                      </button>
                    ))}
                    {cell.more ? (
                      <button
                        type="button"
                        className={`mt-auto flex min-h-8 w-full shrink-0 items-center rounded-full ${FOCUS}`}
                        aria-label={`${cell.more} more`}
                        onClick={() => showDay(key)}
                      >
                        <span className="cat-tag cat-tag-more w-full">+{cell.more} more</span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {row.segs.map((s) => (
            <SpanButton key={s.e.id} seg={s} cats={eventCats} onOpen={openEvent} />
          ))}
          </div>
            );
          })}
        </div>
      )}

      {mode === "month" && (
        <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Categories">
          <p className="w-full text-xs uppercase tracking-widest text-muted-foreground">Categories</p>
          {legendCats.map((c) => (
            <span key={c.id} className="cat-tag cat-tag-lg" style={eventCatTagStyle(eventCats, c.id)}>
              <span>{eventCatLabel(eventCats, c.id)}</span>
            </span>
          ))}
          <Button type="button" variant="ghost" className="h-11" onClick={() => setCatsOpen(true)}>
            Manage
          </Button>
        </div>
      )}

      {mode === "day" && (
        <div className="min-h-96 rounded-lg border border-border bg-card p-3">
          <CalendarPeek date={cursor} embedded onSelect={openEvent} widgetId="page-day" />
        </div>
      )}

      {mode === "week" && (
        <>
          {/* md+: one 7-column grid — day cards underneath, a span band under the day headers, timed rows below. */}
          <div
            role="group"
            aria-label={heading(cursor, mode)}
            className="hidden gap-x-2 md:grid md:grid-cols-7"
            style={{ gridTemplateRows: `44px${weekRow.lanes ? ` repeat(${weekRow.lanes}, 32px)` : ""} 1fr` }}
          >
            {weekRow.days.map((key, i) => {
              const date = manilaAt(key, 12);
              const isToday = sameDay(date, new Date());
              return (
                <div key={key} className="contents">
                  <div
                    aria-hidden="true"
                    style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
                    className={`min-h-48 rounded-lg border bg-card ${isToday ? "border-[var(--today-accent)]" : "border-border"}`}
                  />
                  <button
                    type="button"
                    style={{ gridColumn: i + 1, gridRow: 1 }}
                    className={`z-[1] min-h-11 rounded-lg px-3 text-left text-xs text-muted-foreground ${FOCUS}`}
                    aria-label={spanCellLabel(date, weekRow.cells[i]!.all)}
                    aria-current={isToday ? "date" : undefined}
                    onClick={() => openDay(key)}
                  >
                    {weekdays[i]} {manilaParts(date).day}
                  </button>
                  <div className="z-[1] flex min-w-0 flex-col px-3 pb-3" style={{ gridColumn: i + 1, gridRow: 2 + weekRow.lanes }}>
                    {weekRow.cells[i]!.singles.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className={`mt-2 block min-h-8 w-full rounded-sm text-left text-sm ${FOCUS}`}
                        onClick={() => openEvent(e)}
                      >
                        <span className="tabular-nums text-muted-foreground">{fmtWhen(e)} </span>
                        {e.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {weekRow.segs.map((s) => (
              <SpanButton key={s.e.id} seg={s} cats={eventCats} onOpen={openEvent} />
            ))}
          </div>
          {/* Phone: days stack in one column, so each day lists what covers it (spans read "day n of N"). */}
          <div className="grid grid-cols-1 gap-2 md:hidden">
            {weekRow.days.map((key, i) => {
              const date = manilaAt(key, 12);
              return (
                <div
                  key={key}
                  className={`rounded-lg border bg-card p-3 ${sameDay(date, new Date()) ? "border-[var(--today-accent)]" : "border-border"}`}
                >
                  <button type="button" className={`min-h-11 w-full rounded-sm text-left text-xs text-muted-foreground ${FOCUS}`} onClick={() => openDay(key)}>
                    {weekdays[i]} {manilaParts(date).day}
                  </button>
                  {weekRow.cells[i]!.all.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className={`mt-2 block min-h-8 w-full rounded-sm text-left text-sm ${FOCUS}`}
                      onClick={() => openEvent(e)}
                    >
                      <span className="tabular-nums text-muted-foreground">{spanWhen(e, key)} </span>
                      {e.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {mode === "agenda" && (
        <div className="space-y-6">
          {agendaDays.length ? (
            agendaDays.map(([k, list]) => (
              <div key={k}>
                <h4 className="mb-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">
                  {fmtDate(manilaAt(k, 12).toISOString())}
                </h4>
                {list!.map(({ e }) => (
                  <div key={`${k}-${e.id}`} className="flex items-center gap-3 border-b border-border py-2">
                    <button type="button" className="min-w-0 grow text-left" onClick={() => openEvent(e)} aria-label={`${e.title}, ${eventCatLabel(eventCats, e.cat)}`}>
                      <span className="cat-tag cat-tag-lg" style={eventCatTagStyle(eventCats, e.cat, e.color)} title={eventCatLabel(eventCats, e.cat)}>
                        <span>{e.title}</span>
                      </span>
                      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {spanWhen(e, k)}
                        {e.reminder ? ` · ${e.reminder}m before` : ""} · {eventCatLabel(eventCats, e.cat)} · {sourceLine(e)}
                      </div>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11"
                      onClick={() => {
                        if (e.seriesId) {
                          const master = events.find((x) => x.id === e.seriesId);
                          const day = isoDate(new Date(e.start));
                          updateEvent(e.seriesId, { skip: [...new Set([...(master?.skip ?? []), day])] });
                          toast("Skipped this date");
                          return;
                        }
                        removeEvent(e.id);
                        toast("Event removed");
                      }}
                    >
                      {e.seriesId ? "Skip" : "Remove"}
                    </Button>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No events yet. Use the command bar — “Lunch Friday 1pm” — or add one here.
            </p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus.current?.focus?.();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editId ? "Edit event" : "New event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ev-title">Title</Label>
              <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3">
              <Label htmlFor="ev-allday" className="text-sm">
                All day
              </Label>
              <Switch
                id="ev-allday"
                checked={allDay}
                onCheckedChange={(on) => {
                  const checked = on === true;
                  setAllDay(checked);
                  const d = (start || isoDate()).slice(0, 10);
                  if (checked) {
                    setStart(`${d}T00:00`);
                    setEnd(`${d}T23:59`);
                  } else {
                    setStart(`${d}T09:00`);
                    setEnd(`${d}T10:00`);
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ev-tz">Time zone</Label>
              <select
                id="ev-tz"
                className="h-11 w-full rounded-md border border-border bg-muted px-3 text-sm"
                value={eventTz}
                onChange={(e) => setEventTz(e.target.value)}
              >
                {WORLD_ZONES.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
              </select>
            </div>
            {allDay ? (
              <div className="space-y-1">
                <Label htmlFor="ev-date">Date</Label>
                <Input
                  id="ev-date"
                  type="date"
                  value={start.slice(0, 10)}
                  onChange={(e) => {
                    const d = e.target.value;
                    setStart(`${d}T00:00`);
                    setEnd(`${d}T23:59`);
                  }}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ev-start">Start</Label>
                  <Input id="ev-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ev-end">End</Label>
                  <Input id="ev-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ev-cat">Category</Label>
                <select
                  id="ev-cat"
                  className="h-11 w-full rounded-md border border-border bg-muted px-3 text-sm"
                  value={cat}
                  onChange={(e) => setCat(e.target.value)}
                >
                  {catOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {eventCatLabel(eventCats, c.id)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="inline-flex min-h-hit items-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => setCatsOpen(true)}
                >
                  Manage categories
                </button>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ev-loc">Location</Label>
                <Input id="ev-loc" value={loc} onChange={(e) => setLoc(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ev-repeat">Repeat</Label>
                <select
                  id="ev-repeat"
                  className="h-11 w-full rounded-md border border-border bg-muted px-3 text-sm"
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value as RepeatChoice)}
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              {repeat !== "none" ? (
                <div className="space-y-1">
                  <Label htmlFor="ev-every">Every</Label>
                  <Input
                    id="ev-every"
                    type="number"
                    min={1}
                    max={30}
                    value={repeatEvery}
                    onChange={(e) => setRepeatEvery(e.target.value)}
                  />
                </div>
              ) : (
                <div />
              )}
            </div>
            {repeat !== "none" ? (
              <>
                <p className="text-xs text-muted-foreground">Leave until and count empty to repeat forever. A birthday is yearly with neither set.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="ev-until">Until</Label>
                    <Input id="ev-until" type="date" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ev-count">Or count</Label>
                    <Input
                      id="ev-count"
                      type="number"
                      min={1}
                      max={500}
                      placeholder="Forever"
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ev-remind">Remind (minutes)</Label>
                <Input
                  id="ev-remind"
                  type="number"
                  min={0}
                  max={10080}
                  placeholder="None"
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Color</Label>
                <div className="flex min-h-11 flex-wrap items-center">
                  {["#7986cb", "#33b679", "#f6bf26", "#e67c73", "#8e24aa"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      aria-pressed={color === c}
                      className="inline-flex size-hit items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setColor(color === c ? "" : c)}
                    >
                      <span
                        aria-hidden
                        className={`size-6 rounded-full border ${color === c ? "border-foreground" : "border-transparent"}`}
                        style={{ background: c }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {fromGoogle ? (
              <p className="text-xs text-muted-foreground">From a connected calendar. A change here stays on this desk and is not written back.</p>
            ) : null}
            {guests ? <p className="text-xs text-muted-foreground">Guests: {guests}</p> : null}
            {meet ? (
              <a href={meet} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                Meet
              </a>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              {editId && occurDay ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    const master = events.find((x) => x.id === editId);
                    updateEvent(editId, { skip: [...new Set([...(master?.skip ?? []), occurDay])] });
                    setOpen(false);
                    toast("Skipped this date");
                  }}
                >
                  Skip this date
                </Button>
              ) : null}
              {editId ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    removeEvent(editId);
                    setOpen(false);
                    toast("Event removed");
                  }}
                >
                  Delete
                </Button>
              ) : null}
              <Button
                onClick={() => {
                  const tz = resolveEventTz(eventTz);
                  const startAt = fromZoneInput(start, tz);
                  let endAt = fromZoneInput(end, tz);
                  if (!startAt || !endAt) {
                    toast("Need a valid start and end");
                    return;
                  }
                  if (allDay) {
                    const day = start.slice(0, 10);
                    endAt = fromZoneInput(`${day}T23:59`, tz) ?? endAt;
                  } else if (endAt.getTime() <= startAt.getTime()) {
                    endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
                  }
                  const freq = repeat === "none" ? undefined : repeat;
                  const every = freq ? Math.min(30, Math.max(1, Math.floor(Number(repeatEvery) || 1))) : undefined;
                  const rawCount = Math.floor(Number(repeatCount));
                  const count =
                    freq && repeatCount.trim() && Number.isFinite(rawCount) && rawCount > 0
                      ? Math.min(500, rawCount)
                      : undefined;
                  const untilIso =
                    freq && !count && /^\d{4}-\d{2}-\d{2}$/.test(repeatUntil)
                      ? fromManila(+repeatUntil.slice(0, 4), +repeatUntil.slice(5, 7), +repeatUntil.slice(8, 10), 23, 59).toISOString()
                      : undefined;
                  const minutes = Math.floor(Number(reminder));
                  const remind = reminder.trim() && Number.isFinite(minutes) && minutes > 0 ? Math.min(10080, minutes) : undefined;
                  const payload = {
                    title: title.trim() || "Event",
                    start: startAt.toISOString(),
                    end: endAt.toISOString(),
                    cat,
                    loc: loc.trim(),
                    allDay: allDay || undefined,
                    repeat: freq,
                    repeatInterval: every && every > 1 ? every : undefined,
                    repeatUntil: untilIso,
                    repeatCount: count,
                    reminder: remind,
                    color: color || undefined,
                  };
                  if (editId) {
                    updateEvent(editId, payload);
                    toast("Event updated");
                  } else {
                    addEvent({ id: uid(), ...payload, source: "local" });
                    toast("Event saved");
                  }
                  setOpen(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <EventCatManager open={catsOpen} onOpenChange={setCatsOpen} />
    </div>
  );
}
