import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type DeskQuote = {
  text: string;
  author: string;
  href: string;
  source: "brainyquote" | "local";
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

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const FETCH_MS = 6_000;
const CACHE_MS = 6 * 60 * 60_000;

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

function stripTags(s: string) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
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

export function parseBrainyHtml(html: string): DeskQuote[] {
  const out: DeskQuote[] = [];
  const seen = new Set<string>();
  const re =
    /<a href="(\/quotes\/[^"]+)" class="[^"]*\bb-qt\b[^"]*"[^>]*>([\s\S]*?)<\/a>\s*<a href="(\/authors\/[^"]+)" class="[^"]*\bbq-aut\b[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const text = stripTags(m[2] ?? "");
    const author = stripTags(m[4] ?? "");
    if (text.length < 12 || !author) continue;
    const key = `${author}::${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text,
      author,
      href: `https://www.brainyquote.com${m[1]}`,
      source: "brainyquote",
    });
  }
  return out;
}

/**
 * BrainyQuote RSS (current): <title>Author</title><description>"Quote."</description>
 * Older feeds used <title>Quote - Author</title>.
 */
export function parseBrainyRss(xml: string): DeskQuote[] {
  const chunks = xml.split(/<item[\s>]/i).slice(1);
  const out: DeskQuote[] = [];
  for (const raw of chunks) {
    const block = raw.split(/<\/item>/i)[0] ?? "";
    const title = stripTags((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] ?? "");
    const link = stripTags((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] ?? "");
    const desc = stripTags(
      (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] ?? "",
    );
    const href = link.startsWith("http") ? link : "https://www.brainyquote.com/quote_of_the_day";
    const dashed = title.match(/^([\s\S]+)\s+[-–—]\s+([^–—-]{2,80})$/);
    let text = "";
    let author = "";
    if (desc.length >= 12 && title.length >= 2 && title.length <= 80 && !dashed) {
      text = desc.replace(/^["“]+|["”]+$/g, "").trim();
      author = title.trim();
    } else if (dashed) {
      text = dashed[1]!.replace(/^["“]+|["”]+$/g, "").trim();
      author = dashed[2]!.trim();
    } else if (desc.length >= 12) {
      text = desc.replace(/^["“]+|["”]+$/g, "").trim();
      author = title || "BrainyQuote";
    }
    if (text.length < 12 || !author) continue;
    out.push({ text, author, href, source: "brainyquote" });
  }
  return out;
}

export const POPULAR_AUTHORS = [
  { name: "Albert Einstein", slug: "albert-einstein" },
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

function local(author: string, slug: string, text: string): DeskQuote {
  return { text, author, href: `https://www.brainyquote.com/authors/${slug}-quotes`, source: "local" };
}

/** Desk copies for when BrainyQuote HTML is Cloudflare-gated. RSS still wins. */
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

const BRAINY_RSS = [
  "https://www.brainyquote.com/link/quotebr.rss",
  "https://www.brainyquote.com/link/quotelo.rss",
  "https://www.brainyquote.com/link/quotefu.rss",
  "https://www.brainyquote.com/link/quotena.rss",
];

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

const g = globalThis as typeof globalThis & {
  __atriumQuotes?: Map<string, { exp: number; data: DeskQuote[] }>;
};

function cache() {
  g.__atriumQuotes ??= new Map();
  return g.__atriumQuotes;
}

async function pull(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fromAuthor(slug: string): Promise<DeskQuote[]> {
  const key = `author:${slug}`;
  const hit = cache().get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const html = await pull(`https://www.brainyquote.com/authors/${slug}-quotes`);
  const data = html ? parseBrainyHtml(html) : [];
  if (data.length) cache().set(key, { exp: Date.now() + CACHE_MS, data });
  return data;
}

async function fromRss(): Promise<DeskQuote[]> {
  const key = "rss:all";
  const hit = cache().get(key);
  if (hit && hit.exp > Date.now()) return hit.data;
  const pages = await Promise.all(BRAINY_RSS.map((url) => pull(url)));
  const data = unique(pages.flatMap((xml) => (xml ? parseBrainyRss(xml) : [])));
  if (data.length) cache().set(key, { exp: Date.now() + CACHE_MS, data });
  return data;
}

function unique(list: DeskQuote[]) {
  const seen = new Set<string>();
  return list.filter((q) => {
    const k = `${q.author}::${q.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function matchAuthor(q: DeskQuote, name: string, slug: string) {
  const a = authorSlug(q.author);
  if (!a) return false;
  return a === slug || a.startsWith(`${slug}-`) || slug.startsWith(`${a}-`) || q.author.toLowerCase() === name.toLowerCase();
}

export const fetchQuotes = createServerFn({ method: "POST" })
  .validator(
    z.object({
      mode: z.enum(["random", "popular", "author"]),
      author: z.string().trim().max(80).optional(),
      limit: z.number().int().min(1).max(40).optional(),
      seed: z.string().max(40).optional(),
    }),
  )
  .handler(async ({ data }): Promise<{ quotes: DeskQuote[]; author?: string; from: string }> => {
    const limit = data.limit ?? 12;
    const seed = data.seed ?? `${Date.now()}`;
    const daily = await fromRss();

    if (data.mode === "author") {
      const name = (data.author ?? "").trim();
      const slug = authorSlug(name);
      if (slug.length < 2) return { quotes: [], from: "local" };
      const known = POPULAR_AUTHORS.find(
        (a) => a.slug === slug || authorSlug(a.name) === slug || a.name.toLowerCase() === name.toLowerCase(),
      );
      const slugs = [...new Set([known?.slug, slug, slug.replace(/-\d+$/, "")].filter(Boolean))] as string[];
      for (const s of slugs) {
        const quotes = await fromAuthor(s);
        if (quotes.length) {
          return { quotes: quotes.slice(0, limit), author: quotes[0]?.author ?? name, from: "brainyquote" };
        }
      }
      const pool = unique([...daily, ...LOCAL_QUOTES]).filter((q) =>
        slugs.some((s) => matchAuthor(q, name, s)),
      );
      return {
        quotes: pool.slice(0, limit),
        author: pool[0]?.author ?? name,
        from: pool.some((q) => q.source === "brainyquote") ? "brainyquote" : pool.length ? "local" : "local",
      };
    }

    if (data.mode === "popular") {
      const quotes = unique([...daily, ...LOCAL_QUOTES]).slice(0, limit);
      return { quotes, from: daily.length ? "brainyquote" : "local" };
    }

    const pool = unique([...daily, ...LOCAL_QUOTES]);
    const quotes = shuffle(pool, seed).slice(0, limit);
    return { quotes, from: daily.length ? "brainyquote" : "local" };
  });
