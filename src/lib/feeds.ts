import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cleanHeadline, keepStory } from "./headline";

export type ParsedStory = {
  title: string;
  link: string;
  desc: string;
  date: string;
};

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (raw, token: string) => {
    if (token[0] === "#") {
      const code =
        token[1] === "x" || token[1] === "X"
          ? Number.parseInt(token.slice(2), 16)
          : Number.parseInt(token.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : raw;
    }
    return NAMED[token.toLowerCase()] ?? raw;
  });
}

function decode(s: string) {
  const unwrapped = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const text = decodeEntities(decodeEntities(unwrapped))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function tag(block: string, name: string) {
  const m = block.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"),
  );
  return m ? decode(m[1]) : "";
}

function parseRss(xml: string): ParsedStory[] {
  const chunks = xml.split(/<item[\s>]/i).slice(1);
  const alt = xml.split(/<entry[\s>]/i).slice(1);
  const parts = chunks.length ? chunks : alt;
  return parts.slice(0, 32).map((raw) => {
    const block = raw.split(/<\/item>|<\/entry>/i)[0];
    const linkHref =
      tag(block, "link") ||
      (block.match(/<link[^>]+href=["']([^"']+)/i) || [])[1] ||
      "";
    return {
      title: tag(block, "title") || "Untitled",
      link: decodeEntities(linkHref),
      desc: (tag(block, "description") || tag(block, "summary")).slice(0, 180),
      date: tag(block, "pubDate") || tag(block, "updated") || tag(block, "published"),
    };
  });
}

export const fetchFeed = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url(), name: z.string(), category: z.string() }))
  .handler(async ({ data }) => {
    const res = await fetch(data.url, {
      headers: { "user-agent": "Atrium/1.0 (personal dashboard)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Feed ${data.name} failed (${res.status})`);
    const xml = await res.text();
    return parseRss(xml)
      .map((s) => ({ ...s, src: data.name, category: data.category }))
      .filter(keepStory)
      .map((s) => ({ ...s, title: cleanHeadline(s.title) || s.title }))
      .slice(0, 16);
  });

export const fetchIcsUrl = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url() }))
  .handler(async ({ data }) => {
    const url = data.url.replace(/^webcal:/i, "https:");
    const res = await fetch(url, {
      headers: { "user-agent": "Atrium/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Calendar fetch failed (${res.status})`);
    return await res.text();
  });
