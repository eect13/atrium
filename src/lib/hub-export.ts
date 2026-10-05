/** Resource hub .md / PDF export — titles from items; context-neutral. */

import { downloadText } from "./books.ts";
import { deskPdf, downloadPdf, wrapPdfText, type DeskPdfLine } from "./desk-pdf.ts";
import { hostOf, type HubItem } from "./feed.ts";
import { isoDate } from "./format.ts";

export function hubMarkdown(items: HubItem[]): string {
  const lines = ["# Resource hub", ""];
  if (!items.length) {
    lines.push("_Empty hub._", "");
    return lines.join("\n");
  }
  for (const h of items) {
    lines.push(`## ${h.title || hostOf(h.url)}`);
    lines.push("");
    lines.push(`- URL: ${h.url}`);
    lines.push(`- Kind: ${h.kind}`);
    if (h.src) lines.push(`- Source: ${h.src}`);
    if (h.note?.trim()) {
      lines.push("");
      lines.push(h.note.trim());
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function hubPdfBytes(items: HubItem[]): Uint8Array {
  const lines: DeskPdfLine[] = [
    { text: "Resource hub", size: 18, bold: true, gap: 18 },
    { text: `${items.length} item${items.length === 1 ? "" : "s"}`, size: 10, gap: 16, gray: true },
  ];
  if (!items.length) {
    lines.push({ text: "Empty hub.", size: 11, gap: 12, gray: true });
  }
  for (const h of items) {
    lines.push({ text: h.title || hostOf(h.url), size: 13, bold: true, gap: 12 });
    lines.push({ text: h.url, size: 9, gap: 10, gray: true });
    lines.push({ text: `Kind  ${h.kind}${h.src ? `    ${h.src}` : ""}`, size: 10, gap: 12 });
    if (h.note?.trim()) {
      for (const row of wrapPdfText(h.note.trim(), 86)) {
        lines.push({ text: row, size: 10, gap: 12 });
      }
    }
    lines.push({ text: " ", size: 8, gap: 10 });
  }
  return deskPdf(lines, "RESOURCE HUB");
}

export function downloadHubMarkdown(items: HubItem[]) {
  downloadText(`atrium-hub-${isoDate()}.md`, hubMarkdown(items), "text/markdown;charset=utf-8");
}

export function downloadHubPdf(items: HubItem[]) {
  downloadPdf(`atrium-hub-${isoDate()}.pdf`, hubPdfBytes(items));
}

export function downloadHubItemMarkdown(item: HubItem) {
  downloadText(`atrium-hub-${isoDate()}.md`, hubMarkdown([item]), "text/markdown;charset=utf-8");
}

export function downloadHubItemPdf(item: HubItem) {
  downloadPdf(`atrium-hub-${isoDate()}.pdf`, hubPdfBytes([item]));
}
