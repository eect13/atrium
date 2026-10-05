/** Feed (was News) — user-defined interests, digest, summary, hub, curate. Pure helpers; no topics baked in. */

import { tagStory } from "./headline.ts";
import { isRelatedStory } from "./news.ts";

/** An instrument an interest can resolve to (watch row or catalog entry). */
export type StockRef = { id?: string; label: string; symbol: string; name?: string; kind: string };
/** Resolves an interest label to a stock, or null when it is a plain topic. */
export type StockOf = (interest: string) => StockRef | null | undefined;

export type HubKind = "link" | "video" | "doc";
export type HubItem = { id: string; url: string; title: string; kind: HubKind; src?: string; at: string };
export type DigestFreq = "daily" | "weekdays" | "weekly";

export type FeedPrefs = {
  /** User-defined interest labels. Empty by default — no hardcoded topics. */
  interests: string[];
  /** Active interest chip. "All" when none. */
  interest: string;
  digestOn: boolean;
  /** HH:MM desk time. */
  digestTime: string;
  digestFreq: DigestFreq;
  hub: HubItem[];
  /** Curate: story links pinned to the top. */
  pinned: string[];
  /** Curate: story links hidden. */
  hidden: string[];
  /** Curate: source names muted (case-insensitive). */
  muted: string[];
};

export const DIGEST_FREQS: { id: DigestFreq; label: string }[] = [
  { id: "daily", label: "daily" },
  { id: "weekdays", label: "weekdays" },
  { id: "weekly", label: "weekly" },
];

export const FEED_ALL = "All";
const INTEREST_MAX = 12;
const HUB_MAX = 48;
const CURATE_MAX = 200;

export const DEFAULT_FEED_PREFS: FeedPrefs = {
  interests: [],
  interest: FEED_ALL,
  digestOn: true,
  digestTime: "07:00",
  digestFreq: "daily",
  hub: [],
  pinned: [],
  hidden: [],
  muted: [],
};

type Story = { title: string; link: string; desc?: string; src?: string; category?: string; region?: string; date?: string };

export function storyKey(n: { src?: string; link: string; title: string }, i: number) {
  return `${n.src ?? ""}|${n.link}|${n.title}|${i}`;
}

/** Trimmed, single-spaced, ≤40 chars. "All" and empties are rejected. */
export function cleanInterest(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const k = raw.trim().replace(/\s+/g, " ").slice(0, 40).trim();
  if (!k || k.toLowerCase() === FEED_ALL.toLowerCase()) return "";
  return k;
}

function strList(raw: unknown, cap: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const k = v.trim();
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
    if (out.length >= cap) break;
  }
  return out;
}

export function hubKind(url: string): HubKind {
  const u = url.trim().toLowerCase();
  if (/(youtube\.com|youtu\.be|vimeo\.com|loom\.com\/share|\.mp4(\?|$)|\.webm(\?|$))/.test(u)) return "video";
  if (/(\.pdf(\?|#|$)|\.docx?(\?|$)|\.pptx?(\?|$)|docs\.google\.com|notion\.so|\/doc\/)/.test(u)) return "doc";
  return "link";
}

function asHub(raw: unknown): HubItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const url = typeof r.url === "string" ? r.url.trim() : "";
  if (!/^https?:\/\//i.test(url)) return null;
  const kind = r.kind === "video" || r.kind === "doc" || r.kind === "link" ? r.kind : hubKind(url);
  return {
    id: typeof r.id === "string" && r.id ? r.id : url,
    url,
    title: (typeof r.title === "string" && r.title.trim()) || hostOf(url),
    kind,
    src: typeof r.src === "string" && r.src.trim() ? r.src.trim() : undefined,
    at: typeof r.at === "string" ? r.at : "",
  };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? url;
  }
}

export function normalizeFeedPrefs(raw: unknown): FeedPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const interests = strList(Array.isArray(r.interests) ? r.interests.map(cleanInterest) : [], INTEREST_MAX);
  const picked = cleanInterest(r.interest);
  const interest = picked && interests.some((i) => i.toLowerCase() === picked.toLowerCase()) ? picked : FEED_ALL;
  const time = typeof r.digestTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.digestTime) ? r.digestTime : DEFAULT_FEED_PREFS.digestTime;
  const freq = DIGEST_FREQS.some((f) => f.id === r.digestFreq) ? (r.digestFreq as DigestFreq) : DEFAULT_FEED_PREFS.digestFreq;
  const hub: HubItem[] = [];
  const seen = new Set<string>();
  for (const h of Array.isArray(r.hub) ? r.hub : []) {
    const item = asHub(h);
    if (!item || seen.has(item.url)) continue;
    seen.add(item.url);
    hub.push(item);
    if (hub.length >= HUB_MAX) break;
  }
  return {
    interests,
    interest,
    digestOn: r.digestOn !== false,
    digestTime: time,
    digestFreq: freq,
    hub,
    pinned: strList(r.pinned, CURATE_MAX),
    hidden: strList(r.hidden, CURATE_MAX),
    muted: strList(r.muted, CURATE_MAX),
  };
}

export function withInterest(p: FeedPrefs, raw: string): FeedPrefs {
  const label = cleanInterest(raw);
  if (!label || p.interests.some((i) => i.toLowerCase() === label.toLowerCase())) return p;
  if (p.interests.length >= INTEREST_MAX) return p;
  return { ...p, interests: [...p.interests, label], interest: label };
}

export function withoutInterest(p: FeedPrefs, label: string): FeedPrefs {
  const k = label.toLowerCase();
  const interests = p.interests.filter((i) => i.toLowerCase() !== k);
  return { ...p, interests, interest: p.interest.toLowerCase() === k ? FEED_ALL : p.interest };
}

export function withHub(p: FeedPrefs, item: Omit<HubItem, "kind"> & { kind?: HubKind }): FeedPrefs {
  const url = item.url.trim();
  if (!/^https?:\/\//i.test(url) || p.hub.some((h) => h.url === url)) return p;
  const next: HubItem = { ...item, url, title: item.title.trim() || hostOf(url), kind: item.kind ?? hubKind(url) };
  return { ...p, hub: [next, ...p.hub].slice(0, HUB_MAX) };
}

export function withoutHub(p: FeedPrefs, id: string): FeedPrefs {
  return { ...p, hub: p.hub.filter((h) => h.id !== id) };
}

function toggle(list: string[], key: string): string[] {
  const k = key.trim();
  if (!k) return list;
  const hit = list.some((x) => x.toLowerCase() === k.toLowerCase());
  return hit ? list.filter((x) => x.toLowerCase() !== k.toLowerCase()) : [k, ...list].slice(0, CURATE_MAX);
}

export const togglePin = (p: FeedPrefs, link: string): FeedPrefs => ({ ...p, pinned: toggle(p.pinned, link) });
export const toggleHide = (p: FeedPrefs, link: string): FeedPrefs => ({
  ...p,
  hidden: toggle(p.hidden, link),
  pinned: p.pinned.filter((x) => x !== link),
});
export const toggleMute = (p: FeedPrefs, src: string): FeedPrefs => ({ ...p, muted: toggle(p.muted, src) });

/** Drop hidden stories and muted sources; pinned first, otherwise original order. */
export function curateStories<T extends Story>(items: T[], p: Pick<FeedPrefs, "pinned" | "hidden" | "muted">): T[] {
  const hidden = new Set(p.hidden);
  const muted = new Set(p.muted.map((m) => m.toLowerCase()));
  const pinned = new Set(p.pinned);
  const kept = items.filter((s) => !hidden.has(s.link) && !muted.has((s.src ?? "").trim().toLowerCase()));
  return [...kept.filter((s) => pinned.has(s.link)), ...kept.filter((s) => !pinned.has(s.link))];
}

function blob(s: Story) {
  return `${s.title} ${s.desc ?? ""} ${s.src ?? ""} ${tagStory(s)} ${s.region ?? ""}`.toLowerCase();
}

function termHit(text: string, term: string) {
  // Short terms (≤4) need word edges so "ai" does not hit "said" and a ticker does not hit a longer word.
  if (term.length <= 4) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc}(?:[^\\p{L}\\p{N}]|$)`, "iu").test(text);
  }
  return text.includes(term);
}

/**
 * Interest is a phrase or comma list (any term matches) over title, desc, source, and tag.
 * When `stockOf` resolves the interest (or a term) to a stock, only stories about that stock pass
 * (same rule as the quote sheet: name or ticker in the title) — no unrelated headlines.
 */
export function matchesInterest(s: Story, interest: string, stockOf?: StockOf): boolean {
  const k = interest.trim();
  if (!k || k.toLowerCase() === FEED_ALL.toLowerCase()) return true;
  const whole = stockOf?.(k);
  if (whole) return isRelatedStory(s, whole);
  const terms = k
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const text = blob(s);
  return terms.some((t) => {
    const stock = terms.length > 1 ? stockOf?.(t) : null;
    if (stock) return isRelatedStory(s, stock);
    return termHit(text, t.toLowerCase());
  });
}

export function storiesFor<T extends Story>(items: T[], p: FeedPrefs, query = "", stockOf?: StockOf): T[] {
  const q = query.trim().toLowerCase();
  return curateStories(items, p).filter((s) => matchesInterest(s, p.interest, stockOf) && (!q || blob(s).includes(q)));
}

/**
 * Interest → stock, strict so topics never turn into tickers: `$BDO` / `PSE:BDO`, an exact
 * UPPERCASE ticker as typed (`BDO`, not `Tech`), or an exact company name. Watch rows first.
 */
export function interestStock(interest: string, catalog: StockRef[]): StockRef | null {
  const raw = interest.trim();
  if (!raw || raw.includes(",")) return null;
  const tagged = /^(\$|pse[:\s-]+)/i.test(raw);
  const bare = raw.replace(/^\$/, "").replace(/^pse[:\s-]+/i, "").trim();
  if (!bare) return null;
  const lower = bare.toLowerCase();
  const tickerish = tagged || (bare === bare.toUpperCase() && /^[A-Z0-9^.=-]{1,12}$/.test(bare));
  if (tickerish) {
    const hit = catalog.find(
      (c) => c.label.toLowerCase() === lower || c.symbol.toLowerCase() === lower || (c.id ?? "").toLowerCase() === lower,
    );
    if (hit) return hit;
  }
  if (bare.length >= 4) {
    const named = catalog.filter((c) => (c.name ?? "").toLowerCase() === lower);
    if (named.length === 1) return named[0]!;
  }
  return null;
}

export type DigestLine<T> = { label: string; story: T };

/** One line per interest (first unseen match), then fill from the top of the feed. */
export function feedDigest<T extends Story>(items: T[], p: FeedPrefs, n = 3, stockOf?: StockOf): DigestLine<T>[] {
  const pool = curateStories(items, p);
  const used = new Set<string>();
  const out: DigestLine<T>[] = [];
  const scope = p.interest !== FEED_ALL ? [p.interest] : p.interests;
  for (const interest of scope) {
    if (out.length >= n) break;
    const hit = pool.find((s) => !used.has(s.link) && matchesInterest(s, interest, stockOf));
    if (!hit) continue;
    used.add(hit.link);
    out.push({ label: interest, story: hit });
  }
  for (const s of pool) {
    if (out.length >= n) break;
    if (used.has(s.link)) continue;
    if (p.interest !== FEED_ALL && !matchesInterest(s, p.interest, stockOf)) continue;
    used.add(s.link);
    out.push({ label: p.interest !== FEED_ALL ? p.interest : tagStory(s), story: s });
  }
  return out;
}

export type FeedSummary = { count: number; sources: number; top: string[]; newest?: string; line: string };

/** Counted, not written — a short context-neutral summary of what is in view. */
export function feedSummary(items: Story[], interest = FEED_ALL): FeedSummary {
  const bySrc = new Map<string, number>();
  let newest: number | undefined;
  for (const s of items) {
    const src = (s.src ?? "").trim();
    if (src) bySrc.set(src, (bySrc.get(src) ?? 0) + 1);
    const t = s.date ? Date.parse(s.date) : NaN;
    if (Number.isFinite(t) && (newest === undefined || t > newest)) newest = t;
  }
  const top = [...bySrc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([k]) => k);
  const count = items.length;
  const scope = interest && interest !== FEED_ALL ? ` for ${interest}` : "";
  const line = !count
    ? `No stories${scope} yet.`
    : `${count} ${count === 1 ? "story" : "stories"}${scope} from ${bySrc.size} ${bySrc.size === 1 ? "source" : "sources"}${top.length ? ` — most from ${top.join(", ")}` : ""}.`;
  return { count, sources: bySrc.size, top, newest: newest === undefined ? undefined : new Date(newest).toISOString(), line };
}

export function digestLabel(p: Pick<FeedPrefs, "digestOn" | "digestTime" | "digestFreq">): string {
  return p.digestOn ? `${p.digestTime} · ${p.digestFreq}` : "off";
}

/** Story tags as add-interest suggestions only (metadata, never the primary IA). */
export function interestSuggestions(items: Story[], have: string[], cap = 8): string[] {
  const own = new Set(have.map((h) => h.toLowerCase()));
  const count = new Map<string, number>();
  for (const s of items) {
    const t = tagStory(s);
    if (!t || own.has(t.toLowerCase())) continue;
    count.set(t, (count.get(t) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, cap).map(([k]) => k);
}
