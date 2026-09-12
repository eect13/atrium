import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BINANCE_PAIRS, downsample } from "./market-board.ts";
import { isoDate } from "./format.ts";
import { fetchYahooSpark } from "./yahoo.ts";

export const SPARK_RANGES = [
  { id: "1d", label: "1D", days: 1 },
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
] as const;

export type SparkRange = (typeof SPARK_RANGES)[number]["id"];

export function normalizeSparkRange(raw: string | undefined): SparkRange {
  if (SPARK_RANGES.some((r) => r.id === raw)) return raw as SparkRange;
  return "3m";
}

const TAPE_KEY = "atrium.tape.v1";

type TapePt = { d: string; p: number };
type TapeMap = Record<string, TapePt[]>;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth session path from previous close → last. Stable for a ticker+day so it does not flicker. */
export function sessionSpark(last: number, change?: number, seed = "tape", n = 36): number[] {
  if (!Number.isFinite(last) || last <= 0) return [];
  const ch = Number.isFinite(change) ? (change as number) : 0;
  const prev = last / (1 + ch / 100);
  if (!Number.isFinite(prev) || prev <= 0) return [last];
  const rand = rng(hash(`${seed}:${last.toFixed(4)}:${ch.toFixed(3)}`));
  const band = Math.max(Math.abs(last - prev) * 0.55, last * 0.004);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const bridge = prev + (last - prev) * t;
    const wobble = (rand() - 0.5) * 2 * band * Math.sin(Math.PI * t);
    const bump = Math.sin(t * Math.PI * 2.2) * band * 0.35 * (rand() * 0.6 + 0.4);
    out.push(Math.max(last * 0.5, bridge + wobble + bump));
  }
  out[0] = prev;
  out[n - 1] = last;
  return out;
}

export function pointsToPath(values: number[], w: number, h: number, pad = 1): { line: string; area: string } {
  if (values.length < 2) return { line: "", area: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: h - ((v - min) / span) * (h - pad * 2) - pad,
  }));
  const fmt = (n: number) => n.toFixed(2);
  let line = `M${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`;
  if (pts.length === 2) {
    line += ` L${fmt(pts[1]!.x)} ${fmt(pts[1]!.y)}`;
  } else {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] ?? pts[i]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      line += ` C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
    }
  }
  const area = `${line} L${fmt(w)} ${fmt(h)} L0 ${fmt(h)} Z`;
  return { line, area };
}

export function readTape(): TapeMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(TAPE_KEY) ?? "{}") as TapeMap;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function rememberTape(quotes: Record<string, { id?: string; price: number; kind: string }>) {
  if (typeof localStorage === "undefined") return;
  const day = isoDate();
  const prev = readTape();
  for (const q of Object.values(quotes)) {
    if (q.kind !== "stock" && q.kind !== "fx" && q.kind !== "global" && q.kind !== "cmdty") continue;
    const id = q.id;
    if (!id || !Number.isFinite(q.price) || q.price <= 0) continue;
    const row = [...(prev[id] ?? [])];
    const last = row[row.length - 1];
    if (last?.d === day) last.p = q.price;
    else row.push({ d: day, p: q.price });
    prev[id] = row.slice(-270);
  }
  try {
    localStorage.setItem(TAPE_KEY, JSON.stringify(prev));
  } catch {
    /* quota */
  }
}

export function tapeSpark(id: string, days: number): number[] | undefined {
  const row = readTape()[id];
  if (!row?.length) return undefined;
  const cut = isoDate(new Date(Date.now() - days * 86400000));
  const vals = row.filter((p) => p.d >= cut).map((p) => p.p);
  return vals.length >= 3 ? vals : undefined;
}

const FETCH_MS = 8_000;

const RANGE_BINANCE: Record<SparkRange, { interval: string; limit: number }> = {
  "1d": { interval: "15m", limit: 96 },
  "1w": { interval: "1h", limit: 168 },
  "1m": { interval: "4h", limit: 180 },
  "3m": { interval: "1d", limit: 90 },
  "6m": { interval: "1d", limit: 180 },
  "1y": { interval: "1w", limit: 52 },
};

function daysOf(range: SparkRange) {
  return SPARK_RANGES.find((r) => r.id === range)?.days ?? 90;
}

async function binanceKline(symbol: string, range: SparkRange): Promise<number[]> {
  const spec = RANGE_BINANCE[range];
  const urls = [
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${spec.interval}&limit=${spec.limit}`,
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${spec.interval}&limit=${spec.limit}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
      if (!res.ok) continue;
      const rows = (await res.json()) as Array<[number, string, string, string, string]>;
      if (!Array.isArray(rows) || rows.length < 4) continue;
      const closes = rows.map((r) => Number(r[4])).filter((n) => Number.isFinite(n) && n > 0);
      if (closes.length >= 4) return downsample(closes, 48);
    } catch {
      continue;
    }
  }
  return [];
}

async function frankfurterSpark(from: string, range: SparkRange): Promise<number[]> {
  const days = daysOf(range);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const a = start.toISOString().slice(0, 10);
  const b = end.toISOString().slice(0, 10);
  try {
    const res = await fetch(`https://api.frankfurter.app/${a}..${b}?from=${from}&to=PHP`, {
      signal: AbortSignal.timeout(FETCH_MS),
      redirect: "follow",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { rates?: Record<string, { PHP?: number }> };
    const vals = Object.keys(json.rates ?? {})
      .toSorted()
      .map((d) => json.rates?.[d]?.PHP)
      .filter((n): n is number => Number.isFinite(n) && (n as number) > 0);
    return vals.length >= 3 ? downsample(vals, 48) : [];
  } catch {
    return [];
  }
}

const g = globalThis as typeof globalThis & {
  __atriumSparks?: { key: string; exp: number; data: Record<string, number[]> };
};

export const fetchSparks = createServerFn({ method: "POST" })
  .validator(
    z.object({
      range: z.enum(["1d", "1w", "1m", "3m", "6m", "1y"]),
      items: z.array(z.object({ id: z.string(), kind: z.enum(["crypto", "fx", "stock", "global", "cmdty"]) })),
    }),
  )
  .handler(async ({ data }): Promise<Record<string, number[]>> => {
    const key = `${data.range}|${data.items.map((i) => i.id).toSorted().join(",")}`;
    const hit = g.__atriumSparks;
    if (hit && hit.key === key && hit.exp > Date.now()) return hit.data;
    const out: Record<string, number[]> = {};
    const geckoToBinance = Object.fromEntries(
      Object.entries(BINANCE_PAIRS).map(([pair, meta]) => [meta.gecko, pair]),
    );
    const jobs: Promise<void>[] = [];
    for (const item of data.items.slice(0, 40)) {
      if (item.kind === "crypto") {
        const pair = geckoToBinance[item.id] ?? (item.id.endsWith("USDT") ? item.id : "");
        if (!pair) continue;
        jobs.push(
          binanceKline(pair, data.range).then((vals) => {
            if (vals.length) out[item.id] = vals;
          }),
        );
      } else if (item.kind === "fx") {
        const from = item.id.replace(/PHP$/, "");
        if (from === "USD" || from === "EUR" || from === "JPY" || from === "GBP") {
          jobs.push(
            frankfurterSpark(from, data.range).then((vals) => {
              if (vals.length) out[item.id] = vals;
            }),
          );
        }
      } else if (item.kind === "global" || item.kind === "cmdty") {
        jobs.push(
          fetchYahooSpark(item.id, data.range).then((vals) => {
            if (vals.length) out[item.id] = vals;
          }),
        );
      }
    }
    await Promise.allSettled(jobs);
    g.__atriumSparks = { key, data: out, exp: Date.now() + 5 * 60_000 };
    return out;
  });
