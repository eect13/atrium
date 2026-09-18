import { httpText } from "./http.ts";
import { parseRss } from "./feeds.ts";
import { cleanHeadline } from "./headline.ts";
import { deskZone, moneyQuote, phpQuote, vol } from "./format.ts";
import { BANK_TICKERS, BLUECHIPS, DIVIDENDS, REITS, displayLast, inSleeve, turnover, type BoardRow } from "./market-board.ts";
import { nameWeight, PSEI_WEIGHTS, sleeveWeight, weightTake } from "./psei-weight.ts";
import { isPseiItem, PSEI_SYMBOL } from "./yahoo.ts";
import { bankFiling, filingFreshness, justifiedPb, liveBankFiling } from "./pse-fundamentals.ts";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ResearchNote = {
  ticker: string;
  name: string;
  asOf: string;
  last: string;
  change: string;
  volume: string;
  high: string;
  low: string;
  support: string;
  resistance: string;
  pivot: string;
  rangePos: string;
  bias: "Bullish" | "Bearish" | "Neutral";
  index: string;
  thesis: string[];
  levels: string[];
  technical: string[];
  watch: string[];
  risk: string[];
  next: string[];
  expert: string[];
  suggestions: string[];
  cfaMethod: string;
  issuerLine: string;
  valuation: string[];
  tape: string[];
  indexFactor: string[];
  gap: string[];
  metrics: { pe: string; ep: string; pb: string; yld: string; wt: string; week: string; weekLabel: string; vol: string; roe: string; nim: string; npl: string; cet1: string };
};

function ascii(s: string) {
  return s
    .replaceAll("₱", "PHP ")
    .replaceAll("¥", "JPY ")
    .replaceAll("€", "EUR ")
    .replaceAll("£", "GBP ")
    .replaceAll("₩", "KRW ")
    .replaceAll("₹", "INR ")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function wrap(text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > width) {
      if (cur) lines.push(cur);
      cur = w.length > width ? w.slice(0, width) : w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function moneyShown(n: number | undefined, ccy: string) {
  if (n == null || !Number.isFinite(n)) return "-";
  return moneyQuote(n, ccy);
}

function peFmt(n: number) {
  if (n >= 100) return n.toFixed(0);
  const two = n.toFixed(2);
  if (n < 20 && !two.endsWith("0")) return two;
  return n.toFixed(1);
}

function peTake(pe?: number, fwd?: number) {
  if (pe == null || pe <= 0) return null;
  const tail = fwd && fwd > 0 ? `, forward ${peFmt(fwd)}` : "";
  const ey = ` Earnings yield ${(100 / pe).toFixed(1)}% (E/P).`;
  if (pe < 8) return `Trailing PE ${peFmt(pe)}${tail} — cheap vs a 15–20 market, or a value trap.${ey}`;
  if (pe < 15) return `Trailing PE ${peFmt(pe)}${tail} — below a typical market multiple.${ey}`;
  if (pe <= 22) return `Trailing PE ${peFmt(pe)}${tail} — in a typical market band.${ey}`;
  if (pe <= 35) return `Trailing PE ${peFmt(pe)}${tail} — growth has to keep showing up.${ey}`;
  return `Trailing PE ${peFmt(pe)}${tail} — rich. Only works if earnings compound.${ey}`;
}

function yldTake(y?: number) {
  if (y == null || y <= 0) return null;
  if (y >= 8) return `Yield ${y.toFixed(1)}% — high. Check if the dividend is covered.`;
  if (y >= 4) return `Yield ${y.toFixed(1)}% — income sleeve territory.`;
  return `Yield ${y.toFixed(1)}%.`;
}

export type TapeBox = {
  low: number;
  high: number;
  kind: "52w" | "spark";
  label: string;
};

/** True 52-week box when Yahoo still publishes it. Otherwise the spark on this desk, labeled as such. */
export function tapeBox(
  q?: { weekLow?: number; weekHigh?: number; spark?: number[] },
  sparkLabel = "3M",
): TapeBox | undefined {
  if (q?.weekLow != null && q?.weekHigh != null && q.weekHigh > q.weekLow) {
    return { low: q.weekLow, high: q.weekHigh, kind: "52w", label: "52w" };
  }
  const spark = (q?.spark ?? []).filter((n) => Number.isFinite(n));
  if (spark.length < 2) return undefined;
  const low = Math.min(...spark);
  const high = Math.max(...spark);
  if (!(high > low)) return undefined;
  const label = spark.length >= 4 ? sparkLabel : "session";
  return { low, high, kind: "spark", label };
}

export function buildResearch(row: BoardRow, asOf = new Date(), opts?: { sparkLabel?: string }): ResearchNote {
  const q = row.q;
  const ticker = row.item.label;
  const code = row.item.symbol || ticker;
  const ch = q?.change;
  const bias: ResearchNote["bias"] = ch == null ? "Neutral" : ch > 1 ? "Bullish" : ch < -1 ? "Bearish" : "Neutral";
  const spark = q?.spark ?? [];
  const sparkLow = spark.length ? Math.min(...spark) : undefined;
  const sparkHigh = spark.length ? Math.max(...spark) : undefined;
  const shown = displayLast(q, { cryptoUsdt: true });
  const ccy = shown?.ccy ?? q?.ccy ?? "PHP";
  const last = shown?.price;
  const box = tapeBox(q, opts?.sparkLabel ?? "3M");
  const low = sparkLow ?? q?.low;
  const high = sparkHigh ?? q?.high;
  const support = low != null ? low : undefined;
  const resistance = high != null ? high : undefined;
  const pivot = support != null && resistance != null ? (support + resistance) / 2 : last;
  const rangePos =
    last != null && support != null && resistance != null && resistance > support
      ? `${Math.round(((last - support) / (resistance - support)) * 100)}% of box`
      : "—";

  const tags: string[] = [];
  if (inSleeve(BLUECHIPS, code, ticker, row.item.id)) tags.push("PSEi");
  if (code === PSEI_SYMBOL || ticker === "PSEi") tags.push("PSEi");
  if (inSleeve(REITS, code, ticker)) tags.push("REIT");
  if (inSleeve(DIVIDENDS, code, ticker)) tags.push("DivY");
  if (q?.kind === "crypto") tags.push("Crypto");
  if (q?.kind === "fx") tags.push("FX");
  if (q?.kind === "global") tags.push("Global");
  if (q?.kind === "cmdty") tags.push("Commodity");
  if (!tags.length) tags.push(q?.kind === "stock" ? "PSE" : "Market");

  const thesis: string[] = [];
  if (ch == null) {
    thesis.push("No live print. Treat this as a blank sheet until last and volume refresh.");
  } else if (bias === "Bullish") {
    thesis.push(`Tape is ${ch.toFixed(2)}% on the session. Buyers have the last print.`);
  } else if (bias === "Bearish") {
    thesis.push(`Tape is ${ch.toFixed(2)}% on the session. Sellers have the last print.`);
  } else {
    thesis.push(`Tape is ${ch.toFixed(2)}% — a range day. Wait for a close outside the box.`);
  }
  if (q?.kind === "stock") {
    thesis.push(
      inSleeve(BLUECHIPS, code, ticker)
        ? "PSEi name as of the 3 Aug 2026 review (PSE CN-2026-0035). Liquidity is the point of the index."
        : "Not a PSEi constituent. Size and float are not the same as a blue chip.",
    );
  }
  const peLine = peTake(q?.pe, q?.forwardPe);
  if (peLine) thesis.push(peLine);
  const yLine = yldTake(q?.yieldPct);
  if (yLine) thesis.push(yLine);

  const technical: string[] = [];
  if (spark.length >= 2) {
    const first = spark[0] ?? 0;
    const lastSpark = spark[spark.length - 1] ?? 0;
    if (lastSpark > first) technical.push("Short tape (spark) is higher than it started. Momentum still leans up.");
    else if (lastSpark < first) technical.push("Short tape (spark) is lower than it started. Momentum still leans down.");
    else technical.push("Short tape is flat. No impulse yet.");
  } else {
    technical.push("No spark on this quote. Use last, high, and low only.");
  }
  if (bias === "Bullish") {
    technical.push("Hold above the pivot keeps the bid in charge. A slip under support hands it back.");
  } else if (bias === "Bearish") {
    technical.push("A hold under the pivot keeps the offer in charge. Reclaim of resistance is the first repair.");
  } else {
    technical.push("The box is the trade. Fade the edges until a close outside support or resistance.");
  }
  if (last != null && box) {
    const pos = (last - box.low) / (box.high - box.low);
    if (box.kind === "52w") {
      if (pos >= 0.9) technical.push("Last is near the 52-week high. A failed break is a fade.");
      else if (pos <= 0.1) technical.push("Last is near the 52-week low. A failed breakdown is a bounce.");
      else technical.push(`${Math.round(pos * 100)}% of the 52-week range.`);
    } else {
      technical.push(`${Math.round(Math.min(1, Math.max(0, pos)) * 100)}% of the ${box.label} spark range — not a 52-week box.`);
    }
  }
  technical.push("Desk note only. No broker, no target, no stop.");

  const watch: string[] = [];
  const risk: string[] = [];
  const next: string[] = [];
  if (ch == null) {
    watch.push("Wait for a live print before taking a view.");
  } else if (bias === "Bullish") {
    watch.push(`Buyers have the tape (${ch.toFixed(2)}%). Keep the idea only while last holds the pivot.`);
  } else if (bias === "Bearish") {
    watch.push(`Sellers have the tape (${ch.toFixed(2)}%). First repair is a reclaim of resistance.`);
  } else {
    watch.push("Range day. Fade the box until a session close outside support or resistance.");
  }
  if (last != null && support != null && resistance != null && resistance > support) {
    const pos = (last - support) / (resistance - support);
    if (pos >= 0.85) watch.push("Last is hugging the top of the spark box — a failed break is a fade.");
    else if (pos <= 0.15) watch.push("Last is hugging the floor of the spark box — a failed breakdown is a bounce.");
  }

  if (bias === "Bullish") {
    risk.push(
      pivot != null
        ? `Invalidation: last loses the pivot (${moneyShown(pivot, ccy)}).`
        : "Invalidation: a slip under support.",
    );
  } else if (bias === "Bearish") {
    risk.push(
      resistance != null
        ? `Invalidation: last reclaims resistance (${moneyShown(resistance, ccy)}).`
        : "Invalidation: a reclaim of the session high.",
    );
  } else if (ch != null) {
    risk.push("Invalidation: a close outside the spark box.");
  }

  if (q?.kind === "stock") {
    next.push(
      inSleeve(BLUECHIPS, code, ticker)
        ? "PSEi name. Liquidity is usually the story, not a thin float."
        : "Off the PSEi. Treat size and float as unknown until you check the tape.",
    );
  } else if (q?.kind === "crypto") {
    next.push("Use the 24h high/low as the box. This desk does not invent a 3-month OHLC.");
  } else if (q?.kind === "fx") {
    next.push("Peso cross. Session change is the whole signal.");
  } else if (q?.kind === "global") {
    next.push(
      code === PSEI_SYMBOL
        ? "Yahoo still publishes the PSEi index. The 30 names last on this desk — Yahoo dropped .PS listings."
        : "Yahoo last, delayed. Index levels are native units, not a peso conversion.",
    );
  } else if (q?.kind === "cmdty") {
    next.push("Yahoo futures last, delayed. Treat the session box as the only tape this desk has.");
  }
  next.push("Read the related headlines before you size anything.");

  const bank = inSleeve(BANK_TICKERS, code, ticker);
  const rawFiling = bank ? bankFiling(code) ?? bankFiling(ticker) : undefined;
  const freshness = rawFiling ? filingFreshness(rawFiling, asOf) : undefined;
  const filing = bank ? liveBankFiling(code, asOf) ?? liveBankFiling(ticker, asOf) : undefined;
  const cfaMethod = bank
    ? "Residual income / P/B and tape. Last-reported bank ratios, not a live print. Not a DCF, not a target."
    : "Relative value and tape. Not a DCF, not a target.";
  const issuerLine = issuerDisplay({
    label: ticker,
    symbol: code,
    name: row.item.name,
    kind: row.item.kind,
  }).line;

  const valuation: string[] = [];
  const tape: string[] = [];
  const indexFactor: string[] = [];
  const gap: string[] = [];

  if (peLine) valuation.push(peLine);
  if (yLine) valuation.push(yLine);
  if (q?.pb && q.pb > 0) {
    valuation.push(
      bank
        ? `P/B ${q.pb.toFixed(2)} — CFA bank valuation starts at book (residual income), not a DCF of FCF. EM universal banks often sit 0.8–1.8×.`
        : q.pb < 1
          ? `P/B ${q.pb.toFixed(2)} — below book.`
          : `P/B ${q.pb.toFixed(2)}.`,
    );
  } else if (bank && q?.kind === "stock") {
    valuation.push("Universal bank. CFA method is residual income / P/B: justified P/B = (ROE − g) / (r − g). No book multiple on this tape, so no justified multiple.");
  }
  if (filing) {
    const bits = [`ROE ${filing.roe.toFixed(2)}%`];
    if (filing.nim != null) bits.push(`NIM ${filing.nim.toFixed(2)}%`);
    bits.push(`NPL ${filing.npl.toFixed(2)}%`, `CET1 ${filing.cet1.toFixed(2)}%`);
    valuation.push(`Last reported ${filing.asOf} (${filing.asOfDate}): ${bits.join(" · ")}. ${filing.source}.`);
    if (freshness === "aging") {
      valuation.push("Aging — next 17-Q not on this desk yet. Not a live EDGE print.");
    }
    const just = q?.pb && q.pb > 0 ? justifiedPb(filing.roe) : null;
    if (just != null && q?.pb && q.pb > 0) {
      valuation.push(
        `Worked identity at r 12% / g 5% (labeled, not a target): justified P/B ${just.toFixed(2)} vs tape ${q.pb.toFixed(2)}.`,
      );
    }
    if (q?.roe && q.roe > 0 && Math.abs(q.roe - filing.roe) >= 0.15) {
      valuation.push(`Public-tape TTM ROE ${q.roe.toFixed(2)}% vs last-reported ${filing.asOf} ${filing.roe.toFixed(2)}%.`);
    }
  } else if (rawFiling && freshness === "stale") {
    valuation.push(`${rawFiling.asOf} filing is past the next 17-Q window — not shown as last reported. Public-tape TTM only.`);
    if (q?.roe && q.roe > 0 && q?.kind === "stock") {
      valuation.push(`Public-tape TTM ROE ${q.roe.toFixed(2)}%.`);
    }
  } else if (q?.roe && q.roe > 0 && q?.kind === "stock") {
    valuation.push(`Public-tape TTM ROE ${q.roe.toFixed(2)}%.`);
  }
  if (inSleeve(REITS, code, ticker)) {
    valuation.push("REIT. CFA real-estate work is yield and NAV, not a manufacturing P/E.");
  }

  if (last != null && box) {
    const pos = (last - box.low) / (box.high - box.low);
    const pct = Math.round(Math.min(1, Math.max(0, pos)) * 100);
    tape.push(
      box.kind === "52w"
        ? `${pct}% of the 52-week range.`
        : `${pct}% of the ${box.label} spark range (not a 52-week box).`,
    );
  }
  if (q?.volume && q.avgVolume && q.avgVolume > 0) {
    const r = q.volume / q.avgVolume;
    if (r >= 1.8) tape.push(`Volume ${r.toFixed(1)}× the 10-day typical — CFA tape confirmation.`);
    else if (r <= 0.5) tape.push(`Volume ${r.toFixed(1)}× typical — quiet tape.`);
    else tape.push(`Volume ${r.toFixed(1)}× the 10-day typical.`);
  }

  const wt = nameWeight(code) ?? nameWeight(ticker);
  if (wt != null) {
    indexFactor.push(`${ticker} is ${wt.toFixed(2)}% of the PSEi (official free-float weights) — a systematic factor in any local-equity book.`);
  }
  if (bank) {
    indexFactor.push(`Financials sleeve (BDO, BPI, MBT, CBC) is ${sleeveWeight(["BDO", "BPI", "MBT", "CBC"]).toFixed(1)}% of the index.`);
  }
  if (isPseiItem(row.item) || code === PSEI_SYMBOL || ticker === "PSEi") {
    indexFactor.push(...weightTake());
  }

  if (!valuation.length && !tape.length && !indexFactor.length && !(code === PSEI_SYMBOL || ticker === "PSEi" || isPseiItem(row.item))) {
    gap.push("No PE, yield, or 52-week box on this quote — tape and levels only.");
  }
  if (isPseiItem(row.item) || code === PSEI_SYMBOL || ticker === "PSEi") {
    /* index take already on the sheet */
  } else if (q?.kind === "stock" && q.pe == null && !(q.pb && q.pb > 0)) {
    if (!gap.some((l) => /tape and levels only/i.test(l))) {
      gap.push("Yahoo dropped .PS fundamentals. Public multiples are still empty on this tape. Last-reported bank ratios are filings, not a live print. Not a DCF, not a target.");
    }
  } else if (q?.kind === "stock") {
    gap.push(
      q.pe || (q.pb && q.pb > 0)
        ? "Multiples from the public tape (not Yahoo .PS). Bank ratios are last reported. Not a DCF, not a target."
        : "Relative value and tape only. Not a DCF, not a target.",
    );
  }

  const expert = [...valuation, ...tape, ...indexFactor, ...gap];

  let weekPct: string | null = null;
  if (last != null && box) {
    weekPct = `${Math.round(Math.min(1, Math.max(0, (last - box.low) / (box.high - box.low))) * 100)}%`;
  }
  const volRatio = q?.volume && q.avgVolume && q.avgVolume > 0 ? `${(q.volume / q.avgVolume).toFixed(1)}×` : null;
  const metrics = {
    pe: q?.pe && q.pe > 0 ? peFmt(q.pe) : "—",
    ep: q?.pe && q.pe > 0 ? `${(100 / q.pe).toFixed(1)}%` : "—",
    pb: q?.pb && q.pb > 0 ? q.pb.toFixed(2) : "—",
    yld: q?.yieldPct && q.yieldPct > 0 ? `${q.yieldPct.toFixed(1)}%` : "—",
    wt: wt != null ? `${wt.toFixed(2)}%` : "—",
    week: weekPct ?? "—",
    weekLabel: box?.label ?? "52w",
    vol: volRatio ?? "—",
    roe: filing?.roe != null ? `${filing.roe.toFixed(2)}%` : q?.roe && q.roe > 0 ? `${q.roe.toFixed(2)}%` : "—",
    nim: filing?.nim != null ? `${filing.nim.toFixed(2)}%` : "—",
    npl: filing?.npl != null ? `${filing.npl.toFixed(2)}%` : "—",
    cet1: filing?.cet1 != null ? `${filing.cet1.toFixed(2)}%` : "—",
  };

  const suggestions = [...watch, ...risk, ...next];

  const levels: string[] = [];
  if (support != null) levels.push(`Support  ${moneyShown(support, ccy)}`);
  if (pivot != null) levels.push(`Pivot    ${moneyShown(pivot, ccy)}`);
  if (resistance != null) levels.push(`Resistance  ${moneyShown(resistance, ccy)}`);
  if (q?.low != null && q.high != null) {
    levels.push(`Session  ${moneyShown(q.low, ccy)} - ${moneyShown(q.high, ccy)}`);
  }
  if (!levels.length) levels.push("No high/low on this quote.");

  const z = deskZone();
  const stamped = asOf.toLocaleString("en-GB", {
    timeZone: z.tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return {
    ticker,
    name: row.item.name ?? ticker,
    asOf: `${stamped} ${z.tz.replace(/_/g, " ")}`,
    last: last != null ? moneyShown(last, ccy) : "-",
    change: ch == null ? "-" : `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`,
    volume: q ? (q.kind === "crypto" ? `Vol ${vol(q.volume ?? 0)}` : turnover(q) ? phpQuote(turnover(q)) : "-") : "-",
    high: moneyShown(high, ccy),
    low: moneyShown(low, ccy),
    support: moneyShown(support, ccy),
    resistance: moneyShown(resistance, ccy),
    pivot: moneyShown(pivot, ccy),
    rangePos,
    bias,
    index: tags.join(" / "),
    thesis,
    levels,
    technical,
    watch,
    risk,
    next,
    expert,
    suggestions,
    cfaMethod,
    issuerLine,
    valuation,
    tape,
    indexFactor,
    gap,
    metrics,
  };
}

function pdfEscape(s: string) {
  return ascii(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

type PdfLine = { text: string; size: number; bold?: boolean; gap?: number; gray?: boolean };

function pageOps(lines: PdfLine[], startY: number) {
  let y = startY;
  const textOps: string[] = [];
  for (const line of lines) {
    if (y < 48) break;
    const font = line.bold ? "F2" : "F1";
    const fill = line.gray ? "0.42 0.42 0.4 rg" : "0.09 0.09 0.09 rg";
    textOps.push("BT");
    textOps.push(fill);
    textOps.push(`/${font} ${line.size} Tf`);
    textOps.push(`1 0 0 1 48 ${y} Tm`);
    textOps.push(`(${pdfEscape(line.text)}) Tj`);
    textOps.push("ET");
    y -= line.gap ?? 14;
  }
  return textOps.join("\n");
}

/** One-page Helvetica desk note — snapshot, technical standpoint, levels. */
export function researchPdf(note: ResearchNote): Uint8Array {
  const lines: PdfLine[] = [
    { text: `${note.ticker}  ${note.name}`, size: 18, bold: true, gap: 16 },
    { text: note.issuerLine, size: 9, gap: 8, gray: true },
    { text: note.asOf, size: 9, gap: 8, gray: true },
    { text: `Sleeve  ${note.index}`, size: 10, gap: 16 },
    { text: `Last ${note.last}    ${note.change}    ${note.volume}`, size: 11, gap: 10 },
    { text: `Bias  ${note.bias}    Range  ${note.rangePos}`, size: 12, bold: true, gap: 18 },
    { text: "SNAPSHOT", size: 9, bold: true, gap: 12 },
    { text: `High ${note.high}    Low ${note.low}`, size: 10, gap: 12 },
    { text: `PE ${note.metrics.pe}    E/P ${note.metrics.ep}    P/B ${note.metrics.pb}    Yld ${note.metrics.yld}`, size: 10, gap: 12 },
    ...(note.metrics.roe !== "—"
      ? [{ text: `ROE ${note.metrics.roe}    NIM ${note.metrics.nim}    NPL ${note.metrics.npl}    CET1 ${note.metrics.cet1}`, size: 10, gap: 12 } as PdfLine]
      : []),
    { text: `Support ${note.support}    Pivot ${note.pivot}    Resistance ${note.resistance}`, size: 10, gap: 18 },
    { text: "STANDPOINT", size: 9, bold: true, gap: 14 },
    ...note.thesis.slice(0, 2).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
    ...note.technical.slice(0, 2).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
    ...((note.expert ?? []).length
      ? [
          { text: "CFA DESK / EXPERT", size: 9, bold: true, gap: 14 } as PdfLine,
          ...(note.expert ?? []).slice(0, 6).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
        ]
      : []),
    ...((note.watch ?? []).length
      ? [
          { text: "WATCH", size: 9, bold: true, gap: 14 } as PdfLine,
          ...(note.watch ?? []).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
        ]
      : []),
    ...((note.risk ?? []).length
      ? [
          { text: "RISK", size: 9, bold: true, gap: 14 } as PdfLine,
          ...(note.risk ?? []).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
        ]
      : []),
    ...((note.next ?? []).length
      ? [
          { text: "NEXT", size: 9, bold: true, gap: 14 } as PdfLine,
          ...(note.next ?? []).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
        ]
      : []),
    {
      text: "Not an offer to buy or sell. Built on the live print in Atrium - not a broker research desk.",
      size: 8,
      gap: 14,
      gray: true,
    },
  ];

  const header = [
    "0.08 0.08 0.09 rg",
    "0 792 595 50 re f",
    "1 1 1 rg",
    "BT",
    "/F2 11 Tf",
    "1 0 0 1 48 810 Tm",
    "(ATRIUM RESEARCH) Tj",
    "ET",
    "0.82 0.82 0.8 rg",
    "48 786 499 0.6 re f",
  ].join("\n");
  const draw = `${header}\n${pageOps(lines, 768)}`;
  const streamBytes = new TextEncoder().encode(draw);

  const objs: string[] = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >> endobj",
    `4 0 obj << /Length ${streamBytes.byteLength} >> stream\n${draw}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "6 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj",
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objs) {
    offsets.push(body.length);
    body += `${obj}\n`;
  }
  const xrefAt = body.length;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

export function downloadPdf(filename: string, bytes: Uint8Array) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  return url;
}

export type NewsWindow = "1d" | "7d" | "30d" | "1y";

const GENERIC_NAME = /^(inc|corp|corporation|holdings?|plc|ltd|limited|group|the|and|of|ph|co|company|philippine|philippines|investments?|services?|bank|islands?|interactive|foods?|mining|power|water|food|equity|ventures?|capital|commercial|container|terminal|electric|metropolitan|trust|international|prime|index)$/i;

/** PH market / Unibank context — used when the ticker is a short collision (BDO, SM, ICT). */
const PH_MARK =
  /philippines?|philippine|\bpse\b|manila|peso|\bbsp\b|unibank|bilyonaryo|inquirer|philstar|businessworld|bworld|gmanews|gma news|abs-cbn|rappler|politiko|abante|manila bulletin|manila standard|businessmirror|philippine news agency|pna\.gov|pse\.com|edge\.pse|insiderph|insider ph|manilatimes|manila times|tribune\.net|onenews|dealroom|fintechnews|mb\.com/i;

type IssuerNews = { names: string[]; minus: string[]; reject: RegExp };

const ISSUER_NEWS: Record<string, IssuerNews> = {
  BDO: {
    names: ["BDO Unibank", "Banco de Oro"],
    minus: ["Luxembourg", "BDO Zone", "biomass", "auditor"],
    reject: /bdo zone|biomass|woody|luxembourg|bdo llp|appointed bdo|bdo as (?:the )?auditor|bowie county|vegreville|noble county|accountancy today|pembroke vct|bdo luxembourg|renewableenergymagazine|canadianbiomass|railwayage|bdo exec average|tops bdo exec/i,
  },
  BPI: {
    names: ["Bank of the Philippine Islands", "BPI Unibank"],
    minus: ["France"],
    reject: /banque|\bbpi sa\b|bpi france|bpi group france/i,
  },
  SM: {
    names: ["SM Investments", "SMIC"],
    minus: ["SM Entertainment"],
    reject: /sm entertainment|sm town|hybe|k-pop|sm entertainment/i,
  },
  SMPH: { names: ["SM Prime", "SM Prime Holdings"], minus: [], reject: /$^/ },
  ICT: {
    names: ["ICTSI", "International Container Terminal"],
    minus: ["ICT sector"],
    reject: /information and communications|ict ministry|ict sector|ict department|converge ict|\bon ict\b|partnership on ict|ict, defense/i,
  },
  AC: {
    names: ["Ayala Corp", "Ayala Corporation"],
    minus: ["Air Canada"],
    reject: /air canada|\bac\/dc\b|\bacer\b/i,
  },
  ALI: {
    names: ["Ayala Land"],
    minus: ["Alibaba"],
    reject: /alibaba|ali express|aliexpress/i,
  },
  MER: {
    names: ["Meralco", "Manila Electric"],
    minus: ["Merrill"],
    reject: /merrill lynch|\bmercedes\b|\bmerck\b/i,
  },
  MBT: { names: ["Metrobank", "Metropolitan Bank"], minus: [], reject: /$^/ },
  TEL: {
    names: ["PLDT", "Philippine Long Distance"],
    minus: [],
    reject: /tel aviv|telecom italia/i,
  },
  CBC: {
    names: ["China Banking", "China Bank"],
    minus: ["CBC News"],
    reject: /canadian broadcasting|\bcbc radio\b|\bcbc news\b|\bcbc\.ca\b/i,
  },
  JFC: { names: ["Jollibee"], minus: [], reject: /$^/ },
  JGS: { names: ["JG Summit"], minus: [], reject: /$^/ },
  RCR: { names: ["RL Commercial REIT"], minus: [], reject: /$^/ },
  EMI: {
    names: ["Emperador"],
    minus: ["EMI Records"],
    reject: /\bemi records\b|\bemi music\b|\bemi group\b/i,
  },
  AREIT: { names: ["AREIT"], minus: [], reject: /$^/ },
  URC: { names: ["Universal Robina"], minus: [], reject: /$^/ },
  GLO: {
    names: ["Globe Telecom"],
    minus: [],
    reject: /globacom|\bglo nigeria\b/i,
  },
  MONDE: { names: ["Monde Nissin"], minus: [], reject: /$^/ },
  LTG: { names: ["LT Group"], minus: [], reject: /$^/ },
  GTCAP: { names: ["GT Capital"], minus: [], reject: /$^/ },
  PGOLD: { names: ["Puregold"], minus: [], reject: /$^/ },
  CNPF: { names: ["Century Pacific"], minus: [], reject: /$^/ },
  MYNLD: { names: ["Maynilad"], minus: [], reject: /$^/ },
  SMC: {
    names: ["San Miguel"],
    minus: ["Sumitomo"],
    reject: /sumitomo|\bsmbc\b/i,
  },
  DMC: { names: ["DMCI"], minus: [], reject: /$^/ },
  ACEN: { names: ["ACEN"], minus: [], reject: /$^/ },
  PLUS: {
    names: ["DigiPlus", "DigiPlus Interactive"],
    minus: ["Google Plus"],
    reject: /plus size|google plus|\bgoogle\+\b/i,
  },
  SCC: { names: ["Semirara"], minus: [], reject: /$^/ },
  AEV: { names: ["Aboitiz Equity"], minus: [], reject: /$^/ },
};


function quoteTerm(s: string) {
  const t = s.trim();
  if (!t) return t;
  if (t.startsWith('"') || !t.includes(" ")) return t;
  return `"${t}"`;
}

export function newsTicker(item: { label: string; symbol: string }) {
  return item.symbol.replace(/^\^/, "").replace(/\.PS$/i, "").trim().toUpperCase() || item.label.trim().toUpperCase();
}

function uniqNames(rows: string[]) {
  const out: string[] = [];
  for (const n of rows) {
    const t = n.trim();
    if (!t) continue;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
  }
  return out;
}

export function issuerNews(item: { label: string; symbol: string; name?: string; kind?: string }): IssuerNews | null {
  if (isPseiItem(item)) return null;
  const t = newsTicker(item);
  const official = PSEI_WEIGHTS.find((w) => w.ticker === t)?.name;
  const extra = [official, item.name, item.label].filter((x): x is string => {
    const n = x?.trim() ?? "";
    return n.length > 3 || n.includes(" ");
  });
  if (ISSUER_NEWS[t]) {
    return { ...ISSUER_NEWS[t], names: uniqNames([...ISSUER_NEWS[t].names, ...extra]) };
  }
  if (item.kind && item.kind !== "stock") return null;
  const name = (item.name ?? item.label).trim();
  if (!name) return null;
  return { names: uniqNames([name, extra.find((n) => n !== name) ?? "", official ?? ""]), minus: [], reject: /$^/ };
}

/** Legal / trade names the CFA desk and harvest use for this ticker. */
export function issuerDisplay(item: { label: string; symbol: string; name?: string; kind?: string }) {
  if (isPseiItem(item)) {
    return {
      ticker: "PSEi",
      legal: "PSE index",
      aliases: ["Philippine Stock Exchange"],
      line: "PSE index · Philippine Stock Exchange",
    };
  }
  const ticker = newsTicker(item);
  const spec = issuerNews(item);
  const names = spec?.names?.length ? spec.names : [(item.name ?? item.label).trim()].filter(Boolean);
  const legal = names[0] || ticker;
  const aliases = names.slice(1).filter((n) => n.toLowerCase() !== legal.toLowerCase());
  return { ticker, legal, aliases, line: [legal, ...aliases].join(" · ") };
}

/** Search terms for the issuer — never a bare 3-letter ticker as the whole query. */
export function issuerSearchQuery(item: { label: string; symbol: string; name?: string; kind?: string }, siteLocked = false) {
  if (isPseiItem(item)) return { q: `(PSEi OR "PSE index" OR "Philippine Stock Exchange")`, minus: "" };
  const spec = issuerNews(item);
  const ticker = newsTicker(item);
  const name = (item.name ?? item.label).trim();
  const minusOf = (rows: string[]) => rows.map((m) => (m.includes(" ") ? `-"${m}"` : `-${m}`)).join(" ");
  if (spec) {
    const names = spec.names.map(quoteTerm);
    if (siteLocked) {
      const bits = [ticker, ...names].filter((s, i, a) => s && a.indexOf(s) === i);
      return { q: `(${bits.join(" OR ")})`, minus: minusOf(spec.minus) };
    }
    const bits = [...names];
    if (ticker.length <= 3) {
      bits.push(`(${ticker} (Philippines OR PSE OR Manila OR peso))`);
    } else bits.push(ticker);
    return { q: `(${[...new Set(bits)].join(" OR ")})`, minus: minusOf(spec.minus) };
  }
  const bits = [ticker, name].filter((s, i, a) => s && a.indexOf(s) === i);
  const long = bits.filter((s) => s.length > 3 || s.includes(" "));
  const use = long.length ? long : bits;
  return { q: use.map(quoteTerm).join(" OR "), minus: "" };
}

export function relatedNeedles(item: { label: string; symbol: string; name?: string; kind: string }) {
  if (isPseiItem(item)) return ["psei", "pse index", "philippine stock exchange"];
  const spec = issuerNews(item);
  const name = (item.name ?? item.label).trim();
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  };
  for (const n of spec?.names ?? []) add(n);
  if (name) add(name);
  for (const part of name.split(/[\s,/&-]+/)) {
    const bit = part.replace(/[.]/g, "");
    if (bit.length >= 5 && !GENERIC_NAME.test(bit)) add(bit);
  }
  return out;
}

function wordHit(hay: string, token: string) {
  const t = token.trim();
  if (!t) return false;
  if (t.length <= 3) {
    return new RegExp(`(?:^|[^a-z0-9])${t.replace(/[^a-z0-9]/gi, '')}(?:[^a-z0-9]|$)`, 'i').test(hay);
  }
  return hay.includes(t.toLowerCase());
}

export function isRelatedStory(
  story: { title: string; desc?: string; src?: string },
  item: { label: string; symbol: string; name?: string; kind: string },
) {
  const titleHay = `${story.title} ${story.src ?? ""}`.toLowerCase();
  const hay = `${story.title} ${story.desc ?? ""} ${story.src ?? ""}`.toLowerCase();
  if (isPseiItem(item)) {
    return /psei|\bpse index\b|philippine stock exchange|manila (?:shares|bourse)|local bourse|pse composite/.test(hay);
  }
  const spec = issuerNews(item);
  if (spec?.reject.test(hay)) return false;
  for (const n of spec?.names ?? []) {
    if (n.length >= 4 && hay.includes(n.toLowerCase())) return true;
  }
  for (const n of relatedNeedles(item)) {
    if (n.length >= 4 && hay.includes(n)) return true;
  }
  const ticker = newsTicker(item);
  // Short tickers must hit the TITLE — RSS descriptions often dump other headlines.
  if (!wordHit(titleHay, ticker)) return false;
  if (item.kind !== "stock") return true;
  if (ticker.length >= 4) return true;
  return PH_MARK.test(titleHay);
}

export function relatedNewsQuery(item: { label: string; symbol: string; name?: string; kind: string }, window: NewsWindow = "1d") {
  const name = (item.name ?? item.label).trim();
  const sym = item.symbol.replace(/^\^/, "").replace(/\.PS$/i, "").trim();
  if (item.kind === "crypto") return `${item.label} OR ${name} crypto when:${window}`;
  if (item.kind === "fx") return `${item.label} peso forex when:${window}`;
  if (item.kind === "cmdty") return `${item.label} OR ${name} commodity when:${window}`;
  if (item.kind === "global" && !isPseiItem(item)) return `${sym} OR ${name} when:${window}`;
  const { q, minus } = issuerSearchQuery(item);
  return `${q} ${minus} when:${window}`.replace(/\s+/g, " ").trim();
}

export function relatedNewsUrl(item: { label: string; symbol: string; name?: string; kind: string }, window: NewsWindow = "1d") {
  const q = relatedNewsQuery(item, window);
  const locale = item.kind === "stock" || item.kind === "fx" || isPseiItem(item) ? "hl=en-PH&gl=PH&ceid=PH:en" : "hl=en&gl=US&ceid=US:en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${locale}`;
}

export const NEWS_LANE_KEEP = 8;
export const NEWS_LANE_MIN = 5;

function googlePhRss(query: string, window: NewsWindow) {
  const locale = "hl=en-PH&gl=PH&ceid=PH:en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${window}`)}&${locale}`;
}

export function rumorSiteUrls(item: { label: string; symbol: string; name?: string; kind?: string }, window: NewsWindow = "7d") {
  const { q, minus } = issuerSearchQuery(item, true);
  const core = `${q} ${minus}`.replace(/\s+/g, " ").trim();
  return [
    googlePhRss(`site:bilyonaryo.com ${core}`, window),
    googlePhRss(`site:politiko.com.ph ${core}`, window),
    googlePhRss(`site:abante.com.ph ${core}`, window),
    googlePhRss(`site:insiderph.com ${core}`, window),
    googlePhRss(`site:manilatimes.net ${core}`, window),
  ];
}

export function rumorTalkUrls(item: { label: string; symbol: string; name?: string; kind?: string }, window: NewsWindow = "7d") {
  const { q, minus } = issuerSearchQuery(item, true);
  const core = `${q} ${minus}`.replace(/\s+/g, " ").trim();
  return [
    googlePhRss(`${core} (in talks OR "sources say" OR rumored OR allegedly OR alleged OR "people familiar" OR mulling OR reportedly)`, window),
    googlePhRss(`${core} ("takeover talks" OR "merger talks" OR "advanced talks" OR "said to be in talks")`, window),
  ];
}

export function rumorFillUrls(item: { label: string; symbol: string; name?: string; kind?: string }, window: NewsWindow = "1y") {
  const { q, minus } = issuerSearchQuery(item, true);
  const core = `${q} ${minus}`.replace(/\s+/g, " ").trim();
  const legal = issuerNews(item)?.names?.[0] ?? item.name ?? item.label;
  return [
    googlePhRss(`site:philstar.com ${core}`, window),
    googlePhRss(`site:inquirer.net ${core}`, window),
    googlePhRss(`site:manilastandard.net ${core}`, window),
    googlePhRss(`site:tribune.net.ph ${core}`, window),
    googlePhRss(`${quoteTerm(legal)} (reportedly OR rumored OR mulling OR allegedly OR alleged OR "in talks" OR "people familiar" OR "sources say")`, window),
  ];
}

export function rumorNewsUrls(item: { label: string; symbol: string; name?: string; kind?: string }, window: NewsWindow = "7d") {
  return [...rumorSiteUrls(item, window), ...rumorTalkUrls(item, window)];
}

export function rumorNewsUrl(item: { label: string; symbol: string; name?: string; kind?: string }, window: NewsWindow = "7d") {
  return rumorNewsUrls(item, window)[0]!;
}

export type StoryLane = "fact" | "rumor" | "wire";

export type RelatedStory = {
  title: string;
  link: string;
  desc: string;
  date: string;
  src: string;
  lane: StoryLane;
};

const RUMOR_COPY =
  /bilyonaryo|politiko|abante|in talks|sources? say|rumou?r\b|unconfirmed|\balleged(?:ly)?\b|hearsay|tipped to|said to be (?:in talks|eyeing)|according to people familiar|people familiar|unnamed source|mulling|advanced talks|takeover talk|merger talks|exploring a (?:deal|stake|bid)|reportedly/i;
const FACT_COPY =
  /pse\.com\.ph|edge\.pse|businessworld|bworldonline|reuters|inquirer|bloomberg|abs-cbn|gmanews|gma news|philstar\.com|mb\.com|manila bulletin|businessmirror|rappler|ft\.com|wsj|associated press/i;

export function storyLane(story: { title: string; desc?: string; src?: string }): StoryLane {
  const hay = `${story.title} ${story.desc ?? ""} ${story.src ?? ""}`;
  if (RUMOR_COPY.test(hay)) return "rumor";
  if (FACT_COPY.test(hay)) return "fact";
  return "wire";
}

function asStories(xml: string): RelatedStory[] {
  return parseRss(xml)
    .filter((s) => s.title && !/^untitled$/i.test(s.title))
    .map((s) => {
      const title = cleanHeadline(s.title) || s.title;
      const src = s.source || "Google News";
      return {
        title,
        link: s.link,
        desc: s.desc,
        date: s.date,
        src,
        lane: storyLane({ title, desc: s.desc, src }),
      };
    })
    .filter((s) => s.title);
}

function mergeStories(rows: RelatedStory[]) {
  const seen = new Set<string>();
  const out: RelatedStory[] = [];
  for (const row of rows) {
    const key = `${row.link}|${row.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort((a, b) => Date.parse(b.date || "") - Date.parse(a.date || ""));
}

const DESK_JUNK =
  /tradingview|stock price and chart|live better with|pay mo na|credit cards|referral campaign|anniversary raffle|easy,\s*simple and secure banking|deeper ties with filipinos|facebook into ofw|^winning\s*\||named best digital wallet|ofws chart future|summit point|holds nerve|golf tournament|\buaap\b|\bpba\b|basketball championship/i;

export function isDeskStory(story: { title: string; src?: string }) {
  const hay = `${story.title} ${story.src ?? ""}`;
  if (DESK_JUNK.test(hay)) return false;
  if (/facebook\.com|twitter\.com|\bx\.com\b/i.test(story.src ?? "")) return false;
  if (/full story:\s*https?:\/\//i.test(story.title)) return false;
  return true;
}

const FP_STOP = new Set(["the", "from", "with", "for", "and", "its", "has", "was", "are"]);

export function storyFingerprint(title: string) {
  const t = title.toLowerCase().replace(/\s*[-—|].*$/, "");
  const nums = [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]).join("-");
  const words = t
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !FP_STOP.has(w));
  if (nums && words[0]) return `${words[0]}#${nums}`;
  return `${words.slice(0, 2).join(" ")}#`;
}

export function collapseNearDup(rows: RelatedStory[]) {
  const seen = new Set<string>();
  const out: RelatedStory[] = [];
  for (const row of rows) {
    const fp = storyFingerprint(row.title);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(row);
  }
  return out;
}

export function pickNewsLanes(related: RelatedStory[]) {
  const facts = related.filter((s) => s.lane !== "rumor").slice(0, NEWS_LANE_KEEP);
  const rumors = related.filter((s) => s.lane === "rumor").slice(0, NEWS_LANE_KEEP);
  return { facts, rumors, stories: mergeStories([...facts, ...rumors]) };
}

const SOFT_TALK =
  /in talks|sources? say|rumou?r|\balleged(?:ly)?\b|mulling|reportedly|people familiar|tipped|unconfirmed|may (?:buy|sell|raise)|takeover talk|merger talks|advanced talks|said to be/i;

export function fillRumorLane(related: RelatedStory[], min = NEWS_LANE_MIN) {
  const rumors = related.filter((s) => s.lane === "rumor");
  const facts = related.filter((s) => s.lane !== "rumor");
  if (rumors.length >= min) return pickNewsLanes(related);
  const need = min - rumors.length;
  const promoted: RelatedStory[] = [];
  const rest: RelatedStory[] = [];
  for (const s of facts) {
    if (promoted.length < need && SOFT_TALK.test(`${s.title} ${s.desc ?? ""} ${s.src}`)) {
      promoted.push({ ...s, lane: "rumor" });
    } else rest.push(s);
  }
  return pickNewsLanes([...rest, ...rumors, ...promoted]);
}

function prepRelated(
  gathered: RelatedStory[],
  item: { label: string; symbol: string; name?: string; kind: string },
) {
  return collapseNearDup(mergeStories(gathered.filter((s) => isRelatedStory(s, item) && isDeskStory(s))));
}

async function pullStories(urls: string[]) {
  return (
    await Promise.all(
      urls.map(async (url) => {
        try {
          return asStories(await httpText(url));
        } catch {
          return [] as RelatedStory[];
        }
      }),
    )
  ).flat();
}

export async function harvestRelatedStories(item: { label: string; symbol: string; name?: string; kind: string }): Promise<RelatedStory[]> {
  const urls: string[] = [];
  for (const window of ["1d", "7d", "1y"] as const) urls.push(relatedNewsUrl(item, window));
  if (item.kind === "stock" || item.kind === "fx" || isPseiItem(item)) {
    urls.push(...rumorNewsUrls(item, "1y"));
  }
  let gathered = await pullStories(urls);
  let related = prepRelated(gathered, item);
  let picked = fillRumorLane(related);
  if (picked.rumors.length < NEWS_LANE_MIN && (item.kind === "stock" || isPseiItem(item))) {
    gathered = [...gathered, ...(await pullStories(rumorFillUrls(item, "1y")))];
    related = prepRelated(gathered, item);
    picked = fillRumorLane(related);
  }
  return picked.stories;
}

const relatedItem = z.object({
  label: z.string(),
  symbol: z.string(),
  name: z.string().optional(),
  kind: z.string(),
});

export const fetchRelatedStories = createServerFn({ method: "POST" })
  .validator(relatedItem)
  .handler(async ({ data }) => harvestRelatedStories(data));
