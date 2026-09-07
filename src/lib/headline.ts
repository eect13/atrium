const SOURCE_TAIL = /\s+[-–—|]\s*(?:help\.)?x\.com\s*$/i;
const PROFILE_ON_X = /\(@[\w.]+\)\s+on X(?:\s+[-–—]\s*x\.com)?\s*$/i;
const EMOJI_BITS = /\p{Extended_Pictographic}|\p{Emoji_Component}|[\uFE0F\u200D]/gu;

export const NEWS_TAGS = [
  "Philippines",
  "World",
  "Business",
  "Markets",
  "Sports",
  "Entertainment",
  "Tech",
  "Science",
  "Opinion",
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
    re: /\b(inflation|gdp|earnings|merger|ipo|banks?|economy|economic|ayala|jollibee|san miguel|revenue|unemployment|tariff|trade war|interest rate|bsp)\b/i,
  },
  {
    tag: "Tech",
    re: /\b(apple|google|microsoft|openai|chatgpt|semiconductor|iphone|android|spacex|\bai\b|tesla)\b/i,
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
  sports: "Sports",
  business: "Business",
  entertainment: "Entertainment",
  science: "Science",
  markets: "Markets",
  opinion: "Opinion",
  x: "World",
};

export function tagStory(s: { title: string; desc?: string; src?: string; category?: string }): NewsTag {
  const hay = `${s.title} ${s.desc ?? ""}`;
  for (const rule of TAG_RULES) {
    if (rule.re.test(hay)) return rule.tag;
  }
  const mapped = CAT_TAG[(s.category ?? "").toLowerCase()];
  if (mapped) return mapped;
  return "World";
}

export function newsTagList<T extends { title: string; desc?: string; src?: string; category?: string }>(
  items: T[],
): NewsTag[] {
  const seen = new Set<NewsTag>();
  for (const it of items) seen.add(tagStory(it));
  return NEWS_TAGS.filter((t) => seen.has(t));
}

export function cleanHeadline(title: string) {
  return title.replace(SOURCE_TAIL, "").replace(PROFILE_ON_X, "").replace(/\s+/g, " ").trim();
}

/** Drop emoji-only tweets, X chrome, and untitled rows. Keep real headlines. */
export function keepStory(story: { title: string; link?: string; src?: string; category?: string }) {
  const raw = story.title.trim();
  if (!raw || /^untitled$/i.test(raw)) return false;
  const link = story.link ?? "";
  if (/help\.x\.com/i.test(raw) || /help\.x\.com/i.test(link)) return false;
  if (PROFILE_ON_X.test(raw)) return false;

  const title = cleanHeadline(raw);
  if (!title || /^untitled$/i.test(title) || /^x\.com$/i.test(title)) return false;

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

/** Round-robin by source so one feed cannot bury the briefing. */
export function mixStories<T extends { src?: string; category?: string; date?: string }>(items: T[], limit = 40): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = it.src || it.category || "_";
    const arr = groups.get(k);
    if (arr) arr.push(it);
    else groups.set(k, [it]);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => +new Date(b.date || 0) - +new Date(a.date || 0));
  }
  const queues = [...groups.values()];
  const out: T[] = [];
  while (out.length < limit) {
    let added = false;
    for (const q of queues) {
      const next = q.shift();
      if (next) {
        out.push(next);
        added = true;
        if (out.length >= limit) break;
      }
    }
    if (!added) break;
  }
  return out;
}
