import type { BoardSort, BoardTab, WatchItem } from "./types.ts";

export type { BoardSort, BoardTab };

/** Official PSEi 30 — PSE CN-2026-0035, effective 3 Aug 2026. IMI and CNVRG are out; MYNLD is in. */
export const BLUECHIPS = new Set([
  "AC",
  "ACEN",
  "AEV",
  "ALI",
  "AREIT",
  "BDO",
  "BPI",
  "CBC",
  "CNPF",
  "DMC",
  "EMI",
  "GLO",
  "GTCAP",
  "ICT",
  "JFC",
  "JGS",
  "LTG",
  "MBT",
  "MER",
  "MONDE",
  "MYNLD",
  "PGOLD",
  "PLUS",
  "RCR",
  "SCC",
  "SM",
  "SMC",
  "SMPH",
  "TEL",
  "URC",
]);

export const PSEI_NAMES: Record<string, string> = {
  AC: "Ayala Corp",
  ACEN: "ACEN",
  AEV: "Aboitiz Equity",
  ALI: "Ayala Land",
  AREIT: "AREIT",
  BDO: "BDO Unibank",
  BPI: "Bank of the PH Islands",
  CBC: "China Bank",
  CNPF: "Century Pacific",
  DMC: "DMCI Holdings",
  EMI: "Emperador",
  GLO: "Globe",
  GTCAP: "GT Capital",
  ICT: "ICTSI",
  JFC: "Jollibee",
  JGS: "JG Summit",
  LTG: "LT Group",
  MBT: "Metrobank",
  MER: "Meralco",
  MONDE: "Monde Nissin",
  MYNLD: "Maynilad",
  PGOLD: "Puregold",
  PLUS: "DigiPlus",
  RCR: "RL Commercial REIT",
  SCC: "Semirara",
  SM: "SM Investments",
  SMC: "San Miguel",
  SMPH: "SM Prime",
  TEL: "PLDT",
  URC: "Universal Robina",
};

export const REITS = new Set([
  "AREIT",
  "RCR",
  "MREIT",
  "FILRT",
  "PREIT",
  "DDMP",
  "CREIT",
  "VREIT",
  "SRET",
  "KEEPR",
]);

export const DIVIDENDS = new Set([
  "TEL",
  "MER",
  "DMC",
  "SCC",
  "GLO",
  "URC",
  "PGOLD",
  "LTG",
  "AEV",
  "SMC",
  "BDO",
  "BPI",
  "MBT",
  "CBC",
  "PLUS",
  "CNPF",
]);

export const BINANCE_PAIRS: Record<string, { gecko: string; ticker: string; name: string }> = {
  BTCUSDT: { gecko: "bitcoin", ticker: "BTC", name: "Bitcoin" },
  ETHUSDT: { gecko: "ethereum", ticker: "ETH", name: "Ethereum" },
  SOLUSDT: { gecko: "solana", ticker: "SOL", name: "Solana" },
  XRPUSDT: { gecko: "ripple", ticker: "XRP", name: "XRP" },
};

export const DEFAULT_GECKO_IDS = Object.values(BINANCE_PAIRS).map((p) => p.gecko);

export const BOARD_TABS: { id: BoardTab; label: string }[] = [
  { id: "watcher", label: "Watcher" },
  { id: "starred", label: "Starred" },
  { id: "all", label: "All" },
  { id: "blue", label: "Bluechips" },
  { id: "reit", label: "REITs" },
  { id: "div", label: "Dividends" },
  { id: "crypto", label: "Crypto" },
  { id: "fx", label: "FX" },
];

export const BOARD_SORTS: { id: BoardSort; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "chg", label: "Change" },
  { id: "vol", label: "Volume" },
  { id: "last", label: "Last" },
];

export type TapeQuote = {
  id?: string;
  label?: string;
  price: number;
  change?: number;
  kind: "crypto" | "fx" | "stock";
  ccy: string;
  php?: number;
  usd?: number;
  spark?: number[];
  volume?: number;
  name?: string;
  high?: number;
  low?: number;
};

export type BoardRow = {
  key: string;
  item: WatchItem;
  q?: TapeQuote;
  watching: boolean;
};

export function inSleeve(set: Set<string>, ...ids: Array<string | undefined | null>) {
  for (const raw of ids) {
    if (!raw) continue;
    const u = raw.toUpperCase();
    if (set.has(u)) return true;
    const stripped = u.replace(/^PSE-/, "");
    if (set.has(stripped)) return true;
  }
  return false;
}

export function sparkFromMove(price: number, change?: number): number[] | undefined {
  if (!Number.isFinite(price) || price <= 0 || change == null || !Number.isFinite(change)) return undefined;
  const prev = price / (1 + change / 100);
  if (!Number.isFinite(prev) || prev <= 0) return undefined;
  return [prev, price];
}

export function downsample(values: number[], n: number): number[] {
  if (values.length <= n) return values;
  if (n <= 1) return [values[values.length - 1] ?? 0];
  const step = (values.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => values[Math.round(i * step)] ?? 0);
}

export function matchQuery(q: string, item: { label: string; symbol: string; name?: string }) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return `${item.label} ${item.symbol} ${item.name ?? ""}`.toLowerCase().includes(needle);
}

export function pairLabel(
  item: { kind: string; label: string },
  q?: { ccy?: string } | null,
  cryptoUsdt?: boolean,
) {
  if (item.kind === "crypto") {
    if (cryptoUsdt) return `${item.label} / USDT`;
    return `${item.label} / ${q?.ccy ?? "PHP"}`;
  }
  return item.label;
}

export function positionValue(qty?: number, php?: number) {
  if (qty == null || php == null || !Number.isFinite(qty) || !Number.isFinite(php)) return 0;
  return qty * php;
}

export function positionPnl(qty?: number, php?: number, avg?: number) {
  if (qty == null || php == null || avg == null) return undefined;
  if (![qty, php, avg].every(Number.isFinite)) return undefined;
  return qty * (php - avg);
}

export function turnover(q?: {
  price?: number;
  php?: number;
  volume?: number;
  kind?: string;
  ccy?: string;
}) {
  if (!q) return 0;
  const vol = q.volume ?? 0;
  if (q.kind === "stock") return (q.php ?? q.price ?? 0) * vol;
  return vol;
}

export function displayLast(
  q?: { kind: string; price: number; ccy: string; php?: number; usd?: number } | null,
  opts?: { cryptoUsdt?: boolean },
) {
  if (!q) return undefined;
  if (q.kind === "crypto" && opts?.cryptoUsdt && q.usd != null) {
    return { price: q.usd, ccy: "USD" as const, php: q.php };
  }
  return { price: q.price, ccy: q.ccy, php: q.php };
}

export function normalizeTab(raw?: string): BoardTab {
  if (raw === "pse") return "all";
  if (
    raw === "all" ||
    raw === "watcher" ||
    raw === "starred" ||
    raw === "blue" ||
    raw === "reit" ||
    raw === "div" ||
    raw === "crypto" ||
    raw === "fx"
  ) {
    return raw;
  }
  return "watcher";
}

export function normalizeSort(raw?: string): BoardSort {
  if (raw === "name" || raw === "chg" || raw === "vol" || raw === "last") return raw;
  return "chg";
}

export function sortRows(
  rows: BoardRow[],
  sort: BoardSort,
  dir: 1 | -1,
  opts?: { cryptoUsdt?: boolean },
): BoardRow[] {
  const lastOf = (r: BoardRow) => {
    if (opts?.cryptoUsdt && r.q?.kind === "crypto" && r.q.usd != null) return r.q.usd;
    return r.q?.price ?? -Infinity;
  };
  return rows.slice().toSorted((a, b) => {
    if (sort === "name") return a.item.label.localeCompare(b.item.label) * dir;
    if (sort === "chg") return ((a.q?.change ?? -Infinity) - (b.q?.change ?? -Infinity)) * dir;
    if (sort === "vol") return (turnover(a.q) - turnover(b.q)) * dir;
    return (lastOf(a) - lastOf(b)) * dir;
  });
}

function asStock(ticker: string, name?: string, catalog?: WatchItem): WatchItem {
  return (
    catalog ?? {
      id: `pse-${ticker.toLowerCase()}`,
      symbol: ticker,
      label: ticker,
      name: name ?? PSEI_NAMES[ticker],
      kind: "stock",
    }
  );
}

/** All / Bluechips / REITs / Dividends. Bluechips is the official PSEi 30 — IMI is never included. */
export function stockBoardRows(
  tab: BoardTab,
  quotes: Record<string, TapeQuote>,
  catalog: WatchItem[],
  isWatching: (item: WatchItem) => boolean,
  liveBlue?: Set<string>,
): BoardRow[] {
  if (tab !== "all" && tab !== "blue" && tab !== "reit" && tab !== "div") return [];
  const blue = liveBlue && liveBlue.size >= 20 ? liveBlue : BLUECHIPS;
  const sleeve = tab === "blue" ? blue : tab === "reit" ? REITS : tab === "div" ? DIVIDENDS : null;

  const bySym = new Map<string, WatchItem>();
  const add = (item: WatchItem) => {
    if (item.kind !== "stock") return;
    const sym = item.symbol.toUpperCase();
    if (sleeve && !sleeve.has(sym)) return;
    if (!bySym.has(sym)) bySym.set(sym, { ...item, symbol: sym, label: item.label || sym });
  };

  for (const c of catalog) add(c);
  for (const q of Object.values(quotes)) {
    if (q.kind !== "stock") continue;
    const sym = String(q.id ?? q.label ?? "").toUpperCase();
    if (!sym) continue;
    add(
      asStock(sym, q.name, catalog.find((c) => c.symbol.toUpperCase() === sym && c.kind === "stock")),
    );
  }
  if (sleeve) {
    for (const ticker of sleeve) {
      if (bySym.has(ticker)) continue;
      const hit = catalog.find((c) => c.symbol.toUpperCase() === ticker && c.kind === "stock");
      bySym.set(ticker, asStock(ticker, PSEI_NAMES[ticker], hit));
    }
  }

  return [...bySym.values()].map((item) => ({
    key: item.id,
    item,
    q: quotes[item.symbol],
    watching: isWatching(item),
  }));
}
