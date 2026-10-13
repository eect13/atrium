/** Shared Helvetica desk PDF encoder — research notes + hub export. */

export type DeskPdfLine = { text: string; size: number; bold?: boolean; gap?: number; gray?: boolean };

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

function pdfEscape(s: string) {
  return ascii(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function wrapPdfText(text: string, width: number) {
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

function headerOps(title: string) {
  return [
    "0.08 0.08 0.09 rg",
    "0 792 595 50 re f",
    "1 1 1 rg",
    "BT",
    "/F2 11 Tf",
    "1 0 0 1 48 810 Tm",
    `(${pdfEscape(title)}) Tj`,
    "ET",
    "0.82 0.82 0.8 rg",
    "48 786 499 0.6 re f",
  ].join("\n");
}

function lineOps(line: DeskPdfLine, y: number) {
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

function paginateOps(lines: DeskPdfLine[], header: string): string[] {
  const pages: string[] = [];
  let ops: string[] = [headerOps(header)];
  let y = 768;
  for (const line of lines) {
    const gap = line.gap ?? 14;
    if (y - gap < 40) {
      pages.push(ops.join("\n"));
      ops = [headerOps(header)];
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

/** Encode desk lines into a PDF. Context-neutral header (e.g. ATRIUM RESEARCH / RESOURCE HUB). */
export function deskPdf(lines: DeskPdfLine[], header = "ATRIUM"): Uint8Array {
  return encodePdf(paginateOps(lines, header));
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
