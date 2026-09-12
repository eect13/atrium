const SOURCE_TAIL = /\s+[-–—|]\s*(?:help\.)?x\.com\s*$/i;
const PROFILE_ON_X = /\(@[\w.]+\)\s+on X(?:\s+[-–—]\s*x\.com)?\s*$/i;
const EMOJI_BITS = /\p{Extended_Pictographic}|\p{Emoji_Component}|[\uFE0F\u200D]/gu;

export const NEWS_TAGS = [
  "World",
  "Business",
  "Markets",
  "Tech",
  "AI",
  "Science",
  "Sports",
  "Entertainment",
  "Opinion",
  "Philippines",
] as const;
export type NewsTag = (typeof NEWS_TAGS)[number];

const TAG_RULES: { tag: NewsTag; re: RegExp }[] = [
  {
    tag: "Sports",
    re: /\b(nba|pba|uaap|ncaa|ufc|fifa|premier league|la liga|serie a|olympic|olympics|fiba|mpbl|volleyball|tennis|golf|boxing|pacquiao|gilas|azkals|football|soccer|basketball|baseball|mlb|nfl|nhl|f1|formula 1|grand prix|world cup|asian games|sea games|wimbledon)\b/i,
  },
  {
    tag: "Entertainment",
    re: /\b(hollywood|netflix|k-?pop|concert|box office|oscar|grammy|album|celebrity|actor|actress|movie|film|tv series|billboard|showbiz|met gala|disney|marvel|variety)\b/i,
  },
  {
    tag: "Markets",
    re: /\b(pse|psEi|stock market|stocks?|equit(?:y|ies)|crypto|bitcoin|forex|bond yield|wall street|nasdaq|dow jones|s&p)\b/i,
  },
  {
    tag: "Business",
    re: /\b(inflation|gdp|earnings|merger|ipo|economy|economic|ayala|jollibee|san miguel|revenue|unemployment|tariff|trade war|interest rate|bsp)\b|(?<!west )\bbanks?\b/i,
  },
  {
    tag: "AI",
    re: /\b(artificial intelligence|\ba\.?i\.?\b|openai|chatgpt|anthropic|claude|gemini|llm|large language|grok|deepseek|machine learning|neural net)\b/i,
  },
  {
    tag: "Tech",
    re: /\b(apple|google|microsoft|semiconductor|iphone|android|spacex|tesla|nvidia|chipmaker)\b/i,
  },
  {
    tag: "Science",
    re: /\b(nasa|climate|vaccine|cancer|physics|genome|asteroid|space station|quantum)\b/i,
  },
  { tag: "Opinion", re: /\b(opinion|editorial|columnist)\b/i },
  {
    tag: "Philippines",
    re: /\b(philippines|filipino|manila|duterte|marcos|senate|malacañang|comelec|\bncr\b|luzon|visayas|mindanao|quezon city|\bcebu\b|\bdavao\b)\b/i,
  },
];

const CAT_TAG: Record<string, NewsTag> = {
  ph: "Philippines",
  philippines: "Philippines",
  top: "World",
  world: "World",
  tech: "Tech",
  ai: "AI",
  sports: "Sports",
  business: "Business",
  entertainment: "Entertainment",
  science: "Science",
  markets: "Markets",
  opinion: "Opinion",
  x: "World",
};

export function asNewsTag(raw: string | undefined): NewsTag {
  const k = (raw ?? "").trim().toLowerCase();
  if (!k) return "World";
  const mapped = CAT_TAG[k];
  if (mapped) return mapped;
  return NEWS_TAGS.find((t) => t.toLowerCase() === k) ?? "World";
}

export function tagStory(s: { title: string; desc?: string; src?: string; category?: string }): NewsTag {
  const hay = `${s.title} ${s.desc ?? ""}`;
  for (const rule of TAG_RULES) {
    if (rule.re.test(hay)) return rule.tag;
  }
  return asNewsTag(s.category);
}

export function newsTagList<T extends { title: string; desc?: string; src?: string; category?: string }>(
  items: T[],
): NewsTag[] {
  const seen = new Set<NewsTag>();
  for (const it of items) seen.add(tagStory(it));
  return NEWS_TAGS.filter((t) => seen.has(t));
}

const JUNK_STORY =
  /\b(call for (?:applications|proposals)|fundsforngos|sponsored content|apply now|register now|this is today'?s edition of the download|sign up for (?:our )?newsletter|partner content|advertorial|experience ai cohort|scholarship(?:s)? (?:for|program))\b/i;
const JUNK_COHORT = /\bcohort\b[\s\S]{0,48}\bngos?\b/i;

const OUTLET_TAIL =
  /\s+[-–—]\s*(?:[\w.-]+\.(?:com|net|org|ph)|inquirer(?:\.net)?|philstar|rappler|bbc(?: news)?|reuters|bloomberg|the guardian|al jazeera|abs-cbn|gma(?: news)?|variety|techcrunch|the verge|ars technica|manila (?:bulletin|times)|bilyonaryo)\s*$/i;

const CLICKBAIT = /^(look|watch|photos?|in photos|breaking|update)[:.\s]/i;

const STOP = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "for",
  "and",
  "as",
  "at",
  "by",
  "is",
  "it",
  "its",
  "with",
  "from",
  "after",
  "over",
  "into",
]);

export function cleanHeadline(title: string) {
  return title
    .replace(SOURCE_TAIL, "")
    .replace(PROFILE_ON_X, "")
    .replace(OUTLET_TAIL, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isJunk(title: string, src = "", link = "") {
  return JUNK_STORY.test(title) || JUNK_COHORT.test(title) || JUNK_STORY.test(src) || JUNK_STORY.test(link);
}

/** Drop emoji-only tweets, X chrome, ads, and untitled rows. Keep real headlines. */
export function keepStory(story: { title: string; link?: string; src?: string; category?: string }) {
  const raw = story.title.trim();
  if (!raw || /^untitled$/i.test(raw)) return false;
  const link = story.link ?? "";
  if (/help\.x\.com/i.test(raw) || /help\.x\.com/i.test(link)) return false;
  if (PROFILE_ON_X.test(raw)) return false;

  const title = cleanHeadline(raw);
  if (!title || /^untitled$/i.test(title) || /^x\.com$/i.test(title)) return false;
  if (isJunk(title, story.src ?? "", link)) return false;

  const noEmoji = title.replace(EMOJI_BITS, " ");
  const letters = noEmoji.match(/\p{L}/gu) ?? [];
  const words = noEmoji.match(/\p{L}[\p{L}'’-]{1,}/gu) ?? [];
  if (letters.length < 8 || words.length < 2) return false;

  const fromX =
    story.category === "X" ||
    story.src === "X" ||
    /(?:^|[./])x\.com(?:\/|$)/i.test(link) ||
    SOURCE_TAIL.test(raw);

  if (fromX) {
    if (letters.length < 28 || words.length < 6) return false;
    if (title.length < 40 && !/[.!?…]/.test(title)) return false;
  }
  return true;
}

/** Collapse near-duplicates, prefer fresh copy, then mix sources and tags. */
export function mixStories<T extends { title?: string; src?: string; category?: string; date?: string; link?: string; desc?: string }>(
  items: T[],
  limit = 40,
  now = Date.now(),
): T[] {
  const clustered = clusterStories(items, now);
  const out: T[] = [];
  const used = new Set<number>();
  let lastSrc = "";
  let lastTag = "";
  const srcCount = new Map<string, number>();
  const tagCount = new Map<string, number>();

  while (out.length < limit && used.size < clustered.length) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < clustered.length; i += 1) {
      if (used.has(i)) continue;
      const row = clustered[i]!;
      const src = row.item.src || "_";
      const tag = tagStory({
        title: row.item.title ?? "",
        desc: row.item.desc,
        src: row.item.src,
        category: row.item.category,
      });
      const seenSrc = srcCount.get(src) ?? 0;
      const seenTag = tagCount.get(tag) ?? 0;
      let n = row.score;
      if (src === lastSrc) n -= 0.42;
      if (tag === lastTag) n -= 0.18;
      n -= seenSrc * 0.1;
      n -= seenTag * 0.04;
      if (seenSrc >= 3) n -= 0.22;
      n -= i * 1e-6;
      if (n > bestScore) {
        bestScore = n;
        best = i;
      }
    }
    if (best < 0) break;
    const pick = clustered[best]!;
    used.add(best);
    out.push(pick.item);
    lastSrc = pick.item.src || "_";
    lastTag = tagStory({
      title: pick.item.title ?? "",
      desc: pick.item.desc,
      src: pick.item.src,
      category: pick.item.category,
    });
    srcCount.set(lastSrc, (srcCount.get(lastSrc) ?? 0) + 1);
    tagCount.set(lastTag, (tagCount.get(lastTag) ?? 0) + 1);
  }
  return out;
}

function clusterStories<T extends { title?: string; src?: string; category?: string; date?: string; link?: string; desc?: string }>(
  items: T[],
  now: number,
) {
  const scored = items
    .map((item, idx) => {
      const title = item.title ?? "";
      if (!title || isJunk(title, item.src ?? "", item.link ?? "")) return null;
      return { item, score: storyScore(item, now), idx, tokens: storyTokens(title) };
    })
    .filter((row): row is { item: T; score: number; idx: number; tokens: string[] } => Boolean(row))
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  const kept: typeof scored = [];
  for (const row of scored) {
    if (kept.some((hit) => nearDuplicate(hit, row))) continue;
    kept.push(row);
  }
  return kept;
}

function storyTokens(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function storyFingerprint(title: string) {
  const words = storyTokens(title);
  return (words.slice(0, 7).join(" ") || title.toLowerCase().slice(0, 48)).trim();
}

function jaccard(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const other = new Set(b);
  let inter = 0;
  const union = new Set(a);
  for (const w of a) if (other.has(w)) inter += 1;
  for (const w of b) union.add(w);
  return inter / union.size;
}

function canonicalLink(link?: string) {
  if (!link) return "";
  try {
    const u = new URL(link);
    if (u.hostname.includes("news.google.com")) return "";
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return link.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

function nearDuplicate(
  a: { item: { title?: string; link?: string }; tokens: string[] },
  b: { item: { title?: string; link?: string }; tokens: string[] },
) {
  const la = canonicalLink(a.item.link);
  const lb = canonicalLink(b.item.link);
  if (la && lb && la === lb) return true;
  const fa = storyFingerprint(a.item.title ?? "");
  const fb = storyFingerprint(b.item.title ?? "");
  if (fa && fa === fb) return true;
  if (a.tokens.length >= 4 && b.tokens.length >= 4 && jaccard(a.tokens, b.tokens) >= 0.62) return true;
  if (
    a.tokens.length >= 3 &&
    b.tokens.length >= 3 &&
    a.tokens.slice(0, 4).join(" ") === b.tokens.slice(0, 4).join(" ")
  ) {
    return true;
  }
  return false;
}

function storyScore(
  item: { src?: string; date?: string; title?: string; link?: string; desc?: string },
  now: number,
) {
  const hours = hoursAgo(item.date, now);
  let n = recencyPoints(hours);
  const link = (item.link ?? "").toLowerCase();
  const title = item.title ?? "";
  const desc = item.desc ?? "";
  if (/news\.google\.com/.test(link)) n -= 0.1;
  if (CLICKBAIT.test(title) || /\blive:/i.test(title)) n -= 0.16;
  if (title.length >= 36 && title.length <= 140) n += 0.06;
  if (title.length > 180) n -= 0.08;
  if (!item.date) n -= 0.08;
  if (desc.length >= 40) n += 0.03;
  return n;
}

function hoursAgo(date: string | undefined, now: number) {
  if (!date) return 72;
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return 72;
  return Math.max(0, (now - t) / 3_600_000);
}

function recencyPoints(hours: number) {
  return Math.max(0.05, Math.exp(-hours / 26));
}

/** Compact age for a story timestamp. Hidden when the date is missing or stale. */
export function storyAge(date?: string, now = Date.now()): string | undefined {
  if (!date) return undefined;
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return undefined;
  const h = Math.max(0, (now - t) / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 24) return `${Math.round(h)}h`;
  const d = Math.round(h / 24);
  if (d > 21) return undefined;
  return `${d}d`;
}

