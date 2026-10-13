"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { ConfirmRow } from "@/components/ui/confirm-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FIELD_SELECT } from "@/components/views/finance-chip";
import { EventCatManager } from "@/components/event-cat-manager";
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
} from "@/lib/format";
import { EVENT_SWATCHES, mineCalId, visibleCalEvents } from "@/lib/google-cal";
import { downloadICS } from "@/lib/ics";
import { parseICSAsync } from "@/lib/parse-ics-async";
import { expandEvents } from "@/lib/repeat";
import { catFg, catsWithOrphans, eventCatLabel, eventCatTagStyle } from "@/lib/event-cats";
import { PAGE_SPAN_CAP, PHONE_SPAN_CAP, UNCAPPED_SPAN, layoutSpanRows, spanCellLabel, spanWhen } from "@/lib/span-layout";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { MonthGrid, SpanButton } from "@/components/calendar/month-grid";
import { DayAgenda } from "@/components/calendar/day-agenda";
import { CalendarAccountsSheet } from "@/components/calendar/calendar-accounts-sheet";
import { calendarColourOf } from "@/lib/calendar/source";
import { addIcsSource, hiddenIcsSources, isReadOnlyEvent, queueGoogleWrite, refreshStatus, syncNow, useCalAccounts, writableGoogleCalendars } from "@/lib/calendar/accounts";
import { catToken } from "@/lib/event-cats";
import { onQuickAdd, takeQuickAdd } from "@/lib/calendar/quick-add";
import { useAtrium } from "@/lib/store";
import type { CalMode, CalendarEvent } from "@/lib/types";

function shiftCursor(cursor: Date, mode: CalMode, dir: -1 | 1) {
  const p = manilaParts(cursor);
  if (mode === "week") return addDays(cursor, dir * 7);
  if (mode === "day") return addDays(cursor, dir);
  return fromManila(p.year, p.month + dir, 1, 12);
}

function sourceLine(e: CalendarEvent) {
  if (e.source === "google") return "Google";
  if (e.source === "ics") return "Read-only";
  return "Atrium";
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

export function CalendarView() {
  const { events, eventCats, addEvent, updateEvent, removeEvent, calMode, calCursor, setCalMode, setCalCursor, gcalCals, gcalOff } = useAtrium(
    useShallow((s) => ({
      events: s.events,
      eventCats: s.eventCats,
      addEvent: s.addEvent,
      updateEvent: s.updateEvent,
      removeEvent: s.removeEvent,
      calMode: s.calMode,
      calCursor: s.calCursor,
      setCalMode: s.setCalMode,
      setCalCursor: s.setCalCursor,
      gcalCals: s.gcalCals,
      gcalOff: s.gcalOff,
    })),
  );
  const { icsSources, canEdit, email } = useCalAccounts(useShallow((s) => ({ icsSources: s.icsSources, canEdit: s.canEdit, email: s.email })));
  const listed = useMemo(() => {
    const hiddenIcs = hiddenIcsSources(icsSources);
    const colours = new Map<string, string>();
    for (const c of gcalCals) colours.set(c.id, catToken(calendarColourOf(c.id, c.colour)));
    for (const src of icsSources) if (src.colour) colours.set(src.id, catToken(src.colour));
    return visibleCalEvents(events, gcalOff, mineCalId(gcalCals))
      .filter((e) => !(e.source === "ics" && hiddenIcs.has(e.srcId ?? "")))
      .map((e) => {
        const c = e.color ? undefined : colours.get((e.source === "google" ? e.calId : e.srcId) ?? "");
        return c ? { ...e, color: c } : e;
      });
  }, [events, gcalOff, gcalCals, icsSources]);
  const [accountsOpen, setAccountsOpen] = useState(false);
  /** Where a new event goes: "local" or a writable Google calendar id (Card 164 Q2: primary first). */
  const [target, setTarget] = useState("local");
  const [viewOnly, setViewOnly] = useState<string | null>(null);
  const writable = useMemo(() => writableGoogleCalendars(gcalCals, canEdit), [gcalCals, canEdit]);
  const [cursor, setCursor] = useState(() => {
    if (calCursor && !Number.isNaN(+new Date(calCursor))) return new Date(calCursor);
    return new Date();
  });
  const [mode, setMode] = useState<CalMode>(() =>
    calMode === "week" || calMode === "day" || calMode === "agenda" || calMode === "month" ? calMode : "month",
  );
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
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
    setConfirmDelete(false);
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
    setViewOnly(null);
    setTarget(writable[0]?.id ?? "local");
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }

  function openEvent(ev: CalendarEvent) {
    const master = ev.seriesId ? (events.find((e) => e.id === ev.seriesId) ?? ev) : ev;
    setConfirmDelete(false);
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
    setTarget(master.source === "google" && master.calId ? master.calId : "local");
    setViewOnly(
      isReadOnlyEvent(master, gcalCals, canEdit)
        ? master.source === "ics"
          ? (icsSources.find((x) => x.id === master.srcId)?.name ?? "this calendar")
          : (gcalCals.find((c) => c.id === master.calId)?.label ?? "this calendar")
        : null,
    );
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("accounts") === "1") {
      // The Google popup lands here after sign-in: close it so the opener takes over.
      if (window.opener && window.name === "atrium-google") {
        window.close();
        return;
      }
      setAccountsOpen(true);
      q.delete("accounts");
      window.history.replaceState(null, "", `${window.location.pathname}${q.size ? `?${q}` : ""}`);
    }
    void refreshStatus().then((st) => {
      if (st.state === "connected") void syncNow();
    });
    const takeAdd = () => {
      const at = takeQuickAdd();
      if (!at) return;
      openDay(isoDate(new Date(at)));
      setStart(toManilaInput(at));
      setEnd(toManilaInput(new Date(new Date(at).getTime() + 30 * 60_000)));
    };
    takeAdd();
    const offAdd = onQuickAdd(takeAdd);
    const onOnline = () => void syncNow();
    window.addEventListener("online", onOnline);
    return () => {
      offAdd();
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importFile(f: File) {
    try {
      const n = addIcsSource({ kind: "ics", name: f.name, importedAt: new Date().toISOString(), shown: true }, await parseICSAsync(await f.text()));
      importedToast(n);
    } catch {
      toast("Could not read that calendar file");
    }
  }

  /** Remove locally, then from Google when the event lives there (Card 163 two-way). */
  function deleteEvent(id: string) {
    const ev = events.find((e) => e.id === id);
    removeEvent(id);
    if (ev?.source === "google" && !isReadOnlyEvent(ev, gcalCals, canEdit)) void queueGoogleWrite("delete", ev);
  }

  function skipDate(id: string, day: string) {
    const master = events.find((x) => x.id === id);
    const skip = [...new Set([...(master?.skip ?? []), day])];
    updateEvent(id, { skip });
    if (master?.source === "google") toast("Skipped here only. Google still shows this date.");
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const grid = useMemo(() => monthCells(cursor), [cursor]);
  const outside = useMemo(() => new Set(grid.filter((c) => c.out).map((c) => isoDate(c.date))), [grid]);
  // One shared span layout (lib/span-layout) for Month rows and the Week strip; spans are one bar per week row.
  const [monthRows, phoneRows] = useMemo(() => {
    const keys = grid.map((c) => isoDate(c.date));
    const weeks = Array.from({ length: keys.length / 7 }, (_, w) => keys.slice(w * 7, w * 7 + 7));
    return [layoutSpanRows(shown, weeks, PAGE_SPAN_CAP), layoutSpanRows(shown, weeks, PHONE_SPAN_CAP)];
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
      <CalendarToolbar
        title={heading(cursor, mode)}
        mode={mode}
        onMode={setMode}
        onPrev={() => setCursor(shiftCursor(cursor, mode, -1))}
        onNext={() => setCursor(shiftCursor(cursor, mode, 1))}
        onToday={() => setCursor(new Date())}
        onImportFile={(f) => void importFile(f)}
        onExport={() => downloadICS(listed)}
        onAccounts={() => setAccountsOpen(true)}
        onNew={() => openDay(isoDate(cursor))}
      />

      {mode === "month" && (
        <MonthGrid cursor={cursor} rows={monthRows} phoneRows={phoneRows} outside={outside} cats={eventCats} onDay={openDay} onShowDay={showDay} onEvent={openEvent} />
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
        <DayAgenda date={cursor} events={shown} cats={eventCats} onEvent={openEvent} onNew={() => openDay(isoDate(cursor))} />
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
                {list!.map(({ e }) =>
                  removeId === `${k}-${e.id}` ? (
                  <ConfirmRow
                    key={`${k}-${e.id}`}
                    className="my-1"
                    subject={e.title}
                    verb="Remove"
                    detail="It leaves your calendar."
                    triggerId={`${k}-${e.id}`}
                    onCancel={() => setRemoveId(null)}
                    onConfirm={() => {
                      deleteEvent(e.id);
                      setRemoveId(null);
                      toast("Event removed");
                    }}
                  />
                  ) : (
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
                    {isReadOnlyEvent(e, gcalCals, canEdit) ? null : <Button
                      variant="ghost"
                      size="sm"
                      className="h-11"
                      {...(e.seriesId ? {} : { "data-confirm-trigger": `${k}-${e.id}` })}
                      onClick={() => {
                        if (e.seriesId) {
                          skipDate(e.seriesId, isoDate(new Date(e.start)));
                          toast("Skipped this date");
                          return;
                        }
                        setRemoveId(`${k}-${e.id}`);
                      }}
                    >
                      {e.seriesId ? "Skip" : "Remove"}
                    </Button>}
                  </div>
                  ),
                )}
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
            <DialogTitle>{viewOnly ? "Event" : editId ? "Edit event" : "New event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {viewOnly ? <p className="rounded-md bg-muted px-3 py-2 text-sm">View only. You can&apos;t edit events in {viewOnly}.</p> : null}
            <fieldset disabled={Boolean(viewOnly)} className="m-0 min-w-0 space-y-3 border-0 p-0">
            {!viewOnly && (writable.length || (editId && fromGoogle)) ? (
              <div className="space-y-1">
                <Label htmlFor="ev-cal">Calendar</Label>
                <select id="ev-cal" className={FIELD_SELECT} value={target} disabled={Boolean(editId)} onChange={(e) => setTarget(e.target.value)}>
                  {editId && fromGoogle && !writable.some((c) => c.id === target) ? <option value={target}>{gcalCals.find((c) => c.id === target)?.label ?? "Google"}</option> : null}
                  {writable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.primary ? (email ?? c.label) : c.label} · Google
                    </option>
                  ))}
                  {!editId || !fromGoogle ? <option value="local">Atrium only</option> : null}
                </select>
              </div>
            ) : null}
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
                className={FIELD_SELECT}
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
                  className={FIELD_SELECT}
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
                  className={FIELD_SELECT}
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
                  {EVENT_SWATCHES.map(({ hex: c, name }) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={name}
                      aria-pressed={color === c}
                      className="inline-flex size-hit items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setColor(color === c ? "" : c)}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "inline-flex size-6 items-center justify-center rounded-full",
                          color === c ? "border-2 border-foreground" : "border border-input",
                        )}
                        style={{ background: c }}
                      >
                        {color === c ? <Check className="size-3.5" style={{ color: catFg(c) }} /> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            </fieldset>
            {fromGoogle && !viewOnly && occurDay ? (
              <p className="text-xs text-muted-foreground">Changes apply to every date in this series in Google.</p>
            ) : null}
            {guests ? <p className="text-xs text-muted-foreground">Guests: {guests}</p> : null}
            {meet ? (
              <a href={meet} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                Meet
              </a>
            ) : null}
            {editId && confirmDelete ? (
              <ConfirmRow
                subject={title.trim() || "this event"}
                verb="Delete"
                detail="It leaves your calendar."
                triggerId="event-delete"
                onCancel={() => setConfirmDelete(false)}
                onConfirm={() => {
                  deleteEvent(editId);
                  setConfirmDelete(false);
                  setOpen(false);
                  toast("Event removed");
                }}
              />
            ) : (
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {viewOnly ? "Close" : "Cancel"}
              </Button>
              {viewOnly ? null : editId && occurDay ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    skipDate(editId, occurDay);
                    setOpen(false);
                    toast("Skipped this date");
                  }}
                >
                  Skip this date
                </Button>
              ) : null}
              {editId && !viewOnly ? (
                <Button variant="outline" data-confirm-trigger="event-delete" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              ) : null}
              {viewOnly ? null : <Button
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
                    const prev = events.find((x) => x.id === editId);
                    if (prev?.source === "google") void queueGoogleWrite("update", { ...prev, ...payload });
                    toast("Event updated");
                  } else if (target !== "local") {
                    const ev: CalendarEvent = { id: uid(), ...payload, source: "google", calId: target };
                    addEvent(ev);
                    void queueGoogleWrite("create", ev);
                    toast("Event saved");
                  } else {
                    addEvent({ id: uid(), ...payload, source: "local" });
                    toast("Event saved");
                  }
                  setOpen(false);
                }}
              >
                Save
              </Button>}
            </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <EventCatManager open={catsOpen} onOpenChange={setCatsOpen} />
      <CalendarAccountsSheet open={accountsOpen} onOpenChange={setAccountsOpen} />
    </div>
  );
}
