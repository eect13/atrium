"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchMarkets, VS_PARAM, type MarketSnapshot } from "@/lib/prices";
import { rememberTape } from "@/lib/sparks";
import { useAtrium } from "@/lib/store";
import { WATCH_CATALOG, type QuoteCcy } from "@/lib/types";
import { regionOf } from "@/lib/region";
import { YAHOO_CORE_TAPE } from "@/lib/yahoo";
import { isPseScreen, isYahooScreen } from "@/lib/screener";

const MARKET_SNAP = "atrium.markets.snap";

function readSnap<T>(key: string): T | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeSnap(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function useMarkets() {
  const watch = useAtrium((s) => s.watch);
  const quoteCcy = useAtrium((s) => s.quoteCcy);
  const financeOn = useAtrium((s) => s.modules.finance);
  const marketsOn = useAtrium((s) => s.marketPrefs.showMarkets !== false);
  const tab = useAtrium((s) => s.marketPrefs.tab);
  const screen = useAtrium((s) => s.marketPrefs.screen);
  const stockTape = useAtrium((s) => s.marketPrefs.stockTape ?? "auto");
  const region = useAtrium((s) => s.profile.region);
  const boardQuery = useAtrium((s) => s.boardQuery);
  const searching = boardQuery.trim().length > 0;
  const ids = watch.filter((w) => w.kind === "crypto").map((w) => w.symbol);
  const wantYahoo = marketsOn;
  const yahoo = wantYahoo
    ? [
        ...new Set([
          ...YAHOO_CORE_TAPE,
          ...watch.filter((w) => w.kind === "global" || w.kind === "cmdty").map((w) => w.symbol),
          ...(tab === "global" || searching
            ? WATCH_CATALOG.filter((w) => w.kind === "global").map((w) => w.symbol)
            : []),
          ...(tab === "cmdty" || searching
            ? WATCH_CATALOG.filter((w) => w.kind === "cmdty").map((w) => w.symbol)
            : []),
        ]),
      ]
    : [];
  const screener = marketsOn && tab === "screen" && isYahooScreen(screen) ? screen : undefined;
  const yahooRegion = regionOf(region).yahoo;
  const wantPse =
    marketsOn &&
    (searching ||
      tab === "all" ||
      tab === "blue" ||
      tab === "reit" ||
      tab === "div" ||
      tab === "watcher" ||
      tab === "starred" ||
      (tab === "screen" && isPseScreen(screen)) ||
      watch.some((w) => w.kind === "stock"));
  const wantCrypto =
    marketsOn &&
    (searching ||
      tab === "crypto" ||
      tab === "watcher" ||
      tab === "starred" ||
      tab === "all" ||
      watch.some((w) => w.kind === "crypto"));
  return useQuery({
    queryKey: ["markets", ids, quoteCcy, yahoo, wantPse, wantCrypto, screener, yahooRegion, stockTape],
    queryFn: async () => {
      const data = await fetchMarkets({
        data: { ids, vs: VS_PARAM[quoteCcy], yahoo, wantPse, wantCrypto, screener, yahooRegion },
      });
      writeSnap(MARKET_SNAP, { ids, quoteCcy, data });
      if (data.quotes) rememberTape(data.quotes);
      return data;
    },
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: financeOn,
    placeholderData: (prev) => {
      if (prev) return prev;
      const snap = readSnap<{ ids: string[]; quoteCcy: QuoteCcy; data: MarketSnapshot }>(MARKET_SNAP);
      if (!snap?.data?.quotes) return undefined;
      if (snap.quoteCcy !== quoteCcy) return undefined;
      return snap.data;
    },
  });
}
