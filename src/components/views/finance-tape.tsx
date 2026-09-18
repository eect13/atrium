"use client";

import { ChangePill } from "@/components/spark";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { moneyQuote } from "@/lib/format";
import { BANK_ORDER, BLUECHIPS, peerTickers, type BoardRow } from "@/lib/market-board";
import { nameWeight } from "@/lib/psei-weight";
import type { MarketQuote } from "@/lib/prices";
import { seededStats } from "@/lib/pse-fundamentals";
import { cn } from "@/lib/utils";

function heatTone(change?: number) {
  if (change == null || !Number.isFinite(change) || change === 0) return "bg-muted text-muted-foreground";
  if (change >= 2) return "bg-ok/25 text-ok";
  if (change > 0) return "bg-ok/15 text-ok";
  if (change <= -2) return "bg-destructive/25 text-destructive";
  return "bg-destructive/15 text-destructive";
}

export function PseHeatmap({
  rows,
  onOpen,
}: {
  rows: BoardRow[];
  onOpen: (row: BoardRow) => void;
}) {
  const ordered = rows
    .filter((r) => BLUECHIPS.has(r.item.label) || BLUECHIPS.has(r.item.symbol))
    .toSorted((a, b) => (nameWeight(b.item.symbol) ?? nameWeight(b.item.label) ?? 0) - (nameWeight(a.item.symbol) ?? nameWeight(a.item.label) ?? 0));
  if (ordered.length < 10) return null;
  const up = ordered.filter((r) => (r.q?.change ?? 0) > 0).length;
  const down = ordered.filter((r) => (r.q?.change ?? 0) < 0).length;
  const flat = ordered.length - up - down;
  return (
    <Card className="mb-4">
      <CardHeader className="space-y-0">
        <CardTitle>Heat</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          PSEi 30 by weight. Color is session change — not a broker book. {up} up · {down} down
          {flat ? ` · ${flat} unchanged` : ""}.
        </p>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-5">
        <div className="grid grid-cols-5 gap-1 sm:grid-cols-6">
          {ordered.map((r) => {
            const ch = r.q?.change;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => onOpen(r)}
                className={cn("min-h-11 rounded-md px-1 py-1.5 text-center", heatTone(ch))}
              >
                <span className="block font-mono text-xs leading-tight">{r.item.label}</span>
                <span className="block text-xs tabular-nums leading-tight">
                  {ch == null ? "—" : `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%`}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function MoversStrip({
  gainers,
  losers,
  active,
  pending,
  onOpen,
  activeLabel = "Active",
}: {
  gainers: MarketQuote[];
  losers: MarketQuote[];
  active: MarketQuote[];
  pending?: boolean;
  onOpen: (q: MarketQuote) => void;
  activeLabel?: string;
}) {
  if (!pending && !gainers.length && !losers.length && !active.length) return null;
  const col = (title: string, rows: MarketQuote[], empty: string) => (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{title}</p>
      {rows.length ? (
        <ul className="mt-1 space-y-0.5">
          {rows.slice(0, 5).map((q) => (
            <li key={q.id}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
                onClick={() => onOpen(q)}
              >
                <span className="font-mono text-sm">{q.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground">{moneyQuote(q.price, q.ccy)}</span>
                  <ChangePill value={q.change} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{pending ? "Waiting on the tape" : empty}</p>
      )}
    </div>
  );
  return (
    <Card className="mb-4">
      <CardHeader className="space-y-0">
        <CardTitle>Movers</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">Session leaders. Delayed, not a level-2 book.</p>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {col("Gainers", gainers, "No gainers on this tape.")}
        {col("Losers", losers, "No losers on this tape.")}
        {col(activeLabel, active, "No turnover yet.")}
      </CardContent>
    </Card>
  );
}

export function PeerStrip({
  ticker,
  quotes,
  onOpen,
}: {
  ticker: string;
  quotes: Record<string, MarketQuote>;
  onOpen: (sym: string) => void;
}) {
  const peers = peerTickers(ticker);
  if (!peers) return null;
  const rows = peers.map((sym) => {
    const q = quotes[sym];
    const seed = seededStats(sym);
    const pe = q?.pe ?? seed?.pe;
    const pb = q?.pb ?? seed?.pb;
    const roe = q?.roe ?? seed?.roe;
    const wt = nameWeight(sym);
    return { sym, q, pe, pb, roe, wt };
  });
  const title = (BANK_ORDER as readonly string[]).includes(ticker) ? "Bank sleeve" : "REIT sleeve";
  return (
    <div className="rounded-lg bg-muted p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">Relative value vs the names already on this desk. Not a target.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-80 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-widest text-muted-foreground">
              <th className="py-1 font-medium">Name</th>
              <th className="py-1 font-medium">Last</th>
              <th className="py-1 font-medium">PE</th>
              <th className="py-1 font-medium">P/B</th>
              <th className="py-1 font-medium">ROE</th>
              <th className="py-1 font-medium">Wt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sym} className={cn(r.sym === ticker ? "text-foreground" : "text-muted-foreground")}>
                <td className="py-1">
                  <button type="button" className="min-h-11 font-mono text-left" onClick={() => onOpen(r.sym)}>
                    {r.sym}
                  </button>
                </td>
                <td className="py-1 tabular-nums">{r.q ? moneyQuote(r.q.price, r.q.ccy) : "—"}</td>
                <td className="py-1 tabular-nums">{r.pe && r.pe > 0 ? r.pe.toFixed(1) : "—"}</td>
                <td className="py-1 tabular-nums">{r.pb && r.pb > 0 ? r.pb.toFixed(2) : "—"}</td>
                <td className="py-1 tabular-nums">{r.roe && r.roe > 0 ? `${r.roe.toFixed(1)}%` : "—"}</td>
                <td className="py-1 tabular-nums">{r.wt != null ? `${r.wt.toFixed(2)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
