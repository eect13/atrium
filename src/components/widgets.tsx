"use client";

import { SHELL_ACTIONS } from "@/lib/widget-menu";
import { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronLeft,
  Eye,
  EyeOff,
  Shuffle,
} from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import {
  addDays,
  eventCoversDay,
  fmtWhen,
  isoDate,
  isoMonth,
  manilaAt,
  maskedMoney,
  moneyShort,
  moneyQuote,
  noteTitle,
  pct,
} from "@/lib/format";
import { eventCatLabel, eventCatTagStyle } from "@/lib/event-cats";
import { type SpanSegment } from "@/lib/span-layout";
import { onExternalAnchorClick } from "@/lib/http";
import { liquidEffect, sumToHome, toHomeCcy } from "@/lib/books";
import { sessionSpark, tapeSpark } from "@/lib/sparks";
import { expandEvents } from "@/lib/repeat";
import { useAtrium } from "@/lib/store";
import {
  cityFromTz,
  clockChangeLabel,
  clockList,
  differentCivilDay,
  formatOffsetVsLocal,
  formatZoneDate,
  formatZoneTime,
  nextClockChange,
  sharedWorkWindow,
  zoneHMS,
  zoneState,
  ZONE_STATE_LABEL,
} from "@/lib/clock";
import { widgetLook, widgetOpts } from "@/lib/widget-prefs";
import { AnalogClock } from "@/components/analog-clock";
import { CalendarTiles } from "@/components/calendar-tiles";
import type { CalendarEvent, NewsItem, QuoteCcy, WatchItem, WidgetKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WeatherGlance } from "@/components/weather-panel";
import { useMarkets } from "@/components/use-markets";
import { LOCAL_QUOTES, loadDeskQuotes, quoteFromStorageEvent, readQuoteSeed, readQuoteSession, writeQuoteSession } from "@/lib/quotes";
import { storyAge, storyDesk, tagStory } from "@/lib/headline";
import { Spark } from "@/components/spark";
import { Skeleton } from "@/components/ui/skeleton";
import { QuoteAttribution } from "@/components/quote-attribution";

export function WeatherBody() {
  return <WeatherGlance hours={6} days={5} />;
}

export function AgendaBody() {
  const stored = useAtrium((s) => s.events);
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
        Nothing today.
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



export function QuoteBody({ variant = "widget" }: { variant?: "widget" | "float" } = {}) {
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
    networkMode: "always",
  });
  const text = q.data?.text;
  // Widget ↔ float mirror (Form 152 N9): Random in another window updates this one.
  useEffect(() => {
    const on = (e: StorageEvent) => {
      const next = quoteFromStorageEvent(e.key, e.newValue);
      if (next) queryClient.setQueryData(["quotes", "session"], next);
    };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, [queryClient]);

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
  if (variant === "float") {
    // Form 152 B1: quote + Random scroll; attribution pinned in a 44px footer.
    return (
      <div className="flex h-full min-h-0 flex-col" data-quote-variant="float">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="font-display text-base leading-snug">{text}</p>
      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          className="inline-flex min-h-hit min-w-hit items-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => void shuffle()}
        >
          <span className="inline-flex items-center gap-1">
            <Shuffle className="size-3" />
            Random
          </span>
        </button>
      </div>
        </div>
        {q.data ? <QuoteAttribution q={q.data} layout="inline" className="shrink-0 border-t border-border" /> : null}
      </div>
    );
  }
  return (
    <div>
      <p className="font-display text-base leading-snug md:text-lg">{text}</p>
      {q.data ? <QuoteAttribution q={q.data} className="mt-3 text-xs" /> : null}
      <div className="mt-1 flex items-center gap-3">
        <button
          type="button"
          className="inline-flex min-h-hit min-w-hit items-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
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
        <button type="button" className="mt-2 inline-flex min-h-11 items-center text-xs underline" onClick={() => void markets.refetch()}>
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

/** Card 216 N4/N5: a tapped note opens that note; "+N" shows what is hidden; one empty-state action. */
export function NotesPeek() {
  const notes = useAtrium((s) => s.notes);
  const shown = notes.slice(0, 4);
  const more = notes.length - shown.length;
  return (
    <div className="space-y-2">
      {shown.map((n) => (
        <button
          key={n.id}
          type="button"
          data-peek-note={n.id}
          className="flex min-h-11 w-full items-center gap-3 text-left text-sm"
          onClick={() => openNote(n.id)}
        >
          <span className="size-2 shrink-0 rounded-full" style={{ background: n.color }} />
          <span className="truncate">{noteTitle(n)}</span>
        </button>
      ))}
      {more > 0 ? (
        <button type="button" className="min-h-11 text-sm text-muted-foreground hover:text-foreground" onClick={() => useAtrium.getState().setView("notes")}>
          +{more} more
        </button>
      ) : null}
      {!notes.length ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">No notes yet.</p>
          <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-sm hover:bg-muted" onClick={SHELL_ACTIONS["new-note"]}>
            + New note
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Opens the Notes page on one note: a floating note is brought back to the board first. */
function openNote(id: string) {
  const st = useAtrium.getState();
  if (st.notes.find((n) => n.id === id)?.pinned) st.unpinNote(id);
  st.setView("notes");
  st.raise("note", id);
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: "center" });
    el?.querySelector<HTMLElement>("textarea,[contenteditable=true]")?.focus();
  }, 60);
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
            className="inline-flex min-h-11 items-center text-sm text-foreground underline-offset-2 hover:underline"
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
  const dashPrefs = useAtrium((s) => s.dashPrefs);
  const setView = useAtrium((s) => s.setView);
  const opts = widgetOpts(dashPrefs, "clock");
  const look = widgetLook(dashPrefs);
  const analog = look.clockStyle === "analog";
  const seconds = opts.seconds && !preview;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), seconds ? 1000 : 15_000);
    return () => clearInterval(t);
  }, [seconds]);
  const primary = profile.tz?.trim() || "UTC";
  const zones = clockList(primary, clockPrefs);
  const hour24 = clockPrefs.hour24;
  const wh = clockPrefs.workHours;
  const locale = profile.locale;
  const main = zones[0]!;
  const rest = zones.slice(1);
  const shown = rest.slice(0, CLOCK_ROWS_MAX);
  const hidden = rest.length - shown.length;
  const shared = opts.shared ? sharedWorkWindow(zones, wh, now) : null;
  const status = (z: string) => ZONE_STATE_LABEL[zoneState(now, z, wh)];
  const change = (z: string) => {
    if (!opts.changes) return null;
    const c = nextClockChange(z, now);
    return c ? clockChangeLabel(c, z, locale) : null;
  };
  const mainChange = change(main);
  return (
    // Card 204 ladder (container width): S <220 time+date · M 220–419 larger · L ≥420 adds cities. Compact steps down one size.
    <div className="@container">
      <div className={cn("flex flex-col items-start gap-1", analog && "flex-row items-center gap-3")}>
        {analog ? (
          <AnalogClock
            {...zoneHMS(now, main)}
            seconds={seconds}
            label={formatZoneTime(now, main, { hour24: true, locale })}
            className={cn("size-20 shrink-0", look.compact ? "@[420px]:size-28" : "@[220px]:size-28")}
          />
        ) : (
          <p className={cn("font-sans font-semibold leading-none tabular-nums tracking-tight", look.compact ? "text-[44px] @[420px]:text-[76px]" : "text-[44px] @[220px]:text-[76px]")}>
            {formatZoneTime(now, main, { hour24, seconds, locale })}
          </p>
        )}
        <p className="min-w-0 text-xs leading-snug text-muted-foreground">
          <span className="block truncate">{preview ? formatZoneDate(now, main, locale) : `${formatZoneDate(now, main, locale)} · ${cityFromTz(main)}`}</span>
          {analog ? <span className="block font-semibold tabular-nums text-foreground">{formatZoneTime(now, main, { hour24, locale })}</span> : null}
        </p>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {status(main)}
        {mainChange ? <span className="text-foreground"> · {mainChange}</span> : null}
      </p>
      {shown.length ? (
        <ul className={cn("mt-3", look.compact ? "hidden" : "hidden @[420px]:block")} aria-label="World clocks">
          {shown.map((z) => {
            const ch = change(z);
            return (
              <li key={z} className="border-t border-border/70 py-2">
                <div className="flex min-h-9 items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{cityFromTz(z)}</span>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">
                      {formatOffsetVsLocal(now, z, main)} · {status(z)}
                      {differentCivilDay(now, z, main) ? ` · ${now.toLocaleDateString(locale || "en-GB", { timeZone: z, weekday: "short" })}` : ""}
                      {ch ? <span className="text-foreground"> · {ch}</span> : null}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-mono text-[20px] tabular-nums">{formatZoneTime(now, z, { hour24, locale })}</span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {opts.shared && rest.length ? (
        <p className="mt-2 border-t border-border/70 pt-2 text-xs text-muted-foreground">
          Shared work hours ·{" "}
          <span className="tabular-nums text-foreground">
            {shared ? `${formatZoneTime(shared.from, main, { hour24, locale })}–${formatZoneTime(shared.to, main, { hour24, locale })}` : "None today"}
          </span>
        </p>
      ) : null}
      {opts.helper ? (
        <button
          type="button"
          className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          onClick={() => setView("clock")}
        >
          {!rest.length ? "Add cities in Clock tab" : hidden > 0 ? `+${hidden} more in Clock tab` : "Edit in Clock tab"}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </button>
      ) : hidden > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">+{hidden} more</p>
      ) : null}
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
  if (kind === "calendar") return <CalendarTiles />;
  if (kind === "quote") return <QuoteBody variant="float" />;
  if (kind === "finance") return <FinancePeek />;
  if (kind === "clock") return <ClockBody />;
  return <NewsPeek headlines={headlines} loading={newsLoading} error={newsError} missed={newsMissed} />;
}
