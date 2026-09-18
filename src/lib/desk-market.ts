/** Home tape for the desk region. Philippines stays the factory PSE board.
 *  Other regions use Yahoo most-actives plus a short liquid seed — not a broker book. */

import { regionOf } from "./region.ts";
import { PSEI_SYMBOL } from "./yahoo.ts";
import type { BoardRow, TapeQuote } from "./market-board.ts";
import type { WatchItem, WatchKind } from "./types.ts";

export const NIFTY_SYMBOL = "^NSEI";

export type DeskName = { symbol: string; name: string; label?: string };

/** World indices the compare picker can take. Home index is the desk region; the other is this list. */
export const WORLD_INDICES: DeskName[] = [
  { symbol: PSEI_SYMBOL, name: "PSEi INDEX", label: "PSEi" },
  { symbol: NIFTY_SYMBOL, name: "Nifty 50", label: "Nifty" },
  { symbol: "^GSPC", name: "S&P 500", label: "S&P 500" },
  { symbol: "^IXIC", name: "Nasdaq Composite", label: "Nasdaq" },
  { symbol: "^DJI", name: "Dow Jones", label: "DJIA" },
  { symbol: "^HSI", name: "Hang Seng", label: "HSI" },
  { symbol: "^N225", name: "Nikkei 225", label: "Nikkei" },
  { symbol: "^FTSE", name: "FTSE 100", label: "FTSE" },
  { symbol: "^GDAXI", name: "DAX", label: "DAX" },
  { symbol: "^FCHI", name: "CAC 40", label: "CAC 40" },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50", label: "SX5E" },
  { symbol: "^AXJO", name: "S&P/ASX 200", label: "ASX 200" },
  { symbol: "^STI", name: "Straits Times", label: "STI" },
  { symbol: "^GSPTSE", name: "S&P/TSX", label: "TSX" },
  { symbol: "^KS11", name: "KOSPI", label: "KOSPI" },
];

export function worldIndex(symbol: string): DeskName {
  return WORLD_INDICES.find((i) => i.symbol === symbol) ?? { symbol, name: symbol, label: symbol.replace(/^\^/, "") };
}

/** Default "other" index for a desk. PH vs Nifty; US vs Nasdaq; rest vs a regional peer or S&P. */
export function comparePeer(regionId?: string | null): string {
  const home = deskMarket(regionId).index.symbol;
  if (home === PSEI_SYMBOL) return NIFTY_SYMBOL;
  if (home === "^GSPC") return "^IXIC";
  if (home === NIFTY_SYMBOL) return "^GSPC";
  if (home === "^HSI") return "^N225";
  if (home === "^N225") return "^HSI";
  if (home === "^FTSE") return "^GDAXI";
  if (home === "^STI") return "^HSI";
  if (home === "^STOXX50E") return "^GSPC";
  return "^GSPC";
}

/** Picked compare index, never the home index. */
export function resolveCompare(regionId?: string | null, picked?: string | null): string {
  const home = deskMarket(regionId).index.symbol;
  const hit = WORLD_INDICES.find((i) => i.symbol === picked);
  if (hit && hit.symbol !== home) return hit.symbol;
  const peer = comparePeer(regionId);
  return peer === home ? "^GSPC" : peer;
}

export type DeskMarket = {
  id: string;
  name: string;
  /** Yahoo chart symbol for the home index. */
  index: DeskName;
  yahooRegion: string;
  newsQuery: string;
  newsLocale: string;
  /** Liquid names so All is not empty if the screener is thin. */
  names: DeskName[];
  /** PSE last still lives on this desk. Other regions are Yahoo. */
  pseHome: boolean;
  tape: string[];
};

const US_NAMES: DeskName[] = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "META", name: "Meta" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "BRK-B", name: "Berkshire Hathaway", label: "BRK.B" },
  { symbol: "JPM", name: "JPMorgan" },
  { symbol: "V", name: "Visa" },
  { symbol: "UNH", name: "UnitedHealth" },
  { symbol: "XOM", name: "Exxon Mobil" },
  { symbol: "LLY", name: "Eli Lilly" },
  { symbol: "AVGO", name: "Broadcom" },
  { symbol: "WMT", name: "Walmart" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
];

const HK_NAMES: DeskName[] = [
  { symbol: "0700.HK", name: "Tencent", label: "0700" },
  { symbol: "9988.HK", name: "Alibaba", label: "9988" },
  { symbol: "3690.HK", name: "Meituan", label: "3690" },
  { symbol: "1299.HK", name: "AIA", label: "1299" },
  { symbol: "0939.HK", name: "CCB", label: "0939" },
  { symbol: "1398.HK", name: "ICBC", label: "1398" },
  { symbol: "0388.HK", name: "HKEX", label: "0388" },
  { symbol: "0005.HK", name: "HSBC", label: "0005" },
  { symbol: "2318.HK", name: "Ping An", label: "2318" },
  { symbol: "1810.HK", name: "Xiaomi", label: "1810" },
  { symbol: "9618.HK", name: "JD.com", label: "9618" },
  { symbol: "0941.HK", name: "China Mobile", label: "0941" },
];

const IN_NAMES: DeskName[] = [
  { symbol: "RELIANCE.NS", name: "Reliance", label: "RIL" },
  { symbol: "TCS.NS", name: "TCS", label: "TCS" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", label: "HDFCB" },
  { symbol: "INFY.NS", name: "Infosys", label: "INFY" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", label: "ICICIB" },
  { symbol: "SBIN.NS", name: "SBI", label: "SBIN" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", label: "BHARTI" },
  { symbol: "ITC.NS", name: "ITC", label: "ITC" },
  { symbol: "LT.NS", name: "Larsen & Toubro", label: "LT" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever", label: "HUL" },
  { symbol: "AXISBANK.NS", name: "Axis Bank", label: "AXIS" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", label: "BAJFIN" },
];

const JP_NAMES: DeskName[] = [
  { symbol: "7203.T", name: "Toyota", label: "7203" },
  { symbol: "6758.T", name: "Sony", label: "6758" },
  { symbol: "9984.T", name: "SoftBank", label: "9984" },
  { symbol: "8306.T", name: "MUFG", label: "8306" },
  { symbol: "6861.T", name: "Keyence", label: "6861" },
  { symbol: "6098.T", name: "Recruit", label: "6098" },
  { symbol: "4063.T", name: "Shin-Etsu", label: "4063" },
  { symbol: "8035.T", name: "Tokyo Electron", label: "8035" },
  { symbol: "9432.T", name: "NTT", label: "9432" },
  { symbol: "7267.T", name: "Honda", label: "7267" },
  { symbol: "7974.T", name: "Nintendo", label: "7974" },
  { symbol: "9983.T", name: "Fast Retailing", label: "9983" },
];

const SG_NAMES: DeskName[] = [
  { symbol: "D05.SI", name: "DBS", label: "D05" },
  { symbol: "O39.SI", name: "OCBC", label: "O39" },
  { symbol: "U11.SI", name: "UOB", label: "U11" },
  { symbol: "Z74.SI", name: "Singtel", label: "Z74" },
  { symbol: "C6L.SI", name: "SIA", label: "C6L" },
  { symbol: "BN4.SI", name: "Keppel", label: "BN4" },
  { symbol: "S63.SI", name: "ST Engineering", label: "S63" },
  { symbol: "C07.SI", name: "Jardine C&C", label: "C07" },
];

const GB_NAMES: DeskName[] = [
  { symbol: "SHEL.L", name: "Shell", label: "SHEL" },
  { symbol: "AZN.L", name: "AstraZeneca", label: "AZN" },
  { symbol: "HSBA.L", name: "HSBC", label: "HSBA" },
  { symbol: "ULVR.L", name: "Unilever", label: "ULVR" },
  { symbol: "BP.L", name: "BP", label: "BP" },
  { symbol: "GSK.L", name: "GSK", label: "GSK" },
  { symbol: "DGE.L", name: "Diageo", label: "DGE" },
  { symbol: "RIO.L", name: "Rio Tinto", label: "RIO" },
  { symbol: "LLOY.L", name: "Lloyds", label: "LLOY" },
  { symbol: "BATS.L", name: "BAT", label: "BATS" },
];

const AU_NAMES: DeskName[] = [
  { symbol: "BHP.AX", name: "BHP", label: "BHP" },
  { symbol: "CBA.AX", name: "Commonwealth Bank", label: "CBA" },
  { symbol: "CSL.AX", name: "CSL", label: "CSL" },
  { symbol: "NAB.AX", name: "NAB", label: "NAB" },
  { symbol: "WBC.AX", name: "Westpac", label: "WBC" },
  { symbol: "ANZ.AX", name: "ANZ", label: "ANZ" },
  { symbol: "WES.AX", name: "Wesfarmers", label: "WES" },
  { symbol: "MQG.AX", name: "Macquarie", label: "MQG" },
];

const CA_NAMES: DeskName[] = [
  { symbol: "RY.TO", name: "RBC", label: "RY" },
  { symbol: "TD.TO", name: "TD", label: "TD" },
  { symbol: "ENB.TO", name: "Enbridge", label: "ENB" },
  { symbol: "SHOP.TO", name: "Shopify", label: "SHOP" },
  { symbol: "CNR.TO", name: "CN Rail", label: "CNR" },
  { symbol: "BMO.TO", name: "BMO", label: "BMO" },
  { symbol: "CNQ.TO", name: "Canadian Natural", label: "CNQ" },
  { symbol: "SU.TO", name: "Suncor", label: "SU" },
];

const EU_NAMES: DeskName[] = [
  { symbol: "ASML", name: "ASML" },
  { symbol: "SAP.DE", name: "SAP", label: "SAP" },
  { symbol: "SIE.DE", name: "Siemens", label: "SIE" },
  { symbol: "ALV.DE", name: "Allianz", label: "ALV" },
  { symbol: "AIR.PA", name: "Airbus", label: "AIR" },
  { symbol: "MC.PA", name: "LVMH", label: "MC" },
  { symbol: "OR.PA", name: "L'Oreal", label: "OR" },
  { symbol: "TTE.PA", name: "TotalEnergies", label: "TTE" },
  { symbol: "SAN.PA", name: "Sanofi", label: "SAN" },
];

const MARKETS: Record<string, Omit<DeskMarket, "id" | "name" | "yahooRegion">> = {
  PH: {
    index: { symbol: PSEI_SYMBOL, name: "PSEi INDEX", label: "PSEi" },
    newsQuery: 'PSEi OR "Philippine Stock Exchange" OR PSE OR "Manila shares"',
    newsLocale: "hl=en-PH&gl=PH&ceid=PH:en",
    names: [],
    pseHome: true,
    tape: [PSEI_SYMBOL, "BDO", "ICT", "SM", "^GSPC", NIFTY_SYMBOL, "GC=F"],
  },
  US: {
    index: { symbol: "^GSPC", name: "S&P 500", label: "S&P 500" },
    newsQuery: '"S&P 500" OR Nasdaq OR "Wall Street" OR "US stocks"',
    newsLocale: "hl=en&gl=US&ceid=US:en",
    names: US_NAMES,
    pseHome: false,
    tape: ["^GSPC", "^IXIC", "AAPL", "NVDA", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  HK: {
    index: { symbol: "^HSI", name: "Hang Seng", label: "HSI" },
    newsQuery: '"Hang Seng" OR HKEX OR "Hong Kong stocks"',
    newsLocale: "hl=en&gl=HK&ceid=HK:en",
    names: HK_NAMES,
    pseHome: false,
    tape: ["^HSI", "0700.HK", "9988.HK", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  IN: {
    index: { symbol: NIFTY_SYMBOL, name: "Nifty 50", label: "Nifty" },
    newsQuery: '"Nifty 50" OR NSE OR "Indian stocks" OR Sensex',
    newsLocale: "hl=en-IN&gl=IN&ceid=IN:en",
    names: IN_NAMES,
    pseHome: false,
    tape: [NIFTY_SYMBOL, "RELIANCE.NS", "TCS.NS", PSEI_SYMBOL, "^GSPC", "GC=F"],
  },
  JP: {
    index: { symbol: "^N225", name: "Nikkei 225", label: "Nikkei" },
    newsQuery: '"Nikkei" OR "Tokyo stocks" OR TSE',
    newsLocale: "hl=en&gl=JP&ceid=JP:en",
    names: JP_NAMES,
    pseHome: false,
    tape: ["^N225", "7203.T", "6758.T", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  SG: {
    index: { symbol: "^STI", name: "Straits Times", label: "STI" },
    newsQuery: '"Straits Times Index" OR "Singapore stocks" OR SGX',
    newsLocale: "hl=en-SG&gl=SG&ceid=SG:en",
    names: SG_NAMES,
    pseHome: false,
    tape: ["^STI", "D05.SI", "O39.SI", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  GB: {
    index: { symbol: "^FTSE", name: "FTSE 100", label: "FTSE" },
    newsQuery: '"FTSE 100" OR "London stocks" OR LSE',
    newsLocale: "hl=en-GB&gl=GB&ceid=GB:en",
    names: GB_NAMES,
    pseHome: false,
    tape: ["^FTSE", "SHEL.L", "AZN.L", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  AU: {
    index: { symbol: "^AXJO", name: "S&P/ASX 200", label: "ASX 200" },
    newsQuery: '"ASX 200" OR "Australian stocks" OR ASX',
    newsLocale: "hl=en-AU&gl=AU&ceid=AU:en",
    names: AU_NAMES,
    pseHome: false,
    tape: ["^AXJO", "BHP.AX", "CBA.AX", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  CA: {
    index: { symbol: "^GSPTSE", name: "S&P/TSX", label: "TSX" },
    newsQuery: '"TSX" OR "Canadian stocks" OR "Toronto stocks"',
    newsLocale: "hl=en-CA&gl=CA&ceid=CA:en",
    names: CA_NAMES,
    pseHome: false,
    tape: ["^GSPTSE", "RY.TO", "SHOP.TO", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  EU: {
    index: { symbol: "^STOXX50E", name: "Euro Stoxx 50", label: "SX5E" },
    newsQuery: '"Euro Stoxx" OR DAX OR "European stocks"',
    newsLocale: "hl=en&gl=DE&ceid=DE:en",
    names: EU_NAMES,
    pseHome: false,
    tape: ["^STOXX50E", "^GDAXI", "ASML", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
};

export function deskMarket(regionId?: string | null): DeskMarket {
  const r = regionOf(regionId);
  const spec = MARKETS[r.id] ?? MARKETS.PH!;
  return {
    id: r.id,
    name: r.name,
    yahooRegion: r.yahoo,
    ...spec,
  };
}

export function deskYahooSymbols(regionId?: string | null): string[] {
  const m = deskMarket(regionId);
  return [...new Set([...WORLD_INDICES.map((n) => n.symbol), m.index.symbol, ...m.tape, ...m.names.map((n) => n.symbol)])];
}

export function asDeskItem(name: DeskName, kind: WatchItem["kind"] = "global"): WatchItem {
  return {
    id: `yh-${name.symbol}`,
    symbol: name.symbol,
    label: name.label ?? name.symbol.replace(/\.[A-Z]{1,2}$/i, ""),
    name: name.name,
    kind,
  };
}

export function homeBoardRows(
  quotes: Record<string, TapeQuote | undefined>,
  live: Array<{
    id: string;
    label: string;
    name?: string;
    kind: WatchKind;
    price: number;
    change?: number;
    ccy: string;
    volume?: number;
    pe?: number;
    marketCap?: number;
    yieldPct?: number;
  }> | undefined,
  market: DeskMarket,
  isWatching: (item: WatchItem) => boolean,
): BoardRow[] {
  if (market.pseHome) return [];
  const seen = new Set<string>();
  const out: BoardRow[] = [];
  const push = (item: WatchItem, q?: TapeQuote) => {
    const key = item.symbol.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key: item.id, item, q: q ?? quotes[item.symbol], watching: isWatching(item) });
  };
  if (live?.length) {
    for (const q of live) {
      if (q.kind === "crypto" || q.kind === "fx") continue;
      if (!isHomeSymbol(q.id, market.id)) continue;
      const seed = market.names.find((n) => n.symbol === q.id);
      push(
        {
          id: q.id,
          symbol: q.id,
          label: seed?.label ?? q.label,
          name: seed?.name ?? q.name,
          kind: q.kind,
        },
        q,
      );
    }
  }
  for (const n of market.names) push(asDeskItem(n), quotes[n.symbol]);
  return out;
}

export function digestUrl(regionId?: string | null, window: "1d" | "7d" = "1d") {
  const m = deskMarket(regionId);
  const q = `${m.newsQuery} when:${window}`.replace(/\s+/g, " ").trim();
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${m.newsLocale}`;
}

/** Yahoo most-actives often ignores region and dumps US names. Keep the home exchange. */
export function isHomeSymbol(symbol: string, regionId?: string | null) {
  const id = (regionId ?? "PH").toUpperCase();
  const s = symbol.trim();
  if (id === "US") return !/\.(HK|NS|BO|T|SI|L|AX|TO|DE|PA)$/i.test(s);
  if (id === "HK") return /\.HK$/i.test(s);
  if (id === "IN") return /\.(NS|BO)$/i.test(s);
  if (id === "JP") return /\.T$/i.test(s);
  if (id === "SG") return /\.SI$/i.test(s);
  if (id === "GB") return /\.L$/i.test(s);
  if (id === "AU") return /\.AX$/i.test(s);
  if (id === "CA") return /\.(TO|V)$/i.test(s);
  if (id === "EU") return /\.(DE|PA)$/i.test(s) || /^(ASML|SAP|SIE)$/i.test(s);
  return true;
}
