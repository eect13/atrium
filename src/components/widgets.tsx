"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Shuffle,
} from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import {
  addDays,
  eventCoverDays,
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
  dayLabel,
  deskZone,
  WEEKDAY_NAMES,
} from "@/lib/format";
import { eventCatLabel, eventCatTagStyle } from "@/lib/event-cats";
import { CAL_VIEWS, CAL_VIEW_LABEL, calViewFor, pillBars, type CalView } from "@/lib/cal-view";
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
import { LOCAL_QUOTES, fetchQuotes, readQuoteSeed, readQuoteSession, writeQuoteSession } from "@/lib/quotes";
import { storyAge, storyDesk, tagStory } from "@/lib/headline";
import { Spark } from "@/components/spark";
import { Skeleton } from "@/components/ui/skeleton";

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

/** Mini-grid cell marks: solid pill bars only — names live in the day agenda. */
function DayBars({ list, max, on, cats }: { list: CalendarEvent[]; max: number; on: boolean; cats: CatList }) {
  if (!list.length) return null;
  const { bars, more } = pillBars(list.length, max);
  return (
    <span className="mt-1 flex w-full flex-col items-stretch gap-0.5 px-1.5" aria-hidden="true">
      {list.slice(0, bars).map((e) => (
        <span key={e.id} className="block h-1.5 rounded-full" style={barStyle(cats, e)} />
      ))}
      {more ? (
        <span className={cn("text-center text-[0.625rem] leading-none tabular-nums", on ? "text-primary-foreground" : "text-muted-foreground")}>
          +{more}
        </span>
      ) : null}
    </span>
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

/**
 * Calendar widget / float body. Today | Week | Month (default Month), remembered
 * per `widgetId`. Month + Week grids carry solid pill bars only; the day agenda
 * below shows Shape 1 `.cat-tag` pills + event name once.
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

  const byDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of painted) {
      for (const k of eventCoverDays(e)) (map[k] ??= []).push(e);
    }
    for (const k of Object.keys(map)) map[k]!.sort((a, b) => a.start.localeCompare(b.start));
    return map;
  }, [painted]);
  const list = byDay[day] ?? [];

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
  const navBtn = "min-h-8 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground";

  const header = (
    <div className="mb-3 shrink-0 space-y-2">
      <div className="flex items-center gap-1" data-tauri-drag-region>
        <span className="min-w-0 grow truncate px-1 text-sm font-medium" data-tauri-drag-region aria-live="polite">
          {title}
        </span>
        <button type="button" data-no-drag className={navBtn} onClick={goToday}>
          Today
        </button>
        <button type="button" data-no-drag className={navBtn} aria-label={`Previous ${view === "today" ? "day" : view}`} onClick={() => step(-1)}>
          Prev
        </button>
        <button type="button" data-no-drag className={navBtn} aria-label={`Next ${view === "today" ? "day" : view}`} onClick={() => step(1)}>
          Next
        </button>
      </div>
      <div role="group" aria-label="Calendar view" className="inline-flex rounded-md bg-muted p-0.5" data-no-drag>
        {CAL_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            data-no-drag
            aria-pressed={view === v}
            className={cn(
              "min-h-9 rounded-[calc(var(--radius-md)-2px)] px-3 text-xs",
              view === v ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
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
      <p className="mb-1.5 text-xs uppercase tracking-[0.06em] text-muted-foreground">
        {fmtDate(manilaAt(day, 12).toISOString())}
      </p>
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
                className="flex min-h-11 w-full items-start gap-2.5 rounded-md bg-muted/60 px-2.5 py-1.5 text-left"
                aria-label={`${e.title}, ${cat}`}
                onClick={() => pick(e)}
              >
                <span className="cat-tag mt-0.5 shrink-0" style={eventCatTagStyle(eventCats, e.cat, e.color)}>
                  <span>{cat}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium leading-snug">{e.title}</span>
                  <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                    {fmtWhen(e)}
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
      className="mt-auto shrink-0 pt-2 text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      onClick={() => setView("calendar")}
    >
      Full calendar
    </button>
  );

  const cellTone = (on: boolean, isToday: boolean, muted: boolean) =>
    cn(
      on ? "bg-primary text-primary-foreground" : muted ? "text-muted-foreground/60" : "text-muted-foreground",
      isToday && !on && "ring-1 ring-ring",
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      {view === "month" ? (
        <div role="grid" aria-label={monthName(cursor)} className="grid grid-cols-7 gap-0.5">
          <div role="row" className="contents">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={`${d}-${i}`} role="columnheader" className="pb-1 text-center text-[0.65rem] text-muted-foreground">
                <span aria-hidden="true">{d}</span>
                <abbr className="sr-only">{WEEKDAY_NAMES[i]}</abbr>
              </div>
            ))}
          </div>
          {Array.from({ length: grid.length / 7 }, (_, w) => grid.slice(w * 7, w * 7 + 7)).map((row) => (
            <div key={isoDate(row[0]!.date)} role="row" className="contents">
              {row.map((c) => {
                const key = isoDate(c.date);
                const items = byDay[key] ?? [];
                const on = key === day;
                return (
                  <div key={key + (c.out ? "-out" : "")} role="gridcell" className="contents">
                    <button
                      type="button"
                      aria-label={dayLabel(c.date, items.length)}
                      aria-pressed={on}
                      aria-current={sameDay(c.date, now) ? "date" : undefined}
                      onClick={() => setDay(key)}
                      className={cn(
                        "flex min-h-14 flex-col items-center justify-start rounded-sm pt-1.5 text-xs tabular-nums",
                        cellTone(on, sameDay(c.date, now), c.out),
                      )}
                    >
                      {c.day}
                      <DayBars list={items} max={3} on={on} cats={eventCats} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : view === "week" ? (
        <div className="grid grid-cols-7 gap-1" role="group" aria-label={title}>
          {week.map((d) => {
            const key = isoDate(d);
            const items = byDay[key] ?? [];
            const on = key === day;
            const parts = manilaParts(d);
            return (
              <button
                key={key}
                type="button"
                aria-label={dayLabel(d, items.length)}
                aria-pressed={on}
                aria-current={sameDay(d, now) ? "date" : undefined}
                onClick={() => setDay(key)}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-start rounded-md pt-1.5 text-xs",
                  on ? "" : "bg-muted",
                  cellTone(on, sameDay(d, now), false),
                )}
              >
                <span>{parts.weekday.slice(0, 2)}</span>
                <span className="tabular-nums">{parts.day}</span>
                <DayBars list={items} max={2} on={on} cats={eventCats} />
              </button>
            );
          })}
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
      const data = await fetchQuotes({ data: { mode: "random", limit: 8, seed: readQuoteSeed() } }).catch(() => ({ quotes: [] as typeof LOCAL_QUOTES }));
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
    const data = await fetchQuotes({ data: { mode: "random", limit: 8, seed: `${Date.now()}` } }).catch(() => ({ quotes: LOCAL_QUOTES }));
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
