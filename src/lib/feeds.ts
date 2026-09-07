import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cleanHeadline, keepStory, type NewsTag } from "./headline.ts";

export type ParsedStory = {
  title: string;
  link: string;
  desc: string;
  date: string;
};

export type FeedProbe = {
  ok: boolean;
  url: string;
  title: string;
  error?: string;
};

export const FEED_PRESETS: { name: string; url: string; category: NewsTag }[] = [
  { name: "Inquirer", url: "https://www.inquirer.net/fullfeed/", category: "Philippines" },
  { name: "Philstar", url: "https://www.philstar.com/rss/headlines", category: "Philippines" },
  { name: "Reuters", url: "https://feeds.reuters.com/reuters/worldNews", category: "World" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "Tech" },
  { name: "ESPN", url: "https://www.espn.com/espn/rss/news", category: "Sports" },
  { name: "Variety", url: "https://variety.com/feed/", category: "Entertainment" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "Tech" },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "World" },
];

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
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}

export function parseRss(xml: string): ParsedStory[] {
  const chunks = xml.split(/<item[\s>]/i).slice(1);
  const alt = xml.split(/<entry[\s>]/i).slice(1);
  const parts = chunks.length ? chunks : alt;
  return parts.slice(0, 32).map((raw) => {
    const block = raw.split(/<\/item>|<\/entry>/i)[0];
    const linkHref =
      tag(block, "link") || (block.match(/<link[^>]+href=["']([^"']+)/i) || [])[1] || "";
    return {
      title: tag(block, "title") || "Untitled",
      link: decodeEntities(linkHref),
      desc: (tag(block, "description") || tag(block, "summary")).slice(0, 180),
      date: tag(block, "pubDate") || tag(block, "updated") || tag(block, "published"),
    };
  });
}

export function looksLikeFeed(body: string, contentType: string) {
  const ct = contentType.toLowerCase();
  if (ct.includes("rss") || ct.includes("atom") || ct.includes("xml")) return true;
  const head = body.slice(0, 800).toLowerCase();
  return (
    head.includes("<rss") ||
    head.includes("<feed") ||
    head.includes("<rdf:rdf") ||
    head.includes("<?xml")
  );
}

export function discoverFeedHref(html: string, base: string): string | undefined {
  const re =
    /<link[^>]+rel=["'][^"']*alternate[^"']*["'][^>]*>/gi;
  for (const raw of html.matchAll(re)) {
    const tag = raw[0];
    const type = (tag.match(/type=["']([^"']+)/i) || [])[1] ?? "";
    if (!/rss|atom|xml/i.test(type) && !/alternate/i.test(tag)) continue;
    if (!/rss|atom|xml/i.test(type) && !/rss|atom/i.test(tag)) continue;
    const href = (tag.match(/href=["']([^"']+)/i) || [])[1];
    if (!href) continue;
    try {
      return new URL(href, base).toString();
    } catch {
      continue;
    }
  }
  const fallback = html.match(
    /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)/i,
  );
  if (fallback?.[1]) {
    try {
      return new URL(fallback[1], base).toString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function normalizeFeedUrl(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

export function candidateFeedUrls(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const out: string[] = [];
  const push = (s: string) => {
    const n = normalizeFeedUrl(s);
    if (n && !out.includes(n)) out.push(n);
  };
  push(t);
  if (!t.includes(".") && /^[a-z0-9-]{2,40}$/i.test(t)) {
    const slug = t.toLowerCase();
    for (const host of [`${slug}.com`, `www.${slug}.com`, `${slug}.net`, `${slug}.org`, `${slug}.ph`]) {
      push(host);
    }
  }
  return out;
}

function channelTitle(xml: string) {
  const channel = xml.split(/<channel[\s>]/i)[1] ?? xml.split(/<feed[\s>]/i)[1] ?? xml;
  return tag(channel.split(/<item[\s>]|<entry[\s>]/i)[0] ?? "", "title");
}

const FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

async function pull(url: string) {
  const res = await fetch(url, {
    headers: { "user-agent": FETCH_UA, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8" },
    signal: AbortSignal.timeout(8_000),
    redirect: "follow",
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, type: res.headers.get("content-type") ?? "", body, finalUrl: res.url || url };
}

export const fetchFeed = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url(), name: z.string(), category: z.string() }))
  .handler(async ({ data }) => {
    const res = await fetch(data.url, {
      headers: { "user-agent": FETCH_UA },
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

export const probeFeed = createServerFn({ method: "POST" })
  .validator(z.object({ input: z.string().trim().min(2).max(400) }))
  .handler(async ({ data }): Promise<FeedProbe> => {
    const urls = candidateFeedUrls(data.input);
    if (!urls.length) return { ok: false, url: data.input, title: "", error: "Need a site name or RSS address" };
    let lastError = "Could not reach that address";
    for (const first of urls) {
      try {
        const hit = await pull(first);
        if (looksLikeFeed(hit.body, hit.type) && parseRss(hit.body).length) {
          return { ok: true, url: hit.finalUrl, title: channelTitle(hit.body) || "Feed" };
        }
        const href = discoverFeedHref(hit.body, hit.finalUrl);
        if (href) {
          const feed = await pull(href);
          if (looksLikeFeed(feed.body, feed.type) || parseRss(feed.body).length) {
            return { ok: true, url: feed.finalUrl, title: channelTitle(feed.body) || "Feed" };
          }
          lastError = "That feed was empty";
          continue;
        }
        lastError = hit.ok ? "No RSS on that page — paste the feed URL" : `Could not open (${hit.status})`;
      } catch {
        lastError = "Could not reach that address";
      }
    }
    return { ok: false, url: urls[0]!, title: "", error: lastError };
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
