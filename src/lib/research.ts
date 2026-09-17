import { httpText } from "./http.ts";
import { parseRss } from "./feeds.ts";
import { cleanHeadline } from "./headline.ts";
import { deskZone, moneyQuote, phpQuote, vol } from "./format.ts";
import { BLUECHIPS, DIVIDENDS, REITS, displayLast, inSleeve, turnover, type BoardRow } from "./market-board.ts";
import { weightTake } from "./psei-weight.ts";
import { isPseiItem, PSEI_SYMBOL } from "./yahoo.ts";
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
  return n >= 100 ? n.toFixed(0) : n.toFixed(1);
}

function peTake(pe?: number, fwd?: number) {
  if (pe == null || pe <= 0) return null;
  const tail = fwd && fwd > 0 ? `, forward ${peFmt(fwd)}` : "";
  if (pe < 8) return `Trailing PE ${peFmt(pe)}${tail} — cheap vs a 15–20 market, or a value trap.`;
  if (pe < 15) return `Trailing PE ${peFmt(pe)}${tail} — below a typical market multiple.`;
  if (pe <= 22) return `Trailing PE ${peFmt(pe)}${tail} — in a typical market band.`;
  if (pe <= 35) return `Trailing PE ${peFmt(pe)}${tail} — growth has to keep showing up.`;
  return `Trailing PE ${peFmt(pe)}${tail} — rich. Only works if earnings compound.`;
}

function yldTake(y?: number) {
  if (y == null || y <= 0) return null;
  if (y >= 8) return `Yield ${y.toFixed(1)}% — high. Check if the dividend is covered.`;
  if (y >= 4) return `Yield ${y.toFixed(1)}% — income sleeve territory.`;
  return `Yield ${y.toFixed(1)}%.`;
}

export function buildResearch(row: BoardRow, asOf = new Date()): ResearchNote {
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
  if (last != null && q?.weekLow != null && q?.weekHigh != null && q.weekHigh > q.weekLow) {
    const pos = (last - q.weekLow) / (q.weekHigh - q.weekLow);
    if (pos >= 0.9) technical.push("Last is near the 52-week high. A failed break is a fade.");
    else if (pos <= 0.1) technical.push("Last is near the 52-week low. A failed breakdown is a bounce.");
    else technical.push(`${Math.round(pos * 100)}% of the 52-week range.`);
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

  const expert: string[] = [];
  if (peLine) expert.push(peLine);
  if (yLine) expert.push(yLine);
  if (last != null && q?.weekLow != null && q?.weekHigh != null && q.weekHigh > q.weekLow) {
    const pos = (last - q.weekLow) / (q.weekHigh - q.weekLow);
    expert.push(`${Math.round(Math.min(1, Math.max(0, pos)) * 100)}% of the 52-week range.`);
  }
  if (q?.pb && q.pb > 0) {
    expert.push(q.pb < 1 ? `P/B ${q.pb.toFixed(1)} — below book.` : `P/B ${q.pb.toFixed(1)}.`);
  }
  if (q?.volume && q.avgVolume && q.avgVolume > 0 && q.kind !== "stock") {
    const r = q.volume / q.avgVolume;
    if (r >= 1.8) expert.push(`Volume ${r.toFixed(1)}× the 10-day typical.`);
    else if (r <= 0.5) expert.push(`Volume ${r.toFixed(1)}× typical — quiet tape.`);
  }
  if (!expert.length && !(code === PSEI_SYMBOL || ticker === "PSEi" || isPseiItem(row.item))) {
    expert.push("No PE, yield, or 52-week box on this quote — tape and levels only.");
  }
  if (code === PSEI_SYMBOL || ticker === "PSEi" || isPseiItem(row.item)) {
    expert.push(...weightTake());
  }

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
    { text: note.asOf, size: 9, gap: 8, gray: true },
    { text: `Sleeve  ${note.index}`, size: 10, gap: 16 },
    { text: `Last ${note.last}    ${note.change}    ${note.volume}`, size: 11, gap: 10 },
    { text: `Bias  ${note.bias}    Range  ${note.rangePos}`, size: 12, bold: true, gap: 18 },
    { text: "SNAPSHOT", size: 9, bold: true, gap: 12 },
    { text: `High ${note.high}    Low ${note.low}`, size: 10, gap: 12 },
    { text: `Support ${note.support}    Pivot ${note.pivot}    Resistance ${note.resistance}`, size: 10, gap: 18 },
    { text: "STANDPOINT", size: 9, bold: true, gap: 14 },
    ...note.thesis.slice(0, 2).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
    ...note.technical.slice(0, 2).flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
    ...((note.expert ?? []).length
      ? [
          { text: "EXPERT", size: 9, bold: true, gap: 14 } as PdfLine,
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

export type NewsWindow = "1d" | "7d" | "30d";

const GENERIC_NAME = /^(inc|corp|corporation|holdings?|plc|ltd|limited|group|the|and|of|ph|co|company|philippine|philippines)$/i;

export function relatedNeedles(item: { label: string; symbol: string; name?: string; kind: string }) {
  if (isPseiItem(item)) return ["psei", "pse index", "philippine stock exchange"];
  const name = (item.name ?? item.label).trim();
  const sym = item.symbol.replace(/^\^/, "").replace(/\.PS$/i, "").trim();
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  };
  if (sym) add(sym);
  if (item.label) add(item.label);
  if (name) add(name);
  for (const part of name.split(/[\s,/&-]+/)) {
    const bit = part.replace(/[.]/g, "");
    if (bit.length >= 3 && !GENERIC_NAME.test(bit)) add(bit);
  }
  return out;
}

export function isRelatedStory(
  story: { title: string; desc?: string; src?: string },
  item: { label: string; symbol: string; name?: string; kind: string },
) {
  const hay = `${story.title} ${story.desc ?? ""} ${story.src ?? ""}`.toLowerCase();
  if (isPseiItem(item)) {
    return /psei|\bpse index\b|philippine stock exchange|manila (?:shares|bourse)|local bourse|pse composite/.test(hay);
  }
  for (const n of relatedNeedles(item)) {
    if (n.length <= 3) {
      const re = new RegExp(`(?:^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`, "i");
      if (re.test(hay)) return true;
    } else if (hay.includes(n)) return true;
  }
  return false;
}

export function relatedNewsQuery(item: { label: string; symbol: string; name?: string; kind: string }, window: NewsWindow = "1d") {
  const name = (item.name ?? item.label).trim();
  const sym = item.symbol.replace(/^\^/, "").replace(/\.PS$/i, "").trim();
  let q = "";
  if (isPseiItem(item)) q = `PSEi OR "PSE index" OR "Philippine Stock Exchange"`;
  else if (item.kind === "crypto") q = `${item.label} OR ${name} crypto`;
  else if (item.kind === "fx") q = `${item.label} peso forex`;
  else if (item.kind === "cmdty") q = `${item.label} OR ${name} commodity`;
  else if (item.kind === "global") q = `${sym} OR ${name}`;
  else {
    const bits = [sym, name].filter((s, i, a) => s && a.indexOf(s) === i);
    q = bits.map((s) => (s.includes(" ") ? `"${s}"` : s)).join(" OR ");
  }
  return `${q} when:${window}`;
}

export function relatedNewsUrl(item: { label: string; symbol: string; name?: string; kind: string }, window: NewsWindow = "1d") {
  const q = relatedNewsQuery(item, window);
  const locale = item.kind === "stock" || item.kind === "fx" || isPseiItem(item) ? "hl=en-PH&gl=PH&ceid=PH:en" : "hl=en&gl=US&ceid=US:en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${locale}`;
}

export function rumorNewsUrls(item: { label: string; symbol: string; name?: string; kind?: string }, window: NewsWindow = "7d") {
  const name = (item.name ?? item.label).trim();
  const sym = item.symbol.replace(/^\^/, "").replace(/\.PS$/i, "").trim();
  const bits = isPseiItem(item)
    ? ["PSEi", `"PSE index"`]
    : [sym, name].filter((s, i, a) => s && a.indexOf(s) === i);
  const q = bits.map((s) => (s.includes(" ") && !s.startsWith('"') ? `"${s}"` : s)).join(" OR ");
  const locale = "hl=en-PH&gl=PH&ceid=PH:en";
  const rss = (query: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${window}`)}&${locale}`;
  return [
    rss(`site:bilyonaryo.com (${q})`),
    rss(`site:politiko.com.ph (${q})`),
    rss(`site:abante.com.ph (${q})`),
    rss(`(${q}) (in talks OR "sources say" OR rumored OR allegedly OR "people familiar")`),
  ];
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
  /bilyonaryo|politiko|abante|in talks|sources? say|rumou?r\b|unconfirmed|allegedly|hearsay|tipped to|said to be (?:in talks|eyeing)|according to people familiar|people familiar|unnamed source|mulling|advanced talks/i;
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

export async function harvestRelatedStories(item: { label: string; symbol: string; name?: string; kind: string }): Promise<RelatedStory[]> {
  const urls: string[] = [];
  for (const window of ["1d", "7d", "30d"] as const) urls.push(relatedNewsUrl(item, window));
  if (item.kind === "stock" || item.kind === "fx" || isPseiItem(item)) {
    urls.push(...rumorNewsUrls(item, "7d"), rumorNewsUrl(item, "30d"));
  }
  const gathered = (
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
  const related = mergeStories(gathered.filter((s) => isRelatedStory(s, item)));
  const facts = related.filter((s) => s.lane !== "rumor").slice(0, 8);
  const rumors = related.filter((s) => s.lane === "rumor").slice(0, 8);
  return mergeStories([...facts, ...rumors]);
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
