/** Official PSEi free-float weights.
 *  PSE does not post a public weight file. First Metro's underlying table
 *  lists the official PSEi weight next to the FMETF fund weight — that PSEi
 *  column is the public official file. Seed is 16 Sep 2026; live fetch overlays. */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { httpText } from "./http.ts";

export const PSEI_WEIGHT_AS_OF = "2026-09-16";
export const PSEI_FORMULA = "Σ(P × S × F) / Divisor";
export const PSEI_WEIGHT_URL = "https://etf.atrfami.com.ph/exchange-traded-funds";

export type PseiWeight = { ticker: string; name: string; psei: number; fmetf: number };
export type PseiWeightFile = { asOf: string; rows: PseiWeight[]; source: "live" | "seed" };

/** Seed: First Metro underlying table, 16 Sep 2026 — PSEi weight column. */
export const PSEI_WEIGHTS: PseiWeight[] = [
  { ticker: "ICT", name: "International Container Terminal Services", psei: 26.83, fmetf: 26.81 },
  { ticker: "SM", name: "SM Investments", psei: 8.44, fmetf: 8.4 },
  { ticker: "BDO", name: "BDO Unibank", psei: 7.63, fmetf: 7.6 },
  { ticker: "BPI", name: "Bank of the Philippine Islands", psei: 7.48, fmetf: 7.46 },
  { ticker: "SMPH", name: "SM Prime Holdings", psei: 5.18, fmetf: 5.22 },
  { ticker: "AC", name: "Ayala Corp", psei: 4.33, fmetf: 4.36 },
  { ticker: "MER", name: "Manila Electric", psei: 4.03, fmetf: 3.9 },
  { ticker: "MBT", name: "Metropolitan Bank & Trust", psei: 3.79, fmetf: 3.8 },
  { ticker: "ALI", name: "Ayala Land", psei: 2.76, fmetf: 2.74 },
  { ticker: "AEV", name: "Aboitiz Equity Ventures", psei: 2.58, fmetf: 2.63 },
  { ticker: "TEL", name: "PLDT", psei: 2.5, fmetf: 2.28 },
  { ticker: "CBC", name: "China Banking", psei: 2.29, fmetf: 2.29 },
  { ticker: "JFC", name: "Jollibee Foods", psei: 2.07, fmetf: 2.14 },
  { ticker: "JGS", name: "JG Summit", psei: 1.76, fmetf: 1.78 },
  { ticker: "RCR", name: "RL Commercial REIT", psei: 1.76, fmetf: 1.77 },
  { ticker: "EMI", name: "Emperador", psei: 1.69, fmetf: 1.67 },
  { ticker: "AREIT", name: "AREIT", psei: 1.58, fmetf: 1.5 },
  { ticker: "URC", name: "Universal Robina", psei: 1.49, fmetf: 1.5 },
  { ticker: "GLO", name: "Globe Telecom", psei: 1.41, fmetf: 1.57 },
  { ticker: "MONDE", name: "Monde Nissin", psei: 1.37, fmetf: 1.35 },
  { ticker: "LTG", name: "LT Group", psei: 1.21, fmetf: 1.22 },
  { ticker: "GTCAP", name: "GT Capital", psei: 1.16, fmetf: 1.3 },
  { ticker: "PGOLD", name: "Puregold", psei: 1.13, fmetf: 1.2 },
  { ticker: "CNPF", name: "Century Pacific Food", psei: 1.11, fmetf: 0.98 },
  { ticker: "MYNLD", name: "Maynilad Water", psei: 1.04, fmetf: 1.03 },
  { ticker: "SMC", name: "San Miguel", psei: 0.89, fmetf: 0.88 },
  { ticker: "DMC", name: "DMCI Holdings", psei: 0.78, fmetf: 0.8 },
  { ticker: "ACEN", name: "ACEN", psei: 0.68, fmetf: 0.78 },
  { ticker: "PLUS", name: "DigiPlus Interactive", psei: 0.56, fmetf: 0.53 },
  { ticker: "SCC", name: "Semirara Mining and Power", psei: 0.48, fmetf: 0.5 },
];

/** @deprecated Use PSEI_WEIGHTS — kept so older imports keep working. */
export const FMETF_WEIGHTS = PSEI_WEIGHTS;

const NAME_TICKER: [RegExp, string][] = [
  [/INTERNATIONAL CONTAINER/, "ICT"],
  [/SM INVESTMENTS/, "SM"],
  [/SM PRIME/, "SMPH"],
  [/BDO UNIBANK/, "BDO"],
  [/BANK OF THE PHILIPPINE/, "BPI"],
  [/AYALA CORPORATION/, "AC"],
  [/AYALA LAND/, "ALI"],
  [/MANILA ELECTRIC/, "MER"],
  [/METROPOLITAN BANK/, "MBT"],
  [/ABOITIZ EQUITY/, "AEV"],
  [/PHILIPPINE LONG DISTANCE|\bPLDT\b/, "TEL"],
  [/CHINA BANKING/, "CBC"],
  [/JOLLIBEE/, "JFC"],
  [/JG SUMMIT/, "JGS"],
  [/RL COMMERCIAL/, "RCR"],
  [/EMPERADOR/, "EMI"],
  [/\bAREIT\b/, "AREIT"],
  [/UNIVERSAL ROBINA/, "URC"],
  [/GLOBE TELECOM/, "GLO"],
  [/MONDE NISSIN/, "MONDE"],
  [/LT GROUP/, "LTG"],
  [/GT CAPITAL/, "GTCAP"],
  [/PUREGOLD/, "PGOLD"],
  [/CENTURY PACIFIC/, "CNPF"],
  [/MAYNILAD/, "MYNLD"],
  [/SAN MIGUEL/, "SMC"],
  [/\bDMCI\b/, "DMC"],
  [/\bACEN\b/, "ACEN"],
  [/DIGIPLUS/, "PLUS"],
  [/SEMIRARA/, "SCC"],
];

export function tickerFromSecurityName(name: string) {
  const u = name.toUpperCase();
  for (const [re, ticker] of NAME_TICKER) {
    if (re.test(u)) return ticker;
  }
  return null;
}

export function parsePseiWeightTable(html: string): PseiWeightFile | null {
  const asOfMatch = html.match(/as of\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const asOf = asOfMatch
    ? `${asOfMatch[3]}-${asOfMatch[1]!.padStart(2, "0")}-${asOfMatch[2]!.padStart(2, "0")}`
    : PSEI_WEIGHT_AS_OF;
  const rows: PseiWeight[] = [];
  const re = /<tr>\s*<td>([^<]+)<\/td>\s*<td>([0-9.]+)<\/td>\s*<td>([0-9.]+)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const ticker = tickerFromSecurityName(m[1]!.trim());
    const psei = Number(m[2]);
    const fmetf = Number(m[3]);
    if (!ticker || !Number.isFinite(psei) || !Number.isFinite(fmetf)) continue;
    if (rows.some((r) => r.ticker === ticker)) continue;
    rows.push({ ticker, name: m[1]!.trim(), psei, fmetf });
  }
  if (rows.length < 25) return null;
  rows.sort((a, b) => b.psei - a.psei);
  return { asOf, rows, source: "live" };
}

export function sleeveWeight(tickers: readonly string[], rows: PseiWeight[] = PSEI_WEIGHTS) {
  const set = new Set(tickers);
  return rows.filter((w) => set.has(w.ticker)).reduce((sum, w) => sum + w.psei, 0);
}

export function nameWeight(ticker: string, rows: PseiWeight[] = PSEI_WEIGHTS) {
  const u = ticker.replace(/^\^/, "").replace(/\.PS$/i, "").trim().toUpperCase();
  return rows.find((w) => w.ticker === u)?.psei;
}

export function topWeights(n = 5, rows: PseiWeight[] = PSEI_WEIGHTS) {
  return [...rows].sort((a, b) => b.psei - a.psei).slice(0, n);
}

export function concentration(rows: PseiWeight[] = PSEI_WEIGHTS) {
  const sorted = [...rows].sort((a, b) => b.psei - a.psei);
  const ict = sorted.find((w) => w.ticker === "ICT")?.psei ?? sorted[0]?.psei ?? 0;
  const top5 = topWeights(5, sorted).reduce((sum, w) => sum + w.psei, 0);
  const sm = sleeveWeight(["SM", "SMPH"], rows);
  const banks = sleeveWeight(["BDO", "BPI", "MBT", "CBC"], rows);
  const ayala = sleeveWeight(["AC", "ALI", "GLO", "AREIT"], rows);
  return { ict, top5, sm, banks, ayala };
}

/** CFA-style take for the Expert card — methodology, not a price target. */
export function weightTake(rows: PseiWeight[] = PSEI_WEIGHTS, asOf = PSEI_WEIGHT_AS_OF) {
  const c = concentration(rows);
  const date = asOf.replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, mo, d) => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${Number(d)} ${months[Number(mo) - 1]} ${y}`;
  });
  return [
    `Free-float market-cap of 30 names: ${PSEI_FORMULA}. Official PSEi weights as of ${date} (First Metro public file of the index weights — not the fund).`,
    `ICT is ${c.ict.toFixed(2)}% of the index. That is single-name concentration a classic 15% cap no longer fully contains.`,
    `Top five (ICT, SM, BDO, BPI, SMPH) are ${c.top5.toFixed(1)}%. SM group ${c.sm.toFixed(1)}%. Banks (BDO, BPI, MBT, CBC) ${c.banks.toFixed(1)}%. Ayala (AC, ALI, GLO, AREIT) ${c.ayala.toFixed(1)}%.`,
    `Feb 2027 CN-2026-0033: MTAR 15% to enter / 10% to stay, 98% cumulative cap filter, 15% free-float exception for PHP 250B+ names.`,
    `Yahoo prints the index last. It does not publish a PE on PSE names. This is methodology, not a target.`,
  ];
}

export const fetchPseiWeights = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async (): Promise<PseiWeightFile> => {
  try {
    const html = await httpText(PSEI_WEIGHT_URL);
    const parsed = parsePseiWeightTable(html);
    if (parsed && parsed.rows.length >= 25) return parsed;
  } catch {
    /* seed */
  }
  return { asOf: PSEI_WEIGHT_AS_OF, rows: PSEI_WEIGHTS, source: "seed" };
});
