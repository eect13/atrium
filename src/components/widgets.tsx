"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Shuffle,
} from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import {
  CAT_COLORS,
  deskZone,
  fmtDate,
  fmtWhen,
  fromManila,
  isoDate,
  isoMonth,
  isAllDayEvent,
  manilaAt,
  manilaParts,
  maskedMoney,
  moneyShort,
  monthCells,
  monthName,
  moneyQuote,
  notePlain,
  pct,
  sameDay,
} from "@/lib/format";
import { liquidEffect, sumToHome, toHomeCcy } from "@/lib/books";
import { sessionSpark, tapeSpark } from "@/lib/sparks";
import { useAtrium } from "@/lib/store";
import type { CalendarEvent, NewsItem, QuoteCcy, WidgetKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WeatherGlance } from "@/components/weather-panel";
import { useMarkets } from "@/components/use-markets";
import { LOCAL_QUOTES, fetchQuotes, readQuoteSeed, readQuoteSession, writeQuoteSession } from "@/lib/quotes";
import { storyAge, tagStory } from "@/lib/headline";
import { Spark } from "@/components/spark";
import { Skeleton } from "@/components/ui/skeleton";

const HOUR_PX = 48;
const DAY_START = 7;
const DAY_END = 21;

function hourLabel(hour: number) {
  const ap = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}${ap}`;
}

export function WeatherBody() {
  return <WeatherGlance hours={6} days={5} />;
}

export function AgendaBody() {
  const events = useAtrium((s) => s.events);
  const setView = useAtrium((s) => s.setView);
  const today = events
    .filter((e) => sameDay(e.start, new Date()))
    .toSorted((a, b) => +new Date(a.start) - +new Date(b.start));
  if (!today.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing on the calendar. Use the command bar: “Lunch Friday 1pm”.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {today.map((e) => (
        <button
          key={e.id}
          type="button"
          className="flex min-h-11 w-full items-start gap-3 text-left"
          onClick={() => setView("calendar")}
        >
          <span className="mt-1 size-2 shrink-0 rounded-full bg-ring" />
          <span>
            <span className="block text-sm font-medium">{e.title}</span>
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

function layoutTimed(list: CalendarEvent[], startH: number) {
  const startMin = startH * 60;
  const raw = list
    .map((e) => {
      const s = manilaParts(new Date(e.start));
      const t = manilaParts(new Date(e.end));
      const a = s.hour * 60 + s.minute;
      let b = t.hour * 60 + t.minute;
      if (isoDate(new Date(e.end)) !== isoDate(new Date(e.start))) b += 24 * 60;
      if (b <= a) b = a + 30;
      return {
        e,
        a,
        b,
        top: ((a - startMin) / 60) * HOUR_PX,
        height: Math.max(36, ((b - a) / 60) * HOUR_PX),
      };
    })
    .toSorted((x, y) => x.a - y.a || y.b - x.b);

  const colUntil: number[] = [];
  return raw.map((item) => {
    let col = colUntil.findIndex((end) => end <= item.a);
    if (col < 0) {
      col = colUntil.length;
      colUntil.push(item.b);
    } else {
      colUntil[col] = item.b;
    }
    let cols = col + 1;
    for (const other of raw) {
      if (other.e.id === item.e.id) continue;
      if (other.a < item.b && other.b > item.a) cols = Math.max(cols, 2);
    }
    return { ...item, col, cols };
  });
}

export function CalendarPeek({
  date,
  embedded = false,
  onSelect,
}: {
  date?: Date;
  embedded?: boolean;
  onSelect?: (e: CalendarEvent) => void;
}) {
  const events = useAtrium((s) => s.events);
  const setView = useAtrium((s) => s.setView);
  const calPeek = useAtrium((s) => s.calPeek);
  const setCalPeek = useAtrium((s) => s.setCalPeek);
  const [day, setDay] = useState(() => isoDate(date ?? new Date()));
  const [cursor, setCursor] = useState(() => date ?? new Date());
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);
  const todayKey = isoDate(now);

  useEffect(() => {
    if (date) setDay(isoDate(date));
  }, [date]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const days = useMemo(() => {
    const origin = manilaParts(now);
    return Array.from({ length: 7 }, (_, i) =>
      fromManila(origin.year, origin.month, origin.day - origin.weekdayIndex + i, 12),
    );
  }, [todayKey, now]);

  const byDay = useMemo(
    () => Object.groupBy(events, (e) => isoDate(new Date(e.start))),
    [events],
  );
  const list = useMemo(
    () => (byDay[day] ?? []).toSorted((a, b) => a.start.localeCompare(b.start)),
    [byDay, day],
  );
  const allDay = useMemo(() => list.filter(isAllDayEvent), [list]);
  const timed = useMemo(() => list.filter((e) => !isAllDayEvent(e)), [list]);
  const startH = useMemo(() => {
    const hours = timed.map((e) => manilaParts(new Date(e.start)).hour);
    return Math.min(DAY_START, ...hours, DAY_START);
  }, [timed]);
  const endH = useMemo(() => {
    const hours = timed.map((e) => manilaParts(new Date(e.end)).hour);
    return Math.max(DAY_END, ...hours, DAY_END);
  }, [timed]);
  const hours = useMemo(
    () => Array.from({ length: endH - startH + 1 }, (_, i) => startH + i),
    [startH, endH],
  );
  const blocks = useMemo(() => layoutTimed(timed, startH), [timed, startH]);
  const nowParts = manilaParts(now);
  const nowTop = ((nowParts.hour * 60 + nowParts.minute - startH * 60) / 60) * HOUR_PX;
  const showNow = day === todayKey && nowTop >= 0 && nowTop <= hours.length * HOUR_PX;
  const pick = (e: CalendarEvent) => {
    if (onSelect) onSelect(e);
    else setView("calendar");
  };
  const grid = useMemo(() => monthCells(cursor), [cursor]);
  const shell = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 360, h: 480 });
  useEffect(() => {
    const node = shell.current;
    if (!node) return;
    const measure = () => {
      const r = node.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const roomy = box.w >= 320 && box.h >= 380;
  const peekMonth =
    calPeek === "month" ? true : calPeek === "week" ? false : roomy;

  useLayoutEffect(() => {
    if (peekMonth) return;
    const node = scroller.current;
    if (!node) return;
    const target = showNow ? nowTop - 72 : (blocks[0]?.top ?? 0) - 8;
    node.scrollTop = Math.max(0, target);
  }, [day, showNow, nowTop, blocks, peekMonth]);

  const goToday = () => {
    const n = new Date();
    setDay(isoDate(n));
    setCursor(n);
  };
  const navBtn =
    "min-h-8 shrink-0 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground";
  const modeBar = (
    <div className="mb-2 shrink-0 space-y-1">
      <div className="flex items-center gap-1" data-tauri-drag-region>
        <span className="min-w-0 grow truncate px-1 text-sm font-medium" data-tauri-drag-region>
          {peekMonth ? monthName(cursor) : fmtDate(manilaAt(day, 12).toISOString())}
        </span>
        <button type="button" data-no-drag className={navBtn} onClick={goToday}>
          Today
        </button>
        {peekMonth ? (
          <>
            <button
              type="button"
              data-no-drag
              className={navBtn}
              onClick={() => {
                const p = manilaParts(cursor);
                setCursor(fromManila(p.year, p.month - 1, 1, 12));
              }}
            >
              Prev
            </button>
            <button
              type="button"
              data-no-drag
              className={navBtn}
              onClick={() => {
                const p = manilaParts(cursor);
                setCursor(fromManila(p.year, p.month + 1, 1, 12));
              }}
            >
              Next
            </button>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {(
          [
            ["auto", "Auto"],
            ["month", "Month"],
            ["week", "Compact"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-no-drag
            aria-pressed={calPeek === id}
            className={cn(
              "min-h-8 rounded-md px-2 text-xs",
              calPeek === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setCalPeek(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  const dayAgenda = (
    <div className="mt-2 min-h-0 flex-1 overflow-auto">
      <p className="mb-1 text-xs uppercase tracking-[0.06em] text-muted-foreground">
        {fmtDate(manilaAt(day, 12).toISOString())}
      </p>
      {!list.length ? (
        <p className="text-sm text-muted-foreground">Nothing on this day.</p>
      ) : (
        <div className="space-y-1.5">
          {list.map((e) => (
            <button
              key={e.id}
              type="button"
              className="flex min-h-11 w-full flex-col items-start rounded-md bg-muted/60 px-2.5 py-1.5 text-left"
              style={{ boxShadow: `inset 3px 0 0 ${CAT_COLORS[e.cat]}` }}
              onClick={() => pick(e)}
            >
              <span className="text-sm font-medium leading-snug">{e.title}</span>
              <span className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                {isAllDayEvent(e) ? "All day" : fmtWhen(e)}
                {e.loc ? ` · ${e.loc}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (peekMonth) {
    return (
      <div ref={shell} className="flex h-full min-h-0 flex-col">
        {modeBar}
        <div className="grid grid-cols-7 gap-0.5">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div
              key={`${d}-${i}`}
              className={cn(
                "pb-1 text-center text-[0.65rem] text-muted-foreground",
                (i === 0 || i === 6) && "opacity-50",
              )}
            >
              {d}
            </div>
          ))}
          {grid.map((c) => {
            const key = isoDate(c.date);
            const count = byDay[key]?.length ?? 0;
            const isToday = sameDay(c.date, now);
            const on = key === day;
            const weekend = manilaParts(c.date).weekdayIndex === 0 || manilaParts(c.date).weekdayIndex === 6;
            return (
              <button
                key={key + (c.out ? "-out" : "")}
                type="button"
                onClick={() => setDay(key)}
                className={cn(
                  "flex min-h-9 flex-col items-center justify-center rounded-sm text-xs tabular-nums",
                  c.out && "opacity-40",
                  weekend && !on && "text-muted-foreground/70",
                  on ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  isToday && !on && "ring-1 ring-ring",
                )}
              >
                {c.day}
                {count ? (
                  <span className="mt-0.5 flex gap-0.5">
                    {Array.from({ length: Math.min(3, count) }).map((_, i) => (
                      <span key={i} className={cn("size-1 rounded-full", on ? "bg-primary-foreground" : "bg-ring")} />
                    ))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {dayAgenda}
        {embedded ? null : (
          <button
            type="button"
            className="mt-2 shrink-0 text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => setView("calendar")}
          >
            Full calendar
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={shell} className="flex h-full min-h-0 flex-col">
      {modeBar}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = isoDate(d);
          const on = key === day;
          const isToday = sameDay(d, now);
          const count = byDay[key]?.length ?? 0;
          const parts = manilaParts(d);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setDay(key)}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center rounded-md text-xs",
                on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                isToday && !on && "ring-1 ring-ring",
              )}
            >
              <span>{parts.weekday.slice(0, 2)}</span>
              <span className="tabular-nums">{parts.day}</span>
              {count ? (
                <span className={cn("mt-0.5 size-1 rounded-full", on ? "bg-primary-foreground" : "bg-ring")} />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">
          {fmtDate(manilaAt(day, 12).toISOString())}
        </p>
        {embedded ? null : (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => setView("calendar")}
          >
            Full calendar
          </button>
        )}
      </div>
      {allDay.length ? (
        <div className="mt-2 space-y-1">
          {allDay.map((e) => (
            <button
              key={e.id}
              type="button"
              className="flex min-h-9 w-full items-center rounded-sm px-2 text-left text-xs"
              style={{ boxShadow: `inset 3px 0 0 ${CAT_COLORS[e.cat]}` }}
              onClick={() => pick(e)}
            >
              {e.title}
            </button>
          ))}
        </div>
      ) : null}
      <div ref={scroller} className="relative mt-2 min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((hour, i) => (
            <div
              key={hour}
              className="absolute left-0 right-0 grid grid-cols-[2.75rem_1fr] border-b border-border"
              style={{ top: i * HOUR_PX, height: HOUR_PX }}
            >
              <span className="pt-1 text-right text-xs tabular-nums text-muted-foreground">
                {hourLabel(hour)}
              </span>
              <div />
            </div>
          ))}
          {blocks.map((item) => (
            <button
              key={item.e.id}
              type="button"
              className="absolute z-[1] overflow-hidden rounded-sm bg-muted px-2 py-1 text-left"
              style={{
                top: item.top,
                height: item.height,
                left: `calc(2.75rem + 6px + ${item.col} * ((100% - 2.75rem - 10px) / ${item.cols}))`,
                width: `calc((100% - 2.75rem - 10px) / ${item.cols} - 4px)`,
                boxShadow: `inset 3px 0 0 ${CAT_COLORS[item.e.cat]}`,
              }}
              onClick={() => pick(item.e)}
            >
              <span className="block truncate text-sm">{item.e.title}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {fmtWhen(item.e)}
                {item.e.loc ? ` · ${item.e.loc}` : ""}
              </span>
            </button>
          ))}
          {showNow ? (
            <div
              className="pointer-events-none absolute left-11 right-0 z-[2] flex items-center"
              style={{ top: nowTop }}
            >
              <span className="size-2 -translate-x-1 rounded-full bg-destructive" />
              <span className="h-px flex-1 bg-destructive" />
            </div>
          ) : null}
        </div>
      </div>
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
    const data = await fetchQuotes({ data: { mode: "random", limit: 8, seed: `${Date.now()}` } }).catch(() => ({ quotes: LOCAL_QUOTES }));
    const next = data.quotes.find((row) => row.text !== text) ?? data.quotes[0] ?? LOCAL_QUOTES[0];
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
  return (
    <div>
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
          setMarketPrefs({ home: "books", showBooks: true });
          setView("finance");
        }}
      >
        <p className="font-display text-3xl tabular-nums">{maskedMoney(liquid, mask, home)}</p>
        <p className="mt-1 text-sm text-destructive">Spent this month {maskedMoney(spent, mask, home)}</p>
      </button>
      {marketsOn ? (
      <div className="mt-4 grid grid-cols-[3.25rem_minmax(0,1fr)_max-content] gap-x-3 gap-y-1" aria-busy={quotesPending || undefined}>
        {watch.slice(0, 4).map((w) => {
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
                setMarketPrefs({ home: "markets", showMarkets: true });
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
        })}
      </div>
      ) : null}
      {marketsOn && (markets.isError || markets.data?.failed) ? (
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
          <span className="truncate">{notePlain(n.html, n.text).split("\n")[0] || "Untitled"}</span>
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
}: {
  headlines: NewsItem[];
  loading?: boolean;
  error?: boolean;
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
      return <p className="text-sm text-muted-foreground">Headlines unavailable.</p>;
    }
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{feedOn ? "No headlines yet." : "No sources on."}</p>
        {!feedOn ? (
          <button
            type="button"
            className="text-sm text-foreground underline-offset-2 hover:underline"
            onClick={() => {
              enableStarterFeeds();
              toast("Starter feeds on");
            }}
          >
            Use starter feeds
          </button>
        ) : (
          <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setView("news")}>
            Open News
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {headlines.slice(0, 5).map((n) => {
        const age = storyAge(n.date);
        return (
          <a key={`${n.src}-${n.link}-${n.title}`} href={n.link} target="_blank" rel="noopener noreferrer" className="block">
            <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{tagStory(n)}</span>
            <span className="mt-0.5 block text-sm leading-snug">{n.title}</span>
            <span className="text-xs text-muted-foreground">
              {n.src}
              {age ? ` · ${age}` : ""}
            </span>
          </a>
        );
      })}
    </div>
  );
}

export function WidgetBody({
  kind,
  headlines,
  newsLoading,
  newsError,
}: {
  kind: WidgetKind;
  headlines: NewsItem[];
  newsLoading?: boolean;
  newsError?: boolean;
}) {
  if (kind === "weather") return <WeatherBody />;
  if (kind === "agenda") return <AgendaBody />;
  if (kind === "calendar") return <CalendarPeek />;
  if (kind === "quote") return <QuoteBody />;
  if (kind === "finance") return <FinancePeek />;
  return <NewsPeek headlines={headlines} loading={newsLoading} error={newsError} />;
}
