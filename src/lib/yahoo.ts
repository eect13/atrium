/** Yahoo Finance last + spark. Delayed, not for trading.
 *  Desktop Tauri runs this in the webview (tauri-start-stub), so pulls must use httpJson.
 *
 *  2026: v7/quote and quoteSummary need a crumb and now 401 without it.
 *  Chart + spark still work. Philippine equities (.PS) return empty YHD shells;
 *  the PSEi index (PSEI.PS) is the listing that still has a last. */

import { httpJson, isTauri } from "./http.ts";

export type YahooLast = {
  symbol: string;
  price: number;
  change?: number;
  currency: string;
  name?: string;
  volume?: number;
  avgVolume?: number;
  high?: number;
  low?: number;
  spark?: number[];
  pe?: number;
  marketCap?: number;
  yieldPct?: number;
  forwardPe?: number;
  pb?: number;
  weekHigh?: number;
  weekLow?: number;
};

export const PSEI_SYMBOL = "PSEI.PS";

/** Core Yahoo symbols the Markets tape always wants — index + a US benchmark + gold. */
export const YAHOO_CORE_TAPE = [PSEI_SYMBOL, "^NSEI", "^GSPC", "GC=F"] as const;

export function isYahooIndex(symbol: string) {
  const s = symbol.trim();
  return s.startsWith("^") || /^PSEI\.PS$/i.test(s);
}

export function isPseiItem(item: { symbol?: string; label?: string }) {
  const s = (item.symbol ?? "").trim();
  const l = (item.label ?? "").trim();
  return s === PSEI_SYMBOL || /^PSEI(\.PS)?$/i.test(s) || l === "PSEi";
}

/** Map BDO.PS → BDO. Null for the PSEi index so it never overlays the listed PSE stock. */
export function pseTickerFromYahoo(symbol: string): string | null {
  if (!/\.PS$/i.test(symbol)) return null;
  if (isYahooIndex(symbol)) return null;
  return symbol.replace(/\.PS$/i, "").toUpperCase();
}

const FETCH_MS = 4_500;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

type SparkRange = "1d" | "1w" | "1m" | "3m" | "6m" | "1y";

const RANGE: Record<SparkRange, { range: string; interval: string }> = {
  "1d": { range: "1d", interval: "5m" },
  "1w": { range: "5d", interval: "1h" },
  "1m": { range: "1mo", interval: "1d" },
  "3m": { range: "3mo", interval: "1d" },
  "6m": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1wk" },
};

function downsample(values: number[], n = 24) {
  if (values.length <= n) return values;
  const step = (values.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => values[Math.round(i * step)] ?? 0);
}

/** Trailing yield is a fraction; Yahoo's dividendYield on this endpoint is already percent. */
export function parseYieldPct(trailing: unknown, dividend: unknown): number | undefined {
  const t = Number(trailing);
  if (Number.isFinite(t) && t > 0) return t < 1 ? t * 100 : t;
  const d = Number(dividend);
  if (!Number.isFinite(d) || d <= 0) return undefined;
  if (d >= 1 || d < 0.2) return d < 1 ? d * 100 : d;
  return d;
}

function finitePos(n: unknown): number | undefined {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

function isAuthFail(err: unknown) {
  const s = String(err);
  return s.includes("401") || /unauthorized/i.test(s);
}

/** v7/quote 401s without a crumb. Skip further quote pulls in this process once we see it. */
let quoteOpen = true;

async function pull(url: string) {
  if (isTauri()) {
    return httpJson(url, { accept: "application/json", "user-agent": UA });
  }
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function closesOf(node: unknown): number[] {
  const row = node as {
    indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    close?: Array<number | null>;
    timestamp?: number[];
  };
  const raw = row.indicators?.quote?.[0]?.close ?? row.close ?? [];
  return raw.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
}

function fromMeta(symbol: string, meta: Record<string, unknown>, spark?: number[]): YahooLast | null {
  const price = Number(meta.regularMarketPrice ?? meta.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const pct = Number(meta.regularMarketChangePercent);
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
  const change = Number.isFinite(pct)
    ? pct
    : Number.isFinite(prev) && prev > 0
      ? ((price - prev) / prev) * 100
      : undefined;
  const high = Number(meta.regularMarketDayHigh ?? meta.fiftyTwoWeekHigh);
  const low = Number(meta.regularMarketDayLow ?? meta.fiftyTwoWeekLow);
  const volume = Number(meta.regularMarketVolume);
  const avgVolume = Number(meta.averageDailyVolume10Day ?? meta.averageDailyVolume3Month);
  const pe = Number(meta.trailingPE);
  const marketCap = Number(meta.marketCap);
  const yieldPctRaw = parseYieldPct(meta.trailingAnnualDividendYield, meta.dividendYield);
  const yieldPct = yieldPctRaw != null && yieldPctRaw <= 15 ? yieldPctRaw : undefined;
  const forwardPe = finitePos(meta.forwardPE);
  const pb = finitePos(meta.priceToBook);
  const weekHigh = finitePos(meta.fiftyTwoWeekHigh);
  const weekLow = finitePos(meta.fiftyTwoWeekLow);
  const currency = String(meta.currency ?? "USD").toUpperCase();
  const name = typeof meta.shortName === "string" ? meta.shortName : typeof meta.longName === "string" ? meta.longName : undefined;
  return {
    symbol,
    price,
    change: Number.isFinite(change) ? change : undefined,
    currency,
    name,
    volume: Number.isFinite(volume) && volume > 0 ? volume : undefined,
    avgVolume: Number.isFinite(avgVolume) && avgVolume > 0 ? avgVolume : undefined,
    high: Number.isFinite(high) ? high : undefined,
    low: Number.isFinite(low) ? low : undefined,
    spark: spark && spark.length >= 2 ? downsample(spark) : undefined,
    pe: Number.isFinite(pe) && pe > 0 ? pe : undefined,
    marketCap: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : undefined,
    yieldPct,
    forwardPe,
    pb,
    weekHigh,
    weekLow,
  };
}

export function parseYahooSpark(json: unknown): YahooLast[] {
  return parseSparkPayload(json);
}

function parseSparkPayload(json: unknown): YahooLast[] {
  const result = (json as { spark?: { result?: unknown[] } })?.spark?.result;
  if (!Array.isArray(result)) return [];
  const out: YahooLast[] = [];
  for (const raw of result) {
    const row = raw as { symbol?: string; response?: unknown[]; meta?: Record<string, unknown> };
    const symbol = String(row.symbol ?? "");
    if (!symbol) continue;
    const res0 = Array.isArray(row.response) ? (row.response[0] as { meta?: Record<string, unknown> }) : undefined;
    const meta = (res0?.meta ?? row.meta ?? row) as Record<string, unknown>;
    const spark = closesOf(res0 ?? row);
    const hit = fromMeta(symbol, meta, spark);
    if (hit) out.push(hit);
  }
  return out;
}

function chunk<T>(items: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export async function fetchYahooLast(symbols: string[]): Promise<YahooLast[]> {
  const uniq = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  if (!uniq.length) return [];
  const found = new Map<string, YahooLast>();
  for (const group of chunk(uniq, 12)) {
    const qs = group.map(encodeURIComponent).join(",");
    let hit = false;
    for (const host of HOSTS) {
      try {
        const json = await pull(`${host}/v7/finance/spark?symbols=${qs}&range=1d&interval=5m`);
        for (const row of parseSparkPayload(json)) found.set(row.symbol, row);
        hit = true;
        break;
      } catch {
        continue;
      }
    }
    if (hit) continue;
    await Promise.all(
      group.map(async (symbol) => {
        if (found.has(symbol)) return;
        const row = await fetchYahooChart(symbol, "1d");
        if (row) found.set(symbol, row);
      }),
    );
  }
  const needFund = quoteOpen
    ? uniq.filter((s) => {
        if (isYahooIndex(s) || pseTickerFromYahoo(s)) return false;
        const row = found.get(s);
        return !row || row.pe == null || row.marketCap == null;
      })
    : [];
  if (needFund.length) {
    const extra = await fetchYahooQuote(needFund);
    for (const row of extra) {
      const prev = found.get(row.symbol);
      found.set(row.symbol, prev ? overlayYahoo(prev, row) : row);
    }
  }
  return uniq.flatMap((s) => {
    const row = found.get(s);
    return row ? [row] : [];
  });
}

export function parseYahooQuote(json: unknown): YahooLast[] {
  const quotes =
    (json as { quoteResponse?: { result?: Array<Record<string, unknown>> } })?.quoteResponse?.result ?? [];
  if (!Array.isArray(quotes)) return [];
  const out: YahooLast[] = [];
  for (const q of quotes) {
    const symbol = String(q.symbol ?? "");
    if (!symbol) continue;
    const hit = fromMeta(symbol, q);
    if (hit) out.push(hit);
  }
  return out;
}

export async function fetchYahooQuote(symbols: string[]): Promise<YahooLast[]> {
  if (!quoteOpen) return [];
  const uniq = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  if (!uniq.length) return [];
  const found = new Map<string, YahooLast>();
  for (const group of chunk(uniq, 20)) {
    if (!quoteOpen) break;
    const qs = group.map(encodeURIComponent).join(",");
    for (const host of HOSTS) {
      try {
        const json = await pull(`${host}/v7/finance/quote?symbols=${qs}&lang=en-US`);
        for (const row of parseYahooQuote(json)) found.set(row.symbol, row);
        break;
      } catch (err) {
        if (isAuthFail(err)) quoteOpen = false;
        continue;
      }
    }
  }
  return uniq.flatMap((s) => {
    const row = found.get(s);
    return row ? [row] : [];
  });
}

export function overlayYahoo(prev: YahooLast, extra: YahooLast): YahooLast {
  return {
    ...prev,
    pe: prev.pe ?? extra.pe,
    marketCap: prev.marketCap ?? extra.marketCap,
    yieldPct: prev.yieldPct ?? extra.yieldPct,
    forwardPe: prev.forwardPe ?? extra.forwardPe,
    pb: prev.pb ?? extra.pb,
    weekHigh: prev.weekHigh ?? extra.weekHigh,
    weekLow: prev.weekLow ?? extra.weekLow,
    volume: prev.volume ?? extra.volume,
    avgVolume: prev.avgVolume ?? extra.avgVolume,
    name: prev.name ?? extra.name,
  };
}

export async function fetchYahooChart(symbol: string, range: SparkRange): Promise<YahooLast | null> {
  const spec = RANGE[range] ?? RANGE["1d"];
  for (const host of HOSTS) {
    try {
      const json = await pull(
        `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${spec.range}&interval=${spec.interval}&includePrePost=false`,
      );
      const res0 = (json as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } })?.chart?.result?.[0];
      if (!res0?.meta) continue;
      const spark = closesOf(res0);
      const hit = fromMeta(symbol, res0.meta, spark);
      if (hit) return hit;
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchYahooSpark(symbol: string, range: SparkRange): Promise<number[]> {
  const row = await fetchYahooChart(symbol, range);
  return row?.spark && row.spark.length >= 3 ? row.spark : [];
}

export async function fetchYahooScreener(
  scrId: string,
  region = "US",
  count = 100,
  opts?: { fallback?: boolean },
): Promise<YahooLast[]> {
  const id = encodeURIComponent(scrId);
  const tryRegions =
    opts?.fallback === false
      ? [region || "US"]
      : region && region !== "US"
        ? [region, "US"]
        : [region || "US"];
  for (const reg of tryRegions) {
    for (const host of HOSTS) {
      try {
        const json = await pull(
          `${host}/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=${encodeURIComponent(reg)}&scrIds=${id}&count=${count}`,
        );
        const quotes =
          (json as { finance?: { result?: Array<{ quotes?: Array<Record<string, unknown>> }> } })?.finance
            ?.result?.[0]?.quotes ?? [];
        if (!Array.isArray(quotes) || !quotes.length) continue;
        const out: YahooLast[] = [];
        for (const q of quotes) {
          const symbol = String(q.symbol ?? "");
          if (!symbol) continue;
          const hit = fromMeta(symbol, q);
          if (hit) out.push(hit);
        }
        if (out.length) return out;
      } catch {
        continue;
      }
    }
  }
  return [];
}

export type YahooSearchHit = {
  symbol: string;
  name: string;
  type: string;
  exch: string;
};

export function parseYahooSearch(json: unknown): YahooSearchHit[] {
  const quotes = (json as { quotes?: Array<Record<string, unknown>> })?.quotes ?? [];
  if (!Array.isArray(quotes)) return [];
  const out: YahooSearchHit[] = [];
  const seen = new Set<string>();
  for (const row of quotes) {
    const symbol = String(row.symbol ?? "").trim();
    if (!symbol || seen.has(symbol)) continue;
    const type = String(row.quoteType ?? row.typeDisp ?? "EQUITY").toUpperCase();
    if (type === "OPTION" || type === "MUTUALFUND") continue;
    seen.add(symbol);
    out.push({
      symbol,
      name: String(row.shortname ?? row.longname ?? row.shortName ?? symbol),
      type,
      exch: String(row.exchDisp ?? row.exchange ?? ""),
    });
  }
  return out.slice(0, 8);
}

export async function searchYahooTickers(q: string): Promise<YahooSearchHit[]> {
  const query = q.trim();
  if (query.length < 1 || query.length > 32) return [];
  for (const host of HOSTS) {
    try {
      const json = await pull(
        `${host}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&listsCount=0`,
      );
      const hits = parseYahooSearch(json);
      if (hits.length) return hits;
    } catch {
      continue;
    }
  }
  return [];
}
