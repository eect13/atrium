import { createServerFn } from "@tanstack/react-start";
import { httpText, publicHttpUrl } from "./http.ts";
import { z } from "zod";
import { cleanHeadline, keepStory, type NewsTag } from "./headline.ts";

export type ParsedStory = {
  title: string;
  link: string;
  desc: string;
  date: string;
  source: string;
};

export type FeedProbe = {
  ok: boolean;
  url: string;
  title: string;
  error?: string;
};

function gFeed(q: string, gl: string, hl = "en") {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl}`;
}

/** National front page. A bare `when:1d` search returns nothing and ignores the country. */
function gTop(gl: string, hl: string) {
  const lang = hl.split("-")[0];
  return `https://news.google.com/rss?hl=${encodeURIComponent(hl)}&gl=${gl}&ceid=${gl}:${lang}`;
}

export const NEWS_CATALOG: { id: string; name: string; url: string; category: NewsTag; region?: string }[] = [
  { id: "inquirer", name: "Inquirer", url: "https://www.inquirer.net/fullfeed/", category: "Philippines" },
  { id: "philstar", name: "Philstar", url: "https://www.philstar.com/rss/headlines", category: "Philippines" },
  { id: "rappler", name: "Rappler", url: "https://www.rappler.com/feed/", category: "Philippines" },
  { id: "abscbn", name: "ABS-CBN", url: "https://news.google.com/rss/search?q=site:abs-cbn.com&hl=en-PH&gl=PH&ceid=PH:en", category: "Philippines" },
  { id: "gma", name: "GMA News", url: "https://news.google.com/rss/search?q=site:gmanetwork.com+when:1d&hl=en-PH&gl=PH&ceid=PH:en", category: "Philippines" },
  { id: "mb", name: "Manila Bulletin", url: "https://news.google.com/rss/search?q=site:mb.com.ph&hl=en-PH&gl=PH&ceid=PH:en", category: "Philippines" },
  { id: "bilyonaryo", name: "Bilyonaryo", url: "https://news.google.com/rss/search?q=site:bilyonaryo.com&hl=en-PH&gl=PH&ceid=PH:en", category: "Philippines" },
  { id: "bworld", name: "BusinessWorld", url: "https://www.bworldonline.com/feed/", category: "Business" },
  { id: "manilatimes", name: "Manila Times", url: "https://www.manilatimes.net/feed/", category: "Philippines" },
  { id: "businessmirror", name: "BusinessMirror", url: "https://businessmirror.com.ph/feed/", category: "Business" },
  { id: "pna", name: "PNA", url: "https://news.google.com/rss/search?q=site:pna.gov.ph&hl=en-PH&gl=PH&ceid=PH:en", category: "Philippines" },
  { id: "tribune", name: "Daily Tribune", url: "https://tribune.net.ph/feed/", category: "Philippines" },
  { id: "sunstar", name: "SunStar", url: "https://news.google.com/rss/search?q=site:sunstar.com.ph&hl=en-PH&gl=PH&ceid=PH:en", category: "Philippines" },
  { id: "inq-biz", name: "Inquirer Business", url: "https://business.inquirer.net/feed", category: "Business" },
  { id: "philstar-biz", name: "Philstar Business", url: "https://www.philstar.com/rss/business", category: "Business" },
  { id: "philstar-sports", name: "Philstar Sports", url: "https://www.philstar.com/rss/sports", category: "Sports" },
  { id: "inq-sports", name: "Inquirer Sports", url: "https://sports.inquirer.net/feed", category: "Sports" },
  { id: "pia", name: "PIA", url: "https://news.google.com/rss/search?q=site:pia.gov.ph&hl=en-PH&gl=PH&ceid=PH:en", category: "Philippines" },
  { id: "cebudaily", name: "Cebu Daily News", url: "https://cebudailynews.inquirer.net/feed", category: "Philippines" },
  { id: "mindanews", name: "MindaNews", url: "https://www.mindanews.com/feed/", category: "Philippines" },
  { id: "gnews", name: "Google World", url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en&gl=GB&ceid=GB:en", category: "World" },
  { id: "bbc", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "World" },
  { id: "guardian", name: "The Guardian", url: "https://www.theguardian.com/world/rss", category: "World" },
  { id: "aljazeera", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", category: "World" },
  { id: "nyt", name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", category: "World" },
  { id: "npr", name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", category: "World" },
  { id: "reuters", name: "Reuters", url: "https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en&gl=US&ceid=US:en", category: "World" },
  { id: "ap", name: "AP", url: "https://news.google.com/rss/search?q=site:apnews.com+when:1d&hl=en&gl=US&ceid=US:en", category: "World" },
  { id: "cnn", name: "CNN World", url: "https://rss.cnn.com/rss/edition_world.rss", category: "World" },
  { id: "dw", name: "Deutsche Welle", url: "https://rss.dw.com/rdf/rss-en-world", category: "World" },
  { id: "france24", name: "France 24", url: "https://www.france24.com/en/rss", category: "World" },
  { id: "abcau", name: "ABC Australia", url: "https://www.abc.net.au/news/feed/51120/rss.xml", category: "World" },
  { id: "cbc", name: "CBC World", url: "https://www.cbc.ca/webfeed/rss/rss-world", category: "World" },
  { id: "independent", name: "The Independent", url: "https://www.independent.co.uk/news/world/rss", category: "World" },
  { id: "sky", name: "Sky News", url: "https://feeds.skynews.com/feeds/rss/world.xml", category: "World" },
  { id: "time", name: "Time", url: "https://time.com/feed/", category: "World" },
  { id: "hindu", name: "The Hindu", url: "https://www.thehindu.com/news/international/feeder/default.rss", category: "World" },
  { id: "japantimes", name: "Japan Times", url: "https://www.japantimes.co.jp/feed/", category: "World" },
  { id: "scmp", name: "SCMP", url: "https://news.google.com/rss/search?q=site:scmp.com+when:1d&hl=en&gl=US&ceid=US:en", category: "World" },
  { id: "nikkei", name: "Nikkei Asia", url: "https://news.google.com/rss/search?q=site:asia.nikkei.com+when:1d&hl=en&gl=US&ceid=US:en", category: "World" },
  { id: "bbc-biz", name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "Business" },
  { id: "ft", name: "Financial Times", url: "https://www.ft.com/world?format=rss", category: "Business" },
  { id: "bloomberg", name: "Bloomberg", url: "https://news.google.com/rss/search?q=site:bloomberg.com+when:1d&hl=en&gl=US&ceid=US:en", category: "Markets" },
  { id: "wsj", name: "WSJ", url: "https://news.google.com/rss/search?q=site:wsj.com+when:1d&hl=en&gl=US&ceid=US:en", category: "Markets" },
  { id: "verge", name: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "Tech" },
  { id: "ars", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "Tech" },
  { id: "techcrunch", name: "TechCrunch", url: "https://techcrunch.com/feed/", category: "Tech" },
  { id: "wired", name: "Wired", url: "https://www.wired.com/feed/rss", category: "Tech" },
  { id: "hn", name: "Hacker News", url: "https://hnrss.org/frontpage", category: "Tech" },
  { id: "bbc-tech", name: "BBC Tech", url: "https://feeds.bbci.co.uk/news/technology/rss.xml", category: "Tech" },
  { id: "ai", name: "Google AI", url: "https://news.google.com/rss/search?q=artificial+intelligence&hl=en&gl=US&ceid=US:en", category: "AI" },
  { id: "mittr", name: "MIT Tech Review", url: "https://www.technologyreview.com/feed/", category: "AI" },
  { id: "openai", name: "OpenAI", url: "https://openai.com/blog/rss.xml", category: "AI" },
  { id: "google-ai", name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", category: "AI" },
  { id: "espn", name: "ESPN", url: "https://www.espn.com/espn/rss/news", category: "Sports" },
  { id: "variety", name: "Variety", url: "https://variety.com/feed/", category: "Entertainment" },
  { id: "vnexpress", name: "VnExpress", url: "https://e.vnexpress.net/rss/news.rss", category: "World", region: "Vietnam" },
  { id: "vietnamnews", name: "Vietnam News", url: gFeed("site:vietnamnews.vn when:7d", "VN"), category: "World", region: "Vietnam" },
  { id: "tuoitre", name: "Tuoi Tre News", url: gFeed("site:tuoitrenews.vn when:7d", "VN"), category: "World", region: "Vietnam" },
  { id: "vn-desk", name: "Vietnam headlines", url: gTop("VN", "vi"), category: "World", region: "Vietnam" },
  { id: "us-desk", name: "US headlines", url: gTop("US", "en-US"), category: "World", region: "United States" },
  { id: "politico", name: "Politico", url: gFeed("site:politico.com when:1d", "US"), category: "World", region: "United States" },
  { id: "japan-desk", name: "Japan headlines", url: gTop("JP", "ja"), category: "World", region: "Japan" },
  { id: "nhk", name: "NHK World", url: gFeed("site:nhk.or.jp when:2d", "JP"), category: "World", region: "Japan" },
  { id: "cna", name: "CNA", url: gFeed("site:channelnewsasia.com when:1d", "SG"), category: "World", region: "Singapore" },
  { id: "straitstimes", name: "Straits Times", url: gFeed("site:straitstimes.com when:1d", "SG"), category: "World", region: "Singapore" },
  { id: "hk-desk", name: "Hong Kong headlines", url: gTop("HK", "zh-HK"), category: "World", region: "Hong Kong" },
  { id: "koreaherald", name: "Korea Herald", url: gFeed("site:koreaherald.com when:2d", "KR"), category: "World", region: "Korea" },
  { id: "korea-desk", name: "Korea headlines", url: gTop("KR", "ko"), category: "World", region: "Korea" },
  { id: "toi", name: "Times of India", url: gFeed("site:timesofindia.indiatimes.com when:1d", "IN"), category: "World", region: "India" },
  { id: "india-desk", name: "India headlines", url: gTop("IN", "en-IN"), category: "World", region: "India" },
  { id: "bangkokpost", name: "Bangkok Post", url: gFeed("site:bangkokpost.com when:2d", "TH"), category: "World", region: "Thailand" },
  { id: "jakartapost", name: "Jakarta Post", url: gFeed("site:thejakartapost.com when:2d", "ID"), category: "World", region: "Indonesia" },
  { id: "au-desk", name: "Australia headlines", url: gTop("AU", "en-AU"), category: "World", region: "Australia" },
  { id: "uk-desk", name: "UK headlines", url: gTop("GB", "en-GB"), category: "World", region: "United Kingdom" },
  { id: "thestar", name: "The Star", url: gFeed("site:thestar.com.my when:1d", "MY"), category: "World", region: "Malaysia" },
  { id: "malaymail", name: "Malay Mail", url: gFeed("site:malaymail.com when:2d", "MY"), category: "World", region: "Malaysia" },
  { id: "my-desk", name: "Malaysia headlines", url: gTop("MY", "en-MY"), category: "World", region: "Malaysia" },
  { id: "focustaiwan", name: "Focus Taiwan", url: gFeed("site:focustaiwan.tw when:2d", "TW"), category: "World", region: "Taiwan" },
  { id: "tw-desk", name: "Taiwan headlines", url: gTop("TW", "zh-TW"), category: "World", region: "Taiwan" },
  { id: "globe", name: "Globe and Mail", url: gFeed("site:theglobeandmail.com when:1d", "CA"), category: "World", region: "Canada" },
  { id: "ca-desk", name: "Canada headlines", url: gTop("CA", "en-CA"), category: "World", region: "Canada" },
];

/** One-click packs — never force all 50 on. */
export const FEED_PACKS: { id: string; label: string; hint: string; ids: readonly string[] }[] = [
  {
    id: "philippines",
    label: "Philippines",
    hint: "Inquirer, Philstar, Rappler, ABS-CBN, GMA and local desks",
    ids: [
      "inquirer",
      "philstar",
      "rappler",
      "abscbn",
      "gma",
      "mb",
      "bilyonaryo",
      "manilatimes",
      "pna",
      "tribune",
      "sunstar",
      "pia",
      "cebudaily",
      "mindanews",
      "inq-biz",
      "philstar-biz",
      "philstar-sports",
      "inq-sports",
    ],
  },
  {
    id: "world",
    label: "World",
    hint: "BBC, Guardian, Reuters, AP and global desks",
    ids: [
      "gnews",
      "bbc",
      "guardian",
      "aljazeera",
      "nyt",
      "npr",
      "reuters",
      "ap",
      "cnn",
      "dw",
      "france24",
      "abcau",
      "cbc",
      "independent",
      "sky",
      "time",
      "hindu",
      "japantimes",
      "scmp",
      "nikkei",
    ],
  },
  {
    id: "tech",
    label: "Tech",
    hint: "Verge, Ars, TechCrunch, AI desks",
    ids: ["verge", "ars", "techcrunch", "wired", "hn", "bbc-tech", "ai", "mittr", "openai", "google-ai"],
  },
  {
    id: "vietnam",
    label: "Vietnam",
    hint: "VnExpress, Vietnam News, Tuoi Tre, Vietnam headlines",
    ids: ["vnexpress", "vietnamnews", "tuoitre", "vn-desk"],
  },
  {
    id: "united-states",
    label: "United States",
    hint: "NYT, NPR, Reuters, AP, CNN, US headlines",
    ids: ["nyt", "npr", "reuters", "ap", "cnn", "wsj", "bloomberg", "us-desk", "politico"],
  },
  {
    id: "japan",
    label: "Japan",
    hint: "Japan Times, NHK, Japan headlines",
    ids: ["japantimes", "nhk", "japan-desk"],
  },
  {
    id: "singapore",
    label: "Singapore",
    hint: "CNA and Straits Times",
    ids: ["cna", "straitstimes"],
  },
  {
    id: "hong-kong",
    label: "Hong Kong",
    hint: "SCMP and Hong Kong headlines",
    ids: ["scmp", "hk-desk"],
  },
  {
    id: "korea",
    label: "Korea",
    hint: "Korea Herald and Korea headlines",
    ids: ["koreaherald", "korea-desk"],
  },
  {
    id: "india",
    label: "India",
    hint: "The Hindu, Times of India, India headlines",
    ids: ["hindu", "toi", "india-desk"],
  },
  {
    id: "thailand",
    label: "Thailand",
    hint: "Bangkok Post",
    ids: ["bangkokpost"],
  },
  {
    id: "indonesia",
    label: "Indonesia",
    hint: "Jakarta Post",
    ids: ["jakartapost"],
  },
  {
    id: "australia",
    label: "Australia",
    hint: "ABC and Australia headlines",
    ids: ["abcau", "au-desk"],
  },
  {
    id: "united-kingdom",
    label: "United Kingdom",
    hint: "BBC, Guardian, Sky, UK headlines",
    ids: ["bbc", "guardian", "sky", "independent", "uk-desk"],
  },
  {
    id: "malaysia",
    label: "Malaysia",
    hint: "The Star, Malay Mail, Malaysia headlines",
    ids: ["thestar", "malaymail", "my-desk"],
  },
  {
    id: "taiwan",
    label: "Taiwan",
    hint: "Focus Taiwan and Taiwan headlines",
    ids: ["focustaiwan", "tw-desk"],
  },
  {
    id: "canada",
    label: "Canada",
    hint: "CBC, Globe and Mail, Canada headlines",
    ids: ["cbc", "globe", "ca-desk"],
  },
];

export const FEED_PRESETS = NEWS_CATALOG;

export function packIsOn(feeds: { id: string; enabled: boolean }[], packId: string) {
  const pack = FEED_PACKS.find((p) => p.id === packId);
  if (!pack) return false;
  const byId = new Map(feeds.map((f) => [f.id, f.enabled]));
  return pack.ids.every((id) => byId.get(id));
}

const PACK_ORDER = [
  "philippines",
  "vietnam",
  "united-states",
  "japan",
  "singapore",
  "hong-kong",
  "korea",
  "india",
  "thailand",
  "indonesia",
  "australia",
  "united-kingdom",
  "malaysia",
  "taiwan",
  "canada",
  "world",
  "tech",
];

export function sortedFeedPacks() {
  return [...FEED_PACKS].sort((a, b) => PACK_ORDER.indexOf(a.id) - PACK_ORDER.indexOf(b.id));
}

const PACK_BY_MARKET: Record<string, string> = {
  PH: "philippines",
  US: "united-states",
  SG: "singapore",
  JP: "japan",
  HK: "hong-kong",
  GB: "united-kingdom",
  AU: "australia",
  IN: "india",
  CA: "canada",
  VN: "vietnam",
  TH: "thailand",
  MY: "malaysia",
  ID: "indonesia",
  KR: "korea",
  TW: "taiwan",
};

/** BBC plus the pack for the first open book. A book with no pack gets World, not the Philippine list. */
export function starterFeedIds(marketId?: string | null): string[] {
  const packId = PACK_BY_MARKET[(marketId ?? "").trim().toUpperCase()] ?? "world";
  const pack = FEED_PACKS.find((p) => p.id === packId);
  return [...new Set(["bbc", ...(pack?.ids ?? [])])];
}

const REGION_ORDER = [
  "Philippines",
  "Vietnam",
  "United States",
  "Japan",
  "Singapore",
  "Hong Kong",
  "Korea",
  "India",
  "Thailand",
  "Indonesia",
  "Australia",
  "United Kingdom",
  "Malaysia",
  "Taiwan",
  "Canada",
  "Germany",
  "France",
  "World",
];

/** Country for catalog rows that predate the region field. */
const REGION_BY_ID: Record<string, string> = {
  bworld: "Philippines",
  businessmirror: "Philippines",
  "inq-biz": "Philippines",
  "philstar-biz": "Philippines",
  "philstar-sports": "Philippines",
  "inq-sports": "Philippines",
  bbc: "United Kingdom",
  guardian: "United Kingdom",
  independent: "United Kingdom",
  sky: "United Kingdom",
  nyt: "United States",
  npr: "United States",
  reuters: "United States",
  ap: "United States",
  cnn: "United States",
  time: "United States",
  wsj: "United States",
  bloomberg: "United States",
  espn: "United States",
  japantimes: "Japan",
  nikkei: "Japan",
  scmp: "Hong Kong",
  hindu: "India",
  abcau: "Australia",
  cbc: "Canada",
  dw: "Germany",
  france24: "France",
};

export function sourceRegion(p: { id?: string; category: string; region?: string }) {
  if (p.id && REGION_BY_ID[p.id]) return REGION_BY_ID[p.id];
  if (p.region) return p.region;
  if (p.category === "Philippines") return "Philippines";
  return "World";
}

export function compareRegion(a: string, b: string) {
  const ia = REGION_ORDER.indexOf(a);
  const ib = REGION_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
}

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
      source: tag(block, "source"),
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
  const body = await httpText(url);
  return { ok: true, status: 200, type: "application/xml", body, finalUrl: url };
}

export const fetchFeed = createServerFn({ method: "POST" })
  .validator(
    z.object({
      url: z.string().min(4).max(2000),
      name: z.string(),
      category: z.string(),
      region: z.string().max(40).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const url = publicHttpUrl(data.url);
    if (!url) throw new Error("That address is not allowed");
    const place = (data.region ?? "").trim();
    const xml = await httpText(url);
    return parseRss(xml)
      .map((s) => ({
        ...s,
        src: data.name,
        category: data.category,
        ...(place ? { region: place } : {}),
      }))
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
          if (parseRss(feed.body).length) {
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
  .validator(z.object({ url: z.string().min(4).max(2000) }))
  .handler(async ({ data }) => {
    const url = publicHttpUrl(data.url);
    if (!url) throw new Error("That address is not allowed");
    return await httpText(url);
  });
