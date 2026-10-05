"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Star } from "lucide-react";
import { toast } from "sonner";
import { ChangePill, Spark, TickMark } from "@/components/spark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { moneyQuote, phpQuote, peso, relativeDesk } from "@/lib/format";
import { displayLast, positionPnl, positionValue, type BoardRow } from "@/lib/market-board";
import type { MarketQuote } from "@/lib/prices";
import { applyPublicStats, fetchPseStats } from "@/lib/pse-fundamentals";
import { concentration, fetchPseiWeights, PSEI_FORMULA, PSEI_WEIGHT_AS_OF, PSEI_WEIGHTS, topWeights } from "@/lib/psei-weight";
import { buildResearch, downloadPdf, fetchRelatedStories, issuerDisplay, newsDeskId, researchPdf, tapeBox, type RelatedStory } from "@/lib/research";
import { capLabel, peLabel, yldLabel } from "@/lib/screener";
import { SPARK_RANGES, normalizeSparkRange } from "@/lib/sparks";
import { vsIndex } from "@/lib/desk-stats";
import type { WatchItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isPseiItem } from "@/lib/yahoo";
import { parseNum, volLabel } from "./finance-market-bits";
import { PeerStrip } from "./finance-tape";

export function RelatedNews({ item }: { item: WatchItem }) {
  const issuer = issuerDisplay(item);
  const news = useQuery({
    queryKey: ["stock-news", item.id, item.symbol, item.name, issuer.legal, newsDeskId(item), "v12"],
    queryFn: () => fetchRelatedStories({ data: item }),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
  const facts = news.data?.facts ?? [];
  const rumors = news.data?.rumors ?? [];
  const earlier = news.data?.earlier ?? [];
  const missed = news.data?.missed ?? [];
  const asked = news.data?.asked ?? [];
  const talkEmpty = asked.length
    ? `No talk from the last 30 days. Asked ${asked.join(", ")}.`
    : "No talk from the last 30 days.";

  const quiet = !facts.length && !rumors.length && earlier.length > 0;

  function lane(title: string, rows: RelatedStory[], empty: string) {
    return (
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {title}
          {rows.length ? ` · ${rows.length}` : ""}
        </p>
        {rows.length ? (
          <div className="mt-2 space-y-2">
            {rows.map((n) => (
              <a
                key={`${n.link}-${n.title}`}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm leading-snug hover:underline"
              >
                <span className="block">{n.title}</span>
                <span className="text-xs text-muted-foreground">
                  {n.src}
                  {n.date ? ` · ${relativeDesk(n.date)}` : ""}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-muted p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Facts vs rumors</p>
      <p className="mt-1 text-sm">
        {issuer.ticker} · {issuer.legal}
        {issuer.aliases.length ? ` · ${issuer.aliases.join(" · ")}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        Daily first. Facts from the last two weeks, talk from the last 30 days. Older copy is earlier, not latest.
        {quiet ? " Nothing new in that window, so this is the 10 latest relevant stories." : ""}
      </p>
      {news.isPending && !facts.length && !rumors.length && !earlier.length ? (
        <div className="mt-3 grid gap-4 sm:grid-cols-2" aria-busy>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ) : news.isError ? (
        <button
          type="button"
          className="mt-2 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => void news.refetch()}
        >
          Couldn’t load related news — retry
        </button>
      ) : (
        <>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {quiet ? (
              <div className="sm:col-span-2">{lane("Latest", earlier, "No relevant copy on the wires.")}</div>
            ) : (
              <>
                {lane("Latest facts", facts, "No fact copy from the last two weeks.")}
                {lane("Latest talk", rumors, talkEmpty)}
              </>
            )}
          </div>
          {quiet ? null : <div className="mt-4">{lane("Earlier", earlier, "No older copy on the wires.")}</div>}
          {missed.length ? (
            <p className="mt-3 text-xs text-muted-foreground">{missed.join(", ")} didn’t answer.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function WeightingCard() {
  const file = useQuery({
    queryKey: ["psei-weights", "v1"],
    queryFn: () => fetchPseiWeights({ data: {} }),
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
  const rows = file.data?.rows ?? PSEI_WEIGHTS;
  const asOf = file.data?.asOf ?? PSEI_WEIGHT_AS_OF;
  const c = concentration(rows);
  const stamped = asOf.replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, mo, d) => `${Number(d)} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mo) - 1]} ${y}`);
  return (
    <div className="rounded-lg bg-muted p-4">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">Weighting</p>
      <p className="mt-2 text-sm">Free-float market-cap of 30 · {PSEI_FORMULA}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Official PSEi weights as of {stamped}
        {file.data?.source === "live" ? " · live file" : ""}. ICT {c.ict.toFixed(2)}% of the index.
      </p>
      <ul className="mt-2 space-y-1">
        {topWeights(5, rows).map((w) => (
          <li key={w.ticker} className="flex items-baseline justify-between gap-3 text-sm">
            <span>{w.ticker}</span>
            <span className="tabular-nums text-muted-foreground">{w.psei.toFixed(2)}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        SM group {c.sm.toFixed(1)}% · Banks {c.banks.toFixed(1)}% · Ayala {c.ayala.toFixed(1)}%
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Feb 2027 CN-2026-0033: MTAR 15% in / 10% stay, 98% cumulative cap, 15% float for PHP 250B+ names.
      </p>
    </div>
  );
}

export function QuoteSheet({
  row,
  held,
  watching,
  cryptoUsdt,
  dualPhp,
  showVol,
  sparkRange,
  quotes,
  nameSpark,
  indexSpark,
  indexLabel,
  onPeer,
  onWatch,
  onRemove,
  onHold,
}: {
  row: BoardRow;
  held?: WatchItem;
  watching: boolean;
  cryptoUsdt: boolean;
  dualPhp: boolean;
  showVol: boolean;
  sparkRange: ReturnType<typeof normalizeSparkRange>;
  quotes: Record<string, MarketQuote>;
  nameSpark?: number[];
  indexSpark?: number[];
  indexLabel?: string;
  onPeer: (sym: string) => void;
  onWatch: () => void;
  onRemove: () => void;
  onHold: (patch: Partial<WatchItem>) => void;
}) {
  const [qty, setQty] = useState(held?.qty != null ? String(held.qty) : "");
  const [avg, setAvg] = useState(held?.avg != null ? String(held.avg) : "");
  const [pdfHref, setPdfHref] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      if (pdfHref) URL.revokeObjectURL(pdfHref);
    };
  }, [pdfHref]);
  const ticker = (row.item.symbol || row.item.label).replace(/^\^/, "").replace(/\.PS$/i, "");
  const statsQ = useQuery({
    queryKey: ["pse-stats", ticker],
    queryFn: () => fetchPseStats({ data: { ticker } }),
    enabled: row.item.kind === "stock" && /^[A-Z][A-Z0-9]{1,5}$/i.test(ticker),
    staleTime: 6 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
  const q = row.q ? applyPublicStats(row.q, statsQ.data) : row.q;
  const sheetRow = q !== row.q && q ? { ...row, q } : row;
  const note = buildResearch(sheetRow, new Date(), { sparkLabel: SPARK_RANGES.find((r) => r.id === sparkRange)?.label ?? "3M" });
  const shown = displayLast(sheetRow.q, { cryptoUsdt });
  const phpUnder = dualPhp && shown?.php != null && shown.ccy !== "PHP" ? phpQuote(shown.php) : null;
  const qtyN = parseNum(qty);
  const avgN = parseNum(avg);
  const php = row.q?.php;
  const value = positionValue(qtyN, php);
  const pnl = positionPnl(qtyN, php, avgN);
  const sparkLabel = SPARK_RANGES.find((r) => r.id === sparkRange)?.label ?? "3M";
  const nameLink =
    row.item.kind === "stock" || row.item.kind === "global" ? vsIndex(nameSpark, indexSpark) : undefined;

  function scaleBand(n: number) {
    if (!row.q) return n;
    if (cryptoUsdt) return n;
    if (row.q.usd && row.q.usd > 0 && shown) return n * (shown.price / row.q.usd);
    return n;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <TickMark label={row.item.label} />
        <div>
          <p className="text-sm text-muted-foreground">{note.issuerLine || row.item.name || row.item.kind}</p>
          <p className="text-xs text-muted-foreground">{note.index}</p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-3xl tabular-nums">{shown ? moneyQuote(shown.price, shown.ccy) : "—"}</p>
          {phpUnder ? <p className="text-sm tabular-nums text-muted-foreground">{phpUnder}</p> : null}
        </div>
        <ChangePill value={row.q?.change} />
      </div>
      <Spark values={row.q?.spark} up={(row.q?.change ?? 0) >= 0} className="h-24 w-full" />
      <p className="text-xs text-muted-foreground">
        {SPARK_RANGES.find((r) => r.id === sparkRange)?.label ?? "3M"} tape
        {row.q?.spark && row.q.spark.length > 2 ? ` · ${row.q.spark.length} pts` : ""}
      </p>
      {showVol && volLabel(row.q) ? <p className="text-sm text-muted-foreground">{volLabel(row.q)}</p> : null}
      <RelatedNews item={row.item} />
      <div className="rounded-lg bg-muted p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">CFA desk</p>
        <p className="mt-1 text-xs text-muted-foreground">{note.cfaMethod}</p>
        {statsQ.data?.source ? (
          <p className="mt-1 text-xs text-muted-foreground">PE / P/B / yield from the public tape. Bank ratios last reported.</p>
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["PE", note.metrics.pe],
              ["E/P", note.metrics.ep],
              ["P/B", note.metrics.pb],
              ["Yield", note.metrics.yld],
              ["ROE", note.metrics.roe],
              ["NIM", note.metrics.nim],
              ["NPL", note.metrics.npl],
              ["CET1", note.metrics.cet1],
              ["PSEi wt", note.metrics.wt],
              [note.metrics.weekLabel, note.metrics.week],
              ["Vol", note.metrics.vol],
              ["52w chg", note.metrics.ch1y],
              ["SMA50", note.metrics.sma50],
              ["RSI", note.metrics.rsi],
            ] as const
          )
            .filter(([k, v]) => v !== "—" || (k !== "ROE" && k !== "NIM" && k !== "NPL" && k !== "CET1" && k !== "RSI" && k !== "52w chg" && k !== "SMA50"))
            .map(([k, v]) => (
            <div key={k}>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">{k}</p>
              <p className="text-sm tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        {row.item.kind === "stock" || row.item.kind === "global" ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {nameLink
              ? `Spark r ${nameLink.r.toFixed(2)} · β ${nameLink.beta.toFixed(2)} vs ${indexLabel ?? "the home index"} (${sparkLabel}, ${nameLink.n} pts). Delayed path, not a hedge.`
              : `Index link waits on a real spark vs ${indexLabel ?? "the home index"} — session wobble is not a beta.`}
          </p>
        ) : null}
        {(
          [
            { title: "Valuation", items: note.valuation },
            { title: "Tape", items: note.tape },
            { title: "Index", items: note.indexFactor },
            { title: "Gap", items: note.gap },
          ] as const
        )
          .filter((g) => g.items.length)
          .map((g) => (
            <div key={g.title} className="mt-3">
              <p className="text-xs text-muted-foreground">{g.title}</p>
              <ul className="mt-1 space-y-1">
                {g.items.map((line) => (
                  <li key={line} className="text-sm leading-snug">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      {isPseiItem(row.item) ? <WeightingCard /> : null}
      <PeerStrip ticker={ticker} quotes={quotes} onOpen={onPeer} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg bg-muted p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Snapshot</p>
          <p className="mt-2 text-sm">
            High {note.high}
            <span className="text-muted-foreground"> · </span>
            Low {note.low}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {note.volume}
            {note.change !== "-" ? ` · ${note.change}` : ""}
          </p>
          {sheetRow.q?.pe || sheetRow.q?.marketCap || sheetRow.q?.yieldPct || sheetRow.q?.forwardPe || sheetRow.q?.pb ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {[
                peLabel(sheetRow.q?.pe),
                sheetRow.q?.forwardPe ? `Fwd ${sheetRow.q.forwardPe >= 100 ? sheetRow.q.forwardPe.toFixed(0) : sheetRow.q.forwardPe.toFixed(1)}` : "",
                sheetRow.q?.marketCap ? capLabel(sheetRow.q.marketCap) : "",
                yldLabel(sheetRow.q?.yieldPct),
                sheetRow.q?.pb ? `P/B ${sheetRow.q.pb.toFixed(2)}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {(() => {
            const box = tapeBox(sheetRow.q, SPARK_RANGES.find((r) => r.id === sparkRange)?.label ?? "3M");
            if (!box) return null;
            return (
              <p className="mt-1 text-xs text-muted-foreground">
                {box.label} {moneyQuote(box.low, shown?.ccy ?? sheetRow.q?.ccy ?? "PHP")} – {moneyQuote(box.high, shown?.ccy ?? sheetRow.q?.ccy ?? "PHP")}
                {box.kind === "spark" ? " · spark range, not 52w" : ""}
              </p>
            );
          })()}
        </div>
        <div className="rounded-lg bg-muted p-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Levels</p>
          <p className="mt-2 text-sm">S {note.support}</p>
          <p className="text-sm">P {note.pivot}</p>
          <p className="text-sm">R {note.resistance}</p>
          <p className="mt-1 text-xs text-muted-foreground">{note.rangePos}</p>
        </div>
      </div>
      <div className="rounded-lg bg-muted p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Standpoint</p>
          <p className="text-sm font-medium">{note.bias}</p>
        </div>
        <p className="mt-2 text-sm">{note.thesis[0]}</p>
        <p className="mt-1 text-xs text-muted-foreground">{note.index}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Suggestions</p>
        <div className="mt-2 space-y-3">
          {(
            [
              { title: "Watch", items: note.watch },
              { title: "Risk", items: note.risk },
              { title: "Next", items: note.next },
            ] as const
          )
            .filter((g) => g.items.length)
            .map((g) => (
              <div key={g.title}>
                <p className="text-xs text-muted-foreground">{g.title}</p>
                <ul className="mt-1 space-y-1">
                  {g.items.map((s) => (
                    <li key={s} className="text-sm leading-snug">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            const filename = `atrium-${row.item.label.toLowerCase()}-research.pdf`;
            const url = downloadPdf(filename, researchPdf(note));
            setPdfHref(url);
            toast(`Research note for ${row.item.label}`);
          }}
        >
          <FileDown className="size-4" />
          Research PDF
        </Button>
        {pdfHref ? (
          <a
            href={pdfHref}
            download={`atrium-${row.item.label.toLowerCase()}-research.pdf`}
            className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs hover:bg-muted"
          >
            Open PDF
          </a>
        ) : null}
      </div>
      {pdfHref ? (
        <section
          aria-label={`${row.item.label} research note`}
          className="max-h-[480px] space-y-3 overflow-y-auto rounded-md border border-border bg-card p-4 text-sm"
        >
          <div>
            <p className="font-medium">
              {note.ticker} · {note.name}
            </p>
            <p className="text-xs text-muted-foreground">{note.issuerLine}</p>
            <p className="text-xs text-muted-foreground">{note.asOf}</p>
          </div>
          <p className="tabular-nums">
            Last {note.last} · {note.change} · Bias {note.bias}
          </p>
          <p className="text-xs text-muted-foreground">
            Support {note.support} · Pivot {note.pivot} · Resistance {note.resistance}
          </p>
          {(
            [
              ["Standpoint", [...note.thesis.slice(0, 2), ...note.technical.slice(0, 2)]],
              ["CFA desk", note.expert ?? []],
              ["Watch", note.watch ?? []],
              ["Risk", note.risk ?? []],
              ["Next", note.next ?? []],
            ] as const
          )
            .filter(([, items]) => items.length)
            .map(([title, items]) => (
              <div key={title}>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{title}</p>
                <ul className="mt-1 space-y-1">
                  {items.map((s) => (
                    <li key={s} className="leading-snug">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          <p className="text-xs text-muted-foreground">
            Readable research note. Open PDF downloads the file.
          </p>
        </section>
      ) : null}
      {row.q?.kind === "crypto" && row.q.high != null && row.q.low != null ? (
        <p className="text-sm text-muted-foreground">
          24h {moneyQuote(scaleBand(row.q.low), shown?.ccy ?? "USD")} –{" "}
          {moneyQuote(scaleBand(row.q.high), shown?.ccy ?? "USD")}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="hold-qty">Holding qty</Label>
          <Input
            id="hold-qty"
            className="h-11"
            type="number"
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => onHold({ qty: qtyN })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hold-avg">Avg cost (₱)</Label>
          <Input
            id="hold-avg"
            className="h-11"
            type="number"
            inputMode="decimal"
            value={avg}
            onChange={(e) => setAvg(e.target.value)}
            onBlur={() => onHold({ avg: avgN })}
          />
        </div>
      </div>
      {value > 0 ? (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted-foreground">Value {peso(value)}</p>
          {pnl != null ? (
            <p className={cn("tabular-nums text-sm", pnl >= 0 ? "text-ok" : "text-destructive")}>
              {"P&L"} {phpQuote(pnl)}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {watching ? (
          <Button variant="outline" className="min-h-11" aria-label="Remove from watcher" onClick={onRemove}>
            <Star className="size-4 fill-primary text-primary" />
            Watching
          </Button>
        ) : (
          <Button className="min-h-11" onClick={onWatch}>
            <Star className="size-4" />
            Watch
          </Button>
        )}
      </div>
    </div>
  );
}

