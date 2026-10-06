import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { manilaParts } from "./format.ts";
import { httpText } from "./http.ts";
import { browserKV, loadView, quoteCacheKey, type KV, type ViewState } from "./quote-cache.ts";
import { WQ_TOPIC_PAGES, loadWikiquote, wqPageHref, type WqKind, type WqResult } from "./wikiquote.ts";

export type DeskQuote = {
  text: string;
  author: string;
  href: string;
  /** wikiquote = live (CC BY-SA, links to its page) · local = built-in offline set */
  source: "wikiquote" | "local";
};

export const QUOTE_SESSION_KEY = "atrium.quote.session";
export const QUOTE_SEED_KEY = "atrium.quote.seed";

export function readQuoteSession(): DeskQuote | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  try {
    const raw = JSON.parse(sessionStorage.getItem(QUOTE_SESSION_KEY) ?? "null") as DeskQuote | null;
    if (!raw?.text || !raw.author) return undefined;
    return raw;
  } catch {
    return undefined;
  }
}

export function writeQuoteSession(q: DeskQuote) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(QUOTE_SESSION_KEY, JSON.stringify(q));
  } catch {
    /* quota */
  }
}

export function nextQuoteSeed() {
  const s = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try {
    sessionStorage.setItem(QUOTE_SEED_KEY, s);
  } catch {
    /* quota */
  }
  return s;
}

export function readQuoteSeed() {
  if (typeof sessionStorage === "undefined") return "desk";
  try {
    return sessionStorage.getItem(QUOTE_SEED_KEY) ?? nextQuoteSeed();
  } catch {
    return "desk";
  }
}

export function authorSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(dr|sir|saint|st)\.?\s+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const POPULAR_AUTHORS = [
  { name: "Albert Einstein", slug: "albert-einstein" },
  { name: "Albert Camus", slug: "albert-camus" },
  { name: "Albert Schweitzer", slug: "albert-schweitzer" },
  { name: "Marcus Aurelius", slug: "marcus-aurelius" },
  { name: "Steve Jobs", slug: "steve-jobs" },
  { name: "Maya Angelou", slug: "maya-angelou" },
  { name: "Oscar Wilde", slug: "oscar-wilde" },
  { name: "Seneca", slug: "seneca" },
  { name: "Confucius", slug: "confucius" },
  { name: "Rumi", slug: "rumi" },
  { name: "Nelson Mandela", slug: "nelson-mandela" },
  { name: "Winston Churchill", slug: "winston-churchill" },
  { name: "Marie Curie", slug: "marie-curie" },
  { name: "Epictetus", slug: "epictetus" },
  { name: "Mark Twain", slug: "mark-twain" },
  { name: "Ralph Waldo Emerson", slug: "ralph-waldo-emerson" },
  { name: "Aristotle", slug: "aristotle" },
  { name: "Buddha", slug: "buddha" },
  { name: "Mahatma Gandhi", slug: "mahatma-gandhi" },
  { name: "Jane Austen", slug: "jane-austen" },
  { name: "Sun Tzu", slug: "sun-tzu" },
  { name: "Simone Weil", slug: "simone-weil" },
] as const;

export function suggestAuthors(q: string, limit = 8) {
  const n = q.trim().toLowerCase();
  if (n.length < 2) return [];
  const extra = LOCAL_QUOTES.map((x) => ({ name: x.author, slug: authorSlug(x.author) }));
  const all = [...POPULAR_AUTHORS, ...extra];
  const seen = new Set<string>();
  const out: { name: string; slug: string }[] = [];
  for (const a of all) {
    const key = a.slug || authorSlug(a.name);
    if (seen.has(key)) continue;
    if (a.name.toLowerCase().includes(n) || key.includes(n.replace(/\s+/g, "-"))) {
      seen.add(key);
      out.push({ name: a.name, slug: key });
    }
    if (out.length >= limit) break;
  }
  return out;
}

function local(author: string, _slug: string, text: string): DeskQuote {
  return { text, author, href: wqPageHref(author), source: "local" };
}

/** Built-in offline set: always available, shown after live rows and alone when offline. */
export const LOCAL_QUOTES: DeskQuote[] = [
  local("Albert Einstein", "albert-einstein", "Life is like riding a bicycle. To keep your balance, you must keep moving."),
  local("Albert Einstein", "albert-einstein", "Imagination is more important than knowledge."),
  local("Albert Einstein", "albert-einstein", "Strive not to be a success, but rather to be of value."),
  local("Marcus Aurelius", "marcus-aurelius", "The impediment to action advances action. What stands in the way becomes the way."),
  local("Marcus Aurelius", "marcus-aurelius", "You have power over your mind — not outside events. Realize this, and you will find strength."),
  local("Marcus Aurelius", "marcus-aurelius", "Waste no more time arguing about what a good man should be. Be one."),
  local("Steve Jobs", "steve-jobs", "Stay hungry. Stay foolish."),
  local("Steve Jobs", "steve-jobs", "Innovation distinguishes between a leader and a follower."),
  local("Maya Angelou", "maya-angelou", "People will forget what you said, people will forget what you did, but people will never forget how you made them feel."),
  local("Maya Angelou", "maya-angelou", "If you don't like something, change it. If you can't change it, change your attitude."),
  local("Oscar Wilde", "oscar-wilde", "Be yourself; everyone else is already taken."),
  local("Oscar Wilde", "oscar-wilde", "We are all in the gutter, but some of us are looking at the stars."),
  local("Seneca", "seneca", "We suffer more often in imagination than in reality."),
  local("Seneca", "seneca", "Luck is what happens when preparation meets opportunity."),
  local("Confucius", "confucius", "It does not matter how slowly you go as long as you do not stop."),
  local("Confucius", "confucius", "The man who moves a mountain begins by carrying away small stones."),
  local("Rumi", "rumi", "Yesterday I was clever, so I wanted to change the world. Today I am wise, so I am changing myself."),
  local("Rumi", "rumi", "What you seek is seeking you."),
  local("Nelson Mandela", "nelson-mandela", "It always seems impossible until it's done."),
  local("Nelson Mandela", "nelson-mandela", "Courage is not the absence of fear, but the triumph over it."),
  local("Winston Churchill", "winston-churchill", "Success is not final, failure is not fatal: it is the courage to continue that counts."),
  local("Winston Churchill", "winston-churchill", "If you're going through hell, keep going."),
  local("Marie Curie", "marie-curie", "Nothing in life is to be feared, it is only to be understood."),
  local("Marie Curie", "marie-curie", "Be less curious about people and more curious about ideas."),
  local("Epictetus", "epictetus", "It's not what happens to you, but how you react to it that matters."),
  local("Epictetus", "epictetus", "No man is free who is not master of himself."),
  local("Mark Twain", "mark-twain", "The secret of getting ahead is getting started."),
  local("Mark Twain", "mark-twain", "Kindness is the language which the deaf can hear and the blind can see."),
  local("Ralph Waldo Emerson", "ralph-waldo-emerson", "What you do speaks so loudly that I cannot hear what you say."),
  local("Ralph Waldo Emerson", "ralph-waldo-emerson", "Do not go where the path may lead, go instead where there is no path and leave a trail."),
  local("Aristotle", "aristotle", "We are what we repeatedly do. Excellence, then, is not an act, but a habit."),
  local("Aristotle", "aristotle", "Knowing yourself is the beginning of all wisdom."),
  local("Buddha", "buddha", "The mind is everything. What you think you become."),
  local("Buddha", "buddha", "Do not dwell in the past, do not dream of the future, concentrate the mind on the present moment."),
  local("Mahatma Gandhi", "mahatma-gandhi", "Be the change that you wish to see in the world."),
  local("Mahatma Gandhi", "mahatma-gandhi", "The weak can never forgive. Forgiveness is the attribute of the strong."),
  local("Jane Austen", "jane-austen", "There is no charm equal to tenderness of heart."),
  local("Jane Austen", "jane-austen", "It isn't what we say or think that defines us, but what we do."),
  local("Sun Tzu", "sun-tzu", "The supreme art of war is to subdue the enemy without fighting."),
  local("Sun Tzu", "sun-tzu", "In the midst of chaos, there is also opportunity."),
  local("Simone Weil", "simone-weil", "Attention is the rarest and purest form of generosity."),
  local("Simone Weil", "simone-weil", "The world is the closed door. It is a barrier. And at the same time it is the way through."),
];

/** Topic chips: ids + labels; each maps to a Wikiquote theme page (WQ_TOPIC_PAGES). */
export const QUOTE_TOPICS = [
  { id: "all", label: "All" },
  { id: "life", label: "Life" },
  { id: "funny", label: "Funny" },
  { id: "love", label: "Love" },
  { id: "wisdom", label: "Wisdom" },
  { id: "success", label: "Success" },
  { id: "motivational", label: "Motivational" },
  { id: "nature", label: "Nature" },
] as const;

export type QuoteTopicId = (typeof QUOTE_TOPICS)[number]["id"];

export function normalizeQuoteTopic(raw?: string): QuoteTopicId {
  const id = (raw ?? "").trim().toLowerCase();
  return QUOTE_TOPICS.some((t) => t.id === id) ? (id as QuoteTopicId) : "all";
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(list: T[], seed: string) {
  const out = [...list];
  let s = hash(seed) || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = Math.imul(s ^ (s >>> 15), 1 | s) >>> 0;
    const j = s % (i + 1);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

function unique(list: DeskQuote[]) {
  const seen = new Set<string>();
  return list.filter((q) => {
    const k = q.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Live rows first, then built-ins, deduped by normalized text. Built-ins alone when offline. */
export function mergeQuotePool(live: DeskQuote[], builtins: DeskQuote[]) {
  return unique([...live.filter((q) => q.text.length >= 12), ...builtins]);
}

const TOPIC_WORDS: Record<string, string[]> = {
  life: ["life", "live", "living", "balance"],
  funny: ["fool", "laugh", "funny", "joke", "gutter", "stars", "taken"],
  love: ["love", "heart", "tenderness"],
  wisdom: ["wisdom", "wise", "know", "understood", "mind"],
  success: ["success", "succeed", "excellence", "leader", "ahead"],
  motivational: ["courage", "change", "keep", "impossible", "hungry", "moving", "fear"],
  nature: ["nature", "world", "earth", "bicycle"],
};

export function topicLocals(id: QuoteTopicId, local: DeskQuote[] = LOCAL_QUOTES): DeskQuote[] {
  if (id === "all") return local;
  const words = TOPIC_WORDS[id] ?? [];
  const hit = local.filter((q) => {
    const blob = `${q.text} ${q.author}`.toLowerCase();
    return words.some((w) => blob.includes(w));
  });
  return hit.length ? hit : local;
}

/** Topic chips: every topic that has a live page (data table), plus All. */
export function quoteTopicChips(): { id: QuoteTopicId; label: string }[] {
  return QUOTE_TOPICS.filter((t) => t.id === "all" || t.id in WQ_TOPIC_PAGES).map((t) => ({ id: t.id, label: t.label }));
}

/** Author chips from the current result set (search/filter chrome, not a dump of every name). */
export function authorChipsFromQuotes(quotes: DeskQuote[], limit = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of quotes) {
    const name = q.author.trim();
    if (!name) continue;
    const key = authorSlug(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

export function matchQuoteQuery(q: DeskQuote, query: string) {
  const n = query.trim().toLowerCase();
  if (!n) return true;
  return q.text.toLowerCase().includes(n) || q.author.toLowerCase().includes(n);
}

export function exactAuthor(q: DeskQuote, name: string) {
  const slug = authorSlug(name);
  if (slug.length < 2) return false;
  return authorSlug(q.author) === slug || q.author.toLowerCase() === name.trim().toLowerCase();
}

export function authorMatches(author: string, name: string) {
  const slug = authorSlug(name);
  const a = authorSlug(author);
  if (!a || slug.length < 2) return false;
  const parts = a.split("-").filter(Boolean);
  return (
    a === slug
    || a.startsWith(`${slug}-`)
    || slug.startsWith(`${a}-`)
    || parts[0] === slug
    || parts[parts.length - 1] === slug
    || author.toLowerCase() === name.toLowerCase()
  );
}

async function pull(url: string, headers: Record<string, string>): Promise<string | null> {
  try {
    return await Promise.race([
      httpText(url, headers),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
    ]);
  } catch {
    return null;
  }
}

/** One Wikiquote view (daily date, topic id, or author/search name). Server on web, webview on Tauri. */
export const fetchWikiquote = createServerFn({ method: "POST" })
  .validator(
    z.object({
      kind: z.enum(["daily", "topic", "author"]),
      key: z.string().trim().min(1).max(80),
    }),
  )
  .handler(async ({ data }): Promise<WqResult> => loadWikiquote(data.kind, data.key, pull));

export type QuoteMode = "random" | "popular" | "author";
export type QuoteQuery = {
  mode: QuoteMode;
  author?: string;
  topic?: string;
  q?: string;
  exact?: boolean;
  limit?: number;
  seed?: string;
  /** Refresh: recheck this view's key only, bypassing the TTL. */
  force?: boolean;
};

/** Today's daily key in the desk zone. */
export function todayQuoteKey(d = new Date()) {
  const p = manilaParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Which Wikiquote view a query reads: author > topic > daily. */
export function quoteView(o: Pick<QuoteQuery, "mode" | "author" | "topic" | "q">, today = todayQuoteKey()): { kind: WqKind; key: string } {
  const name = (o.author ?? o.q ?? "").trim();
  if (o.mode === "author" && name.length >= 2) return { kind: "author", key: name };
  const topic = normalizeQuoteTopic(o.topic);
  if (topic !== "all") return { kind: "topic", key: topic };
  return { kind: "daily", key: today };
}

export type DeskQuotes = {
  quotes: DeskQuote[];
  author?: string;
  topic?: string;
  /** wikiquote when any live row is shown, else local (built-ins). */
  from: "wikiquote" | "local";
  state: ViewState["from"];
  /** The Wikiquote page behind this view (attribution). */
  page?: { title: string; href: string };
};

type Deps = {
  fetcher?: (kind: WqKind, key: string) => Promise<WqResult>;
  kv?: KV;
  now?: () => number;
  today?: string;
};

/** Client composer: persistent cache + Wikiquote + built-ins → the page/widget list. */
export async function loadDeskQuotes(o: QuoteQuery, deps: Deps = {}): Promise<DeskQuotes> {
  const fetcher = deps.fetcher ?? ((kind, key) => fetchWikiquote({ data: { kind, key } }));
  const view = quoteView(o, deps.today);
  const state = await loadView<DeskQuote>(
    quoteCacheKey(view.kind, view.key),
    async () => {
      const r = await fetcher(view.kind, view.key);
      return { quotes: r.quotes.map((q) => ({ ...q, source: "wikiquote" as const })), title: r.title };
    },
    { kv: "kv" in deps ? deps.kv : browserKV(), now: deps.now, force: o.force },
  );
  const live = state.quotes;
  const limit = o.limit ?? 12;
  const page = state.title ? { title: state.title, href: live[0]?.href ?? wqPageHref(state.title) } : undefined;
  const from = (list: DeskQuote[]) => (list.some((q) => q.source === "wikiquote") ? "wikiquote" : "local") as DeskQuotes["from"];

  if (view.kind === "author") {
    const name = view.key;
    const builtins = LOCAL_QUOTES.filter((q) => (o.exact ? exactAuthor(q, name) : authorMatches(q.author, name)));
    const quotes = mergeQuotePool(live, builtins).slice(0, limit);
    return { quotes, author: live[0]?.author ?? quotes[0]?.author ?? name, from: from(quotes), state: state.from, page };
  }
  const topic = normalizeQuoteTopic(o.topic);
  const pool = mergeQuotePool(live, topic === "all" ? LOCAL_QUOTES : topicLocals(topic)).filter((q) => matchQuoteQuery(q, o.q ?? ""));
  const quotes = (o.mode === "random" ? shuffle(pool, o.seed ?? `${Date.now()}`) : pool).slice(0, limit);
  return { quotes, topic, from: from(quotes), state: state.from, page };
}
