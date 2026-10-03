"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { ChangePill, Spark, TickMark } from "@/components/spark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarkets } from "@/components/use-markets";
import { deskZone, moneyQuote, phpQuote, peso } from "@/lib/format";
import {
  BOARD_SORTS,
  BOARD_TABS,
  BLUECHIPS,
  PRIMARY_TABS,
  PSE_TABS,
  SCREEN_SORTS,
  displayLast,
  kindBoardRows,
  matchQuery,
  normalizeTab,
  pairLabel,
  positionPnl,
  positionValue,
  rankByQuery,
  sortRows,
  stockBoardRows,
  tabSortPatch,
  turnover,
  universeRows,
  type BoardRow,
  type BoardSort,
} from "@/lib/market-board";
import {
  PSE_SCREENS,
  SESSION_SCREENS,
  STYLE_SCREENS,
  SECTOR_SCREENS,
  SCREEN_CAPS,
  SCREEN_PES,
  SCREEN_VOLS,
  SCREEN_YLDS,
  applyScreenFilters,
  capLabel,
  isPseScreen,
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
  sparkFetchable,
  tapeSpark,
  writeTapeSpark,
} from "@/lib/sparks";
import { bustPseCache } from "@/lib/sw-client";
import { useAtrium } from "@/lib/store";
import { QUOTE_CCY, WATCH_CATALOG, type WatchItem, DEFAULT_MARKET_PREFS } from "@/lib/types";
import type { MarketQuote } from "@/lib/prices";
import { searchTickers } from "@/lib/prices";
import { overlayStats, seededStats } from "@/lib/pse-fundamentals";
import { cn } from "@/lib/utils";
import { Chip, FIELD_SELECT } from "./finance-chip";
import { asItem, sparkOf, usdPerFromFx, volLabel } from "./finance-market-bits";
import { QuoteSheet } from "./finance-quote-sheet";
import { FxConverter } from "./finance-fx";
import { BoardViewDialog } from "./finance-board-view";
import { DigestCard, IndexCompare, MoversStrip, PeerStrip, PseHeatmap, SessionHeatmap, SleeveRotation } from "./finance-tape";
import { isPseiItem, PSEI_SYMBOL } from "@/lib/yahoo";
import { asDeskItem, deskMarket, homeBoardRows, resolveIndexPair, worldIndex } from "@/lib/desk-market";
import { fetchFinanceDigest, mergeDigest } from "@/lib/digest";
import { DESK_REGIONS, normalizeMarkets, toggleMarket } from "@/lib/region";
import { deskSleeves, indexLink, pseWeightOf, rotationTake, sleeveSession, vsIndex } from "@/lib/desk-stats";
import { newsRowHint } from "@/lib/research";


export function FinanceMarkets() {
  const {
    watch,
    quoteCcy,
    marketPrefs,
    addWatch,
    removeWatch,
    updateWatch,
    setQuoteCcy,
    setMarketPrefs,
    boardQuery,
    setBoardQuery,
    boardFocus,
    setBoardFocus,
    region,
    profileMarkets,
    setProfile,
    digests,
    rememberDigest,
  } = useAtrium(
    useShallow((s) => ({
      watch: s.watch,
      quoteCcy: s.quoteCcy,
      marketPrefs: s.marketPrefs ?? DEFAULT_MARKET_PREFS,
      addWatch: s.addWatch,
      removeWatch: s.removeWatch,
      updateWatch: s.updateWatch,
      setQuoteCcy: s.setQuoteCcy,
      setMarketPrefs: s.setMarketPrefs,
      boardQuery: s.boardQuery,
      setBoardQuery: s.setBoardQuery,
      boardFocus: s.boardFocus,
      setBoardFocus: s.setBoardFocus,
      region: s.profile.region,
      profileMarkets: s.profile.markets,
      setProfile: s.setProfile,
      digests: s.digests,
      rememberDigest: s.rememberDigest,
    })),
  );
  const query = boardQuery;
  const setQuery = setBoardQuery;
  const [open, setOpen] = useState<BoardRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addNeedle, setAddNeedle] = useState("");
  const queryClient = useQueryClient();

  const tab = normalizeTab(marketPrefs.tab);
  const sort = marketPrefs.sort;
  const sortDir = marketPrefs.sortDir;
  const range = normalizeSparkRange(marketPrefs.sparkRange);
  const sparkLabel = SPARK_RANGES.find((r) => r.id === range)?.label ?? "3M";
  const pseScreenOn = tab === "screen" && isPseScreen(marketPrefs.screen);
  const marketIds = normalizeMarkets(profileMarkets, region);
  const books = marketIds.map((id) => deskMarket(id));
  const hasPse = books.some((m) => m.pseHome);
  const market = books[0] ?? deskMarket(region);
  const foreignBooks = books.filter((m) => !m.pseHome);
  const sortUse = !hasPse && sort === "wt" && (tab === "all" || tab === "blue") ? "chg" : sort;

  function goTab(next: typeof tab) {
    setMarketPrefs(tabSortPatch(next, { tab, sort: sortUse }, { pse: hasPse }));
  }

  const markets = useMarkets();
  const quotes = useMemo(() => {
    const raw = markets.data?.quotes ?? {};
    const out: Record<string, MarketQuote> = {};
    for (const [k, q] of Object.entries(raw)) {
      out[k] = q.kind === "stock" ? overlayStats(q, seededStats(k) ?? seededStats(q.label ?? "")) : q;
    }
    return out;
  }, [markets.data?.quotes]);
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
  const tape = [...new Set([...market.tape, "USDPHP", "bitcoin", "ethereum"])]
    .map((id) => (id === "bitcoin" ? (quotes.bitcoin ?? quotes.BTC) : id === "ethereum" ? (quotes.ethereum ?? quotes.ETH) : quotes[id]))
    .filter((q): q is MarketQuote => Boolean(q));
  const psei = quotes[PSEI_SYMBOL];
  const pair = resolveIndexPair(marketIds, marketPrefs.baseIndex, marketPrefs.compareIndex);
  const compareSym = pair.peer;
  const baseSym = pair.base;
  const peer = worldIndex(compareSym);
  const baseName = worldIndex(baseSym);
  const homeIndex = quotes[market.index.symbol] ?? (market.pseHome ? psei : undefined);
  const bannerQ = quotes[baseSym] ?? (baseSym === PSEI_SYMBOL ? psei : undefined);
  const bannerWeek =
    bannerQ?.weekLow != null && bannerQ.weekHigh != null && bannerQ.weekHigh > bannerQ.weekLow
      ? Math.round(Math.min(1, Math.max(0, (bannerQ.price - bannerQ.weekLow) / (bannerQ.weekHigh - bannerQ.weekLow))) * 100)
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
    push(market.index.symbol, "global");
    push(baseSym, "global");
    push(compareSym, "global");
    if (tab === "crypto" || tab === "fx" || tab === "global" || tab === "cmdty") {
      for (const c of WATCH_CATALOG.filter((w) => w.kind === tab)) push(c.symbol, c.kind);
    }
    if (tab === "screen") {
      if (pseScreenOn) {
        for (const t of BLUECHIPS) push(t, "stock");
      } else {
        for (const q of markets.data?.screen ?? []) push(q.id, "global");
      }
    }
    if (tab === "all" || tab === "blue" || tab === "reit" || tab === "div") {
      if (hasPse) {
        for (const t of BLUECHIPS) push(t, "stock");
      }
      for (const book of foreignBooks) {
        for (const n of book.names) push(n.symbol, "global");
      }
    }
    return out.slice(0, 40);
  }, [watch, tab, markets.data?.screen, pseScreenOn, hasPse, foreignBooks, compareSym, baseSym]);

  const sparkFetchItems = useMemo(() => sparkItems.filter(sparkFetchable), [sparkItems]);

  const sparkQ = useQuery({
    queryKey: ["sparks", range, sparkFetchItems.map((i) => i.id).join(",")],
    queryFn: () => fetchSparks({ data: { range, items: sparkFetchItems } }),
    staleTime: 5 * 60_000,
    retry: 1,
    enabled: sparkFetchItems.length > 0 && (marketPrefs.spark || tab === "all"),
  });
  const indexSparkQ = useQuery({
    queryKey: ["sparks", "index", range, baseSym, tab === "all" ? compareSym : ""],
    queryFn: () =>
      fetchSparks({
        data: {
          range,
          items: [
            { id: baseSym, kind: "global" as const },
            ...(tab === "all" ? [{ id: compareSym, kind: "global" as const }] : []),
          ],
        },
      }),
    staleTime: 5 * 60_000,
    retry: 2,
    enabled: tab === "all" || Boolean(open && (open.item.kind === "stock" || open.item.kind === "global")),
  });
  const sheetSparkQ = useQuery({
    queryKey: ["sparks", "sheet", range, open?.item.symbol ?? ""],
    queryFn: () => {
      const item = open?.item;
      if (!item) return {} as Record<string, number[]>;
      return fetchSparks({ data: { range, items: [{ id: item.symbol, kind: item.kind }] } });
    },
    staleTime: 5 * 60_000,
    retry: 1,
    enabled: Boolean(open && sparkFetchable({ id: open.item.symbol, kind: open.item.kind })),
  });
  const remoteSparks = useMemo(
    () => ({ ...sparkQ.data, ...indexSparkQ.data, ...sheetSparkQ.data }),
    [sparkQ.data, indexSparkQ.data, sheetSparkQ.data],
  );
  useEffect(() => {
    const days = SPARK_RANGES.find((r) => r.id === range)?.days ?? 90;
    for (const [id, vals] of Object.entries(remoteSparks)) {
      if (vals && vals.length >= 9) writeTapeSpark(id, vals, days);
    }
  }, [remoteSparks, range]);

  function remoteSpark(...ids: (string | undefined)[]) {
    for (const id of ids) {
      if (!id) continue;
      const hit = remoteSparks[id];
      if (hit && hit.length >= 9) return hit;
    }
    const days = SPARK_RANGES.find((r) => r.id === range)?.days ?? 90;
    for (const id of ids) {
      if (!id) continue;
      const tape = tapeSpark(id, days);
      if (tape && tape.length >= 9) return tape;
    }
    return undefined;
  }

  const digestQ = useQuery({
    queryKey: ["finance-digest", marketIds.join(",")],
    queryFn: async () => {
      const days = await Promise.all(marketIds.map((id) => fetchFinanceDigest({ data: { region: id } })));
      const first = days[0];
      if (!first) return first;
      const items = mergeDigest(days.flatMap((d) => d?.items ?? []));
      return {
        ...first,
        region: marketIds.join("+").slice(0, 24),
        market: books.map((b) => b.name).join(" · "),
        items,
      };
    },
    staleTime: 30 * 60_000,
    gcTime: 24 * 60 * 60_000,
    enabled: tab === "all",
    retry: 1,
  });
  useEffect(() => {
    if (digestQ.data) rememberDigest(digestQ.data);
  }, [digestQ.data, rememberDigest]);

  useEffect(() => {
    if (!hasPse && (tab === "blue" || tab === "reit" || tab === "div")) {
      setMarketPrefs(tabSortPatch("all", { tab: "all", sort: "chg" }));
    }
  }, [hasPse, tab, setMarketPrefs]);
  useEffect(() => {
    if (marketPrefs.tab !== tab) setMarketPrefs({ tab });
  }, [marketPrefs.tab, tab, setMarketPrefs]);

  const rows = useMemo(() => {
    const searching = query.trim().length > 0;
    const list: BoardRow[] = searching
      ? universeRows(quotes, watch, WATCH_CATALOG, watching, liveBlue)
      : (() => {
          const out: BoardRow[] = [];
          if (tab === "watcher") {
            for (const w of watch) {
              out.push({ key: w.id, item: w, q: quotes[w.symbol], watching: true });
            }
          } else if (tab === "crypto" || tab === "fx" || tab === "global" || tab === "cmdty") {
            for (const r of kindBoardRows(tab, quotes, WATCH_CATALOG, watching)) out.push(r);
          } else if (tab === "screen") {
            const usdPer = usdPerFromFx(markets.data?.fx);
            if (pseScreenOn) {
              const sleeve = stockBoardRows("blue", quotes, WATCH_CATALOG, watching, liveBlue);
              const screened = applyScreenFilters(
                sleeve.map((r) => ({
                  row: r,
                  pe: r.q?.pe,
                  marketCap: r.q?.marketCap,
                  ccy: r.q?.ccy,
                  volume: r.q?.volume,
                  yieldPct: r.q?.yieldPct,
                })),
                {
                  pe: marketPrefs.screenPe,
                  cap: marketPrefs.screenCap,
                  vol: marketPrefs.screenVol,
                  yld: marketPrefs.screenYld,
                  usdPer,
                },
              );
              for (const hit of screened) out.push(hit.row);
            } else {
              const screened = applyScreenFilters(markets.data?.screen ?? [], {
                pe: marketPrefs.screenPe,
                cap: marketPrefs.screenCap,
                vol: marketPrefs.screenVol,
                yld: marketPrefs.screenYld,
                usdPer,
              });
              for (const q of screened) {
                const item = asItem(q, "global");
                out.push({ key: q.id, item, q, watching: watching(item) });
              }
            }
          } else if (tab === "all" || tab === "blue" || tab === "reit" || tab === "div") {
            if (hasPse) {
              for (const r of stockBoardRows(tab === "all" ? "all" : tab, quotes, WATCH_CATALOG, watching, liveBlue)) {
                out.push(r);
              }
            }
            if (tab === "all" || !hasPse) {
              for (const book of foreignBooks) {
                for (const r of homeBoardRows(quotes, markets.data?.home, book, watching)) out.push(r);
              }
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
    const sorted = sortRows(filtered, sortUse, sortDir, { cryptoUsdt: marketPrefs.cryptoUsdt });
    return query.trim() ? rankByQuery(sorted, query) : sorted;
  }, [tab, watch, quotes, query, sortUse, sortDir, marketPrefs.cryptoUsdt, marketPrefs.screenPe, marketPrefs.screenCap, marketPrefs.screenVol, marketPrefs.screenYld, liveBlue, range, remoteSparks, markets.data?.screen, markets.data?.home, markets.data?.fx, pseScreenOn, hasPse, foreignBooks]);

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
    const seeds = books.flatMap((b) => b.names.map((n) => asDeskItem(n)));
    const pool = [...WATCH_CATALOG, ...pse, ...seeds].filter(
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
  }, [addQuery, addNeedle, quotes, watch, remoteAdd.data, books]);

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

  const compact = marketPrefs.compact;
  const screenFilterOn = screensOn({
    pe: marketPrefs.screenPe,
    cap: marketPrefs.screenCap,
    vol: marketPrefs.screenVol,
    yld: marketPrefs.screenYld,
  });
  const screenRawCount = pseScreenOn
    ? stockBoardRows("blue", quotes, WATCH_CATALOG, watching, liveBlue).length
    : (markets.data?.screen?.length ?? 0);
  const rowH = compact ? "min-h-11" : "min-h-11 sm:min-h-14";
  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const pnlParts = positions.map((p) => p.pnl).filter((n): n is number => n != null);
  const totalPnl = pnlParts.length ? pnlParts.reduce((a, b) => a + b, 0) : null;
  const heatRows = useMemo(
    () => {
      const out: BoardRow[] = [];
      if (hasPse) out.push(...stockBoardRows("blue", quotes, WATCH_CATALOG, watching, liveBlue));
      for (const book of foreignBooks) out.push(...homeBoardRows(quotes, markets.data?.home, book, watching));
      return out;
    },
    [quotes, liveBlue, watch, hasPse, foreignBooks, markets.data?.home],
  );
  const tapeMovers = useMemo(() => {
    if (tab === "crypto") {
      const coins = Object.values(quotes).filter((q) => q.kind === "crypto" && q.change != null);
      const ranked = coins.toSorted((a, b) => (b.change ?? 0) - (a.change ?? 0));
      const active = coins.toSorted((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 5);
      return {
        gainers: ranked.filter((c) => (c.change ?? 0) > 0).slice(0, 5),
        losers: ranked.filter((c) => (c.change ?? 0) < 0).toReversed().slice(0, 5),
        active,
      };
    }
    if (foreignBooks.length && !hasPse) {
      const board = heatRows
        .map((r) => r.q)
        .filter((q): q is NonNullable<typeof q> => Boolean(q && q.change != null));
      const ranked = board.toSorted((a, b) => (b.change ?? 0) - (a.change ?? 0));
      const active = [...board]
        .toSorted((a, b) => (b.price ?? 0) * (b.volume ?? 0) - (a.price ?? 0) * (a.volume ?? 0))
        .slice(0, 5);
      return {
        gainers: ranked.filter((c) => (c.change ?? 0) > 0).slice(0, 5) as MarketQuote[],
        losers: ranked.filter((c) => (c.change ?? 0) < 0).toReversed().slice(0, 5) as MarketQuote[],
        active: active as MarketQuote[],
      };
    }
    return markets.data?.movers ?? { gainers: [], losers: [], active: [] };
  }, [tab, quotes, markets.data?.movers, hasPse, foreignBooks, heatRows]);

  const sleeves = useMemo(() => deskSleeves(hasPse ? "PH" : market.id, hasPse), [hasPse, market.id]);
  const rotation = useMemo(
    () => sleeveSession(sleeves, quotes, hasPse ? pseWeightOf : undefined),
    [sleeves, quotes, hasPse],
  );
  const compareLink = useMemo(
    () => indexLink(remoteSpark(baseSym), remoteSpark(compareSym, peer.symbol)),
    [remoteSparks, baseSym, compareSym, peer.symbol, range],
  );
  function putOnWatch(item: WatchItem, extra?: Partial<WatchItem>) {
    addWatch({ ...item, ...extra });
    toast(`Watching ${item.label}`);
  }

  function onSort(key: BoardSort) {
    if (sortUse === key) {
      setMarketPrefs({ sortDir: sortDir === 1 ? -1 : 1 });
      return;
    }
    setMarketPrefs({ sort: key, sortDir: key === "name" ? 1 : -1 });
  }

  function starRow(item: WatchItem) {
    const hit = watched(item);
    if (hit) {
      removeWatch(hit.id);
      if (open && (open.item.id === hit.id || open.item.symbol === hit.symbol)) setOpen(null);
      toast(`Removed ${item.label}`);
      return;
    }
    putOnWatch(item);
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
    const news =
      r.item.kind === "stock" || r.item.kind === "global" || r.item.kind === "fx" || r.item.kind === "cmdty" || isPseiItem(r.item)
        ? newsRowHint(r.item)
        : "";
    const parts = [
      r.item.name ?? r.item.kind,
      peLabel(r.q?.pe),
      r.q?.marketCap && (tab === "screen" || r.item.kind === "global") ? capLabel(r.q.marketCap) : "",
      tab === "screen" && r.q?.yieldPct ? yldLabel(r.q.yieldPct) : "",
      marketPrefs.showVol ? volLabel(r.q) : "",
      holdVal > 0 ? peso(holdVal) : "",
      news,
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
          <Chip key={t.id} active={tab === t.id || (t.id === "all" && hasPse && (tab === "blue" || tab === "reit" || tab === "div"))} onClick={() => goTab(t.id)}>
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
      {hasPse && (tab === "all" || tab === "blue" || tab === "reit" || tab === "div") ? (
        <div className="scroll-auto mb-3 flex flex-nowrap gap-2 overflow-x-auto pb-1">
          <Chip active={tab === "all"} onClick={() => goTab("all")}>
            PSE
          </Chip>
          {PSE_TABS.map((t) => (
            <Chip key={t.id} active={tab === t.id} onClick={() => goTab(t.id)}>
              {t.label}
            </Chip>
          ))}
        </div>
      ) : null}
      <div className="scroll-auto mb-3 flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {DESK_REGIONS.map((r) => {
          const on = marketIds.includes(r.id);
          return (
            <Chip
              key={r.id}
              active={on}
              onClick={() => {
                const next = toggleMarket(marketIds, r.id);
                setProfile({ markets: next });
              }}
            >
              {r.id}
            </Chip>
          );
        })}
      </div>
      {tab === "all" && !query.trim() ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {books.map((b) => b.name).join(" · ")}. Watcher holds any name you add — country chips only change All.
        </p>
      ) : null}
      {tab === "screen" ? (
        <>
          <div className="scroll-auto mb-2 flex flex-nowrap gap-2 overflow-x-auto pb-1">
            {PSE_SCREENS.map((s) => (
              <Chip
                key={s.id}
                active={marketPrefs.screen === s.id}
                onClick={() => setMarketPrefs({ screen: s.id, sort: "wt", sortDir: -1 })}
              >
                {s.label}
              </Chip>
            ))}
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
              {quotesPending && !screenRawCount && !pseScreenOn
                ? "Waiting on the list"
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
        <div className="scroll-auto flex max-w-full flex-nowrap gap-2 overflow-x-auto sm:flex-wrap">
          {(tab === "screen" ? [...BOARD_SORTS, ...SCREEN_SORTS] : BOARD_SORTS)
            .filter((s) => s.id !== "wt" || (hasPse && (tab === "all" || tab === "blue" || tab === "reit" || tab === "div" || tab === "screen")))
            .map((s) => (
            <Chip key={s.id} active={sortUse === s.id} onClick={() => onSort(s.id)}>
              {s.label}
              {sortUse === s.id ? (sortDir === -1 ? " ↓" : " ↑") : ""}
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

      {bannerQ ? (
        <button
          type="button"
          className="mb-4 flex w-full items-center gap-3 rounded-md bg-card px-4 py-3 text-left shadow-[var(--shadow-border)]"
          onClick={() => {
            const item = asItem(bannerQ, "global");
            setOpen({ key: bannerQ.id, item, q: bannerQ, watching: watching(item) });
          }}
        >
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{baseName.label ?? baseName.name}</p>
            <p className="font-display text-2xl tabular-nums">{moneyQuote(bannerQ.price, bannerQ.ccy)}</p>
            <p className="text-xs text-muted-foreground">
              {bannerWeek != null ? `${bannerWeek}% of 52w` : baseName.name}
              {bannerQ.weekLow && bannerQ.weekHigh
                ? ` · ${moneyQuote(bannerQ.weekLow, bannerQ.ccy)}–${moneyQuote(bannerQ.weekHigh, bannerQ.ccy)}`
                : ""}
            </p>
          </div>
          <ChangePill value={bannerQ.change} />
          {marketPrefs.spark ? (
            <Spark
              values={remoteSparks[bannerQ.id] ?? bannerQ.spark}
              up={(bannerQ.change ?? 0) >= 0}
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

      {!query.trim() && tab === "all" ? (
        <IndexCompare
          home={baseName}
          peer={peer}
          homeQuote={quotes[baseSym]}
          peerQuote={quotes[compareSym]}
          pending={quotesPending || indexSparkQ.isFetching}
          onPickBase={(sym) => {
            if (sym === compareSym) {
              setMarketPrefs({ baseIndex: compareSym, compareIndex: baseSym });
              return;
            }
            setMarketPrefs({ baseIndex: sym, compareIndex: compareSym });
          }}
          onPick={(sym) => {
            if (sym === baseSym) {
              setMarketPrefs({ baseIndex: compareSym, compareIndex: baseSym });
              return;
            }
            setMarketPrefs({ baseIndex: baseSym, compareIndex: sym });
          }}
          onOpen={(q) => {
            const item = asItem(q, q.kind);
            setOpen({ key: q.id, item, q, watching: watching(item) });
          }}
          link={compareLink}
          rangeLabel={sparkLabel}
        />
      ) : null}

      {!query.trim() && (tab === "all" || tab === "blue") && sleeves.length ? (
        <SleeveRotation
          rows={rotation}
          take={rotationTake(rotation)}
          pending={quotesPending}
          quotes={quotes}
          onOpen={(sym) => {
            const q = quotes[sym];
            const item = asItem(
              q ?? { id: sym, label: sym, price: 0, kind: "stock", ccy: hasPse ? "PHP" : "USD" },
              hasPse ? "stock" : "global",
            );
            setOpen({ key: sym, item, q, watching: watching(item) });
          }}
        />
      ) : null}

      {!query.trim() && tab === "all" ? (
        <DigestCard
          today={digestQ.data ?? digests[0]}
          history={digests}
          pending={digestQ.isPending && !digestQ.data}
          market={books.map((b) => b.name).join(" · ")}
        />
      ) : null}

      {!query.trim() && (tab === "all" || tab === "blue" || tab === "crypto") ? (
        <MoversStrip
          gainers={tapeMovers.gainers}
          losers={tapeMovers.losers}
          active={tapeMovers.active}
          pending={quotesPending}
          activeLabel={tab === "crypto" ? "Volume" : "Active"}
          onOpen={(q) => {
            const item = asItem(q, q.kind);
            setOpen({ key: q.id, item, q, watching: watching(item) });
          }}
        />
      ) : null}

      {!query.trim() && (tab === "all" || tab === "blue") ? (
        <>
          {hasPse ? <PseHeatmap rows={heatRows.filter((r) => r.item.kind === "stock")} onOpen={setOpen} /> : null}
          {foreignBooks.length ? (
            <SessionHeatmap
              rows={heatRows.filter((r) => r.item.kind !== "stock")}
              market={foreignBooks.map((b) => b.name).join(" · ")}
              onOpen={setOpen}
            />
          ) : null}
        </>
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
              <span className="sm:hidden">Name{sortUse === "name" ? (sortDir === -1 ? " ↓" : " ↑") : ""}</span>
              <span className="hidden sm:inline">
                Name / vol{sortUse === "name" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
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
              Last{sortUse === "last" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
            </button>
            <button type="button" className="min-h-11 w-14 shrink-0 text-right sm:w-20" onClick={() => onSort("chg")}>
              {tab === "crypto" ? "24h" : "Chg"}{sortUse === "chg" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
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
              const onList = Boolean(watched(r.item));
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
                    aria-label={onList ? `Remove ${r.item.label} from watcher` : `Add ${r.item.label} to watcher`}
                    aria-pressed={onList}
                    onClick={() => starRow(r.item)}
                  >
                    <Star className={cn("size-4", onList && "fill-primary text-primary")} />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              {query.trim()
                ? `No market matches “${query.trim()}”.`
                : tab === "watcher"
                  ? "Empty watcher — tap + to add a name from any market."
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
              ? pseScreenOn
                ? "Official PSEi 30 on the public-tape seed. PE / P/B / yield are not Yahoo US. Delayed, not a full-market screen, not for trading."
                : "Yahoo list of up to 100 names, then PE, cap, volume, and yield on this desk. Delayed, not a full-market screen, not for trading."
              : tab === "cmdty"
                ? "Last from Yahoo Finance. Delayed, not for trading. Commodities stay in dollars unless you turn on peso convert."
                : `Spark range is on the board — ${SPARK_RANGES.find((r) => r.id === range)?.label ?? "3M"} default. Coins use Binance, FX uses Frankfurter, PSE names use this desk's tape. PSEi last from Yahoo. Not for trading.`}
          </p>
          {markets.data?.gaps?.length ? (
            <p className="mt-2 px-5 text-xs text-muted-foreground">
              {markets.data.gaps.join(" · ")} didn’t answer. Prices on screen may be incomplete.
            </p>
          ) : null}
          {markets.isError || markets.data?.failed || markets.data?.gaps?.length ? (
            <button type="button" className="mt-2 px-5 text-xs underline" onClick={() => void markets.refetch()}>
              Retry prices
            </button>
          ) : null}
        </CardContent>
      </Card>

      <FxConverter fx={fx} />

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
              watching={watching(open.item)}
              cryptoUsdt={marketPrefs.cryptoUsdt}
              dualPhp={open.item.kind === "cmdty" ? marketPrefs.cmdtyPhp : marketPrefs.dualPhp}
              showVol={marketPrefs.showVol}
              sparkRange={range}
              quotes={quotes}
              nameSpark={remoteSpark(open.item.symbol, open.item.id, open.q?.id)}
              indexSpark={remoteSpark(market.index.symbol, homeIndex?.id)}
              indexLabel={market.index.label ?? market.index.symbol}
              onPeer={(sym) => {
                const q = quotes[sym];
                const item = asItem(
                  q ?? { id: sym, label: sym, price: 0, kind: "stock", ccy: "PHP" },
                  "stock",
                );
                setOpen({ key: sym, item, q, watching: watching(item) });
              }}
              onWatch={() => {
                putOnWatch(open.item);
                setOpen(null);
              }}
              onRemove={() => starRow(open.item)}
              onHold={(patch) => {
                const hit = watched(open.item);
                if (hit) {
                  updateWatch(hit.id, patch);
                  return;
                }
                addWatch({ ...open.item, ...patch });
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
              addHits.map((item) => {
                return (
                <button
                  key={item.id}
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 text-left hover:bg-muted"
                  onClick={() => {
                    putOnWatch(item);
                    setAddOpen(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-sm">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.name ?? item.kind}</span>
                  </span>
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                </button>
                );
              })
            ) : addNeedle && remoteAdd.isFetching ? (
              <p className="py-4 text-sm text-muted-foreground">Searching…</p>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">No matches. Type a ticker like COST or NVDA.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <BoardViewDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        spark={marketPrefs.spark}
        range={range}
        dualPhp={marketPrefs.dualPhp}
        cmdtyPhp={marketPrefs.cmdtyPhp}
        cryptoUsdt={marketPrefs.cryptoUsdt}
        showVol={marketPrefs.showVol}
        showTape={marketPrefs.showTape}
        compact={marketPrefs.compact}
        onPatch={setMarketPrefs}
      />
    </div>
  );
}
