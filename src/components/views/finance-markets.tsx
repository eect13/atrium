"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, FileDown, Plus, RefreshCw, Search, SlidersHorizontal, Star } from "lucide-react";
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
import { useMarkets } from "@/components/widgets";
import { isoDate, moneyQuote, phpQuote, peso, vol } from "@/lib/format";
import {
  BOARD_SORTS,
  BOARD_TABS,
  displayLast,
  matchQuery,
  pairLabel,
  positionPnl,
  positionValue,
  sortRows,
  stockBoardRows,
  turnover,
  type BoardRow,
  type BoardSort,
} from "@/lib/market-board";
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
import { buildResearch, downloadPdf, relatedNewsUrl, researchPdf } from "@/lib/research";
import { fetchFeed } from "@/lib/feeds";
import { cn } from "@/lib/utils";
import { Chip, FIELD_SELECT } from "./finance-chip";

const FX_UNITS = ["USD", "EUR", "JPY", "GBP", "PHP"] as const;

function fxToPhp(unit: (typeof FX_UNITS)[number], fx: { usdphp: number; eurphp: number; jpyphp: number; gbpphp: number }) {
  if (unit === "PHP") return 1;
  if (unit === "USD") return fx.usdphp;
  if (unit === "EUR") return fx.eurphp;
  if (unit === "JPY") return fx.jpyphp;
  return fx.gbpphp;
}

function asItem(q: MarketQuote, kind: WatchItem["kind"]): WatchItem {
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
  if (q.kind === "crypto") return `Vol ${vol(n)}`;
  return `Vol ${phpQuote(n)}`;
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
  if (item.kind === "crypto" && q?.spark && q.spark.length >= 8 && (range === "1w" || range === "1d")) {
    return q.spark;
  }
  if (!q?.price || q.price <= 0) return undefined;
  const n = range === "1d" ? 28 : 36;
  return sessionSpark(q.price, q.change, `${item.symbol}:${range}:${isoDate()}`, n);
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
    })),
  );
  const [fromUnit, setFromUnit] = useState<(typeof FX_UNITS)[number]>("USD");
  const [toUnit, setToUnit] = useState<(typeof FX_UNITS)[number]>("PHP");
  const [fxAmt, setFxAmt] = useState("100");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<BoardRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
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
  const tape = [
    quotes.BDO,
    quotes.ICT,
    quotes.SM,
    quotes.USDPHP,
    quotes.bitcoin ?? quotes.BTC,
    quotes.ethereum ?? quotes.ETH,
  ].filter((q): q is MarketQuote => Boolean(q));

  const watching = (item: WatchItem) => watch.some((w) => w.symbol === item.symbol || w.id === item.id);
  const watched = (item: WatchItem) => watch.find((w) => w.symbol === item.symbol || w.id === item.id);

  const sparkItems = useMemo(() => {
    const out: { id: string; kind: "crypto" | "fx" | "stock" }[] = [];
    const seen = new Set<string>();
    const push = (id: string, kind: "crypto" | "fx" | "stock") => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ id, kind });
    };
    for (const w of watch) push(w.kind === "crypto" ? w.symbol : w.symbol, w.kind);
    for (const q of Object.values(quotes)) {
      if (q.kind === "crypto" || q.kind === "fx") push(q.id, q.kind);
    }
    return out.slice(0, 40);
  }, [watch, quotes]);

  const sparkQ = useQuery({
    queryKey: ["sparks", range, sparkItems.map((i) => i.id).join(",")],
    queryFn: () => fetchSparks({ data: { range, items: sparkItems } }),
    staleTime: 5 * 60_000,
    enabled: marketPrefs.spark && sparkItems.length > 0,
  });
  const remoteSparks = sparkQ.data ?? {};

  const rows = useMemo(() => {
    const list: BoardRow[] = [];
    if (tab === "watcher" || tab === "starred") {
      const src = tab === "starred" ? watch.filter((w) => w.starred) : watch;
      for (const w of src) {
        list.push({ key: w.id, item: w, q: quotes[w.symbol], watching: true });
      }
    } else if (tab === "crypto") {
      const coins = Object.values(quotes).filter((q) => q.kind === "crypto");
      const seen = new Set<string>();
      for (const q of coins) {
        seen.add(q.id);
        list.push({ key: q.id, item: asItem(q, "crypto"), q, watching: watching(asItem(q, "crypto")) });
      }
      for (const c of WATCH_CATALOG.filter((w) => w.kind === "crypto")) {
        if (seen.has(c.symbol)) continue;
        list.push({ key: c.id, item: c, q: quotes[c.symbol], watching: watching(c) });
      }
    } else if (tab === "fx") {
      for (const q of Object.values(quotes).filter((x) => x.kind === "fx")) {
        list.push({ key: q.id, item: asItem(q, "fx"), q, watching: watching(asItem(q, "fx")) });
      }
    } else {
      for (const r of stockBoardRows(tab, quotes, WATCH_CATALOG, watching, liveBlue)) {
        list.push(r);
      }
    }
    const withSpark = list.map((r) => {
      const spark = sparkOf(r.item, r.q, range, remoteSparks);
      if (!spark || !r.q) return r;
      return { ...r, q: { ...r.q, spark } };
    });
    const filtered = withSpark.filter((r) => matchQuery(query, r.item));
    return sortRows(filtered, sort, sortDir, { cryptoUsdt: marketPrefs.cryptoUsdt });
  }, [tab, watch, quotes, query, sort, sortDir, marketPrefs.cryptoUsdt, liveBlue, range, remoteSparks]);

  const addHits = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    const pse = Object.values(quotes)
      .filter((x) => x.kind === "stock")
      .map((x) => asItem(x, "stock" as const));
    const pool = [...WATCH_CATALOG, ...pse].filter(
      (item, i, all) => all.findIndex((x) => x.symbol === item.symbol) === i,
    );
    const free = pool.filter((item) => !watching(item));
    if (!q) return free.slice(0, 16);
    return free.filter((item) => matchQuery(q, item)).slice(0, 16);
  }, [addQuery, quotes, watch]);

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
  const rowH = compact ? "min-h-11" : "min-h-14";
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
    const phpUnder =
      marketPrefs.dualPhp && shown.php != null && shown.ccy !== "PHP" ? phpQuote(shown.php) : null;
    return (
      <>
        <p className={cn("tabular-nums text-sm", q?.change == null ? "" : up ? "text-ok" : "text-destructive")}>
          {moneyQuote(shown.price, shown.ccy)}
        </p>
        {phpUnder ? <p className="text-xs tabular-nums text-muted-foreground">{phpUnder}</p> : null}
      </>
    );
  }

  function rowMeta(r: BoardRow) {
    const held = watched(r.item);
    const holdVal = positionValue(held?.qty, r.q?.php);
    const parts = [
      r.item.name ?? r.item.kind,
      marketPrefs.showVol ? volLabel(r.q) : "",
      holdVal > 0 ? peso(holdVal) : "",
    ].filter(Boolean);
    return parts.join(" · ");
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-11 pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search coin, stock, pair…"
          aria-label="Search markets"
        />
      </div>

      <div className="scroll-auto mb-3 flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {BOARD_TABS.map((t) => (
          <Chip key={t.id} active={tab === t.id} onClick={() => setMarketPrefs({ tab: t.id })}>
            {t.label}
          </Chip>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {BOARD_SORTS.map((s) => (
          <Chip key={s.id} active={sort === s.id} onClick={() => onSort(s.id)}>
            {s.label}
            {sort === s.id ? (sortDir === -1 ? " ↓" : " ↑") : ""}
          </Chip>
        ))}
        {marketPrefs.spark
          ? SPARK_RANGES.map((r) => (
              <Chip key={r.id} active={range === r.id} onClick={() => setMarketPrefs({ sparkRange: r.id })}>
                {r.label}
              </Chip>
            ))
          : null}
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
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
          onClick={() => {
            bustPseCache();
            void fetchPseIndex({ data: { fresh: true } }).then((snap) => {
              queryClient.setQueryData(["pse-index"], snap);
            });
            void markets.refetch();
            void sparkQ.refetch();
          }}
          disabled={markets.isFetching && !markets.data}
        >
          <RefreshCw className={cn("size-3.5", markets.isFetching && "animate-spin")} />
          {markets.isFetching && !markets.data ? "Updating…" : "Live"}
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

      {marketPrefs.showTape ? (
        <div className="mb-4 flex gap-3 overflow-x-auto pb-1" aria-busy={quotesPending || undefined}>
          {tape.length ? (
            tape.map((q) => (
              <div key={q.id} className="min-w-36 shrink-0 rounded-md bg-card px-3 py-2 shadow-[var(--shadow-border)]">
                <p className="font-mono text-xs text-muted-foreground">{q.label}</p>
                <p className={`tabular-nums text-sm ${(q.change ?? 0) >= 0 ? "text-ok" : "text-destructive"}`}>
                  {moneyQuote(q.price, q.ccy)}
                </p>
              </div>
            ))
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
              <div key={p.w.id} className="flex min-h-11 items-center justify-between gap-3 border-t border-border px-5">
                <p className="font-mono text-sm">{p.w.label}</p>
                <div className="text-right">
                  <p className="tabular-nums text-sm">{peso(p.value)}</p>
                  {p.pnl != null ? (
                    <p className={cn("text-xs tabular-nums", p.pnl >= 0 ? "text-ok" : "text-destructive")}>
                      {phpQuote(p.pnl)}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{BOARD_TABS.find((t) => t.id === tab)?.label ?? "Board"}</CardTitle>
          {markets.data?.asOf || markets.dataUpdatedAt ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {markets.dataUpdatedAt
                ? new Date(markets.dataUpdatedAt).toLocaleTimeString("en-PH", {
                    hour: "numeric",
                    minute: "2-digit",
                    second: "2-digit",
                    timeZone: "Asia/Manila",
                  })
                : null}
              {markets.data?.asOf ? ` · PSE ${markets.data.asOf.slice(0, 10)}` : ""}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="px-0 pb-2 sm:px-5" aria-busy={quotesPending || undefined}>
          <div className="flex items-center gap-1 px-2 text-xs uppercase tracking-[0.06em] text-muted-foreground sm:gap-2 sm:px-3">
            <span className="inline-block size-9 shrink-0" />
            <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => onSort("name")}>
              Name / vol{sort === "name" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
            </button>
            {marketPrefs.spark ? (
              <button
                type="button"
                className="min-h-11 w-14 shrink-0 text-left sm:w-16"
                onClick={() => onSort("chg")}
              >
                {SPARK_RANGES.find((r) => r.id === range)?.label ?? "3M"}
              </button>
            ) : null}
            <button type="button" className="min-h-11 w-24 shrink-0 text-right" onClick={() => onSort("last")}>
              Last{sort === "last" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
            </button>
            <button type="button" className="min-h-11 w-16 shrink-0 text-right sm:w-20" onClick={() => onSort("chg")}>
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
                <div key={r.key} className="flex items-center gap-1 border-t border-border px-2 sm:gap-2 sm:px-3">
                  <TickMark label={r.item.label} />
                  <button type="button" className={cn("min-w-0 flex-1 py-2 text-left", rowH)} onClick={() => setOpen(r)}>
                    <p className="truncate font-mono text-sm">
                      {pairLabel(r.item, r.q, marketPrefs.cryptoUsdt)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{rowMeta(r)}</p>
                  </button>
                  {marketPrefs.spark ? (
                    <div className="w-14 shrink-0 sm:w-16">
                      {pending ? <Skeleton className="h-7 w-14" /> : <Spark values={r.q?.spark} up={up} />}
                    </div>
                  ) : null}
                  <button type="button" className={cn("w-24 shrink-0 py-2 text-right", rowH)} onClick={() => setOpen(r)}>
                    {lastBlock(r.q, pending)}
                  </button>
                  <div className="flex w-16 shrink-0 justify-end sm:w-20">
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
              {tab === "watcher"
                ? "Empty watcher — tap + to add from PSE or Crypto."
                : "Nothing in this board."}
            </p>
          )}
          {tab === "blue" ? (
            <p className="mt-3 px-5 text-xs text-muted-foreground">
              {indexQ.data?.source === "live"
                ? `Official PSEi 30 · live from Wikipedia${indexQ.data.asOf ? ` · ${indexQ.data.asOf}` : ""}.`
                : "Official PSEi 30 as of 3 Aug 2026 (PSE CN-2026-0035). Live will pull Wikipedia."}
            </p>
          ) : null}
          <p className="mt-3 px-5 text-xs text-muted-foreground">
            Spark range is on the board — {SPARK_RANGES.find((r) => r.id === range)?.label ?? "3M"} default. Coins use
            Binance, FX uses Frankfurter, PSE uses this desk's tape (session curve until the tape fills). Not for trading.
          </p>
          {markets.isError || markets.data?.failed ? (
            <button type="button" className="mt-2 px-5 text-xs underline" onClick={() => void markets.refetch()}>
              Retry prices
            </button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Currency converter</CardTitle>
        </CardHeader>
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
                {Number.isFinite(converted) && fx ? converted.toLocaleString("en-PH", { maximumFractionDigits: 2 }) : "—"}{" "}
                <span className="text-sm text-muted-foreground">{toUnit}</span>
              </>
            )}
          </p>
          {fx?.usdphp ? <p className="text-xs text-muted-foreground">USD/PHP {phpQuote(fx.usdphp)}</p> : null}
        </CardContent>
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
              dualPhp={marketPrefs.dualPhp}
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
              placeholder="PSE ticker or coin…"
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
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.name ?? item.kind}</span>
                  </span>
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No matches.</p>
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
              hint="Peso line under USDT and FX"
              checked={marketPrefs.dualPhp}
              onCheckedChange={(v) => setMarketPrefs({ dualPhp: v })}
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
  const url = relatedNewsUrl(item);
  const news = useQuery({
    queryKey: ["stock-news", item.symbol, item.name],
    queryFn: () => fetchFeed({ data: { url, name: "Related", category: "Markets" } }),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
  const items = news.data ?? [];
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Related news</p>
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
      ) : !items.length ? (
        <p className="mt-2 text-sm text-muted-foreground">No related stories right now.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {items.slice(0, 5).map((n) => (
            <a
              key={`${n.link}-${n.title}`}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm leading-snug hover:underline"
            >
              {n.title}
            </a>
          ))}
        </div>
      )}
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
        <p className="text-sm text-muted-foreground">{row.item.name ?? row.item.kind}</p>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-3xl tabular-nums">{shown ? moneyQuote(shown.price, shown.ccy) : "—"}</p>
          {phpUnder ? <p className="text-sm tabular-nums text-muted-foreground">{phpUnder}</p> : null}
        </div>
        <ChangePill value={row.q?.change} />
      </div>
      <Spark values={row.q?.spark} up={(row.q?.change ?? 0) >= 0} className="h-16 w-full" />
      <p className="text-xs text-muted-foreground">
        {SPARK_RANGES.find((r) => r.id === sparkRange)?.label ?? "3M"} tape
        {row.q?.spark && row.q.spark.length > 2 ? ` · ${row.q.spark.length} pts` : ""}
      </p>
      {showVol && volLabel(row.q) ? <p className="text-sm text-muted-foreground">{volLabel(row.q)}</p> : null}
      <div className="rounded-lg bg-muted p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Technical standpoint</p>
          <p className="text-sm font-medium">{note.bias}</p>
        </div>
        <p className="mt-2 text-sm">{note.thesis[0]}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {note.index}
          {note.support !== "-" ? ` · Support ${note.support}` : ""}
          {note.resistance !== "-" ? ` · Resist ${note.resistance}` : ""}
        </p>
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
