"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FloatBtn, QuoteRow, useMarkets } from "@/components/widgets";
import { isoDate, isoMonth, moneyQuote, pct, peso, phpQuote, uid, vol } from "@/lib/format";
import { bustPseCache } from "@/lib/sw-client";
import { useAtrium } from "@/lib/store";
import { QUOTE_CCY, WATCH_CATALOG, type WatchKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const FX_UNITS = ["USD", "EUR", "JPY", "GBP", "PHP"] as const;

function fxToPhp(unit: (typeof FX_UNITS)[number], fx: { usdphp: number; eurphp: number; jpyphp: number; gbpphp: number }) {
  if (unit === "PHP") return 1;
  if (unit === "USD") return fx.usdphp;
  if (unit === "EUR") return fx.eurphp;
  if (unit === "JPY") return fx.jpyphp;
  return fx.gbpphp;
}

export function FinanceView() {
  const { accounts, budgets, txs, watch, quoteCcy, addTx, removeTx, setAccounts, addWatch, removeWatch, setQuoteCcy } = useAtrium(
    useShallow((s) => ({
      accounts: s.accounts,
      budgets: s.budgets,
      txs: s.txs,
      watch: s.watch,
      quoteCcy: s.quoteCcy,
      addTx: s.addTx,
      removeTx: s.removeTx,
      setAccounts: s.setAccounts,
      addWatch: s.addWatch,
      removeWatch: s.removeWatch,
      setQuoteCcy: s.setQuoteCcy,
    })),
  );
  const [open, setOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("-500");
  const [date, setDate] = useState(() => isoDate());
  const [cat, setCat] = useState("food");
  const [accountId, setAccountId] = useState("");
  const [acctDraft, setAcctDraft] = useState(accounts);
  const [fromUnit, setFromUnit] = useState<(typeof FX_UNITS)[number]>("USD");
  const [toUnit, setToUnit] = useState<(typeof FX_UNITS)[number]>("PHP");
  const [fxAmt, setFxAmt] = useState("100");
  const [watchQ, setWatchQ] = useState("");
  const [watchKind, setWatchKind] = useState<"all" | WatchKind>("all");
  const [sort, setSort] = useState<{ key: "ticker" | "last" | "chg" | "vol"; dir: 1 | -1 }>({
    key: "ticker",
    dir: 1,
  });
  const resolvedAccount = accounts.some((a) => a.id === accountId)
    ? accountId
    : (accounts[0]?.id ?? "cash");
  const acctName = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const prefix = isoMonth();
  const spent = txs.filter((t) => t.date.startsWith(prefix) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const income = txs.filter((t) => t.date.startsWith(prefix) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const liquid = accounts.reduce((s, a) => s + a.balance, 0);
  const byCat: Record<string, number> = {};
  for (const t of txs) {
    if (!t.date.startsWith(prefix) || t.amount >= 0) continue;
    byCat[t.cat] = (byCat[t.cat] || 0) + Math.abs(t.amount);
  }

  const markets = useMarkets();
  const quotes = markets.data?.quotes ?? {};
  const quotesPending = markets.isPending && !markets.data;
  const fx = markets.data?.fx;
  const tape = [
    quotes.PSE,
    quotes.BDO,
    quotes.SM,
    quotes.JFC,
    quotes.USDPHP,
    quotes.bitcoin ?? quotes.BTC,
  ].filter(Boolean);
  const available = WATCH_CATALOG.filter((c) => !watch.some((w) => w.id === c.id));
  const fromPhp = fx ? fxToPhp(fromUnit, fx) : 0;
  const toPhp = fx ? fxToPhp(toUnit, fx) : 0;
  const converted = fromPhp && toPhp ? (Number(fxAmt) * fromPhp) / toPhp : 0;
  const pseListed = Object.values(quotes).filter((q) => q.kind === "stock");
  const watchRows = watch
    .filter((w) => watchKind === "all" || w.kind === watchKind)
    .map((w) => ({ w, q: quotes[w.symbol] }))
    .toSorted((a, b) => {
      const d = sort.dir;
      if (sort.key === "ticker") return d * a.w.label.localeCompare(b.w.label);
      if (sort.key === "last") return d * ((a.q?.price ?? -1) - (b.q?.price ?? -1));
      if (sort.key === "chg") return d * ((a.q?.change ?? -999) - (b.q?.change ?? -999));
      return d * ((a.q?.volume ?? -1) - (b.q?.volume ?? -1));
    });
  function toggleSort(key: typeof sort.key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-medium tracking-tight">Markets</h2>
        <FloatBtn kind="finance" />
        <div className="grow" />
        <div className="flex flex-wrap items-center gap-1">
          {QUOTE_CCY.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={quoteCcy === c}
              onClick={() => setQuoteCcy(c)}
              className={cn(
                "min-h-11 rounded-full border px-3 text-xs",
                quoteCcy === c
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
          onClick={() => {
            bustPseCache();
            void markets.refetch();
          }}
          disabled={markets.isFetching && !markets.data}
        >
          <RefreshCw className={cn("size-3.5", markets.isFetching && "animate-spin")} />
          {markets.isFetching && !markets.data ? "Updating…" : "Live"}
        </button>
        <Button
          variant="outline"
          onClick={() => {
            setAcctDraft(accounts);
            setAcctOpen(true);
          }}
        >
          Accounts
        </Button>
        <Button onClick={() => setOpen(true)}>Add transaction</Button>
      </div>

      <div className="mb-4 flex gap-3 overflow-x-auto pb-1" aria-busy={quotesPending || undefined}>
        {tape.length ? (
          tape.map((q) => (
            <div key={q!.id} className="min-w-36 shrink-0 rounded-md bg-card px-3 py-2 shadow-[var(--shadow-border)]">
              <p className="font-mono text-xs text-muted-foreground">{q!.label}</p>
              <p className={`tabular-nums text-sm ${(q!.change ?? 0) >= 0 ? "text-ok" : "text-destructive"}`}>
                {moneyQuote(q!.price, q!.ccy)}
              </p>
            </div>
          ))
        ) : quotesPending ? (
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="min-w-36 shrink-0 rounded-md bg-card px-3 py-2 shadow-[var(--shadow-border)]">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="mt-2 h-4 w-20" />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Market tape unavailable.</p>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Cash on hand", peso(liquid), ""],
          ["Income MTD", peso(income), "text-ok"],
          ["Spent MTD", peso(spent), "text-destructive"],
          ["Net MTD", peso(income - spent), income - spent >= 0 ? "text-ok" : "text-destructive"],
        ].map(([lbl, val, cls]) => (
          <Card key={lbl}>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">{lbl}</p>
              <p className={`mt-1 font-display text-2xl tabular-nums ${cls}`}>{val}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id}>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">{a.name}</p>
              <p className="mt-1 font-display text-xl tabular-nums">{peso(a.balance)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Watchlist</CardTitle>
            {markets.data?.asOf || markets.dataUpdatedAt ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {markets.dataUpdatedAt
                  ? new Date(markets.dataUpdatedAt).toLocaleTimeString("en-PH", {
                      hour: "numeric",
                      minute: "2-digit",
                      second: "2-digit",
                      timeZone: "Asia/Manila",
                    })
                  : null}
                {markets.data?.asOf ? ` · PSE ${markets.data.asOf.slice(0, 10)}` : ""}
              </p>
            ) : null}
          </CardHeader>
          <CardContent aria-busy={quotesPending || undefined}>
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["stock", "PSE"],
                  ["crypto", "Crypto"],
                  ["fx", "FX"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={watchKind === id}
                  onClick={() => setWatchKind(id)}
                  className={cn(
                    "min-h-11 rounded-full border px-3 text-xs",
                    watchKind === id
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.06em] text-muted-foreground">
                    {(
                      [
                        ["ticker", "Ticker"],
                        ["last", "Last"],
                        ["chg", "%"],
                        ["vol", "Vol"],
                      ] as const
                    ).map(([key, label]) => (
                      <th key={key} className="pb-2 font-medium">
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center gap-1"
                          onClick={() => toggleSort(key)}
                        >
                          {label}
                          {sort.key === key ? (
                            sort.dir === 1 ? (
                              <ChevronUp className="size-3.5" />
                            ) : (
                              <ChevronDown className="size-3.5" />
                            )
                          ) : null}
                        </button>
                      </th>
                    ))}
                    <th className="pb-2 font-medium">Name</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {watchRows.map(({ w, q }) => {
                    const ch = q?.change;
                    const pending = quotesPending && !q;
                    return (
                      <tr key={w.id} className="border-t border-border">
                        <td className="py-2 font-mono">{w.label}</td>
                        <td
                          className={`tabular-nums ${
                            ch == null ? "" : ch >= 0 ? "text-ok" : "text-destructive"
                          }`}
                        >
                          {pending ? <Skeleton className="h-4 w-20" /> : q ? moneyQuote(q.price, q.ccy) : "—"}
                        </td>
                        <td
                          className={`tabular-nums ${
                            ch == null ? "text-muted-foreground" : ch >= 0 ? "text-ok" : "text-destructive"
                          }`}
                        >
                          {pending ? <Skeleton className="h-4 w-12" /> : ch == null ? "—" : pct(ch)}
                        </td>
                        <td className="tabular-nums text-muted-foreground">
                          {pending ? <Skeleton className="h-4 w-12" /> : q?.volume ? vol(q.volume) : "—"}
                        </td>
                        <td className="max-w-[10rem] truncate text-muted-foreground">
                          {w.name ?? q?.name ?? w.kind}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="min-h-11 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => removeWatch(w.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!watchRows.length ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-sm text-muted-foreground">
                        Empty list — add a ticker below.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <Input
                placeholder="Add ticker — BDO, SM, JFC, BTC…"
                value={watchQ}
                onChange={(e) => setWatchQ(e.target.value)}
                aria-label="Add to watchlist"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {(watchQ.trim()
                  ? [
                      ...WATCH_CATALOG,
                      ...pseListed.map((q) => ({
                        id: `pse-${q.id}`,
                        symbol: q.id,
                        label: q.label,
                        name: q.name,
                        kind: "stock" as const,
                      })),
                    ]
                      .filter((item) => {
                        const q = watchQ.trim().toLowerCase();
                        return (
                          !watch.some((w) => w.symbol === item.symbol || w.id === item.id) &&
                          (item.label.toLowerCase().includes(q) ||
                            item.symbol.toLowerCase().includes(q) ||
                            (item.name ?? "").toLowerCase().includes(q))
                        );
                      })
                      .filter((item, i, all) => all.findIndex((x) => x.symbol === item.symbol) === i)
                      .slice(0, 10)
                  : available.slice(0, 10)
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="min-h-11 rounded-full border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      addWatch(item);
                      setWatchQ("");
                    }}
                  >
                    + {item.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Prices in {quoteCcy}. Crypto and FX refresh every minute. PSE is last session via Phisix — not for trading.
            </p>
            {markets.isError || markets.data?.failed ? (
              <button type="button" className="mt-2 text-xs underline" onClick={() => void markets.refetch()}>
                Retry prices
              </button>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Most active</CardTitle></CardHeader>
          <CardContent aria-busy={quotesPending || undefined}>
            {quotesPending
              ? Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex min-h-11 items-center justify-between gap-3 border-b border-border last:border-0">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))
              : (markets.data?.movers.active ?? []).map((q) => (
              <button
                key={q.id}
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-border text-left text-sm last:border-0"
                onClick={() =>
                  addWatch({
                    id: `pse-${q.id}`,
                    symbol: q.id,
                    label: q.label,
                    name: q.name,
                    kind: "stock",
                  })
                }
              >
                <span>
                  <span className="font-mono">{q.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{q.volume ? vol(q.volume) : ""}</span>
                </span>
                <span className="tabular-nums">{moneyQuote(q.price, q.ccy)}</span>
              </button>
            ))}
            {!quotesPending && !markets.data?.movers.active.length ? (
              <p className="text-sm text-muted-foreground">PSE tape unavailable right now.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Movers</CardTitle></CardHeader>
          <CardContent aria-busy={quotesPending || undefined}>
            {quotesPending ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="flex min-h-11 items-center justify-between gap-3">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : (markets.data?.movers.gainers.length || markets.data?.movers.losers.length) ? (
              <>
                <p className="mb-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">Gainers</p>
                {(markets.data?.movers.gainers ?? []).map((q) => (
                  <QuoteRow key={q.id} label={q.label} price={q.price} change={q.change} ccy={q.ccy} />
                ))}
                <p className="mb-2 mt-4 text-xs uppercase tracking-[0.06em] text-muted-foreground">Losers</p>
                {(markets.data?.movers.losers ?? []).map((q) => (
                  <QuoteRow key={q.id} label={q.label} price={q.price} change={q.change} ccy={q.ccy} />
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No % movers (market closed). Most active is above.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Currency converter</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="fx-amt">Amount</Label>
              <Input id="fx-amt" type="number" value={fxAmt} onChange={(e) => setFxAmt(e.target.value)} />
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="fx-from">From</Label>
                <select
                  id="fx-from"
                  className="h-11 w-full rounded-md border border-border bg-muted px-3 text-sm"
                  value={fromUnit}
                  onChange={(e) => setFromUnit(e.target.value as (typeof FX_UNITS)[number])}
                >
                  {FX_UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
                aria-label="Swap currencies"
                onClick={() => {
                  setFromUnit(toUnit);
                  setToUnit(fromUnit);
                }}
              >
                <ArrowLeftRight className="size-4" />
              </button>
              <div className="space-y-1">
                <Label htmlFor="fx-to">To</Label>
                <select
                  id="fx-to"
                  className="h-11 w-full rounded-md border border-border bg-muted px-3 text-sm"
                  value={toUnit}
                  onChange={(e) => setToUnit(e.target.value as (typeof FX_UNITS)[number])}
                >
                  {FX_UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="font-display text-2xl tabular-nums">
              {quotesPending && !fx ? (
                <Skeleton className="inline-block h-8 w-36" />
              ) : (
                <>
                  {Number.isFinite(converted) && fx ? converted.toLocaleString("en-PH", { maximumFractionDigits: 2 }) : "—"}{" "}
                  <span className="text-sm text-muted-foreground">{toUnit}</span>
                </>
              )}
            </p>
            {fx?.usdphp ? (
              <p className="text-xs text-muted-foreground">USD/PHP {phpQuote(fx.usdphp)}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Budgets this month</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {budgets.map((b) => {
              const used = byCat[b.id] || 0;
              const pctUsed = Math.min(100, Math.round((used / b.limit) * 100));
              return (
                <div key={b.id} className="grid grid-cols-[7rem_1fr_7rem] items-center gap-3 text-xs">
                  <span>{b.name}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pctUsed}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-muted-foreground">{peso(used)} / {peso(b.limit)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Ledger</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Payee</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Account</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {txs.toSorted((a, b) => b.date.localeCompare(a.date)).map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2 tabular-nums">{t.date}</td>
                    <td>{t.payee}</td>
                    <td className="text-muted-foreground">{t.cat}</td>
                    <td className="text-muted-foreground">{t.accountId ? acctName[t.accountId] ?? t.accountId : "—"}</td>
                    <td className={`tabular-nums ${t.amount < 0 ? "text-destructive" : "text-ok"}`}>
                      {t.amount < 0 ? "−" : "+"}{peso(Math.abs(t.amount))}
                    </td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => removeTx(t.id)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transaction</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="tx-payee">Payee</Label><Input id="tx-payee" value={payee} onChange={(e) => setPayee(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="tx-amt">Amount (− expense)</Label><Input id="tx-amt" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="tx-date">Date</Label><Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tx-cat">Category</Label>
                <select
                  id="tx-cat"
                  className="h-11 w-full rounded-md border border-border bg-muted px-3 text-sm"
                  value={cat}
                  onChange={(e) => setCat(e.target.value)}
                >
                  {["food", "trans", "bills", "fun", "income", "other"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tx-acct">Account</Label>
                <select
                  id="tx-acct"
                  className="h-11 w-full rounded-md border border-border bg-muted px-3 text-sm"
                  value={resolvedAccount}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  const n = Number(amount);
                  if (!Number.isFinite(n) || n === 0) {
                    toast("Enter an amount");
                    return;
                  }
                  addTx({
                    id: uid(),
                    date,
                    payee: payee.trim() || "Entry",
                    amount: n,
                    cat,
                    accountId: resolvedAccount,
                  });
                  setOpen(false);
                  setPayee("");
                  toast("Logged");
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={acctOpen} onOpenChange={setAcctOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Accounts</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {acctDraft.map((a, i) => (
              <div key={a.id} className="grid grid-cols-2 gap-3">
                <Input
                  value={a.name}
                  onChange={(e) => {
                    const next = [...acctDraft];
                    next[i] = { ...a, name: e.target.value };
                    setAcctDraft(next);
                  }}
                />
                <Input
                  type="number"
                  value={Number.isFinite(a.balance) ? a.balance : 0}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const next = [...acctDraft];
                    next[i] = { ...a, balance: Number.isFinite(n) ? n : 0 };
                    setAcctDraft(next);
                  }}
                />
              </div>
            ))}
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setAccounts(acctDraft.map((a) => ({
                    ...a,
                    balance: Number.isFinite(a.balance) ? a.balance : 0,
                  })));
                  setAcctOpen(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
