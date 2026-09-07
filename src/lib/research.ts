import { moneyQuote, phpQuote, vol } from "./format.ts";
import { BLUECHIPS, DIVIDENDS, REITS, displayLast, inSleeve, turnover, type BoardRow } from "./market-board.ts";

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
  if (inSleeve(REITS, code, ticker)) tags.push("REIT");
  if (inSleeve(DIVIDENDS, code, ticker)) tags.push("DivY");
  if (q?.kind === "crypto") tags.push("Crypto");
  if (q?.kind === "fx") tags.push("FX");
  if (!tags.length) tags.push(q?.kind === "stock" ? "PSE" : "Market");

  const thesis: string[] = [];
  if (ch == null) {
    thesis.push("No live print. Treat this as a blank sheet until last and volume refresh.");
  } else if (bias === "Bullish") {
    thesis.push(`Tape is ${ch.toFixed(2)}% on the session. Buyers have the last print.`);
  } else if (bias === "Bearish") {
    thesis.push(`Tape is ${ch.toFixed(2)}% on the session. Sellers have the last print.`);
  } else {
    thesis.push(`Tape is ${ch.toFixed(2)}% - a range day. Wait for a close outside the box.`);
  }
  if (q?.kind === "stock") {
    thesis.push(
      inSleeve(BLUECHIPS, code, ticker)
        ? "PSEi name as of the 3 Aug 2026 review (PSE CN-2026-0035). Liquidity is the point of the index."
        : "Not a PSEi constituent. Size and float are not the same as a blue chip.",
    );
  }

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
  technical.push("Desk note only. No broker, no target, no stop.");

  const levels: string[] = [];
  if (support != null) levels.push(`Support  ${moneyShown(support, ccy)}`);
  if (pivot != null) levels.push(`Pivot    ${moneyShown(pivot, ccy)}`);
  if (resistance != null) levels.push(`Resistance  ${moneyShown(resistance, ccy)}`);
  if (q?.low != null && q.high != null) {
    levels.push(`Session  ${moneyShown(q.low, ccy)} - ${moneyShown(q.high, ccy)}`);
  }
  if (!levels.length) levels.push("No high/low on this quote.");

  const manila = asOf.toLocaleString("en-GB", {
    timeZone: "Asia/Manila",
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
    asOf: `${manila} Asia/Manila`,
    last: last != null ? moneyShown(last, ccy) : "-",
    change: ch == null ? "-" : `${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%`,
    volume: q ? (q.kind === "crypto" ? `Vol ${vol(q.volume ?? 0)}` : phpQuote(turnover(q))) : "-",
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
    { text: "LEVELS", size: 9, bold: true, gap: 12 },
    ...note.levels.flatMap((t) => wrap(t, 86).map((text) => ({ text, size: 10, gap: 12 }))),
    { text: "TECHNICAL STANDPOINT", size: 9, bold: true, gap: 14 },
    ...note.technical.flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
    { text: "NOTE", size: 9, bold: true, gap: 14 },
    ...note.thesis.flatMap((t) => wrap(t, 86).map((text, i) => ({ text: i === 0 ? `* ${text}` : `  ${text}`, size: 10, gap: 12 }))),
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

export function relatedNewsQuery(item: { label: string; symbol: string; name?: string; kind: string }) {
  const name = item.name ?? item.label;
  if (item.kind === "crypto") return `${item.label} ${name} crypto`;
  if (item.kind === "fx") return `${item.label} peso forex`;
  return `${item.symbol} ${name}`;
}

export function relatedNewsUrl(item: { label: string; symbol: string; name?: string; kind: string }) {
  const q = relatedNewsQuery(item);
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-PH&gl=PH&ceid=PH:en`;
}
