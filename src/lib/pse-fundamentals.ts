/** Public PSE multiples + last-reported bank ratios.
 *  Yahoo dropped .PS quoteSummary. StockAnalysis still publishes PE / P/B / yield
 *  for PSE names. Bank ROE / NIM / NPL / CET1 are last reported filings — not a live tape. */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { httpText } from "./http.ts";

export type PseStats = {
  ticker: string;
  pe?: number;
  forwardPe?: number;
  pb?: number;
  yieldPct?: number;
  marketCap?: number;
  roe?: number;
  source?: string;
  asOf?: string;
};

export type BankFiling = {
  ticker: string;
  asOf: string;
  asOfDate: string;
  roe: number;
  nim?: number;
  npl: number;
  cet1: number;
  source: string;
};

/** H1 2026 disclosures (period ended 30 Jun 2026). Not a live print. */
export const BANK_FILINGS: Record<string, BankFiling> = {
  BDO: {
    ticker: "BDO",
    asOf: "H1 2026",
    asOfDate: "2026-06-30",
    roe: 12.72,
    nim: 4.2,
    npl: 1.64,
    cet1: 13.1,
    source: "BDO disclosure, 28 Jul 2026",
  },
  BPI: {
    ticker: "BPI",
    asOf: "H1 2026",
    asOfDate: "2026-06-30",
    roe: 13.8,
    nim: 4.7,
    npl: 2.42,
    cet1: 14.0,
    source: "BPI H1 2026, 31 Jul 2026",
  },
  MBT: {
    ticker: "MBT",
    asOf: "H1 2026",
    asOfDate: "2026-06-30",
    roe: 11.98,
    npl: 1.81,
    cet1: 14.22,
    source: "Metrobank H1 2026, 31 Jul 2026",
  },
  CBC: {
    ticker: "CBC",
    asOf: "H1 2026",
    asOfDate: "2026-06-30",
    roe: 15.09,
    nim: 4.67,
    npl: 1.5,
    cet1: 14.68,
    source: "China Bank SEC 17-Q, 30 Jun 2026",
  },
};

export function bankFiling(ticker: string): BankFiling | undefined {
  return BANK_FILINGS[ticker.replace(/^\^/, "").replace(/\.PS$/i, "").replace(/^PSE-/, "").trim().toUpperCase()];
}

export function overlayStats<T extends { pe?: number; pb?: number; yieldPct?: number; forwardPe?: number; marketCap?: number; roe?: number }>(
  q: T,
  s?: Pick<PseStats, "pe" | "pb" | "yieldPct" | "forwardPe" | "marketCap" | "roe">,
): T {
  if (!s) return q;
  return {
    ...q,
    pe: q.pe ?? s.pe,
    pb: q.pb ?? s.pb,
    yieldPct: q.yieldPct ?? s.yieldPct,
    forwardPe: q.forwardPe ?? s.forwardPe,
    marketCap: q.marketCap ?? s.marketCap,
    roe: q.roe ?? s.roe,
  };
}

/** Residual income identity with labeled assumptions — not a target. */
export function justifiedPb(roePct: number, r = 0.12, g = 0.05): number | null {
  if (!(roePct > 0) || r <= g) return null;
  const roe = roePct / 100;
  return (roe - g) / (r - g);
}

function saField(html: string, id: string, key: "value" | "hover" = "value"): string | undefined {
  const m = html.match(new RegExp(`id\\s*:\\s*"${id}"[^}]{0,240}${key}\\s*:\\s*"([^"]+)"`));
  return m?.[1];
}

function parseNum(raw?: string): number | undefined {
  if (!raw || /^n\/?a$/i.test(raw.trim())) return undefined;
  const n = Number(raw.replace(/%/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseCap(value?: string, hover?: string): number | undefined {
  const fromHover = parseNum(hover);
  if (fromHover && fromHover > 1_000) return fromHover;
  if (!value) return undefined;
  const m = value.trim().replace(/^[^\d.]+/, "").match(/^([\d.]+)\s*([KMBT])?$/i);
  if (!m) return parseNum(value);
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const mul: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const k = (m[2] ?? "").toUpperCase();
  return n * (mul[k] ?? 1);
}

export function parseStockAnalysisStats(html: string, ticker: string): PseStats {
  const pe =
    parseNum(saField(html, "peRatio") ?? saField(html, "pe")) ??
    parseNum(html.match(/trailing PE ratio is ([0-9.]+)/i)?.[1]);
  const forwardPe = parseNum(saField(html, "peForward"));
  const pb = parseNum(saField(html, "pb"));
  const yieldPct = parseNum(saField(html, "dividendYield"));
  const marketCap = parseCap(
    saField(html, "marketCap") ?? saField(html, "marketcap"),
    saField(html, "marketCap", "hover") ?? saField(html, "marketcap", "hover"),
  );
  const roe = parseNum(saField(html, "roe"));
  return {
    ticker,
    pe,
    forwardPe,
    pb,
    yieldPct,
    marketCap,
    roe,
    source: pe || pb || yieldPct || roe ? "stockanalysis" : undefined,
    asOf: new Date().toISOString().slice(0, 10),
  };
}

const CACHE_MS = 6 * 60 * 60_000;
const g = globalThis as typeof globalThis & {
  __atriumPseStats?: Map<string, { exp: number; data: PseStats }>;
};

function cache() {
  g.__atriumPseStats ??= new Map();
  return g.__atriumPseStats;
}

export async function loadPseStats(ticker: string): Promise<PseStats> {
  const t = ticker.replace(/^\^/, "").replace(/\.PS$/i, "").trim().toUpperCase();
  const hit = cache().get(t);
  if (hit && hit.exp > Date.now()) return hit.data;
  const empty: PseStats = { ticker: t };
  if (!/^[A-Z][A-Z0-9]{1,5}$/.test(t)) return empty;
  try {
    const html = await httpText(`https://stockanalysis.com/quote/pse/${encodeURIComponent(t)}/statistics/`, {
      accept: "text/html",
      "user-agent": "Atrium/1.2.19 (personal dashboard; PSE multiples)",
    });
    const data = parseStockAnalysisStats(html, t);
    cache().set(t, { exp: Date.now() + CACHE_MS, data });
    return data;
  } catch {
    if (hit) return hit.data;
    return empty;
  }
}

export const fetchPseStats = createServerFn({ method: "POST" })
  .validator(z.object({ ticker: z.string().min(1).max(12) }))
  .handler(async ({ data }) => loadPseStats(data.ticker));
