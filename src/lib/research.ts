import { deskZone, moneyQuote, phpQuote, vol } from "./format.ts";
import { BANK_TICKERS, BLUECHIPS, DIVIDENDS, PSEI_NAMES, REITS, displayLast, inSleeve, turnover, type BoardRow } from "./market-board.ts";
import { nameWeight, sleeveWeight, weightTake } from "./psei-weight.ts";
import { isPseiItem, PSEI_SYMBOL } from "./yahoo.ts";
import { bankFiling, distortedPublicTape, filingFreshness, justifiedPb, liveBankFiling } from "./pse-fundamentals.ts";
import { issuerDisplay } from "./news.ts";

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
  metrics: { pe: string; ep: string; pb: string; yld: string; wt: string; week: string; weekLabel: string; vol: string; roe: string; nim: string; npl: string; cet1: string; ch1y: string; rsi: string; sma50: string };
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
  if ((!q || q.kind === "stock") && inSleeve(BLUECHIPS, code, ticker, row.item.id)) tags.push("PSEi");
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
  if (distortedPublicTape(q)) {
    valuation.push(
      `Public-tape TTM ROE ${q?.roe?.toFixed(1)}% and P/B ${q?.pb?.toFixed(1)} look distorted on this name (StockAnalysis TTM). Not a CFA input — do not haircut it, treat it as a data gap.`,
    );
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
    if (r >= 1.8) tape.push(`Volume ${r.toFixed(1)}× typical on the public tape — CFA tape confirmation.`);
    else if (r <= 0.5) tape.push(`Volume ${r.toFixed(1)}× typical — quiet tape.`);
    else tape.push(`Volume ${r.toFixed(1)}× typical on the public tape.`);
  }
  if (q?.weekChange != null && Number.isFinite(q.weekChange)) {
    tape.push(`52-week change ${q.weekChange.toFixed(1)}% on the public tape — a return, not a high/low box.`);
  }
  if (last != null && q?.sma50 && q.sma50 > 0) {
    const vs = ((last / q.sma50) - 1) * 100;
    tape.push(`Last is ${vs >= 0 ? "+" : ""}${vs.toFixed(1)}% vs the 50-day SMA (${moneyShown(q.sma50, ccy)}).`);
  }
  if (q?.rsi && q.rsi > 0) {
    if (q.rsi <= 30) tape.push(`RSI ${q.rsi.toFixed(0)} — oversold band on the public tape.`);
    else if (q.rsi >= 70) tape.push(`RSI ${q.rsi.toFixed(0)} — overbought band on the public tape.`);
    else tape.push(`RSI ${q.rsi.toFixed(0)} on the public tape.`);
  }
  if (q?.beta && q.beta > 0) tape.push(`Beta ${q.beta.toFixed(2)} on the public tape.`);

  const wt = !q || q.kind === "stock" ? nameWeight(code) ?? nameWeight(ticker) : null;
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
    ch1y: q?.weekChange != null && Number.isFinite(q.weekChange) ? `${q.weekChange.toFixed(1)}%` : "—",
    rsi: q?.rsi && q.rsi > 0 ? q.rsi.toFixed(0) : "—",
    sma50: q?.sma50 && q.sma50 > 0 ? moneyShown(q.sma50, ccy) : "—",
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

function headerOps() {
  return [
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
}

function lineOps(line: PdfLine, y: number) {
  const font = line.bold ? "F2" : "F1";
  const fill = line.gray ? "0.42 0.42 0.4 rg" : "0.09 0.09 0.09 rg";
  return [
    "BT",
    fill,
    `/${font} ${line.size} Tf`,
    `1 0 0 1 48 ${y} Tm`,
    `(${pdfEscape(line.text)}) Tj`,
    "ET",
  ].join("\n");
}

function paginateOps(lines: PdfLine[]): string[] {
  const pages: string[] = [];
  let ops: string[] = [headerOps()];
  let y = 768;
  for (const line of lines) {
    const gap = line.gap ?? 14;
    if (y - gap < 40) {
      pages.push(ops.join("\n"));
      ops = [headerOps()];
      y = 768;
    }
    ops.push(lineOps(line, y));
    y -= gap;
  }
  pages.push(ops.join("\n"));
  return pages;
}

function encodePdf(pages: string[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let pos = 0;
  const push = (s: string) => {
    const b = enc.encode(s);
    chunks.push(b);
    pos += b.byteLength;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = pos;
    push(`${n} 0 obj ${body} endobj\n`);
  };
  push("%PDF-1.4\n");
  const kids = pages.map((_, i) => `${5 + 2 * i} 0 R`).join(" ");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  obj(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  pages.forEach((draw, i) => {
    const pageNo = 5 + 2 * i;
    const contentNo = 6 + 2 * i;
    const stream = enc.encode(draw);
    obj(
      pageNo,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentNo} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
    );
    offsets[contentNo] = pos;
    push(`${contentNo} 0 obj << /Length ${stream.byteLength} >> stream\n`);
    chunks.push(stream);
    pos += stream.byteLength;
    push("\nendstream endobj\n");
  });
  const xrefAt = pos;
  const last = 4 + 2 * pages.length;
  let xref = `xref\n0 ${last + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= last; i += 1) {
    xref += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer << /Size ${last + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  const out = new Uint8Array(pos);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** Helvetica desk note — paginates when the Expert take runs long. */
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
    { text: `52w chg ${note.metrics.ch1y}    SMA50 ${note.metrics.sma50}    RSI ${note.metrics.rsi}`, size: 10, gap: 18 },
    { text: "STANDPOINT", size: 9, bold: true, gap: 14 },
    ...note.thesis.slice(0, 2).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
    ...note.technical.slice(0, 2).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
    ...((note.expert ?? []).length
      ? [
          { text: "CFA DESK / EXPERT", size: 9, bold: true, gap: 14 } as PdfLine,
          ...(note.expert ?? []).slice(0, 8).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
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
  return encodePdf(paginateOps(lines));
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
  return url;
}

export {
  NEWS_FRESH_DAYS,
  NEWS_LANE_KEEP,
  NEWS_LANE_MIN,
  NEWS_TALK_DAYS,
  collapseNearDup,
  fillRumorLane,
  isDeskStory,
  isFreshStory,
  isRelatedStory,
  issuerDisplay,
  issuerNews,
  issuerSearchQuery,
  newsAfterDay,
  newsAsked,
  newsDeskId,
  newsRowHint,
  newsTicker,
  pickNewsLanes,
  relatedNeedles,
  relatedNewsQuery,
  relatedNewsUrl,
  rumorFillUrls,
  rumorNewsUrl,
  rumorNewsUrls,
  rumorSiteUrls,
  rumorTalkUrls,
  storyAgeDays,
  storyFingerprint,
  storyLane,
} from "./news.ts";
export type { NewsWindow, RelatedStory, StoryLane } from "./news.ts";
export { fetchRelatedStories, harvestRelatedStories } from "./news-harvest.ts";
export type { RelatedDesk } from "./news-harvest.ts";
