"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CalendarPeek } from "@/components/widgets";
import { FloatBtn } from "@/components/desk-chrome";
import { redirectToLoginIfRequired } from "@/lib/app-data";
import {
  addDays,
  CAT_COLORS,
  fmtDate,
  fmtWhen,
  fromManila,
  fromManilaInput,
  isoDate,
  isoMonth,
  isAllDayEvent,
  manilaAt,
  manilaParts,
  monthName,
  monthCells,
  sameDay,
  toManilaInput,
  toZoneInput,
  fromZoneInput,
  resolveEventTz,
  WORLD_ZONES,
  uid,
  weekRangeLabel,
} from "@/lib/format";
import { fetchIcsUrl } from "@/lib/feeds";
import { defaultGcalOff, listGoogleCalendars, listGoogleEvents, visibleCalEvents } from "@/lib/google-cal";
import { downloadICS } from "@/lib/ics";
import { parseICSAsync } from "@/lib/parse-ics-async";
import { useAtrium } from "@/lib/store";
import type { CalMode, CalendarEvent, EventCat } from "@/lib/types";

function shiftCursor(cursor: Date, mode: CalMode, dir: -1 | 1) {
  const p = manilaParts(cursor);
  if (mode === "week") return addDays(cursor, dir * 7);
  if (mode === "day") return addDays(cursor, dir);
  return fromManila(p.year, p.month + dir, 1, 12);
}

function importedToast(n: number) {
  toast(n ? `Imported ${n} event${n === 1 ? "" : "s"}` : "Already up to date");
}

function heading(cursor: Date, mode: CalMode) {
  if (mode === "week") return weekRangeLabel(cursor);
  if (mode === "day") return fmtDate(cursor.toISOString());
  return monthName(cursor);
}

export function CalendarView() {
  const { events, addEvent, updateEvent, removeEvent, importEvents, calMode, calCursor, setCalMode, setCalCursor, gcalCals, gcalOff, setGcalCals, toggleGcal } = useAtrium(
    useShallow((s) => ({
      events: s.events,
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
  const shown = useMemo(() => visibleCalEvents(events, gcalOff), [events, gcalOff]);
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
  const [cat, setCat] = useState<EventCat>("work");
  const [loc, setLoc] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [eventTz, setEventTz] = useState("desk");

  useEffect(() => {
    setCalMode(mode);
  }, [mode, setCalMode]);
  useEffect(() => {
    setCalCursor(isoDate(cursor));
  }, [cursor, setCalCursor]);
  const [subUrl, setSubUrl] = useState("");

  function openDay(date: string) {
    setEditId(null);
    setStart(toManilaInput(manilaAt(date, 9)));
    setEnd(toManilaInput(manilaAt(date, 10)));
    setTitle("");
    setLoc("");
    setCat("work");
    setAllDay(false);
    setOpen(true);
  }

  function openEvent(ev: CalendarEvent) {
    setEditId(ev.id);
    setTitle(ev.title);
    setStart(toManilaInput(ev.start));
    setEnd(toManilaInput(ev.end));
    setCat(ev.cat);
    setLoc(ev.loc);
    setAllDay(Boolean(ev.allDay) || isAllDayEvent(ev));
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


  async function mapGoogle(res: Awaited<ReturnType<typeof listGoogleEvents>>, calendarId?: string) {
    if (res.loginRequired) {
      redirectToLoginIfRequired({ ok: false, data: null, loginRequired: true, loginUrl: res.loginUrl });
      toast("Connect Google Calendar, then try again.");
      return null;
    }
    if (res.error) {
      toast(res.error);
      return null;
    }
    return res.events.flatMap((g) => {
      const dateOnly = Boolean(g.start?.date && !g.start.dateTime);
      const s = g.start?.dateTime || (g.start?.date ? manilaAt(g.start.date, 9).toISOString() : "");
      const e = dateOnly
        ? manilaAt(g.start!.date!, 10).toISOString()
        : g.end?.dateTime || (g.end?.date ? manilaAt(g.end.date, 10).toISOString() : s);
      if (!s) return [];
      const startAt = new Date(s);
      const endAt = new Date(e);
      if (Number.isNaN(startAt.getTime())) return [];
      return [{
        id: "g-" + (calendarId ? calendarId + "-" : "") + (g.id || uid()),
        title: g.summary || "Google event",
        start: startAt.toISOString(),
        end: Number.isNaN(endAt.getTime()) ? startAt.toISOString() : endAt.toISOString(),
        cat: "personal" as const,
        loc: g.location || "",
        source: "google" as const,
        allDay: dateOnly || undefined,
        calId: calendarId,
      }];
    });
  }

  async function pullGoogle(ids?: string[]) {
    const now = new Date();
    const p = manilaParts(now);
    const range = {
      timeMin: fromManila(p.year, p.month, 1).toISOString(),
      timeMax: fromManila(p.year, p.month + 2, 1).toISOString(),
    };
    const listed = await listGoogleCalendars();
    if (listed.loginRequired) {
      redirectToLoginIfRequired({ ok: false, data: null, loginRequired: true, loginUrl: listed.loginUrl });
      toast("Connect Google Calendar, then try again.");
      return;
    }
    let cals = listed.calendars;
    let off = gcalOff;
    if (cals.length) {
      const first = !gcalCals.length;
      if (first) off = defaultGcalOff(cals);
      setGcalCals(cals, first ? off : undefined);
    } else {
      cals = gcalCals;
    }
    const selected = ids?.length
      ? ids
      : (cals.length ? cals.filter((c) => !off.includes(c.id)).map((c) => c.id) : [undefined]);
    const mapped: CalendarEvent[] = [];
    for (const calendarId of selected.length ? selected : [undefined]) {
      const res = await listGoogleEvents({
        data: { ...range, calendarId: calendarId || undefined },
      });
      const rows = await mapGoogle(res, calendarId || undefined);
      if (rows === null) return;
      mapped.push(...rows);
    }
    importedToast(importEvents(mapped));
  }

  async function flipCal(id: string) {
    const turningOn = gcalOff.includes(id);
    toggleGcal(id);
    if (turningOn) await pullGoogle([id]);
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const grid = useMemo(() => monthCells(cursor), [cursor]);
  const onDate = (d: Date) =>
    shown.filter((e) => sameDay(e.start, d)).toSorted((a, b) => +new Date(a.start) - +new Date(b.start));

  const agendaMonth = isoMonth(cursor);
  const agenda = Object.groupBy(
    shown
      .filter((e) => isoDate(new Date(e.start)).startsWith(agendaMonth))
      .toSorted((a, b) => a.start.localeCompare(b.start)),
    (e) => isoDate(new Date(e.start)),
  );
  const agendaDays = Object.entries(agenda).slice(0, 20);
  const weekOrigin = manilaParts(cursor);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-medium tracking-tight">{heading(cursor, mode)}</h2>
        <Button variant="outline" size="sm" onClick={() => setCursor(shiftCursor(cursor, mode, -1))}>
          Prev
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
          Today
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCursor(shiftCursor(cursor, mode, 1))}>
          Next
        </Button>
        <div className="flex rounded-md border border-border">
          {(["month", "week", "day", "agenda"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-11 px-3 text-xs capitalize ${mode === m ? "bg-muted text-foreground" : "text-muted-foreground"}`}
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
        <Button variant="outline" size="sm" onClick={() => downloadICS(shown)}>
          Export
        </Button>
        <Button variant="outline" size="sm" onClick={() => void pullGoogle()}>
          Google
        </Button>
        <Button size="sm" onClick={() => openDay(isoDate())}>
          New event
        </Button>
        <FloatBtn kind="calendar" />
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Integrate by importing an .ics, pasting a public iCal URL, exporting Atrium, or pulling Google Calendar when connected.
      </p>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Public iCal URL (Google secret address, Outlook, Apple)"
          value={subUrl}
          onChange={(e) => setSubUrl(e.target.value)}
        />
        <Button variant="secondary" onClick={() => void subscribe()}>
          Subscribe
        </Button>
      </div>
      {gcalCals.length ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Google</p>
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
          <p className="text-xs text-muted-foreground">Mine stays on. Family and holidays start hidden.</p>
        </div>
      ) : null}

      {mode === "month" && (
        <div className="grid grid-cols-7 gap-1.5">
          {weekdays.map((d) => (
            <div key={d} className="px-1 pb-1 text-center text-xs text-muted-foreground">
              <span className="sm:hidden">{d[0]}</span>
              <span className="hidden sm:inline">{d}</span>
            </div>
          ))}
          {grid.map((c) => {
            const evs = onDate(c.date);
            const isToday = sameDay(c.date, new Date());
            return (
              <div
                key={isoDate(c.date) + (c.out ? "-out" : "")}
                className={`min-h-16 overflow-hidden rounded-md border p-1 text-left sm:min-h-24 sm:p-1.5 ${c.out ? "opacity-40" : "bg-card"} ${isToday ? "border-ring" : "border-border"}`}
              >
                <button
                  type="button"
                  className="min-h-6 min-w-6 text-left text-xs leading-none text-muted-foreground sm:min-h-8 sm:min-w-8"
                  onClick={() => openDay(isoDate(c.date))}
                >
                  {c.day}
                </button>
                {evs.slice(0, 3).map((e, i) => (
                  <button
                    key={e.id}
                    type="button"
                    className={`mt-0.5 block w-full truncate rounded-sm px-0.5 text-left text-xs leading-tight sm:min-h-8 sm:px-1 ${i > 0 ? "hidden sm:block" : ""}`}
                    style={{ color: CAT_COLORS[e.cat] }}
                    onClick={() => openEvent(e)}
                  >
                    {e.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {mode === "day" && (
        <div className="min-h-96 rounded-lg border border-border bg-card p-3">
          <CalendarPeek date={cursor} embedded onSelect={openEvent} />
        </div>
      )}

      {mode === "week" && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {weekdays.map((d, i) => {
            const startW = fromManila(
              weekOrigin.year,
              weekOrigin.month,
              weekOrigin.day - weekOrigin.weekdayIndex + i,
              12,
            );
            const evs = onDate(startW);
            return (
              <div
                key={d}
                className={`min-h-48 rounded-lg border bg-card p-3 ${sameDay(startW, new Date()) ? "border-ring" : "border-border"}`}
              >
                <button
                  type="button"
                  className="min-h-8 text-xs text-muted-foreground"
                  onClick={() => openDay(isoDate(startW))}
                >
                  {d} {manilaParts(startW).day}
                </button>
                {evs.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="mt-2 block min-h-8 w-full text-left text-sm"
                    onClick={() => openEvent(e)}
                  >
                    <span className="tabular-nums text-muted-foreground">{fmtWhen(e)} </span>
                    {e.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {mode === "agenda" && (
        <div className="space-y-6">
          {agendaDays.length ? (
            agendaDays.map(([k, list]) => (
              <div key={k}>
                <h4 className="mb-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">
                  {fmtDate(list![0].start)}
                </h4>
                {list!.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 border-b border-border py-2">
                    <span className="size-2 rounded-full" style={{ background: CAT_COLORS[e.cat] }} />
                    <button type="button" className="grow text-left" onClick={() => openEvent(e)}>
                      <div className="text-sm">{e.title}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {fmtWhen(e)} · {e.source}
                      </div>
                    </button>
                    <Button variant="ghost" size="sm" onClick={() => removeEvent(e.id)}>
                      Remove
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
        <DialogContent>
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
                  onChange={(e) => setCat(e.target.value as EventCat)}
                >
                  {(["work", "personal", "family", "health", "other"] as const).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ev-loc">Location</Label>
                <Input id="ev-loc" value={loc} onChange={(e) => setLoc(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
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
                    const day = isoDate(startAt);
                    endAt = manilaAt(day, 23, 59);
                  } else if (endAt.getTime() <= startAt.getTime()) {
                    endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
                  }
                  const payload = {
                    title: title.trim() || "Event",
                    start: startAt.toISOString(),
                    end: endAt.toISOString(),
                    cat,
                    loc: loc.trim(),
                    allDay: allDay || undefined,
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
    </div>
  );
}
