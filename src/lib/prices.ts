import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { QuoteCcy } from "./types";

export type PriceMap = Record<string, { php: number; php_24h_change?: number }>;
export type PriceResult = { failed?: boolean; quotes: PriceMap };

const FETCH_MS = 3_500;

export const fetchPrices = createServerFn({ method: "POST" })
  .validator(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ data }): Promise<PriceResult> => {
    if (!data.ids.length) return { quotes: {} };
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${data.ids.join(",")}&vs_currencies=php&include_24hr_change=true`,
        {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(FETCH_MS),
        },
      );
      if (!res.ok) return { failed: true, quotes: {} };
      return { quotes: (await res.json()) as PriceMap };
    } catch {
      return { failed: true, quotes: {} };
    }
  });

export type MarketQuote = {
  id: string;
  label: string;
  price: number;
  change?: number;
  kind: "crypto" | "fx" | "stock";
  name?: string;
  volume?: number;
  ccy: QuoteCcy;
};

export type MarketSnapshot = {
  failed?: boolean;
  fx: { usdphp: number; eurphp: number; jpyphp: number; gbpphp: number };
  movers: { gainers: MarketQuote[]; losers: MarketQuote[]; active: MarketQuote[] };
  quotes: Record<string, MarketQuote>;
  asOf?: string;
  vs: QuoteCcy;
};

type GeckoRow = {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
};

const VS = z.enum(["php", "usd", "eur", "gbp", "jpy"]);
type Vs = z.infer<typeof VS>;

export const VS_PARAM = {
  PHP: "php",
  USD: "usd",
  EUR: "eur",
  GBP: "gbp",
  JPY: "jpy",
} as const satisfies Record<QuoteCcy, Vs>;

function asCcy(vs: Vs): QuoteCcy {
  return vs.toUpperCase() as QuoteCcy;
}

function fxQuote(id: string, label: string, price: number): MarketQuote {
  return { id, label, price, kind: "fx", ccy: "PHP" };
}

function phpPer(vs: Vs, fx: MarketSnapshot["fx"]) {
  if (vs === "php") return 1;
  if (vs === "usd") return fx.usdphp;
  if (vs === "eur") return fx.eurphp;
  if (vs === "jpy") return fx.jpyphp;
  return fx.gbpphp;
}

function fromPhp(php: number, vs: Vs, fx: MarketSnapshot["fx"] | null): { price: number; ccy: QuoteCcy } {
  if (!fx || vs === "php") return { price: php, ccy: "PHP" };
  const per = phpPer(vs, fx);
  if (!per) return { price: php, ccy: "PHP" };
  return { price: php / per, ccy: asCcy(vs) };
}

async function loadFx(): Promise<MarketSnapshot["fx"] | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const php = json.rates?.PHP;
    const eur = json.rates?.EUR;
    const jpy = json.rates?.JPY;
    const gbp = json.rates?.GBP;
    if (!php) return null;
    return {
      usdphp: php,
      eurphp: eur ? php / eur : php,
      jpyphp: jpy ? php / jpy : 0,
      gbpphp: gbp ? php / gbp : 0,
    };
  } catch {
    return null;
  }
}

const GECKO_TICKER: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  ripple: "XRP",
};

async function geckoSimple(ids: string[], vs: Vs): Promise<GeckoRow[]> {
  if (!ids.length) return [];
  try {
    const extra = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${[...new Set(ids)].join(",")}&vs_currencies=${vs}&include_24hr_change=true`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(FETCH_MS) },
    );
    if (!extra.ok) return [];
    const map = (await extra.json()) as Record<string, Record<string, number>>;
    const changeKey = `${vs}_24h_change`;
    return Object.entries(map).flatMap(([id, q]) =>
      q && q[vs] != null
        ? [
            {
              id,
              symbol: GECKO_TICKER[id] ?? id.slice(0, 4),
              name: id,
              current_price: q[vs],
              price_change_percentage_24h: q[changeKey] ?? 0,
            },
          ]
        : [],
    );
  } catch {
    return [];
  }
}

let geckoCache: { key: string; exp: number; rows: GeckoRow[] } | null = null;

async function loadGecko(ids: string[], vs: Vs): Promise<GeckoRow[]> {
  const key = `${vs}|${ids.toSorted().join(",")}`;
  if (geckoCache && geckoCache.key === key && geckoCache.exp > Date.now()) return geckoCache.rows;
  const rows = await geckoSimple(ids, vs);
  geckoCache = { key, rows, exp: Date.now() + 45_000 };
  return rows;
}

type PseRow = {
  name?: string;
  symbol?: string;
  volume?: number;
  percentChange?: number | null;
  price?: { amount?: number } | number;
};

const PSE_URLS = [
  "https://phisix-api2.appspot.com/stocks.json",
  "https://phisix-api3.appspot.com/stocks.json",
];

const PSE_FRESH_MS = 5 * 60_000;
const PSE_STALE_MS = 12 * 60 * 60_000;

type PseTape = { rows: MarketQuote[]; asOf?: string; etag?: string; exp: number; staleExp: number };

const g = globalThis as typeof globalThis & {
  __atriumPse?: PseTape;
  __atriumPseInflight?: Promise<{ rows: MarketQuote[]; asOf?: string }>;
  __atriumMarkets?: { key: string; exp: number; staleExp: number; data: MarketSnapshot };
};

function parsePse(json: { stocks?: PseRow[]; stock?: PseRow[]; as_of?: string }): {
  rows: MarketQuote[];
  asOf?: string;
} {
  const list = json.stocks ?? json.stock ?? [];
  const rows = list.flatMap((row) => {
    const symbol = String(row.symbol ?? "").toUpperCase();
    const amount = typeof row.price === "number" ? row.price : row.price?.amount;
    if (!symbol || amount == null || !Number.isFinite(Number(amount))) return [];
    const change = row.percentChange;
    const q: MarketQuote = {
      id: symbol,
      label: symbol,
      name: row.name,
      price: Number(amount),
      change: change == null ? undefined : Number(change),
      volume: Number(row.volume) || 0,
      kind: "stock",
      ccy: "PHP",
    };
    return [q];
  });
  return { rows, asOf: json.as_of };
}

async function fetchPse(url: string): Promise<{ rows: MarketQuote[]; asOf?: string; etag?: string }> {
  const headers: Record<string, string> = { accept: "application/json" };
  const prev = g.__atriumPse;
  if (prev?.etag) headers["if-none-match"] = prev.etag;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_MS) });
  if (res.status === 304 && prev?.rows.length) {
    return { rows: prev.rows, asOf: prev.asOf, etag: prev.etag };
  }
  if (!res.ok) throw new Error("pse");
  const parsed = parsePse((await res.json()) as { stocks?: PseRow[]; stock?: PseRow[]; as_of?: string });
  if (!parsed.rows.length) throw new Error("empty");
  return { ...parsed, etag: res.headers.get("etag") ?? undefined };
}

function stampPse(hit: { rows: MarketQuote[]; asOf?: string; etag?: string }): PseTape {
  const now = Date.now();
  return { ...hit, exp: now + PSE_FRESH_MS, staleExp: now + PSE_STALE_MS };
}

function refreshPse(): Promise<{ rows: MarketQuote[]; asOf?: string }> {
  if (g.__atriumPseInflight) return g.__atriumPseInflight;
  g.__atriumPseInflight = Promise.any(PSE_URLS.map((url) => fetchPse(url)))
    .then((hit) => {
      g.__atriumPse = stampPse(hit);
      return { rows: hit.rows, asOf: hit.asOf };
    })
    .finally(() => {
      g.__atriumPseInflight = undefined;
    });
  return g.__atriumPseInflight;
}

/** Last-session PSE tape. Fresh for 5 min, served stale for 12h while a refresh runs. */
export async function getPseTape(): Promise<{ rows: MarketQuote[]; asOf?: string }> {
  const now = Date.now();
  const hit = g.__atriumPse;
  if (hit && hit.exp > now && hit.rows.length) return hit;
  if (hit && hit.staleExp > now && hit.rows.length) {
    void refreshPse().catch(() => undefined);
    return hit;
  }
  try {
    return await refreshPse();
  } catch {
    if (hit?.rows.length) return hit;
    return { rows: [] };
  }
}

function assemble(
  vs: Vs,
  fx: MarketSnapshot["fx"] | null,
  gecko: GeckoRow[],
  pse: { rows: MarketQuote[]; asOf?: string },
): MarketSnapshot {
  const quotes: Record<string, MarketQuote> = {};
  if (fx) {
    quotes.USDPHP = fxQuote("USDPHP", "USD/PHP", fx.usdphp);
    quotes.EURPHP = fxQuote("EURPHP", "EUR/PHP", fx.eurphp);
    quotes.JPYPHP = fxQuote("JPYPHP", "JPY/PHP", fx.jpyphp);
    quotes.GBPPHP = fxQuote("GBPPHP", "GBP/PHP", fx.gbpphp);
  }
  const ccy = asCcy(vs);
  const coins: MarketQuote[] = gecko.map((row) => {
    const q: MarketQuote = {
      id: row.id,
      label: row.symbol.toUpperCase(),
      price: row.current_price,
      change: row.price_change_percentage_24h ?? 0,
      kind: "crypto",
      ccy,
    };
    quotes[row.id] = q;
    return q;
  });
  const stocks = pse.rows.map((row) => {
    const converted = fromPhp(row.price, vs, fx);
    const q: MarketQuote = { ...row, price: converted.price, ccy: converted.ccy };
    quotes[row.id] = q;
    return q;
  });
  const withChg = stocks.filter((r) => r.change != null && r.change !== 0);
  const ranked = (withChg.length ? withChg : coins).toSorted((a, b) => (b.change ?? 0) - (a.change ?? 0));
  const active = stocks
    .toSorted((a, b) => b.price * (b.volume ?? 0) - a.price * (a.volume ?? 0))
    .slice(0, 8);
  const failed = !fx && !coins.length && !stocks.length;
  return {
    failed: failed || undefined,
    fx: fx ?? { usdphp: 0, eurphp: 0, jpyphp: 0, gbpphp: 0 },
    movers: {
      gainers: ranked.filter((c) => (c.change ?? 0) > 0).slice(0, 5),
      losers: ranked.filter((c) => (c.change ?? 0) < 0).toReversed().slice(0, 5),
      active,
    },
    quotes,
    asOf: pse.asOf,
    vs: ccy,
  };
}

export const fetchMarkets = createServerFn({ method: "POST" })
  .validator(z.object({ ids: z.array(z.string()).optional(), vs: VS.optional() }))
  .handler(async ({ data }): Promise<MarketSnapshot> => {
    const vs = data.vs ?? "php";
    const geckoIds = (data.ids ?? []).filter((id) => !id.includes("PHP") && id !== "USDPHP" && !/^[A-Z]{1,6}$/.test(id));
    const key = `${vs}|${geckoIds.toSorted().join(",")}`;
    const snap = g.__atriumMarkets;
    if (snap && snap.key === key && snap.exp > Date.now()) return snap.data;
    const [fx, gecko, pse] = await Promise.all([loadFx(), loadGecko(geckoIds, vs), getPseTape()]);
    const snapshot = assemble(vs, fx, gecko, pse);
    if (!snapshot.failed) {
      const hasStocks = Object.values(snapshot.quotes).some((q) => q.kind === "stock");
      g.__atriumMarkets = {
        key,
        data: snapshot,
        exp: Date.now() + (hasStocks ? 20_000 : 4_000),
        staleExp: Date.now() + 10 * 60_000,
      };
      return snapshot;
    }
    if (snap && snap.key === key && snap.staleExp > Date.now()) return snap.data;
    return snapshot;
  });
