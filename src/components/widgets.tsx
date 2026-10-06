"use client";

import { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Eye,
  EyeOff,
  Shuffle,
} from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import {
  addDays,
  eventCoversDay,
  fmtDate,
  fmtWhen,
  fromManila,
  isoDate,
  isoMonth,
  manilaAt,
  manilaParts,
  maskedMoney,
  moneyShort,
  monthCells,
  monthName,
  moneyQuote,
  noteTitle,
  pct,
  sameDay,
  deskZone,
  WEEKDAY_NAMES,
} from "@/lib/format";
import { eventCatLabel, eventCatTagStyle } from "@/lib/event-cats";
import { CAL_VIEWS, CAL_VIEW_LABEL, calViewFor, type CalView } from "@/lib/cal-view";
import { WIDGET_SPAN_CAP, layoutSpanRows, spanCellLabel, spanWhen, type SpanRow, type SpanSegment } from "@/lib/span-layout";
import { onExternalAnchorClick } from "@/lib/http";
import { liquidEffect, sumToHome, toHomeCcy } from "@/lib/books";
import { sessionSpark, tapeSpark } from "@/lib/sparks";
import { mineCalId, visibleCalEvents } from "@/lib/google-cal";
import { expandEvents } from "@/lib/repeat";
import { useAtrium } from "@/lib/store";
import {
  cityFromTz,
  clockList,
  differentCivilDay,
  formatLocalOffsetLabel,
  formatOffsetVsLocal,
  formatZoneTime,
  formatZoneWeekday,
} from "@/lib/clock";
import type { CalendarEvent, NewsItem, QuoteCcy, WatchItem, WidgetKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WeatherGlance } from "@/components/weather-panel";
import { useMarkets } from "@/components/use-markets";
import { LOCAL_QUOTES, loadDeskQuotes, readQuoteSeed, readQuoteSession, writeQuoteSession } from "@/lib/quotes";
import { storyAge, storyDesk, tagStory } from "@/lib/headline";
import { Spark } from "@/components/spark";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "@/components/ui/tooltip";

export function WeatherBody() {
  return <WeatherGlance hours={6} days={5} />;
}

export function AgendaBody() {
  const stored = useAtrium((s) => visibleCalEvents(s.events, s.gcalOff, mineCalId(s.gcalCals)));
  const eventCats = useAtrium((s) => s.eventCats);
  const setView = useAtrium((s) => s.setView);
  const todayStart = manilaAt(isoDate(new Date()), 0);
  const events = expandEvents(stored, todayStart, addDays(todayStart, 1));
  const today = events
    .filter((e) => eventCoversDay(e, new Date()))
    .toSorted((a, b) => +new Date(a.start) - +new Date(b.start));
  if (!today.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing on the calendar. Use the command bar: “Lunch Friday 1pm”.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {today.map((e) => (
        <button
          key={e.id}
          type="button"
          className="flex min-h-11 w-full items-start gap-3 text-left"
          onClick={() => setView("calendar")}
          aria-label={`${e.title}, ${eventCatLabel(eventCats, e.cat)}`}
        >
          <span className="cat-tag cat-tag-lg mt-0.5 shrink-0" style={eventCatTagStyle(eventCats, e.cat, e.color)}>
            <span>{eventCatLabel(eventCats, e.cat)}</span>
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-snug">{e.title}</span>
            <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
              {fmtWhen(e)}
              {e.loc ? ` · ${e.loc}` : ""}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

type CatList = ReturnType<typeof useAtrium.getState>["eventCats"];

/** Solid category fill for an event (per-event colour wins), from the shared tag tokens. */
function barStyle(cats: CatList, e: CalendarEvent) {
  return { ...eventCatTagStyle(cats, e.cat, e.color), background: "var(--tag-bg)" };
}

/**
 * One continuous bar per week-row segment (widget + full Calendar). True ends are
 * rounded and inset; squared ends run to the row edge, and a squared start shows ‹.
 * The keyline (primary-foreground) is invisible on card and keeps the bar ≥3:1 on a selected (primary) day.
 */
export function SpanBar({
  seg,
  cats,
  className,
  style,
  ...rest
}: { seg: SpanSegment<CalendarEvent>; cats: CatList } & ComponentPropsWithoutRef<"span">) {
  return (
    <span
      {...rest}
      className={cn("span-bar", seg.trueStart ? "span-bar-start" : "span-bar-cont", seg.trueEnd && "span-bar-end", className)}
      style={{ ...eventCatTagStyle(cats, seg.e.cat, seg.e.color), ...style }}
    >
      {seg.trueStart ? null : <ChevronLeft className="size-2.5 shrink-0" strokeWidth={3} aria-hidden="true" />}
      <span className="min-w-0 truncate">{seg.e.title}</span>
    </span>
  );
}

/** Mini-grid singles: solid pill bars + "+N" (counts come from the shared span layout cap). */
function DayBars({ shown, more, on, cats }: { shown: CalendarEvent[]; more: number; on: boolean; cats: CatList }) {
  if (!shown.length && !more) return null;
  return (
    <span className="mt-[3px] flex w-full flex-col items-stretch gap-0.5 px-1.5" aria-hidden="true">
      {shown.map((e) => (
        <span
          key={e.id}
          className={cn("block h-1.5 rounded-full", on && "shadow-[0_0_0_1px_var(--color-primary-foreground)]")}
          style={barStyle(cats, e)}
        />
      ))}
      {more ? (
        <span className={cn("text-center text-[0.625rem] leading-none tabular-nums", on ? "text-primary-foreground" : "text-muted-foreground")}>
          +{more}
        </span>
      ) : null}
    </span>
  );
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";

/** One widget week row: day buttons underneath, span lanes + single bars overlaid (decorative). */
function PeekSpanRow({
  row,
  kind,
  day,
  now,
  outside,
  cats,
  onDay,
}: {
  row: SpanRow<CalendarEvent>;
  kind: "month" | "week";
  day: string;
  now: Date;
  outside?: Set<string>;
  cats: CatList;
  onDay: (key: string) => void;
}) {
  const head = kind === "month" ? 26 : 44;
  return (
    <div
      role="row"
      className={cn("grid grid-cols-7", kind === "month" ? "gap-x-0.5" : "gap-x-1")}
      style={{ gridTemplateRows: `${head}px${row.lanes ? ` repeat(${row.lanes}, 22px)` : ""} auto` }}
    >
      {row.days.map((key, i) => {
        const cell = row.cells[i]!;
        const d = manilaAt(key, 12);
        const on = key === day;
        const isToday = sameDay(d, now);
        const parts = manilaParts(d);
        return (
          <div key={key} role="gridcell" className="contents">
            <button
              type="button"
              aria-label={spanCellLabel(d, cell.all)}
              aria-pressed={on}
              aria-current={isToday ? "date" : undefined}
              onClick={() => onDay(key)}
              style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
              className={cn(
                "flex flex-col items-center justify-start pt-1.5 text-xs tabular-nums",
                FOCUS_RING,
                kind === "month" ? "min-h-14 rounded-sm" : "min-h-24 rounded-md",
                on
                  ? "bg-primary text-primary-foreground"
                  : cn(kind === "week" && "bg-muted", outside?.has(key) ? "text-muted-foreground/60" : "text-muted-foreground"),
                isToday && !on && "inset-ring inset-ring-ring",
              )}
            >
              {kind === "week" ? <span>{parts.weekday.slice(0, 2)}</span> : null}
              <span>{parts.day}</span>
            </button>
            {cell.shown.length || cell.more ? (
              <span className="pointer-events-none z-[1] self-start" style={{ gridColumn: i + 1, gridRow: 2 + row.lanes }}>
                <DayBars shown={cell.shown} more={cell.more} on={on} cats={cats} />
              </span>
            ) : null}
          </div>
        );
      })}
      {row.segs.map((s) => (
        <SpanBar
          key={s.e.id}
          seg={s}
          cats={cats}
          aria-hidden="true"
          className="pointer-events-none z-[1] self-center"
          style={{ gridColumn: `${s.c0 + 1} / ${s.c1 + 2}`, gridRow: 2 + s.lane }}
        />
      ))}
    </div>
  );
}

function weekRangeLabel(a: Date, b: Date) {
  const { locale, tz } = deskZone();
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: tz }).formatRange(a, b);
  } catch {
    return `${fmtDate(a.toISOString())} – ${fmtDate(b.toISOString())}`;
  }
}

const weekRows = (keys: string[]) => Array.from({ length: Math.ceil(keys.length / 7) }, (_, w) => keys.slice(w * 7, w * 7 + 7));

/**
 * Calendar widget / float body. Today | Week | Month (default Month), remembered
 * per `widgetId`. Month + Week grids draw multi-day events as continuous bars
 * (shared `layoutSpanRows`) and singles as solid pill bars; the day agenda below
 * shows Shape 1 `.cat-tag` pills + event name once.
 */
export function CalendarPeek({
  date,
  embedded = false,
  onSelect,
  widgetId = "float-calendar",
}: {
  date?: Date;
  embedded?: boolean;
  onSelect?: (e: CalendarEvent) => void;
  /** Key the Today | Week | Month pick is remembered under. */
  widgetId?: string;
}) {
  const stored = useAtrium((s) => visibleCalEvents(s.events, s.gcalOff, mineCalId(s.gcalCals)));
  const eventCats = useAtrium((s) => s.eventCats);
  const setView = useAtrium((s) => s.setView);
  const view = useAtrium((s) => calViewFor(s.calViews, widgetId));
  const setCalView = useAtrium((s) => s.setCalView);
  const [day, setDay] = useState(() => isoDate(date ?? new Date()));
  const [cursor, setCursor] = useState(() => date ?? new Date());
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!date) return;
    setDay(isoDate(date));
    setCursor(date);
  }, [date]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const grid = useMemo(() => monthCells(cursor), [cursor]);
  const week = useMemo(() => {
    const o = manilaParts(manilaAt(day, 12));
    return Array.from({ length: 7 }, (_, i) => fromManila(o.year, o.month, o.day - o.weekdayIndex + i, 12));
  }, [day]);

  const painted = useMemo(() => {
    const keys = [isoDate(grid[0]!.date), isoDate(grid[grid.length - 1]!.date), isoDate(week[0]!), isoDate(week[6]!), day].sort();
    const from = manilaAt(keys[0]!, 0);
    const to = addDays(manilaAt(keys[keys.length - 1]!, 0), 1);
    return expandEvents(stored, from, to);
  }, [stored, grid, week, day]);

  const outside = useMemo(() => new Set(grid.filter((c) => c.out).map((c) => isoDate(c.date))), [grid]);
  const rows = useMemo(() => {
    if (view === "month") return layoutSpanRows(painted, weekRows(grid.map((c) => isoDate(c.date))), WIDGET_SPAN_CAP);
    if (view === "week") return layoutSpanRows(painted, [week.map((d) => isoDate(d))], WIDGET_SPAN_CAP);
    return [];
  }, [view, painted, grid, week]);
  const list = useMemo(
    () => painted.filter((e) => eventCoversDay(e, day)).toSorted((a, b) => a.start.localeCompare(b.start)),
    [painted, day],
  );

  const pick = (e: CalendarEvent) => {
    if (onSelect) onSelect(e);
    else setView("calendar");
  };
  const selectDay = (key: string) => {
    setDay(key);
    setCursor(manilaAt(key, 12));
  };
  const goToday = () => selectDay(isoDate(new Date()));
  const step = (dir: -1 | 1) => {
    if (view === "month") {
      const p = manilaParts(cursor);
      setCursor(fromManila(p.year, p.month + dir, 1, 12));
      return;
    }
    selectDay(isoDate(addDays(manilaAt(day, 12), view === "week" ? 7 * dir : dir)));
  };
  const pickView = (v: CalView) => {
    setCalView(widgetId, v);
    if (v === "today" && !date) goToday();
  };

  const title =
    view === "month"
      ? monthName(cursor)
      : view === "week"
        ? weekRangeLabel(week[0]!, week[6]!)
        : fmtDate(manilaAt(day, 12).toISOString());
  const unit = view === "today" ? "day" : view;
  const iconBtn = cn(
    "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
    FOCUS_RING,
  );

  const header = (
    <div className="mb-3 shrink-0 space-y-2">
      <div className="flex items-center gap-0.5" data-tauri-drag-region>
        <span className="min-w-0 grow truncate px-1 text-sm font-medium" data-tauri-drag-region aria-live="polite">
          {title}
        </span>
        <Tip label="Go to today">
          <button type="button" data-no-drag className={iconBtn} aria-label="Go to today" onClick={goToday}>
            <CircleDot className="size-4" aria-hidden="true" />
          </button>
        </Tip>
        <Tip label={`Previous ${unit}`}>
          <button type="button" data-no-drag className={iconBtn} aria-label={`Previous ${unit}`} onClick={() => step(-1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
        </Tip>
        <Tip label={`Next ${unit}`}>
          <button type="button" data-no-drag className={iconBtn} aria-label={`Next ${unit}`} onClick={() => step(1)}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </Tip>
      </div>
      <div role="group" aria-label="Calendar view" className="inline-flex rounded-md bg-muted p-0.5" data-no-drag>
        {CAL_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            data-no-drag
            aria-pressed={view === v}
            className={cn(
              "min-h-11 rounded-[calc(var(--radius-md)-2px)] px-3.5 text-xs",
              FOCUS_RING,
              view === v ? "bg-background text-foreground ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => pickView(v)}
          >
            {CAL_VIEW_LABEL[v]}
          </button>
        ))}
      </div>
    </div>
  );

  const dayAgenda = (
    <div className="mt-3 min-h-0 flex-1 overflow-auto">
      {view === "today" ? null : (
        <p className="mb-1.5 text-xs uppercase tracking-[0.06em] text-muted-foreground">
          {fmtDate(manilaAt(day, 12).toISOString())}
        </p>
      )}
      {!list.length ? (
        <p className="text-sm text-muted-foreground">Nothing on this day.</p>
      ) : (
        <div className="space-y-1">
          {list.map((e) => {
            const cat = eventCatLabel(eventCats, e.cat);
            return (
              <button
                key={e.id}
                type="button"
                className={cn("flex min-h-11 w-full items-start gap-2.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-left", FOCUS_RING)}
                aria-label={`${e.title}, ${cat}`}
                onClick={() => pick(e)}
              >
                <span className="cat-tag mt-0.5 shrink-0" style={eventCatTagStyle(eventCats, e.cat, e.color)}>
                  <span>{cat}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium leading-snug">{e.title}</span>
                  <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                    {spanWhen(e, day)}
                    {e.loc ? ` · ${e.loc}` : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const fullLink = embedded ? null : (
    <button
      type="button"
      className={cn(
        "mt-auto inline-flex min-h-11 shrink-0 items-center self-start rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground",
        FOCUS_RING,
      )}
      onClick={() => setView("calendar")}
    >
      Full calendar
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      {view === "month" ? (
        <div role="grid" aria-label={monthName(cursor)} className="flex flex-col gap-0.5">
          <div role="row" className="grid grid-cols-7 gap-x-0.5">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={`${d}-${i}`} role="columnheader" className="pb-1 text-center text-[0.65rem] text-muted-foreground">
                <span aria-hidden="true">{d}</span>
                <abbr className="sr-only">{WEEKDAY_NAMES[i]}</abbr>
              </div>
            ))}
          </div>
          {rows.map((row) => (
            <PeekSpanRow key={row.days[0]} row={row} kind="month" day={day} now={now} outside={outside} cats={eventCats} onDay={setDay} />
          ))}
        </div>
      ) : view === "week" ? (
        <div role="grid" aria-label={title}>
          {rows.map((row) => (
            <PeekSpanRow key={row.days[0]} row={row} kind="week" day={day} now={now} cats={eventCats} onDay={setDay} />
          ))}
        </div>
      ) : null}
      {dayAgenda}
      {fullLink}
    </div>
  );
}

export function QuoteBody() {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["quotes", "session"],
    queryFn: async () => {
      const hit = readQuoteSession();
      if (hit) return hit;
      const data = await loadDeskQuotes({ mode: "random", limit: 8, seed: readQuoteSeed() }).catch(() => ({ quotes: LOCAL_QUOTES }));
      const first = data.quotes[0] ?? LOCAL_QUOTES[0];
      if (first) writeQuoteSession(first);
      return first ?? null;
    },
    staleTime: Infinity,
    gcTime: 6 * 60 * 60_000,
  });
  const text = q.data?.text;
  const author = q.data?.author;

  async function shuffle() {
    const current = queryClient.getQueryData<{ text?: string }>(["quotes", "session"])?.text ?? text;
    const data = await loadDeskQuotes({ mode: "random", limit: 8, seed: `${Date.now()}` }).catch(() => ({ quotes: LOCAL_QUOTES }));
    const next = data.quotes.find((row) => row.text !== current) ?? data.quotes[0] ?? LOCAL_QUOTES[0];
    if (!next) return;
    writeQuoteSession(next);
    queryClient.setQueryData(["quotes", "session"], next);
  }

  if (q.isPending && !text) {
    return (
      <div aria-busy>
        <Skeleton className="h-5 w-full" />
        <Skeleton className="mt-2 h-5 w-4/5" />
        <Skeleton className="mt-3 h-3 w-24" />
      </div>
    );
  }
  if (!text) {
    return <p className="text-sm text-muted-foreground">No quote this session.</p>;
  }
  return (
    <div>
      <p className="font-display text-base leading-snug md:text-lg">{text}</p>
      <p className="mt-3 text-xs text-muted-foreground">— {author}</p>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => void shuffle()}
        >
          <span className="inline-flex items-center gap-1">
            <Shuffle className="size-3" />
            Random
          </span>
        </button>
      </div>
    </div>
  );
}

export function FinancePeek() {
  const { txs, accounts, watch, books, setBooks, setView, setBoardFocus, setMarketPrefs, marketPrefs } = useAtrium(
    useShallow((s) => ({
      txs: s.txs,
      accounts: s.accounts,
      watch: s.watch,
      books: s.books,
      setBooks: s.setBooks,
      setView: s.setView,
      setBoardFocus: s.setBoardFocus,
      setMarketPrefs: s.setMarketPrefs,
      marketPrefs: s.marketPrefs,
    })),
  );
  const prefix = isoMonth();
  const mask = Boolean(books.mask);
  const home = books.currency ?? "PHP";
  const markets = useMarkets();
  const fx = markets.data?.fx;
  const spent = txs
    .filter((t) => t.date.startsWith(prefix) && liquidEffect(t) < 0)
    .reduce((s, t) => {
      const acc = accounts.find((a) => a.id === t.accountId);
      const n = toHomeCcy(Math.abs(liquidEffect(t)), acc?.currency ?? home, home, fx);
      return s + (n ?? 0);
    }, 0);
  const liquid = sumToHome(
    accounts.map((a) => ({ amount: a.balance, currency: a.currency ?? home })),
    home,
    fx,
  ).total;
  const quotes = markets.data?.quotes ?? {};
  const quotesPending = markets.isPending && !markets.data;
  const marketsOn = marketPrefs.showMarkets !== false;
  const booksOn = marketPrefs.showBooks !== false;

  const peekWatch = useMemo(() => {
    const seen = new Set<string>();
    const out: WatchItem[] = [];
    for (const w of watch) {
      const k = w.symbol.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(w);
    }
    return out.slice(0, booksOn ? 6 : 8);
  }, [watch, booksOn]);

  return (
    <div>
      {booksOn ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">On hand</p>
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={mask ? "Show balances" : "Hide balances"}
              aria-pressed={mask}
              onClick={() => setBooks({ mask: !mask })}
            >
              {mask ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <button
            type="button"
            className="block w-full text-left"
            onClick={() => {
              setMarketPrefs({ home: "books" });
              setView("finance");
            }}
          >
            <p className="font-display text-3xl tabular-nums">{maskedMoney(liquid, mask, home)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Spent this month {maskedMoney(spent, mask, home)}</p>
          </button>
        </>
      ) : null}
      {marketsOn ? (
      <div className={cn("grid grid-cols-[3.25rem_minmax(0,1fr)_max-content] gap-x-3 gap-y-1", booksOn && "mt-4")} aria-busy={quotesPending || undefined}>
        {peekWatch.length ? peekWatch.map((w) => {
          const q = quotes[w.symbol] ?? quotes[w.id] ?? quotes[w.label];
          const spark =
            q?.spark && q.spark.length >= 2
              ? q.spark
              : tapeSpark(w.symbol, 90) ??
                (q && Number.isFinite(q.price) ? sessionSpark(q.price, q.change, w.symbol) : undefined);
          const ch = q?.change;
          const up = (ch ?? 0) >= 0;
          return (
            <button
              key={w.id}
              type="button"
              className="col-span-3 grid min-h-11 grid-cols-subgrid items-center text-left"
              onClick={() => {
                setMarketPrefs({ home: "markets", tab: "watcher" });
                setBoardFocus(w.symbol);
                setView("finance");
              }}
            >
              <span className="font-mono text-sm text-muted-foreground">{w.label}</span>
              {quotesPending && !q ? (
                <Skeleton className="col-span-2 h-4 w-full" />
              ) : (
                <>
                  {spark && spark.length >= 2 ? (
                    <Spark values={spark} up={up} className="h-8 w-full min-w-0 sm:h-9" />
                  ) : (
                    <span />
                  )}
                  <span
                    className={`whitespace-nowrap text-right tabular-nums text-sm ${ch == null ? "text-muted-foreground" : up ? "text-ok" : "text-destructive"}`}
                  >
                    {q ? moneyShort(q.price, q.ccy) : "—"}
                    {q && ch != null ? ` ${pct(ch)}` : ""}
                  </span>
                </>
              )}
            </button>
          );
        }) : (
          <button
            type="button"
            className="col-span-3 min-h-11 text-left text-sm text-muted-foreground"
            onClick={() => {
              setMarketPrefs({ home: "markets", tab: "watcher" });
              setView("finance");
            }}
          >
            Empty watcher — open Markets to add names.
          </button>
        )}
      </div>
      ) : null}
      {marketsOn && markets.data?.gaps?.length ? (
        <p className="mt-2 text-xs text-muted-foreground">{markets.data.gaps.join(" · ")} didn’t answer.</p>
      ) : null}
      {marketsOn && (markets.isError || markets.data?.failed || markets.data?.gaps?.length) ? (
        <button type="button" className="mt-2 text-xs underline" onClick={() => void markets.refetch()}>
          Retry prices
        </button>
      ) : null}
    </div>
  );
}

export function QuoteRow({
  label,
  price,
  change,
  ccy = "PHP",
}: {
  label: string;
  price?: number;
  change?: number;
  ccy?: QuoteCcy;
}) {
  const ch = change ?? 0;
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border text-sm">
      <span className="font-mono">{label}</span>
      <span className={`tabular-nums ${ch >= 0 ? "text-ok" : "text-destructive"}`}>
        {price != null ? moneyQuote(price, ccy) : "—"}
        {price != null && change != null ? ` ${pct(ch)}` : ""}
      </span>
    </div>
  );
}

export function NotesPeek() {
  const notes = useAtrium((s) => s.notes);
  const setView = useAtrium((s) => s.setView);
  return (
    <div className="space-y-2">
      {notes.slice(0, 4).map((n) => (
        <button
          key={n.id}
          type="button"
          className="flex min-h-11 w-full items-center gap-3 text-left text-sm"
          onClick={() => setView("notes")}
        >
          <span className="size-2 rounded-full" style={{ background: n.color }} />
          <span className="truncate">{noteTitle(n)}</span>
        </button>
      ))}
      {!notes.length && <p className="text-sm text-muted-foreground">No stickies yet.</p>}
    </div>
  );
}

export function NewsPeek({
  headlines,
  loading = false,
  error = false,
  missed = [],
}: {
  headlines: NewsItem[];
  loading?: boolean;
  error?: boolean;
  missed?: string[];
}) {
  const setView = useAtrium((s) => s.setView);
  const feedOn = useAtrium((s) => s.feeds.some((f) => f.enabled));
  const enableStarterFeeds = useAtrium((s) => s.enableStarterFeeds);
  if (!headlines.length) {
    if (loading) {
      return (
        <div className="space-y-3" aria-busy>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-14" />
              <Skeleton className="mt-1.5 h-4 w-full" />
              <Skeleton className="mt-1 h-3 w-20" />
            </div>
          ))}
        </div>
      );
    }
    if (error) {
      return <p className="text-sm text-muted-foreground">Feed unavailable.</p>;
    }
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{feedOn ? "No stories yet." : "No sources on."}</p>
        {!feedOn ? (
          <button
            type="button"
            className="text-sm text-foreground underline-offset-2 hover:underline"
            onClick={() => {
              enableStarterFeeds();
              toast("Starter sources on");
            }}
          >
            Use starter sources
          </button>
        ) : (
          <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setView("news")}>
            Open Feed
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {headlines.slice(0, 5).map((n) => {
        const age = storyAge(n.date);
        const desk = storyDesk(n);
        return (
          <a key={`${n.src}-${n.link}-${n.title}`} href={n.link} target="_blank" rel="noopener noreferrer" onClick={onExternalAnchorClick} className="block">
            <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{tagStory(n)}</span>
            <span className="mt-0.5 block text-sm leading-snug">{n.title}</span>
            <span className="text-xs text-muted-foreground">
              {n.src}
              {desk ? ` · ${desk}` : ""}
              {age ? ` · ${age}` : ""}
            </span>
          </a>
        );
      })}
      {missed.length ? (
        <p className="text-xs text-muted-foreground">
          {missed.length === 1 ? `${missed[0]} didn’t answer.` : `${missed.length} sources didn’t answer.`}
        </p>
      ) : null}
    </div>
  );
}

const CLOCK_ROWS_MAX = 6;

export function ClockBody({ preview = false }: { preview?: boolean }) {
  const profile = useAtrium((s) => s.profile);
  const clockPrefs = useAtrium((s) => s.clockPrefs);
  const setView = useAtrium((s) => s.setView);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const primary = profile.tz?.trim() || "UTC";
  const zones = clockList(primary, clockPrefs);
  const hour24 = clockPrefs.hour24;
  const locale = profile.locale;
  const main = zones[0]!;
  const rest = zones.slice(1);
  const shown = rest.slice(0, CLOCK_ROWS_MAX);
  const hidden = rest.length - shown.length;
  const linkLabel = !rest.length
    ? "Add cities in Clock tab"
    : hidden > 0
      ? `+${hidden} more in Clock tab`
      : "Edit in Clock tab";
  return (
    <div>
      <p className="font-display text-3xl font-medium tabular-nums tracking-tight">
        {formatZoneTime(now, main, { hour24, seconds: !preview, locale })}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {preview
          ? cityFromTz(main)
          : `${formatZoneWeekday(now, main, locale)} · ${cityFromTz(main)} · ${formatLocalOffsetLabel(now, main)}`}
      </p>
      {shown.length ? (
        <ul className="mt-3" aria-label="World clocks">
          {shown.map((z) => (
            <li key={z} className="flex min-h-11 items-center justify-between gap-3 border-t border-border/70">
              <span className="min-w-0">
                <span className="block truncate text-sm">{cityFromTz(z)}</span>
                <span className="block text-[11px] tabular-nums text-muted-foreground">
                  {formatOffsetVsLocal(now, z, main)}
                  {differentCivilDay(now, z, main)
                    ? ` · ${now.toLocaleDateString(locale || "en-GB", { timeZone: z, weekday: "short" })}`
                    : ""}
                </span>
              </span>
              <span className="whitespace-nowrap text-[15px] tabular-nums">{formatZoneTime(now, z, { hour24, locale })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No other cities yet</p>
      )}
      <button
        type="button"
        className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        onClick={() => setView("clock")}
      >
        {linkLabel}
        <ArrowUpRight className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export function WidgetBody({
  kind,
  headlines,
  newsLoading,
  newsError,
  newsMissed = [],
}: {
  kind: WidgetKind;
  headlines: NewsItem[];
  newsLoading?: boolean;
  newsError?: boolean;
  newsMissed?: string[];
}) {
  if (kind === "weather") return <WeatherBody />;
  if (kind === "agenda") return <AgendaBody />;
  if (kind === "calendar") return <CalendarPeek widgetId="float-calendar" />;
  if (kind === "quote") return <QuoteBody />;
  if (kind === "finance") return <FinancePeek />;
  if (kind === "clock") return <ClockBody />;
  return <NewsPeek headlines={headlines} loading={newsLoading} error={newsError} missed={newsMissed} />;
}
