"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, FileDown, Plus, RefreshCw, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { ChangePill, Spark, TickMark } from "@/components/spark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useMarkets } from "@/components/use-markets";
import { deskZone, isoDate, moneyQuote, phpQuote, peso, vol } from "@/lib/format";
import {
  BOARD_SORTS,
  BOARD_TABS,
  PRIMARY_TABS,
  PSE_TABS,
  SCREEN_SORTS,
  displayLast,
  kindBoardRows,
  matchQuery,
  pairLabel,
  positionPnl,
  positionValue,
  rankByQuery,
  sortRows,
  stockBoardRows,
  turnover,
  universeRows,
  type BoardRow,
  type BoardSort,
} from "@/lib/market-board";
import {
  SESSION_SCREENS,
  STYLE_SCREENS,
  SECTOR_SCREENS,
  SCREEN_CAPS,
  SCREEN_PES,
  SCREEN_VOLS,
  SCREEN_YLDS,
  applyScreenFilters,
  capLabel,
  peLabel,
  screensOn,
  yldLabel,
} from "@/lib/screener";
import { fetchPseIndex } from "@/lib/pse-index";
import {
  SPARK_RANGES,
  fetchSparks,
  normalizeSparkRange,
  rememberTape,
  sessionSpark,
  tapeSpark,
} from "@/lib/sparks";
import { bustPseCache } from "@/lib/sw-client";
import { useAtrium } from "@/lib/store";
import { QUOTE_CCY, WATCH_CATALOG, type WatchItem, DEFAULT_MARKET_PREFS } from "@/lib/types";
import type { MarketQuote } from "@/lib/prices";
import { searchTickers } from "@/lib/prices";
import { buildResearch, downloadPdf, fetchRelatedStories, issuerDisplay, researchPdf, type RelatedStory } from "@/lib/research";
import { concentration, fetchPseiWeights, PSEI_FORMULA, PSEI_WEIGHT_AS_OF, PSEI_WEIGHTS, topWeights } from "@/lib/psei-weight";
import { mixStories } from "@/lib/headline";
import { cn } from "@/lib/utils";
import { Chip, FIELD_SELECT } from "./finance-chip";
import { isPseiItem, PSEI_SYMBOL } from "@/lib/yahoo";

const FX_UNITS = ["USD", "EUR", "JPY", "GBP", "PHP"] as const;

function fxToPhp(unit: (typeof FX_UNITS)[number], fx: { usdphp: number; eurphp: number; jpyphp: number; gbpphp: number }) {
  if (unit === "PHP") return 1;
  if (unit === "USD") return fx.usdphp;
  if (unit === "EUR") return fx.eurphp;
  if (unit === "JPY") return fx.jpyphp;
  return fx.gbpphp;
}

function asItem(q: MarketQuote, kind: WatchItem["kind"]): WatchItem {
  const catalog = WATCH_CATALOG.find((w) => w.symbol === q.id || (kind === "stock" && w.symbol === q.label));
  if (catalog) return catalog;
  return {
    id: kind === "stock" ? `pse-${q.id}` : q.id,
    symbol: q.id,
    label: q.label,
    name: q.name,
    kind,
  };
}

function volLabel(q?: { kind: string; volume?: number; php?: number; price: number; ccy: string }) {
  if (!q) return "";
  const n = turnover(q);
  if (!n) return "";
  if (q.kind === "stock") return `Vol ${phpQuote(n)}`;
  return `Vol ${vol(n)}`;
}

function parseNum(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function sparkOf(
  item: WatchItem,
  q: BoardRow["q"],
  range: ReturnType<typeof normalizeSparkRange>,
  remote: Record<string, number[]>,
) {
  const hit = remote[item.id] ?? remote[item.symbol];
  if (hit && hit.length >= 4) return hit;
  const days = SPARK_RANGES.find((r) => r.id === range)?.days ?? 90;
  const tape = tapeSpark(item.symbol, days) ?? tapeSpark(item.id, days);
  if (tape && tape.length >= 3) return tape;
  if ((item.kind === "crypto" || item.kind === "global" || item.kind === "cmdty") && q?.spark && q.spark.length >= 8 && (range === "1w" || range === "1d")) {
    return q.spark;
  }
  if (!q?.price || q.price <= 0) return undefined;
  return sessionSpark(q.price, q.change, item.symbol);
}

function PrefSwitch({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

export function FinanceMarkets() {
  const {
    watch,
    quoteCcy,
    marketPrefs,
    addWatch,
    removeWatch,
    toggleWatchStar,
    updateWatch,
    setQuoteCcy,
    setMarketPrefs,
    boardQuery,
    setBoardQuery,
    boardFocus,
    setBoardFocus,
  } = useAtrium(
    useShallow((s) => ({
      watch: s.watch,
      quoteCcy: s.quoteCcy,
      marketPrefs: s.marketPrefs ?? DEFAULT_MARKET_PREFS,
      addWatch: s.addWatch,
      removeWatch: s.removeWatch,
      toggleWatchStar: s.toggleWatchStar,
      updateWatch: s.updateWatch,
      setQuoteCcy: s.setQuoteCcy,
      setMarketPrefs: s.setMarketPrefs,
      boardQuery: s.boardQuery,
      setBoardQuery: s.setBoardQuery,
      boardFocus: s.boardFocus,
      setBoardFocus: s.setBoardFocus,
    })),
  );
  const [fromUnit, setFromUnit] = useState<(typeof FX_UNITS)[number]>("USD");
  const [toUnit, setToUnit] = useState<(typeof FX_UNITS)[number]>("PHP");
  const [fxAmt, setFxAmt] = useState("100");
  const [fxOpen, setFxOpen] = useState(false);
  const query = boardQuery;
  const setQuery = setBoardQuery;
  const [open, setOpen] = useState<BoardRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addNeedle, setAddNeedle] = useState("");
  const queryClient = useQueryClient();

  const tab = marketPrefs.tab;
  const sort = marketPrefs.sort;
  const sortDir = marketPrefs.sortDir;
  const range = normalizeSparkRange(marketPrefs.sparkRange);

  const markets = useMarkets();
  const quotes = markets.data?.quotes ?? {};
  const quotesPending = markets.isPending && !markets.data;
  const fx = markets.data?.fx;

  const indexQ = useQuery({
    queryKey: ["pse-index"],
    queryFn: () => fetchPseIndex({ data: { fresh: false } }),
    staleTime: 30 * 60_000,
    gcTime: 6 * 60 * 60_000,
  });
  const liveBlue = useMemo(() => new Set(indexQ.data?.tickers ?? []), [indexQ.data]);

  useEffect(() => {
    rememberTape(quotes);
  }, [quotes]);
  useEffect(() => {
    if (!addOpen) return;
    const t = window.setTimeout(() => setAddNeedle(addQuery.trim()), 280);
    return () => window.clearTimeout(t);
  }, [addQuery, addOpen]);

  const remoteAdd = useQuery({
    queryKey: ["ticker-search", addNeedle],
    queryFn: () => searchTickers({ data: { q: addNeedle } }),
    enabled: addOpen && addNeedle.length >= 1,
    staleTime: 60_000,
  });
  const tape = [
    quotes[PSEI_SYMBOL],
    quotes.BDO,
    quotes.ICT,
    quotes.SM,
    quotes["^GSPC"],
    quotes["GC=F"],
    quotes.USDPHP,
    quotes.bitcoin ?? quotes.BTC,
    quotes.ethereum ?? quotes.ETH,
  ].filter((q): q is MarketQuote => Boolean(q));
  const psei = quotes[PSEI_SYMBOL];
  const pseiWeek =
    psei?.weekLow != null && psei.weekHigh != null && psei.weekHigh > psei.weekLow
      ? Math.round(Math.min(1, Math.max(0, (psei.price - psei.weekLow) / (psei.weekHigh - psei.weekLow))) * 100)
      : null;

  const watching = (item: WatchItem) => watch.some((w) => w.symbol === item.symbol || w.id === item.id);
  const watched = (item: WatchItem) => watch.find((w) => w.symbol === item.symbol || w.id === item.id);

  const sparkItems = useMemo(() => {
    const out: { id: string; kind: WatchItem["kind"] }[] = [];
    const seen = new Set<string>();
    const push = (id: string, kind: WatchItem["kind"]) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ id, kind });
    };
    for (const w of watch) push(w.symbol, w.kind);
    push(PSEI_SYMBOL, "global");
    if (tab === "crypto" || tab === "fx" || tab === "global" || tab === "cmdty") {
      for (const c of WATCH_CATALOG.filter((w) => w.kind === tab)) push(c.symbol, c.kind);
    }
    if (tab === "screen") {
      for (const q of markets.data?.screen ?? []) push(q.id, "global");
    }
    return out.slice(0, 24);
  }, [watch, tab, markets.data?.screen]);

  const sparkQ = useQuery({
    queryKey: ["sparks", range, sparkItems.map((i) => i.id).join(",")],
    queryFn: () => fetchSparks({ data: { range, items: sparkItems } }),
    staleTime: 5 * 60_000,
    enabled: marketPrefs.spark && sparkItems.length > 0,
  });
  const remoteSparks = sparkQ.data ?? {};

  const rows = useMemo(() => {
    const searching = query.trim().length > 0;
    const list: BoardRow[] = searching
      ? universeRows(quotes, watch, WATCH_CATALOG, watching, liveBlue)
      : (() => {
          const out: BoardRow[] = [];
          if (tab === "watcher" || tab === "starred") {
            const src = tab === "starred" ? watch.filter((w) => w.starred) : watch;
            for (const w of src) {
              out.push({ key: w.id, item: w, q: quotes[w.symbol], watching: true });
            }
          } else if (tab === "crypto" || tab === "fx" || tab === "global" || tab === "cmdty") {
            for (const r of kindBoardRows(tab, quotes, WATCH_CATALOG, watching)) out.push(r);
          } else if (tab === "screen") {
            const screened = applyScreenFilters(markets.data?.screen ?? [], {
              pe: marketPrefs.screenPe,
              cap: marketPrefs.screenCap,
              vol: marketPrefs.screenVol,
              yld: marketPrefs.screenYld,
            });
            for (const q of screened) {
              const item = asItem(q, "global");
              out.push({ key: q.id, item, q, watching: watching(item) });
            }
          } else {
            for (const r of stockBoardRows(tab, quotes, WATCH_CATALOG, watching, liveBlue)) {
              out.push(r);
            }
          }
          return out;
        })();
    const withSpark = list.map((r) => {
      const spark = sparkOf(r.item, r.q, range, remoteSparks);
      if (!spark || !r.q) return r;
      return { ...r, q: { ...r.q, spark } };
    });
    const filtered = withSpark.filter((r) => matchQuery(query, r.item));
    const sorted = sortRows(filtered, sort, sortDir, { cryptoUsdt: marketPrefs.cryptoUsdt });
    return query.trim() ? rankByQuery(sorted, query) : sorted;
  }, [tab, watch, quotes, query, sort, sortDir, marketPrefs.cryptoUsdt, marketPrefs.screenPe, marketPrefs.screenCap, marketPrefs.screenVol, marketPrefs.screenYld, liveBlue, range, remoteSparks, markets.data?.screen]);

  useEffect(() => {
    if (!boardFocus) return;
    const needle = boardFocus.toUpperCase();
    const hit = rows.find(
      (r) =>
        r.item.symbol.toUpperCase() === needle ||
        r.item.label.toUpperCase() === needle ||
        r.item.id.toUpperCase() === needle,
    );
    if (!hit) return;
    setOpen(hit);
    setBoardFocus(null);
  }, [boardFocus, rows, setBoardFocus]);

  const addHits = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    const pse = Object.values(quotes)
      .filter((x) => x.kind === "stock")
      .map((x) => asItem(x, "stock" as const));
    const pool = [...WATCH_CATALOG, ...pse].filter(
      (item, i, all) => all.findIndex((x) => x.symbol === item.symbol) === i,
    );
    const free = pool.filter((item) => !watching(item));
    const local = !q ? free.slice(0, 12) : free.filter((item) => matchQuery(q, item)).slice(0, 12);
    const seen = new Set(local.map((i) => i.symbol.toUpperCase()));
    const remote = (remoteAdd.data ?? []).filter((item) => {
      if (watching(item) || seen.has(item.symbol.toUpperCase())) return false;
      seen.add(item.symbol.toUpperCase());
      return true;
    });
    const typed = addNeedle.toUpperCase();
    const extra =
      /^[A-Z][A-Z0-9.=^-]{0,11}$/.test(typed) && !seen.has(typed) && !watch.some((w) => w.symbol.toUpperCase() === typed)
        ? [
            {
              id: `yh-${typed}`,
              symbol: typed,
              label: typed,
              name: "Add ticker",
              kind: "global" as const,
            },
          ]
        : [];
    return [...local, ...remote, ...extra].slice(0, 16);
  }, [addQuery, addNeedle, quotes, watch, remoteAdd.data]);

  const positions = useMemo(() => {
    return watch
      .map((w) => {
        const q = quotes[w.symbol];
        const value = positionValue(w.qty, q?.php);
        const pnl = positionPnl(w.qty, q?.php, w.avg);
        return { w, q, value, pnl };
      })
      .filter((p) => p.value > 0);
  }, [watch, quotes]);

  const fromPhp = fx ? fxToPhp(fromUnit, fx) : 0;
  const toPhp = fx ? fxToPhp(toUnit, fx) : 0;
  const converted = fromPhp && toPhp ? (Number(fxAmt) * fromPhp) / toPhp : 0;
  const compact = marketPrefs.compact;
  const screenFilterOn = screensOn({
    pe: marketPrefs.screenPe,
    cap: marketPrefs.screenCap,
    vol: marketPrefs.screenVol,
    yld: marketPrefs.screenYld,
  });
  const screenRawCount = markets.data?.screen?.length ?? 0;
  const rowH = compact ? "min-h-11" : "min-h-11 sm:min-h-14";
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const pnlParts = positions.map((p) => p.pnl).filter((n): n is number => n != null);
  const totalPnl = pnlParts.length ? pnlParts.reduce((a, b) => a + b, 0) : null;

  function onSort(key: BoardSort) {
    if (sort === key) {
      setMarketPrefs({ sortDir: sortDir === 1 ? -1 : 1 });
      return;
    }
    setMarketPrefs({ sort: key, sortDir: key === "name" ? 1 : -1 });
  }

  function starRow(item: WatchItem) {
    const hit = watched(item);
    if (hit) {
      toggleWatchStar(hit.id);
      return;
    }
    addWatch({ ...item, starred: true });
    toast(`Watching ${item.label}`);
  }

  function lastBlock(q: BoardRow["q"], pending: boolean) {
    const shown = displayLast(q, { cryptoUsdt: marketPrefs.cryptoUsdt });
    if (pending) return <Skeleton className="ml-auto h-4 w-16" />;
    if (!shown) return <p className="text-sm text-muted-foreground">—</p>;
    const up = (q?.change ?? 0) >= 0;
    const convert = q?.kind === "cmdty" ? marketPrefs.cmdtyPhp : marketPrefs.dualPhp;
    const phpUnder =
      convert && shown.php != null && shown.ccy !== "PHP" ? phpQuote(shown.php) : null;
    return (
      <>
        <p className={cn("whitespace-nowrap tabular-nums text-sm", q?.change == null ? "" : up ? "text-ok" : "text-destructive")}>
          {moneyQuote(shown.price, shown.ccy)}
        </p>
        {phpUnder ? (
          <p className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{phpUnder}</p>
        ) : null}
      </>
    );
  }

  function rowMeta(r: BoardRow) {
    const held = watched(r.item);
    const holdVal = positionValue(held?.qty, r.q?.php);
    const parts = [
      r.item.name ?? r.item.kind,
      peLabel(r.q?.pe),
      r.q?.marketCap && (tab === "screen" || r.item.kind === "global") ? capLabel(r.q.marketCap) : "",
      tab === "screen" && r.q?.yieldPct ? yldLabel(r.q.yieldPct) : "",
      marketPrefs.showVol ? volLabel(r.q) : "",
      holdVal > 0 ? peso(holdVal) : "",
    ];
    return parts.filter(Boolean).join(" · ");
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9 pr-11"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="BDO, AAPL, Gold, Bitcoin…"
          aria-label="Search markets"
        />
        {query.trim() ? (
          <button
            type="button"
            className="absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {query.trim() ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {rows.length === 1 ? "1 market" : `${rows.length} markets`} matching “{query.trim()}”
        </p>
      ) : null}

      <div className="scroll-auto mb-3 flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {PRIMARY_TABS.map((t) => (
          <Chip key={t.id} active={tab === t.id || (t.id === "all" && (tab === "blue" || tab === "reit" || tab === "div"))} onClick={() => setMarketPrefs({ tab: t.id })}>
            {t.short ? (
              <>
                <span className="sm:hidden">{t.short}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </>
            ) : (
              t.label
            )}
          </Chip>
        ))}
      </div>
      {tab === "all" || tab === "blue" || tab === "reit" || tab === "div" ? (
        <div className="scroll-auto mb-3 flex flex-nowrap gap-2 overflow-x-auto pb-1">
          <Chip active={tab === "all"} onClick={() => setMarketPrefs({ tab: "all" })}>
            PSE
          </Chip>
          {PSE_TABS.map((t) => (
            <Chip key={t.id} active={tab === t.id} onClick={() => setMarketPrefs({ tab: t.id })}>
              {t.label}
            </Chip>
          ))}
        </div>
      ) : null}
      {tab === "screen" ? (
        <>
          <div className="scroll-auto mb-2 flex flex-nowrap gap-2 overflow-x-auto pb-1">
            {SESSION_SCREENS.map((s) => (
              <Chip
                key={s.id}
                active={(marketPrefs.screen ?? "day_gainers") === s.id}
                onClick={() => setMarketPrefs({ screen: s.id })}
              >
                {s.label}
              </Chip>
            ))}
          </div>
          <div className="scroll-auto mb-2 flex flex-nowrap gap-2 overflow-x-auto pb-1">
            {[...STYLE_SCREENS, ...SECTOR_SCREENS].map((s) => (
              <Chip
                key={s.id}
                active={marketPrefs.screen === s.id}
                onClick={() => setMarketPrefs({ screen: s.id })}
              >
                {s.label}
              </Chip>
            ))}
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:hidden">
            <select
              aria-label="PE filter"
              className={cn(FIELD_SELECT, "h-11")}
              value={marketPrefs.screenPe ?? "any"}
              onChange={(e) => setMarketPrefs({ screenPe: e.target.value as (typeof SCREEN_PES)[number]["id"] })}
            >
              {SCREEN_PES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Market cap filter"
              className={cn(FIELD_SELECT, "h-11")}
              value={marketPrefs.screenCap ?? "any"}
              onChange={(e) => setMarketPrefs({ screenCap: e.target.value as (typeof SCREEN_CAPS)[number]["id"] })}
            >
              {SCREEN_CAPS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Volume filter"
              className={cn(FIELD_SELECT, "h-11")}
              value={marketPrefs.screenVol ?? "any"}
              onChange={(e) => setMarketPrefs({ screenVol: e.target.value as (typeof SCREEN_VOLS)[number]["id"] })}
            >
              {SCREEN_VOLS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Yield filter"
              className={cn(FIELD_SELECT, "h-11")}
              value={marketPrefs.screenYld ?? "any"}
              onChange={(e) => setMarketPrefs({ screenYld: e.target.value as (typeof SCREEN_YLDS)[number]["id"] })}
            >
              {SCREEN_YLDS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3 hidden flex-wrap items-center gap-1.5 sm:flex">
            {SCREEN_PES.map((s) => (
              <Chip key={s.id} active={(marketPrefs.screenPe ?? "any") === s.id} onClick={() => setMarketPrefs({ screenPe: s.id })}>
                {s.label}
              </Chip>
            ))}
            {SCREEN_CAPS.map((s) => (
              <Chip key={`c-${s.id}`} active={(marketPrefs.screenCap ?? "any") === s.id} onClick={() => setMarketPrefs({ screenCap: s.id })}>
                {s.label}
              </Chip>
            ))}
            {SCREEN_VOLS.map((s) => (
              <Chip key={`v-${s.id}`} active={(marketPrefs.screenVol ?? "any") === s.id} onClick={() => setMarketPrefs({ screenVol: s.id })}>
                {s.label}
              </Chip>
            ))}
            {SCREEN_YLDS.map((s) => (
              <Chip key={`y-${s.id}`} active={(marketPrefs.screenYld ?? "any") === s.id} onClick={() => setMarketPrefs({ screenYld: s.id })}>
                {s.label}
              </Chip>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <p>
              {quotesPending && !screenRawCount
                ? "Loading list…"
                : `${rows.length} of ${screenRawCount}${screenFilterOn ? " matching filters" : " on this list"}`}
            </p>
            {screenFilterOn ? (
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() =>
                  setMarketPrefs({ screenPe: "any", screenCap: "any", screenVol: "any", screenYld: "any" })
                }
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="hidden flex-wrap gap-2 sm:flex">
          {(tab === "screen" ? [...BOARD_SORTS, ...SCREEN_SORTS] : BOARD_SORTS).map((s) => (
            <Chip key={s.id} active={sort === s.id} onClick={() => onSort(s.id)}>
              {s.label}
              {sort === s.id ? (sortDir === -1 ? " ↓" : " ↑") : ""}
            </Chip>
          ))}
        </div>
        {marketPrefs.spark ? (
          <div className="scroll-auto flex max-w-full flex-nowrap gap-2 overflow-x-auto pb-0.5">
            {SPARK_RANGES.map((r) => (
              <Chip key={r.id} active={range === r.id} onClick={() => setMarketPrefs({ sparkRange: r.id })}>
                {r.label}
              </Chip>
            ))}
          </div>
        ) : null}
        <div className="grow" />
        <select
          aria-label="Quote currency"
          className={cn(FIELD_SELECT, "h-11 w-24")}
          value={quoteCcy}
          onChange={(e) => setQuoteCcy(e.target.value as (typeof QUOTE_CCY)[number])}
        >
          {QUOTE_CCY.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-60 sm:h-11 sm:w-auto sm:px-3"
          onClick={() => {
            bustPseCache();
            void fetchPseIndex({ data: { fresh: true } }).then((snap) => {
              queryClient.setQueryData(["pse-index"], snap);
            });
            void markets.refetch();
            void sparkQ.refetch();
          }}
          disabled={markets.isFetching && !markets.data}
          aria-label={markets.isFetching && !markets.data ? "Updating prices" : "Refresh prices"}
        >
          <RefreshCw className={cn("size-3.5", markets.isFetching && "animate-spin")} />
          <span className="hidden sm:inline">{markets.isFetching && !markets.data ? "Updating…" : "Live"}</span>
        </button>
        <button
          type="button"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          aria-label="Add to watcher"
          onClick={() => {
            setAddQuery("");
            setAddOpen(true);
          }}
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          aria-label="Board view"
          onClick={() => setViewOpen(true)}
        >
          <SlidersHorizontal className="size-4" />
        </button>
      </div>

      {psei ? (
        <button
          type="button"
          className="mb-4 flex w-full items-center gap-3 rounded-md bg-card px-4 py-3 text-left shadow-[var(--shadow-border)]"
          onClick={() => {
            const item = asItem(psei, "global");
            setOpen({ key: psei.id, item, q: psei, watching: watching(item) });
          }}
        >
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">PSEi</p>
            <p className="font-display text-2xl tabular-nums">{moneyQuote(psei.price, psei.ccy)}</p>
            <p className="text-xs text-muted-foreground">
              {pseiWeek != null ? `${pseiWeek}% of 52w` : "Yahoo index"}
              {psei.weekLow && psei.weekHigh
                ? ` · ${moneyQuote(psei.weekLow, psei.ccy)}–${moneyQuote(psei.weekHigh, psei.ccy)}`
                : ""}
            </p>
          </div>
          <ChangePill value={psei.change} />
          {marketPrefs.spark ? (
            <Spark
              values={remoteSparks[PSEI_SYMBOL] ?? psei.spark}
              up={(psei.change ?? 0) >= 0}
              className="ml-auto hidden h-10 w-28 sm:block"
            />
          ) : null}
        </button>
      ) : quotesPending ? (
        <div className="mb-4 rounded-md bg-card px-4 py-3 shadow-[var(--shadow-border)]">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="mt-2 h-7 w-28" />
        </div>
      ) : null}

      {marketPrefs.showTape ? (
        <div className="mb-4 flex gap-3 overflow-x-auto pb-1" aria-busy={quotesPending || undefined}>
          {tape.length ? (
            tape.map((q) => {
              const item = asItem(q, q.kind);
              return (
                <button
                  key={q.id}
                  type="button"
                  className="min-w-36 shrink-0 rounded-md bg-card px-3 py-2 text-left shadow-[var(--shadow-border)]"
                  onClick={() => setOpen({ key: q.id, item, q, watching: watching(item) })}
                >
                  <p className="font-mono text-xs text-muted-foreground">{q.label}</p>
                  <p className={`tabular-nums text-sm ${(q.change ?? 0) >= 0 ? "text-ok" : "text-destructive"}`}>
                    {moneyQuote(q.price, q.ccy)}
                  </p>
                </button>
              );
            })
          ) : quotesPending ? (
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="min-w-36 shrink-0 rounded-md bg-card px-3 py-2 shadow-[var(--shadow-border)]">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="mt-2 h-4 w-20" />
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Market tape unavailable.</p>
          )}
        </div>
      ) : null}

      {tab === "watcher" && positions.length > 0 ? (
        <Card className="mb-4">
          <CardHeader className="flex-row items-end justify-between space-y-0">
            <div>
              <CardTitle>Positions</CardTitle>
              <p className="mt-1 font-display text-2xl tabular-nums">{peso(totalValue)}</p>
            </div>
            {totalPnl != null ? (
              <p className={cn("tabular-nums text-sm", totalPnl >= 0 ? "text-ok" : "text-destructive")}>
                {"P&L"} {phpQuote(totalPnl)}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-2 sm:px-5">
            {positions.map((p) => (
              <button
                key={p.w.id}
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border px-5 text-left"
                onClick={() =>
                  setOpen({
                    key: p.w.id,
                    item: p.w,
                    q: quotes[p.w.symbol] ?? quotes[p.w.id],
                    watching: true,
                  })
                }
              >
                <p className="font-mono text-sm">{p.w.label}</p>
                <div className="text-right">
                  <p className="tabular-nums text-sm">{peso(p.value)}</p>
                  {p.pnl != null ? (
                    <p className={cn("text-xs tabular-nums", p.pnl >= 0 ? "text-ok" : "text-destructive")}>
                      {phpQuote(p.pnl)}
                    </p>
                  ) : null}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{query.trim() ? "Search" : (BOARD_TABS.find((t) => t.id === tab)?.label ?? "Board")}</CardTitle>
          {markets.data?.asOf || markets.dataUpdatedAt ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {markets.dataUpdatedAt
                ? new Date(markets.dataUpdatedAt).toLocaleTimeString(deskZone().locale, {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    timeZone: deskZone().tz,
                  })
                : null}
              {markets.data?.asOf ? ` · PSE ${markets.data.asOf.slice(0, 10)}` : ""}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="min-w-0 px-0 pb-2 sm:px-5" aria-busy={quotesPending || undefined}>
          <div className="flex items-center gap-1 px-2 text-xs uppercase tracking-[0.06em] text-muted-foreground sm:gap-2 sm:px-3">
            <span className="inline-block size-9 shrink-0" />
            <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => onSort("name")}>
              <span className="sm:hidden">Name{sort === "name" ? (sortDir === -1 ? " ↓" : " ↑") : ""}</span>
              <span className="hidden sm:inline">
                Name / vol{sort === "name" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
              </span>
            </button>
            {marketPrefs.spark ? (
              <button
                type="button"
                className="hidden min-h-11 w-16 shrink-0 text-left sm:block"
                onClick={() => onSort("chg")}
              >
                {SPARK_RANGES.find((r) => r.id === range)?.label ?? "3M"}
              </button>
            ) : null}
            <button type="button" className="min-h-11 shrink-0 text-right sm:w-24" onClick={() => onSort("last")}>
              Last{sort === "last" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
            </button>
            <button type="button" className="min-h-11 w-14 shrink-0 text-right sm:w-20" onClick={() => onSort("chg")}>
              24h{sort === "chg" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
            </button>
            <span className="inline-block size-11 shrink-0" />
          </div>
          {quotesPending && !rows.length ? (
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex min-h-14 items-center gap-2 border-t border-border px-5">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
            ))
          ) : rows.length ? (
            rows.map((r) => {
              const ch = r.q?.change;
              const up = (ch ?? 0) >= 0;
              const starred = Boolean(watched(r.item)?.starred);
              const pending = quotesPending && !r.q;
              return (
                <div key={r.key} className="flex min-w-0 items-center gap-1 border-t border-border px-2 sm:gap-2 sm:px-3">
                  <TickMark label={r.item.label} />
                  <button type="button" className={cn("min-w-0 flex-1 py-2 text-left", rowH)} onClick={() => setOpen(r)}>
                    <p className="truncate font-mono text-sm">
                      {pairLabel(r.item, r.q, marketPrefs.cryptoUsdt)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{rowMeta(r)}</p>
                  </button>
                  {marketPrefs.spark ? (
                    <div className="hidden w-16 shrink-0 sm:block">
                      {pending ? <Skeleton className="h-7 w-16" /> : <Spark values={r.q?.spark} up={up} className="h-7 w-16 sm:h-8 sm:w-20" />}
                    </div>
                  ) : null}
                  <button type="button" className={cn("shrink-0 py-2 text-right sm:w-24", rowH)} onClick={() => setOpen(r)}>
                    {lastBlock(r.q, pending)}
                  </button>
                  <div className="flex w-14 shrink-0 justify-end sm:w-20">
                    {pending ? <Skeleton className="h-9 w-14" /> : <ChangePill value={ch} />}
                  </div>
                  <button
                    type="button"
                    className="inline-flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                    aria-label={starred ? `Unstar ${r.item.label}` : `Star ${r.item.label}`}
                    aria-pressed={starred}
                    onClick={() => starRow(r.item)}
                  >
                    <Star className={cn("size-4", starred && "fill-primary text-primary")} />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {query.trim()
                ? `No market matches “${query.trim()}”.`
                : tab === "watcher"
                  ? "Empty watcher — tap + to add from PSE, Global, or Crypto."
                  : tab === "screen"
                    ? "No names match those filters — loosen PE, cap, volume, or yield."
                    : "Nothing in this board."}
            </p>
          )}
          {tab === "blue" ? (
            <p className="mt-3 px-5 text-xs text-muted-foreground">
              {indexQ.data?.source === "live"
                ? `Official PSEi 30 · live from Wikipedia${indexQ.data.asOf ? ` · ${indexQ.data.asOf}` : ""}. Index last from Yahoo.`
                : "Official PSEi 30 as of 3 Aug 2026 (PSE CN-2026-0035). Index last from Yahoo. Live will pull Wikipedia."}
            </p>
          ) : null}
          <p className="mt-3 px-5 text-xs text-muted-foreground">
            {tab === "screen"
              ? "Yahoo list of up to 100 names, then PE, cap, volume, and yield on this desk. Delayed, not a full-market screen, not for trading."
              : tab === "global" || tab === "cmdty"
                ? "Last from Yahoo Finance. Delayed, not for trading. Commodities stay in dollars unless you turn on peso convert."
                : `Spark range is on the board — ${SPARK_RANGES.find((r) => r.id === range)?.label ?? "3M"} default. Coins use Binance, FX uses Frankfurter, PSE names use this desk's tape. PSEi last from Yahoo. Not for trading.`}
          </p>
          {markets.isError || markets.data?.failed ? (
            <button type="button" className="mt-2 px-5 text-xs underline" onClick={() => void markets.refetch()}>
              Retry prices
            </button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Currency converter</CardTitle>
          <Chip active={fxOpen} onClick={() => setFxOpen((v) => !v)}>
            {fxOpen ? "Hide" : "Show"}
          </Chip>
        </CardHeader>
        {fxOpen ? (
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="fx-amt">Amount</Label>
            <Input id="fx-amt" className="h-11" type="number" value={fxAmt} onChange={(e) => setFxAmt(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="fx-from">From</Label>
              <select
                id="fx-from"
                className={FIELD_SELECT}
                value={fromUnit}
                onChange={(e) => setFromUnit(e.target.value as (typeof FX_UNITS)[number])}
              >
                {FX_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
              aria-label="Swap currencies"
              onClick={() => {
                setFromUnit(toUnit);
                setToUnit(fromUnit);
              }}
            >
              <ArrowLeftRight className="size-4" />
            </button>
            <div className="space-y-1">
              <Label htmlFor="fx-to">To</Label>
              <select
                id="fx-to"
                className={FIELD_SELECT}
                value={toUnit}
                onChange={(e) => setToUnit(e.target.value as (typeof FX_UNITS)[number])}
              >
                {FX_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="font-display text-2xl tabular-nums">
            {quotesPending && !fx ? (
              <Skeleton className="inline-block h-8 w-36" />
            ) : (
              <>
                {Number.isFinite(converted) && fx ? converted.toLocaleString(deskZone().locale, { maximumFractionDigits: 2 }) : "—"}{" "}
                <span className="text-sm text-muted-foreground">{toUnit}</span>
              </>
            )}
          </p>
          {fx?.usdphp ? <p className="text-xs text-muted-foreground">USD/PHP {phpQuote(fx.usdphp)}</p> : null}
        </CardContent>
        ) : (
          <CardContent>
            <p className="text-sm text-muted-foreground">PHP, USD, EUR, GBP, JPY from the same FX tape as On hand.</p>
          </CardContent>
        )}
      </Card>

      <Dialog open={Boolean(open)} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{open ? pairLabel(open.item, open.q, marketPrefs.cryptoUsdt) : "Quote"}</DialogTitle>
          </DialogHeader>
          {open ? (
            <QuoteSheet
              key={open.key}
              row={open}
              held={watched(open.item)}
              starred={Boolean(watched(open.item)?.starred)}
              watching={watching(open.item)}
              cryptoUsdt={marketPrefs.cryptoUsdt}
              dualPhp={open.item.kind === "cmdty" ? marketPrefs.cmdtyPhp : marketPrefs.dualPhp}
              showVol={marketPrefs.showVol}
              sparkRange={range}
              onStar={() => starRow(open.item)}
              onWatch={() => {
                addWatch({ ...open.item, starred: true });
                toast(`Watching ${open.item.label}`);
                setOpen(null);
              }}
              onRemove={() => {
                const hit = watched(open.item);
                if (hit) removeWatch(hit.id);
                setOpen(null);
              }}
              onHold={(patch) => {
                const hit = watched(open.item);
                if (hit) {
                  updateWatch(hit.id, patch);
                  return;
                }
                addWatch({ ...open.item, starred: true, ...patch });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to watcher</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pl-9"
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              placeholder="AAPL, BDO, bitcoin…"
              aria-label="Search to add"
            />
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {addHits.length ? (
              addHits.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 text-left hover:bg-muted"
                  onClick={() => {
                    addWatch({ ...item, starred: true });
                    toast(`Watching ${item.label}`);
                    setAddOpen(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.name ?? item.kind}</span>
                  </span>
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))
            ) : addNeedle && remoteAdd.isFetching ? (
              <p className="py-4 text-sm text-muted-foreground">Searching…</p>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No matches. Type a ticker like COST or NVDA.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Board view</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <PrefSwitch
              label="Spark"
              hint="Range chips 1D–1Y. Coins from Binance, FX from Frankfurter, PSE from this desk."
              checked={marketPrefs.spark}
              onCheckedChange={(v) => setMarketPrefs({ spark: v })}
            />
            {marketPrefs.spark ? (
              <div className="flex flex-wrap gap-2 py-2">
                {SPARK_RANGES.map((r) => (
                  <Chip key={r.id} active={range === r.id} onClick={() => setMarketPrefs({ sparkRange: r.id })}>
                    {r.label}
                  </Chip>
                ))}
              </div>
            ) : null}
            <PrefSwitch
              label="PHP under last"
              hint="Peso line under coins, FX, and global stocks — not commodities"
              checked={marketPrefs.dualPhp}
              onCheckedChange={(v) => setMarketPrefs({ dualPhp: v })}
            />
            <PrefSwitch
              label="Convert commodities"
              hint="Peso line under gold, oil, and metals. Off by default."
              checked={marketPrefs.cmdtyPhp}
              onCheckedChange={(v) => setMarketPrefs({ cmdtyPhp: v })}
            />
            <PrefSwitch
              label="USDT last"
              hint="Coins in dollars, PHP underneath"
              checked={marketPrefs.cryptoUsdt}
              onCheckedChange={(v) => setMarketPrefs({ cryptoUsdt: v })}
            />
            <PrefSwitch
              label="Volume line"
              hint="Turnover under the name"
              checked={marketPrefs.showVol}
              onCheckedChange={(v) => setMarketPrefs({ showVol: v })}
            />
            <PrefSwitch
              label="Tape"
              hint="Strip of live last prices"
              checked={marketPrefs.showTape}
              onCheckedChange={(v) => setMarketPrefs({ showTape: v })}
            />
            <PrefSwitch
              label="Compact rows"
              hint="Tighter board rows"
              checked={marketPrefs.compact}
              onCheckedChange={(v) => setMarketPrefs({ compact: v })}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RelatedNews({ item }: { item: WatchItem }) {
  const issuer = issuerDisplay(item);
  const news = useQuery({
    queryKey: ["stock-news", item.symbol, item.name, issuer.legal, "v6"],
    queryFn: () => fetchRelatedStories({ data: item }),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
  const items = [...(news.data ?? [])].sort((a, b) => Date.parse(b.date || "") - Date.parse(a.date || ""));
  const facts = items.filter((s) => s.lane !== "rumor");
  const rumors = items.filter((s) => s.lane === "rumor");

  function lane(title: string, rows: RelatedStory[], empty: string) {
    return (
      <div>
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {title}
          {rows.length ? ` · ${rows.length}` : ""}
        </p>
        {rows.length ? (
          <div className="mt-2 space-y-2">
            {rows.map((n) => (
              <a
                key={`${n.link}-${n.title}`}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm leading-snug hover:underline"
              >
                <span className="block">{n.title}</span>
                <span className="text-xs text-muted-foreground">
                  {n.src}
                  {n.date
                    ? ` · ${new Date(n.date).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                    : ""}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Facts vs rumors</p>
      <p className="mt-1 text-sm">{issuer.line}</p>
      <p className="text-xs text-muted-foreground">
        Matched to {issuer.ticker} — this issuer, not a ticker collision. Latest five when the wires have copy.
      </p>
      {news.isPending && !items.length ? (
        <div className="mt-2 space-y-2" aria-busy>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : news.isError ? (
        <button
          type="button"
          className="mt-2 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => void news.refetch()}
        >
          Couldn’t load related news — retry
        </button>
      ) : (
        <div className="mt-3 space-y-4">
          {lane("Facts", facts, "No related fact copy on the wires right now.")}
          {lane("Rumors", rumors, "No rumor copy on the wires right now.")}
        </div>
      )}
    </div>
  );
}

function WeightingCard() {
  const file = useQuery({
    queryKey: ["psei-weights", "v1"],
    queryFn: () => fetchPseiWeights({ data: {} }),
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
  const rows = file.data?.rows ?? PSEI_WEIGHTS;
  const asOf = file.data?.asOf ?? PSEI_WEIGHT_AS_OF;
  const c = concentration(rows);
  const stamped = asOf.replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, mo, d) => `${Number(d)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mo) - 1]} ${y}`);
  return (
    <div className="rounded-lg bg-muted p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Weighting</p>
      <p className="mt-2 text-sm">Free-float market-cap of 30 · {PSEI_FORMULA}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Official PSEi weights as of {stamped}
        {file.data?.source === "live" ? " · live file" : ""}. ICT {c.ict.toFixed(2)}% of the index.
      </p>
      <ul className="mt-2 space-y-1">
        {topWeights(5, rows).map((w) => (
          <li key={w.ticker} className="flex items-baseline justify-between gap-3 text-sm">
            <span>{w.ticker}</span>
            <span className="tabular-nums text-muted-foreground">{w.psei.toFixed(2)}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        SM group {c.sm.toFixed(1)}% · Banks {c.banks.toFixed(1)}% · Ayala {c.ayala.toFixed(1)}%
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Feb 2027 CN-2026-0033: MTAR 15% in / 10% stay, 98% cumulative cap, 15% float for PHP 250B+ names.
      </p>
    </div>
  );
}

function QuoteSheet({
  row,
  held,
  starred,
  watching,
  cryptoUsdt,
  dualPhp,
  showVol,
  sparkRange,
  onStar,
  onWatch,
  onRemove,
  onHold,
}: {
  row: BoardRow;
  held?: WatchItem;
  starred: boolean;
  watching: boolean;
  cryptoUsdt: boolean;
  dualPhp: boolean;
  showVol: boolean;
  sparkRange: ReturnType<typeof normalizeSparkRange>;
  onStar: () => void;
  onWatch: () => void;
  onRemove: () => void;
  onHold: (patch: Partial<WatchItem>) => void;
}) {
  const [qty, setQty] = useState(held?.qty != null ? String(held.qty) : "");
  const [avg, setAvg] = useState(held?.avg != null ? String(held.avg) : "");
  const [pdfHref, setPdfHref] = useState<string | null>(null);
  const note = buildResearch(row);
  const shown = displayLast(row.q, { cryptoUsdt });
  const phpUnder = dualPhp && shown?.php != null && shown.ccy !== "PHP" ? phpQuote(shown.php) : null;
  const qtyN = parseNum(qty);
  const avgN = parseNum(avg);
  const php = row.q?.php;
  const value = positionValue(qtyN, php);
  const pnl = positionPnl(qtyN, php, avgN);

  function scaleBand(n: number) {
    if (!row.q) return n;
    if (cryptoUsdt) return n;
    if (row.q.usd && row.q.usd > 0 && shown) return n * (shown.price / row.q.usd);
    return n;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <TickMark label={row.item.label} />
        <div>
          <p className="text-sm text-muted-foreground">{note.issuerLine || row.item.name || row.item.kind}</p>
          <p className="text-xs text-muted-foreground">{note.index}</p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-3xl tabular-nums">{shown ? moneyQuote(shown.price, shown.ccy) : "—"}</p>
          {phpUnder ? <p className="text-sm tabular-nums text-muted-foreground">{phpUnder}</p> : null}
        </div>
        <ChangePill value={row.q?.change} />
      </div>
      <Spark values={row.q?.spark} up={(row.q?.change ?? 0) >= 0} className="h-24 w-full" />
      <p className="text-xs text-muted-foreground">
        {SPARK_RANGES.find((r) => r.id === sparkRange)?.label ?? "3M"} tape
        {row.q?.spark && row.q.spark.length > 2 ? ` · ${row.q.spark.length} pts` : ""}
      </p>
      {showVol && volLabel(row.q) ? <p className="text-sm text-muted-foreground">{volLabel(row.q)}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-muted p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Snapshot</p>
          <p className="mt-2 text-sm">
            High {note.high}
            <span className="text-muted-foreground"> · </span>
            Low {note.low}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {note.volume}
            {note.change !== "-" ? ` · ${note.change}` : ""}
          </p>
          {row.q?.pe || row.q?.marketCap || row.q?.yieldPct || row.q?.forwardPe || row.q?.pb ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {[
                peLabel(row.q?.pe),
                row.q?.forwardPe ? `Fwd ${row.q.forwardPe >= 100 ? row.q.forwardPe.toFixed(0) : row.q.forwardPe.toFixed(1)}` : "",
                row.q?.marketCap ? capLabel(row.q.marketCap) : "",
                yldLabel(row.q?.yieldPct),
                row.q?.pb ? `P/B ${row.q.pb.toFixed(1)}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {row.q?.weekLow && row.q?.weekHigh ? (
            <p className="mt-1 text-xs text-muted-foreground">
              52w {moneyQuote(row.q.weekLow, shown?.ccy ?? row.q.ccy)} – {moneyQuote(row.q.weekHigh, shown?.ccy ?? row.q.ccy)}
            </p>
          ) : null}
        </div>
        <div className="rounded-lg bg-muted p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Levels</p>
          <p className="mt-2 text-sm">S {note.support}</p>
          <p className="text-sm">P {note.pivot}</p>
          <p className="text-sm">R {note.resistance}</p>
          <p className="mt-1 text-xs text-muted-foreground">{note.rangePos}</p>
        </div>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Standpoint</p>
          <p className="text-sm font-medium">{note.bias}</p>
        </div>
        <p className="mt-2 text-sm">{note.thesis[0]}</p>
        <p className="mt-1 text-xs text-muted-foreground">{note.index}</p>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">CFA desk</p>
        <p className="mt-1 text-xs text-muted-foreground">{note.cfaMethod}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["PE", note.metrics.pe],
              ["E/P", note.metrics.ep],
              ["P/B", note.metrics.pb],
              ["Yld", note.metrics.yld],
              ["Wt", note.metrics.wt],
              ["52w", note.metrics.week],
              ["Vol", note.metrics.vol],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{k}</p>
              <p className="text-sm tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        {(
          [
            { title: "Valuation", items: note.valuation },
            { title: "Tape", items: note.tape },
            { title: "Index", items: note.indexFactor },
            { title: "Gap", items: note.gap },
          ] as const
        )
          .filter((g) => g.items.length)
          .map((g) => (
            <div key={g.title} className="mt-3">
              <p className="text-xs text-muted-foreground">{g.title}</p>
              <ul className="mt-1 space-y-1">
                {g.items.map((line) => (
                  <li key={line} className="text-sm leading-snug">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      {isPseiItem(row.item) ? <WeightingCard /> : null}
      <div>
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Suggestions</p>
        <div className="mt-2 space-y-3">
          {(
            [
              { title: "Watch", items: note.watch },
              { title: "Risk", items: note.risk },
              { title: "Next", items: note.next },
            ] as const
          )
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.title}>
                <p className="text-xs text-muted-foreground">{g.title}</p>
                <ul className="mt-1 space-y-1">
                  {g.items.map((s) => (
                    <li key={s} className="text-sm leading-snug">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            const filename = `atrium-${row.item.label.toLowerCase()}-research.pdf`;
            const url = downloadPdf(filename, researchPdf(note));
            setPdfHref(url);
            toast(`Research note for ${row.item.label}`);
          }}
        >
          <FileDown className="size-4" />
          Research PDF
        </Button>
        {pdfHref ? (
          <a
            href={pdfHref}
            download={`atrium-${row.item.label.toLowerCase()}-research.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs hover:bg-muted"
          >
            Open PDF
          </a>
        ) : null}
      </div>
      {row.q?.kind === "crypto" && row.q.high != null && row.q.low != null ? (
        <p className="text-sm text-muted-foreground">
          24h {moneyQuote(scaleBand(row.q.low), shown?.ccy ?? "USD")} –{" "}
          {moneyQuote(scaleBand(row.q.high), shown?.ccy ?? "USD")}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="hold-qty">Holding qty</Label>
          <Input
            id="hold-qty"
            className="h-11"
            type="number"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => onHold({ qty: qtyN })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hold-avg">Avg cost (₱)</Label>
          <Input
            id="hold-avg"
            className="h-11"
            type="number"
            inputMode="decimal"
            value={avg}
            onChange={(e) => setAvg(e.target.value)}
            onBlur={() => onHold({ avg: avgN })}
          />
        </div>
      </div>
      {value > 0 ? (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted-foreground">Value {peso(value)}</p>
          {pnl != null ? (
            <p className={cn("tabular-nums text-sm", pnl >= 0 ? "text-ok" : "text-destructive")}>
              {"P&L"} {phpQuote(pnl)}
            </p>
          ) : null}
        </div>
      ) : null}
      <RelatedNews item={row.item} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11" onClick={onStar}>
          <Star className={cn("size-4", starred && "fill-primary text-primary")} />
          {starred ? "Starred" : "Star"}
        </Button>
        {watching ? (
          <Button variant="outline" className="min-h-11" onClick={onRemove}>
            Remove
          </Button>
        ) : (
          <Button className="min-h-11" onClick={onWatch}>
            Add
          </Button>
        )}
      </div>
    </div>
  );
}
