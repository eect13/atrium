/** Wikiquote (MediaWiki Action API) adapter: URLs, wikitext → quotes, and a serial loader.
 *  Text is CC BY-SA 4.0; every quote keeps a link to its page for attribution. */

export const WQ_SITE = "https://en.wikiquote.org";
export const WQ_API = `${WQ_SITE}/w/api.php`;
export const WQ_LICENSE = { label: "CC BY-SA 4.0", href: "https://creativecommons.org/licenses/by-sa/4.0/" } as const;
/** Honest client id per the Wikimedia User-Agent policy (sent where the platform lets us set it). */
export const WQ_UA = "AtriumDesk/1 (https://github.com/eect13/atrium; desk quotes reader)";
export const WQ_HEADERS: Record<string, string> = { "User-Agent": WQ_UA, "Api-User-Agent": WQ_UA };

/** Max length for a card; the daily quote (often verse) gets more room. */
export const QUOTE_MAX = 300;
export const DAILY_MAX = 600;
const PAGE_CAP = 120;

export type WqQuote = { text: string; author: string; href: string; source: "wikiquote" };
export type WqKind = "daily" | "topic" | "author";
export type WqGet = (url: string, headers: Record<string, string>) => Promise<string | null>;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…" };

export function decodeEntities(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (raw, token: string) => {
    if (token[0] === "#") {
      const code = token[1] === "x" || token[1] === "X" ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : raw;
    }
    return NAMED[token.toLowerCase()] ?? raw;
  });
}

/** Wiki page URL (attribution link). */
export function wqPageHref(title: string) {
  const path = encodeURIComponent(title.trim().replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":").replace(/%2C/g, ",");
  return `${WQ_SITE}/wiki/${path}`;
}

export function wqParseUrl(title: string) {
  return `${WQ_API}?action=parse&format=json&formatversion=2&redirects=1&prop=wikitext&page=${encodeURIComponent(title)}`;
}

export function wqSearchUrl(q: string) {
  return `${WQ_API}?action=opensearch&format=json&namespace=0&limit=5&search=${encodeURIComponent(q.trim())}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** `YYYY-MM-DD` → the Quote of the day page title (en.wikiquote names pages in English). */
export function qotdTitle(key: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `Wikiquote:Quote of the day/${month} ${Number(m[3])}, ${m[1]}`;
}

/** Wikitext → plain text (links, templates, refs, markup, entities). */
export function cleanWikitext(raw: string) {
  let s = raw.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<ref[^>]*\/>/gi, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  // {{w|Page}} / {{w|Page|label}} are inline links; every other template is dropped.
  s = s.replace(/\{\{\s*w\s*\|([^{}|]*)(?:\|([^{}|]*))?\}\}/gi, (_m, page: string, label?: string) => label ?? page);
  for (let i = 0; i < 3; i += 1) s = s.replace(/\{\{[^{}]*\}\}/g, "");
  s = s.replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, "");
  s = s.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1");
  s = s.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1").replace(/\[https?:\/\/[^\]]+\]/g, "");
  s = s.replace(/<br\s*\/?>/gi, " / ");
  s = s.replace(/'{2,}/g, "");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s).replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1");
  // Stanza breaks (<br><br>) collapse to one separator.
  return s.replace(/(?:\s*\/\s*){2,}/g, " / ").replace(/^(?:\s*\/\s*)+|(?:\s*\/\s*)+$/g, "").trim();
}

/** Card-worthy text: real sentence, no leftover markup, within length. */
export function acceptQuote(text: string, max = QUOTE_MAX) {
  if (text.length < 12 || text.length > max) return false;
  if (/\[\[|\]\]|\{\{|\}\}|\||<|>|https?:/i.test(text)) return false;
  if (!/\p{L}{2}/u.test(text)) return false;
  return !/:\s*$/.test(text);
}

const SKIP_SECTION = /disputed|misattribut|quotes about|about\b|see also|external links|references|sources|notes|further reading|bibliography|cast|dialogue/i;
const DISAMBIG = /\{\{\s*(disambig|dab|disambiguation)\b/i;

export function isDisambiguation(wikitext: string) {
  return DISAMBIG.test(wikitext);
}

/** Page links listed on a disambiguation page, in page order. */
export function disambigLinks(wikitext: string) {
  const out: string[] = [];
  for (const m of wikitext.matchAll(/^\*\s*\[\[([^|\]#]+)/gm)) {
    const t = m[1]!.trim();
    if (t && !/^(w|File|Category):/i.test(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/** "Seneca the Younger" stays; "Courage (film)" → "Courage". */
export function pageAuthor(title: string) {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** Theme-page citation line → author ("[[Horace]], Odes" → Horace). */
export function authorFromCite(cite: string) {
  const link = /^\s*(?:''+)?\[\[(?!File:|Image:)([^|\]]+)(?:\|([^\]]+))?\]\]/i.exec(cite);
  if (link) return cleanWikitext(link[2] ?? link[1]!).replace(/^w:/i, "");
  const head = cleanWikitext(cite).split(/[,(;]/)[0]?.trim() ?? "";
  const words = head.split(/\s+/).length;
  return head.length >= 2 && head.length <= 60 && words <= 5 && !/\d{3,}/.test(head) ? head : "";
}

type Bullet = { top: string; child?: string };

function bullets(wikitext: string): Bullet[] {
  const out: Bullet[] = [];
  let skip = 0;
  for (const line of wikitext.split("\n")) {
    const h = /^(={2,6})\s*(.*?)\s*\1\s*$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      if (skip && level <= skip) skip = 0;
      if (!skip && SKIP_SECTION.test(cleanWikitext(h[2]!))) skip = level;
      continue;
    }
    if (skip) continue;
    const top = /^\*(?!\*)\s*(.*)$/.exec(line);
    if (top) {
      out.push({ top: top[1]!.trim() });
      continue;
    }
    const child = /^\*\*(?!\*)\s*(.*)$/.exec(line);
    const last = out[out.length - 1];
    if (child && last && last.child === undefined) last.child = child[1]!.trim();
  }
  return out;
}

/** Theme pages cite a linked person under each quote; author pages cite works. */
export function looksLikeThemePage(list: Bullet[]) {
  const cited = list.filter((b) => b.child);
  if (cited.length < 3) return false;
  const linked = cited.filter((b) => /^\s*(?:''+)?\[\[(?!File:|Image:)/i.test(b.child!)).length;
  return linked / cited.length >= 0.5;
}

/** Whole line in italics (original language): `''…''` or an italic opened and never closed. */
function wholeItalic(top: string) {
  if (!/^''(?!')/.test(top)) return false;
  const rest = top.slice(2);
  return /''\.?$/.test(rest) || !rest.includes("''");
}

/** A Wikiquote page → quotes. `mode` "auto" decides theme vs author from the citations. */
export function parseQuotePage(wikitext: string, title: string, mode: "auto" | "theme" | "author" = "auto"): WqQuote[] {
  const list = bullets(wikitext);
  const theme = mode === "theme" || (mode === "auto" && looksLikeThemePage(list));
  const href = wqPageHref(title);
  const seen = new Set<string>();
  const out: WqQuote[] = [];
  for (const b of list) {
    let text = "";
    let author = "";
    if (wholeItalic(b.top)) {
      // Original-language line: an author page puts the translation in the child.
      if (theme || !b.child) continue;
      text = cleanWikitext(b.child);
      author = pageAuthor(title);
    } else {
      text = cleanWikitext(b.top);
      author = theme ? (b.child ? authorFromCite(b.child) : "") : pageAuthor(title);
    }
    if (!author || !acceptQuote(text)) continue;
    const key = normQuote(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, author, href, source: "wikiquote" });
    if (out.length >= PAGE_CAP) break;
  }
  return out;
}

function templateParams(wikitext: string) {
  const params: Record<string, string> = {};
  const marks = [...wikitext.matchAll(/^\|\s*([\w-]+)\s*=\s*/gm)];
  marks.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1]!.index! : wikitext.lastIndexOf("}}");
    params[m[1]!.toLowerCase()] = wikitext.slice(start, end > start ? end : undefined);
  });
  return params;
}

/** Quote of the day page → one quote (or none). */
export function parseQotd(wikitext: string, title: string): WqQuote[] {
  const p = templateParams(wikitext);
  const text = cleanWikitext(p.quote ?? "").replace(/^["“]+|["”]+$/g, "").trim();
  const author = cleanWikitext(p.author ?? "").replace(/^[~–—-]\s*/, "").trim();
  if (!author || !acceptQuote(text, DAILY_MAX)) return [];
  return [{ text, author, href: wqPageHref(title), source: "wikiquote" }];
}

export function normQuote(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

type ParseJson = { parse?: { title?: string; wikitext?: string } };

function readParse(raw: string | null): { title: string; wikitext: string } | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as ParseJson;
    const title = j.parse?.title;
    const wikitext = j.parse?.wikitext;
    return title && typeof wikitext === "string" ? { title, wikitext } : null;
  } catch {
    return null;
  }
}

/** opensearch → titles in rank order, exact (case-insensitive) match first. */
export function searchTitles(raw: string | null, q: string): string[] {
  if (!raw) return [];
  try {
    const j = JSON.parse(raw) as [string, string[]];
    const titles = Array.isArray(j?.[1]) ? j[1].filter((t) => typeof t === "string") : [];
    const n = q.trim().toLowerCase();
    return [...titles.filter((t) => t.toLowerCase() === n), ...titles.filter((t) => t.toLowerCase() !== n)];
  } catch {
    return [];
  }
}

let chain: Promise<unknown> = Promise.resolve();
/** Wikimedia etiquette: one request in flight at a time. */
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
}

async function page(get: WqGet, title: string) {
  return readParse(await serial(() => get(wqParseUrl(title), WQ_HEADERS)));
}

/** Topic chip id → Wikiquote theme page (data table, one place). */
export const WQ_TOPIC_PAGES: Record<string, string> = {
  life: "Life",
  funny: "Humor",
  love: "Love",
  wisdom: "Wisdom",
  success: "Success",
  motivational: "Motivation",
  nature: "Nature",
};

export type WqResult = { quotes: WqQuote[]; title?: string };

/** One view from Wikiquote. Never throws: a failure is `{ quotes: [] }` (the caller keeps its cache). */
export async function loadWikiquote(kind: WqKind, key: string, get: WqGet): Promise<WqResult> {
  try {
    if (kind === "daily") {
      const title = qotdTitle(key);
      const hit = title ? await page(get, title) : null;
      return hit ? { quotes: parseQotd(hit.wikitext, hit.title), title: hit.title } : { quotes: [] };
    }
    if (kind === "topic") {
      const title = WQ_TOPIC_PAGES[key];
      const hit = title ? await page(get, title) : null;
      return hit ? { quotes: parseQuotePage(hit.wikitext, hit.title, "theme"), title: hit.title } : { quotes: [] };
    }
    const ranked = searchTitles(await serial(() => get(wqSearchUrl(key), WQ_HEADERS)), key);
    const first = ranked[0];
    if (!first) return { quotes: [] };
    let hit = await page(get, first);
    if (hit && isDisambiguation(hit.wikitext)) {
      const links = disambigLinks(hit.wikitext);
      const pick = ranked.find((t) => links.includes(t)) ?? links[0];
      hit = pick ? await page(get, pick) : null;
    }
    return hit ? { quotes: parseQuotePage(hit.wikitext, hit.title), title: hit.title } : { quotes: [] };
  } catch {
    return { quotes: [] };
  }
}
