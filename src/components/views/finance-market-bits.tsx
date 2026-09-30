"use client";

import { Switch } from "@/components/ui/switch";
import { asDeskItem, deskMarket } from "@/lib/desk-market";
import { phpQuote, vol } from "@/lib/format";
import { turnover, type BoardRow } from "@/lib/market-board";
import type { MarketQuote } from "@/lib/prices";
import { DESK_REGIONS } from "@/lib/region";
import { SPARK_RANGES, normalizeSparkRange, sessionSpark, tapeSpark } from "@/lib/sparks";
import { WATCH_CATALOG, type WatchItem } from "@/lib/types";

export function usdPerFromFx(fx?: { usdphp?: number; per?: Record<string, number> } | null) {
  const usdphp = fx?.usdphp;
  if (!usdphp) return undefined;
  const out: Record<string, number> = { USD: 1, PHP: 1 / usdphp };
  for (const [code, php] of Object.entries(fx.per ?? {})) {
    if (php > 0) out[code.toUpperCase()] = php / usdphp;
  }
  return out;
}

export const FX_UNITS = ["USD", "EUR", "JPY", "GBP", "PHP"] as const;

export function fxToPhp(unit: (typeof FX_UNITS)[number], fx: { usdphp: number; eurphp: number; jpyphp: number; gbpphp: number }) {
  if (unit === "PHP") return 1;
  if (unit === "USD") return fx.usdphp;
  if (unit === "EUR") return fx.eurphp;
  if (unit === "JPY") return fx.jpyphp;
  return fx.gbpphp;
}

export function asItem(q: MarketQuote, kind: WatchItem["kind"]): WatchItem {
  const catalog = WATCH_CATALOG.find((w) => w.symbol === q.id || (kind === "stock" && w.symbol === q.label));
  if (catalog) return catalog;
  const seed = DESK_REGIONS.flatMap((r) => deskMarket(r.id).names).find((n) => n.symbol === q.id);
  if (seed) return asDeskItem(seed);
  return {
    id: kind === "stock" ? `pse-${q.id}` : q.id,
    symbol: q.id,
    label: q.label,
    name: q.name,
    kind,
  };
}

export function volLabel(q?: { kind: string; volume?: number; php?: number; price: number; ccy: string }) {
  if (!q) return "";
  const n = turnover(q);
  if (!n) return "";
  if (q.kind === "stock") return `Vol ${phpQuote(n)}`;
  return `Vol ${vol(n)}`;
}

export function parseNum(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function sparkOf(
  item: WatchItem,
  q: BoardRow["q"],
  range: ReturnType<typeof normalizeSparkRange>,
  remote: Record<string, number[]>,
) {
  const hit = remote[item.id] ?? remote[item.symbol];
  if (hit && hit.length >= 4) return hit;
  const days = SPARK_RANGES.find((r) => r.id === range)?.days ?? 90;
  const tape = tapeSpark(item.symbol, days) ?? tapeSpark(item.id, days);
  if (tape && tape.length >= 3) return tape;
  if ((item.kind === "crypto" || item.kind === "global" || item.kind === "cmdty") && q?.spark && q.spark.length >= 8 && (range === "1w" || range === "1d")) {
    return q.spark;
  }
  if (!q?.price || q.price <= 0) return undefined;
  return sessionSpark(q.price, q.change, item.symbol);
}

export function PrefSwitch({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
