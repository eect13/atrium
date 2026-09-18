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

/** Public-tape seed 18 Sep 2026 (StockAnalysis). Sheet live-fetch overlays. Not Yahoo .PS. */
export const PSE_STATS_AS_OF = "2026-09-18";
export const PSE_STATS_SEED: Record<string, PseStats> = {
  AC: { ticker: "AC", pe: 5.45, pb: 0.38, yieldPct: 1.97, roe: 10.83, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  ACEN: { ticker: "ACEN", pe: 21.02, pb: 0.64, yieldPct: 1.87, roe: 4.58, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  AEV: { ticker: "AEV", pe: 8.72, pb: 0.5, yieldPct: 2.97, roe: 9.72, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  ALI: { ticker: "ALI", pe: 5.99, pb: 0.55, yieldPct: 3.84, roe: 11.28, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  AREIT: { ticker: "AREIT", pe: 13.33, pb: 0.99, yieldPct: 6.74, roe: 8.17, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  BDO: { ticker: "BDO", pe: 7.05, pb: 0.93, yieldPct: 3.8, roe: 13.82, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  BPI: { ticker: "BPI", pe: 7.95, pb: 1.09, yieldPct: 5.19, roe: 14.18, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  CBC: { ticker: "CBC", pe: 4.71, pb: 0.72, yieldPct: 5.44, roe: 16.06, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  CNPF: { ticker: "CNPF", pe: 15.76, pb: 2.88, yieldPct: 3.54, roe: 18.82, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  DMC: { ticker: "DMC", pe: 6.32, pb: 0.69, yieldPct: 9.43, roe: 14.35, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  EMI: { ticker: "EMI", pe: 68.74, pb: 2.21, yieldPct: 0.86, roe: 3.5, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  GLO: { ticker: "GLO", pe: 11.73, pb: 1.31, yieldPct: 6.23, roe: 12.48, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  GTCAP: { ticker: "GTCAP", pe: 2.85, pb: 0.28, yieldPct: 2.43, roe: 12.74, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  ICT: { ticker: "ICT", pe: 26.96, pb: 12.5, yieldPct: 2.04, roe: 57.4, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  JFC: { ticker: "JFC", pe: 16.2, pb: 1.93, yieldPct: 2.43, roe: 12.52, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  JGS: { ticker: "JGS", pe: 5.72, pb: 0.36, yieldPct: 2.16, roe: 8.41, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  LTG: { ticker: "LTG", pe: 4.94, pb: 0.44, yieldPct: 8.19, roe: 12.68, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  MBT: { ticker: "MBT", pe: 5.63, pb: 0.67, yieldPct: 8.03, roe: 12.28, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  MER: { ticker: "MER", pe: 10.16, pb: 2.38, yieldPct: 5.78, roe: 25.11, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  MONDE: { ticker: "MONDE", pe: 12.11, pb: 1.97, yieldPct: 7.11, roe: 16.63, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  MYNLD: { ticker: "MYNLD", pe: 7.29, pb: 1.17, yieldPct: 6.55, roe: 17.45, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  PGOLD: { ticker: "PGOLD", pe: 9.67, pb: 1.12, yieldPct: 4.9, roe: 11.93, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  PLUS: { ticker: "PLUS", pe: 2.94, pb: 0.87, yieldPct: 9.16, roe: 32.98, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  RCR: { ticker: "RCR", pe: 4.2, pb: 0.82, yieldPct: 6.57, roe: 22.45, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  SCC: { ticker: "SCC", pe: 6.44, pb: 1.32, yieldPct: 16.09, roe: 21.88, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  SM: { ticker: "SM", pe: 6.93, pb: 0.67, yieldPct: 3.21, roe: 13.59, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  SMC: { ticker: "SMC", pe: 40.13, pb: 0.19, yieldPct: 2.22, roe: 8.56, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  SMPH: { ticker: "SMPH", pe: 10.12, pb: 1.02, yieldPct: 2.44, roe: 10.72, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  TEL: { ticker: "TEL", pe: 8.44, pb: 1.81, yieldPct: 8.33, roe: 22.45, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
  URC: { ticker: "URC", pe: 11.5, pb: 0.96, yieldPct: 3.6, roe: 8.94, source: "stockanalysis", asOf: PSE_STATS_AS_OF },
};

export function statsTicker(ticker: string) {
  return ticker.replace(/^\^/, "").replace(/\.PS$/i, "").replace(/^PSE-/, "").trim().toUpperCase();
}

export function seededStats(ticker: string): PseStats | undefined {
  return PSE_STATS_SEED[statsTicker(ticker)];
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

/** Public tape wins when present (live StockAnalysis over seed). Yahoo stays if public fields are empty. */
export function applyPublicStats<T extends { pe?: number; pb?: number; yieldPct?: number; forwardPe?: number; marketCap?: number; roe?: number }>(
  q: T,
  s?: Pick<PseStats, "pe" | "pb" | "yieldPct" | "forwardPe" | "marketCap" | "roe">,
): T {
  if (!s) return q;
  return {
    ...q,
    pe: s.pe ?? q.pe,
    pb: s.pb ?? q.pb,
    yieldPct: s.yieldPct ?? q.yieldPct,
    forwardPe: s.forwardPe ?? q.forwardPe,
    marketCap: s.marketCap ?? q.marketCap,
    roe: s.roe ?? q.roe,
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
  const seed = seededStats(t);
  const empty: PseStats = seed ?? { ticker: t };
  if (!/^[A-Z][A-Z0-9]{1,5}$/.test(t)) return empty;
  try {
    const html = await httpText(`https://stockanalysis.com/quote/pse/${encodeURIComponent(t)}/statistics/`, {
      accept: "text/html",
      "user-agent": "Atrium/1.2.20 (personal dashboard; PSE multiples)",
    });
    const data = parseStockAnalysisStats(html, t);
    const merged = data.source ? data : { ...empty, ...data, source: seed?.source, asOf: data.asOf ?? seed?.asOf };
    cache().set(t, { exp: Date.now() + CACHE_MS, data: merged });
    return merged;
  } catch {
    if (hit) return hit.data;
    return empty;
  }
}

export const fetchPseStats = createServerFn({ method: "POST" })
  .validator(z.object({ ticker: z.string().min(1).max(12) }))
  .handler(async ({ data }) => loadPseStats(data.ticker));
