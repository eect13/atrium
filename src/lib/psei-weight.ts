/** PSEi free-float methodology + FMETF 16 Sep 2026 illustrative weights.
 *  FMETF is the liquid proxy for the 30, not the official index file. */

export const PSEI_WEIGHT_AS_OF = "2026-09-16";
export const PSEI_FORMULA = "Σ(P × S × F) / Divisor";

export type PseiWeight = { ticker: string; name: string; psei: number; fmetf: number };

/** Official First Metro underlying table, 16 Sep 2026 — PSEi weight + FMETF weight. */
export const FMETF_WEIGHTS: PseiWeight[] = [
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

export function sleeveWeight(tickers: readonly string[]) {
  const set = new Set(tickers);
  return FMETF_WEIGHTS.filter((w) => set.has(w.ticker)).reduce((sum, w) => sum + w.psei, 0);
}

export function topWeights(n = 5) {
  return FMETF_WEIGHTS.slice(0, n);
}

export function concentration() {
  const ict = FMETF_WEIGHTS[0]?.psei ?? 0;
  const top5 = topWeights(5).reduce((sum, w) => sum + w.psei, 0);
  const sm = sleeveWeight(["SM", "SMPH"]);
  const banks = sleeveWeight(["BDO", "BPI", "MBT", "CBC"]);
  const ayala = sleeveWeight(["AC", "ALI", "GLO", "AREIT"]);
  return { ict, top5, sm, banks, ayala };
}

/** CFA-style take for the Expert card — methodology, not a price target. */
export function weightTake() {
  const c = concentration();
  return [
    `Free-float market-cap of 30 names: ${PSEI_FORMULA}. FMETF as of 16 Sep 2026 is the liquid proxy — not the official index file.`,
    `ICT is ${c.ict.toFixed(2)}% of the index. That is single-name concentration a classic 15% cap no longer fully contains.`,
    `Top five (ICT, SM, BDO, BPI, SMPH) are ${c.top5.toFixed(1)}%. SM group ${c.sm.toFixed(1)}%. Banks (BDO, BPI, MBT, CBC) ${c.banks.toFixed(1)}%. Ayala (AC, ALI, GLO, AREIT) ${c.ayala.toFixed(1)}%.`,
    `Feb 2027 CN-2026-0033: MTAR 15% to enter / 10% to stay, 98% cumulative cap filter, 15% free-float exception for PHP 250B+ names.`,
    `Yahoo prints the index last. It does not publish a PE on PSE names. This is methodology, not a target.`,
  ];
}
