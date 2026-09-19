"use client";

import { useState } from "react";
import { ChangePill } from "@/components/spark";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { moneyQuote, relativeDesk } from "@/lib/format";
import { BANK_ORDER, BLUECHIPS, peerTickers, PSEI_NAMES, type BoardRow } from "@/lib/market-board";
import { nameWeight } from "@/lib/psei-weight";
import type { MarketQuote } from "@/lib/prices";
import { seededStats } from "@/lib/pse-fundamentals";
import { cn } from "@/lib/utils";
import { WORLD_INDICES, type DeskName } from "@/lib/desk-market";
import type { DigestDay } from "@/lib/digest";
import type { IndexLink, SleeveMove } from "@/lib/desk-stats";
import { FIELD_SELECT } from "./finance-chip";

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

function lastLine(q?: MarketQuote) {
  if (!q || !Number.isFinite(q.price)) return "—";
  return moneyQuote(q.price, q.ccy);
}

export function IndexCompare({
  home,
  peer,
  homeQuote,
  peerQuote,
  pending,
  onPick,
  onOpen,
  link,
  rangeLabel,
}: {
  home: DeskName;
  peer: DeskName;
  homeQuote?: MarketQuote;
  peerQuote?: MarketQuote;
  pending?: boolean;
  onPick: (symbol: string) => void;
  onOpen: (q: MarketQuote) => void;
  link?: IndexLink;
  rangeLabel?: string;
}) {
  const cell = (q: MarketQuote | undefined, name: DeskName) => (
    <button
      type="button"
      className="min-h-11 w-full rounded-md bg-muted px-3 py-3 text-left"
      onClick={() => q && onOpen(q)}
      disabled={!q}
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{name.label ?? name.symbol}</p>
      <p className="mt-1 font-display text-xl tabular-nums">{pending && !q ? "—" : lastLine(q)}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{name.name}</span>
        <ChangePill value={q?.change} />
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{name.symbol}</p>
    </button>
  );
  const options = WORLD_INDICES.filter((i) => i.symbol !== home.symbol);
  return (
    <Card className="mb-4">
      <CardHeader className="space-y-0">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>
              {home.label ?? home.symbol} vs {peer.label ?? peer.symbol}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Home index is this desk. Pick the other. Two delayed lasts — not a pairs trade.
            </p>
          </div>
          <label className="min-w-40">
            <span className="sr-only">Compare index</span>
            <select
              aria-label="Compare index"
              className={cn(FIELD_SELECT, "h-11 w-full sm:w-44")}
              value={peer.symbol}
              onChange={(e) => onPick(e.target.value)}
            >
              {options.map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.label ?? i.symbol}
                </option>
              ))}
            </select>
          </label>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {cell(homeQuote, home)}
        {cell(peerQuote, peer)}
        {link ? (
          <p className="col-span-full text-xs text-muted-foreground">
            Spark r {link.r.toFixed(2)} · β {link.beta.toFixed(2)} vs {peer.label ?? peer.symbol}
            {rangeLabel ? ` (${rangeLabel}, ${link.n} pts)` : ` · ${link.n} pts`}. Delayed path, not a hedge.
          </p>
        ) : !pending ? (
          <p className="col-span-full text-xs text-muted-foreground">
            Correlation waits on a real spark of both indices — session wobble is not a link.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SleeveRotation({
  rows,
  take,
  pending,
  quotes,
  onOpen,
}: {
  rows: SleeveMove[];
  take?: string;
  pending?: boolean;
  quotes?: Record<string, { change?: number } | undefined>;
  onOpen: (symbol: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (!pending && rows.length < 2) return null;
  return (
    <Card className="mb-4">
      <CardHeader className="space-y-0">
        <CardTitle>Rotation</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          PSEi 30 sleeves. Banks are BDO, BPI, MBT, CBC — not every PSE lender. Open a sleeve for every name. Delayed, not a rotation trade.
        </p>
        {take ? <p className="mt-1 text-xs text-muted-foreground">{take}</p> : null}
      </CardHeader>
      <CardContent className="px-0 pb-2 sm:px-5">
        {pending && !rows.length ? (
          <p className="px-5 text-sm text-muted-foreground">Waiting on the tape</p>
        ) : (
          <ul>
            {rows.map((r) => {
              const ch = r.chg;
              const live = Number.isFinite(ch);
              const up = live && ch >= 0;
              const shown = open === r.id;
              return (
                <li key={r.id} className="border-t border-border">
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-2 text-left"
                    aria-expanded={shown}
                    onClick={() => setOpen(shown ? null : r.id)}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm">{r.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.tickers.join(" · ")}
                        {` · ${r.n} ${r.n === 1 ? "name" : "names"}`}
                        {r.nLive > 0 && r.nLive < r.n ? ` · ${r.nLive} on tape` : ""}
                        {r.wt > r.n + 0.05 ? ` · ${r.wt.toFixed(1)}%` : ""}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums text-sm",
                        !live ? "text-muted-foreground" : up ? "text-ok" : "text-destructive",
                      )}
                    >
                      {live ? `${up ? "+" : ""}${ch.toFixed(2)}%` : "—"}
                    </span>
                  </button>
                  {shown ? (
                    <ul className="px-5 pb-2">
                      {r.tickers.map((t) => {
                        const qch = quotes?.[t]?.change;
                        const qlive = qch != null && Number.isFinite(qch);
                        const qup = qlive && (qch as number) >= 0;
                        return (
                          <li key={t}>
                            <button
                              type="button"
                              className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
                              onClick={() => onOpen(t)}
                            >
                              <span className="min-w-0">
                                <span className="block font-mono text-sm">{t}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {PSEI_NAMES[t] ?? t}
                                </span>
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 tabular-nums text-sm",
                                  !qlive ? "text-muted-foreground" : qup ? "text-ok" : "text-destructive",
                                )}
                              >
                                {qlive ? `${qup ? "+" : ""}${(qch as number).toFixed(2)}%` : "—"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ColliderNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <Card className="mb-4">
      <CardHeader className="space-y-0">
        <CardTitle>Name traps</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Dual listings, group sleeves, and short-ticker mix-ups on this watcher. Not a corporate-action feed.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n} className="text-sm leading-snug">
              {n}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function SessionHeatmap({
  rows,
  market,
  onOpen,
}: {

  rows: BoardRow[];
  market: string;
  onOpen: (row: BoardRow) => void;
}) {
  const ordered = rows
    .filter((r) => r.q && Number.isFinite(r.q.price))
    .toSorted((a, b) => (b.q?.change ?? 0) - (a.q?.change ?? 0))
    .slice(0, 24);
  if (ordered.length < 6) return null;
  const up = ordered.filter((r) => (r.q?.change ?? 0) > 0).length;
  const down = ordered.filter((r) => (r.q?.change ?? 0) < 0).length;
  return (
    <Card className="mb-4">
      <CardHeader className="space-y-0">
        <CardTitle>Heat</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {market} session %. No index weights on this tape. {up} up · {down} down.
        </p>
      </CardHeader>
      <CardContent className="px-3 pb-3 sm:px-5">
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
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

export function DigestCard({
  today,
  history,
  pending,
  market,
}: {
  today?: DigestDay;
  history: DigestDay[];
  pending?: boolean;
  market: string;
}) {
  const days = history.length ? history : today ? [today] : [];
  const [openDay, setOpenDay] = useState<string | null>(null);
  const shown = days.find((d) => d.day === openDay) ?? today ?? days[0];
  if (!pending && !shown && !days.length) return null;
  return (
    <Card className="mb-4">
      <CardHeader className="space-y-0">
        <CardTitle>Daily digest</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          {market} headlines. Last {Math.min(10, Math.max(days.length, 1))} runs on this desk. RSS, not an AI brief.
        </p>
      </CardHeader>
      <CardContent>
        {pending && !shown?.items.length ? (
          <p className="text-sm text-muted-foreground">Pulling today's tape.</p>
        ) : shown?.items.length ? (
          <ul className="space-y-2">
            {shown.items.slice(0, 10).map((s) => (
              <li key={s.link}>
                <a href={s.link} target="_blank" rel="noopener noreferrer" className="block min-h-11">
                  <p className="text-sm leading-snug">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.src}
                    {s.date ? ` · ${relativeDesk(s.date)}` : ""}
                  </p>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No headlines on this window yet.</p>
        )}
        {days.length > 1 ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Last 10</p>
            <ul className="mt-2 space-y-1">
              {days.slice(0, 10).map((d) => (
                <li key={`${d.region}-${d.day}`}>
                  <button
                    type="button"
                    className={cn(
                      "flex min-h-11 w-full items-baseline justify-between gap-3 text-left text-sm",
                      shown?.day === d.day ? "text-foreground" : "text-muted-foreground",
                    )}
                    onClick={() => setOpenDay(d.day)}
                  >
                    <span className="tabular-nums">{d.day}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.items.length} {d.items.length === 1 ? "headline" : "headlines"} · {d.market}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
