/** Index link and session sleeve rotation. Delayed sparks, not a hedge or a rotation trade. */

import { nameWeight } from "./psei-weight.ts";

export type Sleeve = { id: string; label: string; tickers: string[] };

export const PH_SLEEVES: Sleeve[] = [
  { id: "banks", label: "Banks", tickers: ["BDO", "BPI", "MBT", "CBC"] },
  { id: "property", label: "Property", tickers: ["ALI", "SMPH", "AREIT", "RCR"] },
  { id: "holdcos", label: "Holdcos", tickers: ["SM", "AC", "AEV", "JGS", "GTCAP", "LTG", "SMC", "DMC"] },
  { id: "consumer", label: "Consumer", tickers: ["JFC", "URC", "CNPF", "PGOLD", "EMI", "MONDE"] },
  { id: "telco", label: "Telco", tickers: ["TEL", "GLO"] },
  { id: "utilities", label: "Utilities", tickers: ["MER", "MYNLD", "ACEN"] },
  { id: "other", label: "Ports / other", tickers: ["ICT", "PLUS", "SCC"] },
];

export const US_SLEEVES: Sleeve[] = [
  { id: "tech", label: "Tech", tickers: ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AVGO"] },
  { id: "consumer", label: "Consumer", tickers: ["AMZN", "TSLA", "WMT"] },
  { id: "health", label: "Health", tickers: ["UNH", "LLY", "JNJ"] },
  { id: "energy", label: "Energy", tickers: ["XOM"] },
  { id: "financials", label: "Financials", tickers: ["JPM", "V", "BRK-B"] },
];

export const HK_SLEEVES: Sleeve[] = [
  { id: "tech", label: "Tech", tickers: ["0700.HK", "9988.HK", "3690.HK", "1810.HK", "9618.HK"] },
  { id: "banks", label: "Banks", tickers: ["0939.HK", "1398.HK", "0005.HK", "2318.HK", "1299.HK"] },
  { id: "other", label: "Other", tickers: ["0388.HK", "0941.HK"] },
];

export function deskSleeves(regionId?: string | null, pseHome = false): Sleeve[] {
  if (pseHome || regionId === "PH") return PH_SLEEVES;
  if (regionId === "US") return US_SLEEVES;
  if (regionId === "HK") return HK_SLEEVES;
  return [];
}

export type SleeveMove = {
  id: string;
  label: string;
  chg: number;
  wt: number;
  n: number;
  nLive: number;
  tickers: string[];
};

export function sleeveSession(
  sleeves: Sleeve[],
  quotes: Record<string, { change?: number } | undefined>,
  weightOf?: (ticker: string) => number | undefined,
): SleeveMove[] {
  const out: SleeveMove[] = [];
  for (const s of sleeves) {
    if (!s.tickers.length) continue;
    let wsum = 0;
    let csum = 0;
    let nLive = 0;
    for (const t of s.tickers) {
      const ch = quotes[t]?.change;
      if (ch == null || !Number.isFinite(ch)) continue;
      const w = weightOf ? weightOf(t) : 1;
      if (w == null || !(w > 0)) continue;
      wsum += w;
      csum += ch * w;
      nLive += 1;
    }
    out.push({
      id: s.id,
      label: s.label,
      chg: nLive ? csum / wsum : Number.NaN,
      wt: wsum,
      n: s.tickers.length,
      nLive,
      tickers: s.tickers,
    });
  }
  return out.toSorted((a, b) => {
    const af = Number.isFinite(a.chg);
    const bf = Number.isFinite(b.chg);
    if (af && bf) return b.chg - a.chg;
    if (af) return -1;
    if (bf) return 1;
    return a.label.localeCompare(b.label);
  });
}

/** One-line read of who leads / lags. Not a buy/sell. */
export function rotationTake(rows: SleeveMove[]): string | undefined {
  const ranked = rows.filter((r) => Number.isFinite(r.chg) && r.nLive > 0);
  if (ranked.length < 2) return undefined;
  const lead = ranked[0]!;
  const lag = ranked[ranked.length - 1]!;
  const spread = lead.chg - lag.chg;
  if (!(spread > 0.15)) {
    return `${lead.label} and ${lag.label} are still close this session. Not a rotation.`;
  }
  return `${lead.label} lead · ${lag.label} lag. Session sleeve spread ${spread.toFixed(1)} pt. Delayed, not a rotation trade.`;
}

export function pseWeightOf(ticker: string) {
  return nameWeight(ticker);
}

export function sparkReturns(values: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const a = values[i - 1]!;
    const b = values[i]!;
    if (!(a > 0) || !(b > 0)) continue;
    out.push((b - a) / a);
  }
  return out;
}

export type IndexLink = { n: number; r: number; beta: number };

/** Pearson r and OLS β of y on x. Needs 8 return points. */
export function corrBeta(x: number[], y: number[]): IndexLink | undefined {
  const n = Math.min(x.length, y.length);
  if (n < 8) return undefined;
  const xs = x.slice(-n);
  const ys = y.slice(-n);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx < 1e-18 || dy < 1e-18) return undefined;
  const r = num / Math.sqrt(dx * dy);
  const beta = num / dx;
  if (!Number.isFinite(r) || !Number.isFinite(beta)) return undefined;
  return { n, r, beta };
}

export function indexLink(homeSpark?: number[], peerSpark?: number[]): IndexLink | undefined {
  if (!homeSpark || !peerSpark) return undefined;
  if (homeSpark.length < 9 || peerSpark.length < 9) return undefined;
  return corrBeta(sparkReturns(peerSpark), sparkReturns(homeSpark));
}

/** Pearson r and OLS β of a name on the home index. Real sparks only — not a session wobble. */
export function vsIndex(nameSpark?: number[], indexSpark?: number[]): IndexLink | undefined {
  return indexLink(nameSpark, indexSpark);
}
