import type { BoardSort, BoardTab, WatchItem, WatchKind } from "./types.ts";

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

/** Universal banks in the official PSEi 30. CFA bank work is P/B and ROE, not a DCF of FCF. */
export const BANK_TICKERS = new Set(["BDO", "BPI", "MBT", "CBC"]);
export const BINANCE_PAIRS: Record<string, { gecko: string; ticker: string; name: string }> = {
  BTCUSDT: { gecko: "bitcoin", ticker: "BTC", name: "Bitcoin" },
  ETHUSDT: { gecko: "ethereum", ticker: "ETH", name: "Ethereum" },
  SOLUSDT: { gecko: "solana", ticker: "SOL", name: "Solana" },
  XRPUSDT: { gecko: "ripple", ticker: "XRP", name: "XRP" },
};

export const DEFAULT_GECKO_IDS = Object.values(BINANCE_PAIRS).map((p) => p.gecko);

export const PRIMARY_TABS: { id: BoardTab; label: string; short?: string }[] = [
  { id: "watcher", label: "Watcher" },
  { id: "starred", label: "Starred" },
  { id: "all", label: "All" },
  { id: "global", label: "Global" },
  { id: "cmdty", label: "Commodities", short: "Cmdty" },
  { id: "screen", label: "Screener" },
  { id: "crypto", label: "Crypto" },
  { id: "fx", label: "FX" },
];

export const PSE_TABS: { id: BoardTab; label: string }[] = [
  { id: "blue", label: "Bluechips" },
  { id: "reit", label: "REITs" },
  { id: "div", label: "Dividends" },
];

export const BOARD_TABS: { id: BoardTab; label: string; short?: string }[] = [...PRIMARY_TABS, ...PSE_TABS];

export const BOARD_SORTS: { id: BoardSort; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "chg", label: "Change" },
  { id: "vol", label: "Volume" },
  { id: "last", label: "Last" },
];

export const SCREEN_SORTS: { id: BoardSort; label: string }[] = [
  { id: "pe", label: "PE" },
  { id: "cap", label: "Cap" },
];

export type TapeQuote = {
  id?: string;
  label?: string;
  price: number;
  change?: number;
  kind: WatchKind;
  ccy: string;
  php?: number;
  usd?: number;
  spark?: number[];
  volume?: number;
  avgVolume?: number;
  name?: string;
  high?: number;
  low?: number;
  pe?: number;
  marketCap?: number;
  yieldPct?: number;
  forwardPe?: number;
  pb?: number;
  roe?: number;
  weekHigh?: number;
  weekLow?: number;
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

function needleOf(q: string) {
  return q
    .trim()
    .toLowerCase()
    .replace(/^\$/, "")
    .replace(/^pse[:\s-]+/, "");
}

function hayOf(item: { label: string; symbol: string; name?: string; kind?: string }) {
  const extra =
    item.kind === "fx"
      ? "peso forex fx"
      : item.kind === "crypto"
        ? "crypto coin"
        : item.kind === "stock"
          ? "stock pse"
          : item.kind === "global"
            ? "index stock nyse nasdaq global"
            : item.kind === "cmdty"
              ? "commodity gold oil metals"
              : "";
  return `${item.label} ${item.symbol} ${item.name ?? ""} ${item.kind ?? ""} ${extra}`.toLowerCase();
}

export function matchQuery(q: string, item: { label: string; symbol: string; name?: string; kind?: string }) {
  const needle = needleOf(q);
  if (!needle) return true;
  const label = item.label.toLowerCase();
  const symbol = item.symbol.toLowerCase();
  if (label === needle || symbol === needle) return true;
  if (label.startsWith(needle) || symbol.startsWith(needle)) return true;
  const hay = hayOf(item);
  return needle.split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

/** Higher is a closer ticker match. Used so “BDO” is not buried under a 24h sort. */
export function queryScore(q: string, item: { label: string; symbol: string; name?: string; kind?: string }) {
  const needle = needleOf(q);
  if (!needle) return 0;
  const label = item.label.toLowerCase();
  const symbol = item.symbol.toLowerCase();
  const name = (item.name ?? "").toLowerCase();
  const compact = (s: string) => s.replace(/[/\s-]/g, "");
  if (label === needle || symbol === needle) return 100;
  if (compact(label) === compact(needle) || compact(symbol) === compact(needle)) return 95;
  if (label.startsWith(needle) || symbol.startsWith(needle)) return 80;
  if (name === needle) return 70;
  const nameHead = name.split(/[\s/]+/)[0] ?? "";
  if (nameHead === needle) return 62;
  if (name.startsWith(needle)) return 55;
  if (name.includes(needle)) return 40;
  if (matchQuery(needle, item)) return 20;
  return 0;
}

export function rankByQuery<T extends { item: { label: string; symbol: string; name?: string; kind?: string } }>(
  rows: T[],
  q: string,
): T[] {
  const needle = needleOf(q);
  if (!needle) return rows;
  return [...rows].sort((a, b) => queryScore(needle, b.item) - queryScore(needle, a.item));
}

export function findInstrument(
  q: string,
  catalog: Array<{ id: string; label: string; symbol: string; name?: string; kind: WatchItem["kind"] }>,
): WatchItem | undefined {
  const needle = q
    .trim()
    .toLowerCase()
    .replace(/^\$/, "")
    .replace(/^pse[:\s-]+/, "");
  if (needle.length < 2) return undefined;
  const asWatch = (i: (typeof catalog)[number]): WatchItem => ({
    id: i.id,
    symbol: i.symbol,
    label: i.label,
    name: i.name,
    kind: i.kind,
  });
  const exact = catalog.filter(
    (i) => i.label.toLowerCase() === needle || i.symbol.toLowerCase() === needle || i.id.toLowerCase() === needle,
  );
  if (exact.length === 1) return asWatch(exact[0]!);
  if (exact.length > 1) {
    const labeled = exact.find((i) => i.label.toLowerCase() === needle);
    return asWatch(labeled ?? exact[0]!);
  }
  const named = catalog.filter((i) => (i.name ?? "").toLowerCase() === needle);
  if (named.length === 1) return asWatch(named[0]!);
  const starts = catalog.filter(
    (i) => i.label.toLowerCase().startsWith(needle) || (i.name ?? "").toLowerCase().startsWith(needle),
  );
  if (starts.length === 1) return asWatch(starts[0]!);
  const hits = catalog.filter((i) => matchQuery(needle, i));
  if (hits.length === 1) return asWatch(hits[0]!);
  return undefined;
}

export function tabForKind(kind: WatchItem["kind"]): BoardTab {
  if (kind === "crypto") return "crypto";
  if (kind === "fx") return "fx";
  if (kind === "global") return "global";
  if (kind === "cmdty") return "cmdty";
  return "all";
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
    raw === "fx" ||
    raw === "global" ||
    raw === "cmdty" ||
    raw === "screen"
  ) {
    return raw;
  }
  return "watcher";
}

export function normalizeSort(raw?: string): BoardSort {
  if (raw === "name" || raw === "chg" || raw === "vol" || raw === "last" || raw === "pe" || raw === "cap") return raw;
  return "chg";
}

function numSort(a: number | undefined, b: number | undefined, dir: 1 | -1) {
  const am = a == null || !Number.isFinite(a);
  const bm = b == null || !Number.isFinite(b);
  if (am && bm) return 0;
  if (am) return 1;
  if (bm) return -1;
  return (a - b) * dir;
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
    if (sort === "pe") return numSort(a.q?.pe, b.q?.pe, dir);
    if (sort === "cap") return numSort(a.q?.marketCap, b.q?.marketCap, dir);
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

function asQuoted(q: TapeQuote, kind: WatchItem["kind"], catalog: WatchItem[]): WatchItem {
  const id = String(q.id ?? q.label ?? "");
  const hit =
    catalog.find((c) => c.kind === kind && (c.symbol === id || c.label === q.label || c.id === id)) ??
    catalog.find((c) => c.kind === kind && c.symbol.toUpperCase() === id.toUpperCase());
  return (
    hit ?? {
      id: kind === "stock" ? `pse-${id.toLowerCase()}` : id,
      symbol: id,
      label: q.label || id,
      name: q.name,
      kind,
    }
  );
}

export function kindBoardRows(
  kind: WatchKind,
  quotes: Record<string, TapeQuote>,
  catalog: WatchItem[],
  isWatching: (item: WatchItem) => boolean,
): BoardRow[] {
  const byKey = new Map<string, BoardRow>();
  const put = (item: WatchItem, q?: TapeQuote) => {
    const k = item.symbol.toUpperCase();
    if (byKey.has(k)) return;
    byKey.set(k, {
      key: item.id,
      item,
      q: q ?? quotes[item.symbol] ?? quotes[item.id],
      watching: isWatching(item),
    });
  };
  for (const q of Object.values(quotes)) {
    if (q.kind !== kind) continue;
    put(asQuoted(q, kind, catalog), q);
  }
  for (const c of catalog) {
    if (c.kind !== kind) continue;
    put(c);
  }
  return [...byKey.values()];
}

/** Watcher + PSE + crypto + FX + global + commodities — used when the board search has a query. */
export function universeRows(
  quotes: Record<string, TapeQuote>,
  watch: WatchItem[],
  catalog: WatchItem[],
  isWatching: (item: WatchItem) => boolean,
  liveBlue?: Set<string>,
): BoardRow[] {
  const byKey = new Map<string, BoardRow>();
  const put = (r: BoardRow) => {
    const k = `${r.item.kind}:${r.item.symbol.toUpperCase()}`;
    if (!byKey.has(k)) byKey.set(k, r);
  };
  for (const w of watch) {
    put({ key: w.id, item: w, q: quotes[w.symbol] ?? quotes[w.id], watching: true });
  }
  for (const r of stockBoardRows("all", quotes, catalog, isWatching, liveBlue)) put(r);
  for (const kind of ["crypto", "fx", "global", "cmdty"] as const) {
    for (const r of kindBoardRows(kind, quotes, catalog, isWatching)) put(r);
  }
  return [...byKey.values()];
}
