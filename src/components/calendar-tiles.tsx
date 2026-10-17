"use client";

/**
 * Card 204 Calendar widget: one container-query ladder for the dashboard and the desk float.
 * S <240 date tile · M 240–519 tile + today's agenda · L ≥520 adds a compact month.
 * Compact widgets step down one size (agenda from 520, no month). No free/busy strip.
 */
import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { connectGoogle, useCalAccounts } from "@/lib/calendar/accounts";
import { eventCatTagStyle } from "@/lib/event-cats";
import { addDays, eventCoversDay, fmtTime, isAllDayEvent, isoDate, manilaAt, manilaParts, monthCells, monthName } from "@/lib/format";
import { mineCalId, visibleCalEvents } from "@/lib/google-cal";
import { expandEvents } from "@/lib/repeat";
import { useAtrium } from "@/lib/store";
import { widgetLook, widgetOpts } from "@/lib/widget-prefs";
import { countdownLabel, minutesUntil, upNext } from "@/lib/calendar/day-summary";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const AGENDA_MAX = 5;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Reconnect line state: only expired/disconnected speak; offline and the last-sync time stay quiet. */
function reconnectLine(banner: string | null | undefined, at: string) {
  if (banner === "expired") return `Google sign-in expired · as of ${at}`;
  if (banner === "disconnected") return `Google disconnected · as of ${at}`;
  return null;
}

export function GoogleReconnectLine() {
  const { banner, lastSync, email } = useCalAccounts(useShallow((s) => ({ banner: s.banner, lastSync: s.lastSync, email: s.email })));
  const text = reconnectLine(banner, lastSync ? fmtTime(lastSync) : "—");
  if (!text) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground" role="status">
      <span aria-hidden className="size-1.5 rounded-full bg-destructive" />
      <span>{text} ·</span>
      <button
        type="button"
        data-no-drag
        className="inline-flex min-h-11 items-center text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => void connectGoogle({ loginHint: email ?? undefined }).catch(() => toast("Couldn't start Google sign-in"))}
      >
        Reconnect
      </button>
    </p>
  );
}

export function CalendarTiles() {
  const stored = useAtrium(useShallow((s) => visibleCalEvents(s.events, s.gcalOff, mineCalId(s.gcalCals))));
  const cats = useAtrium((s) => s.eventCats);
  const compact = useAtrium((s) => widgetLook(s.dashPrefs).compact);
  const opts = useAtrium(useShallow((s) => widgetOpts(s.dashPrefs, "calendar")));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const today = isoDate(now);
  const p = manilaParts(now);
  const cells = useMemo(() => monthCells(manilaAt(today, 12)), [today]);
  const painted = useMemo(() => expandEvents(stored, manilaAt(isoDate(cells[0]!.date), 0), addDays(manilaAt(isoDate(cells[cells.length - 1]!.date), 0), 1)), [stored, cells]);
  const agenda = useMemo(() => painted.filter((e) => eventCoversDay(e, today)).toSorted((a, b) => a.start.localeCompare(b.start)), [painted, today]);
  const next = opts.upNext ? upNext(agenda, today, now) : null;
  const busy = useMemo(() => new Set(cells.filter((c) => painted.some((e) => eventCoversDay(e, c.date))).map((c) => isoDate(c.date))), [cells, painted]);

  const open = (key: string) => {
    const st = useAtrium.getState();
    st.setCalMode("day");
    st.setCalCursor(key);
    st.setView("calendar");
  };

  return (
    <div className="@container">
      <div className="flex items-start gap-4">
        <button
          type="button"
          data-no-drag
          className="flex w-24 shrink-0 flex-col items-center rounded-lg py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Today, ${DAYS[p.weekdayIndex]} ${p.day} ${monthName(now)}. Open calendar`}
          onClick={() => open(today)}
        >
          <span className="text-xs font-medium tracking-wide text-muted-foreground">{MONTHS[p.month - 1]}</span>
          <span className="text-[64px] font-semibold leading-none tabular-nums @[240px]:text-[88px]">{p.day}</span>
          <span className="text-sm text-muted-foreground">{DAYS[p.weekdayIndex]}</span>
        </button>
        <ul aria-label="Today" className={cn("min-w-0 flex-1 space-y-1", compact ? "hidden @[520px]:block" : "hidden @[240px]:block")}>
          {next ? (
            <li className="truncate text-xs text-muted-foreground">
              Next · <span className="text-foreground">{next.title}</span> · in {countdownLabel(minutesUntil(next.start, now))}
            </li>
          ) : null}
          {agenda.slice(0, AGENDA_MAX).map((e) => (
            <li key={`${e.id}-${e.start}`}>
              <button type="button" data-no-drag className="flex min-h-11 w-full min-w-0 items-center gap-2 text-left text-sm" onClick={() => open(today)}>
                <span aria-hidden className="h-5 w-1 shrink-0 rounded-full" style={{ ...eventCatTagStyle(cats, e.cat, e.color), background: "var(--tag-bg)" }} />
                <span className="w-16 shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">{isAllDayEvent(e) ? "All day" : fmtTime(e.start)}</span>
                <span className="min-w-0 truncate">{e.title}</span>
              </button>
            </li>
          ))}
          {agenda.length > AGENDA_MAX ? <li className="text-xs text-muted-foreground">+{agenda.length - AGENDA_MAX} more</li> : null}
          {!agenda.length ? <li className="pt-3 text-sm text-muted-foreground">Nothing today</li> : null}
        </ul>
        <div role="grid" aria-label={monthName(now)} className={cn("w-56 shrink-0", compact ? "hidden" : "hidden @[520px]:block")}>
          <div role="row" className="grid grid-cols-7 text-center text-[0.65rem] text-muted-foreground">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} role="columnheader" aria-label={DAYS[i]}>
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 text-center text-xs tabular-nums">
            {/* Card 228 B10: gridcells live in rows (a week each); rows are display:contents so the 7-col grid is unchanged. */}
            {Array.from({ length: Math.ceil(cells.length / 7) }, (_, w) => (
              <div key={w} role="row" className="contents">
                {cells.slice(w * 7, w * 7 + 7).map((c) => {
                  const key = isoDate(c.date);
                  const isToday = key === today;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="gridcell"
                      data-no-drag
                      aria-current={isToday ? "date" : undefined}
                      aria-label={`${c.day}${busy.has(key) ? ", has events" : ""}`}
                      className={cn("relative mx-auto flex size-8 items-center justify-center rounded-full", c.out && "text-muted-foreground", isToday ? "bg-foreground font-semibold text-background" : "hover:bg-muted")}
                      onClick={() => open(key)}
                    >
                      {c.day}
                      {busy.has(key) && !isToday ? <span aria-hidden className="absolute bottom-0.5 size-1 rounded-full bg-muted-foreground" /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <GoogleReconnectLine />
      {opts.helper ? (
        <button type="button" data-no-drag className="mt-1 inline-flex min-h-11 items-center rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => useAtrium.getState().setView("calendar")}>
          Full calendar
        </button>
      ) : null}
    </div>
  );
}
