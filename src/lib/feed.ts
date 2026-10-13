/** Feed (was News) — user-defined interests, digest, summary, hub, curate. Pure helpers; no topics baked in. */

import { tagStory } from "./headline.ts";
import { isRelatedStory } from "./news.ts";

/** An instrument an interest can resolve to (watch row or catalog entry). */
export type StockRef = { id?: string; label: string; symbol: string; name?: string; kind: string };
/** Resolves an interest label to a stock, or null when it is a plain topic. */
export type StockOf = (interest: string) => StockRef | null | undefined;

export type HubKind = "link" | "video" | "doc";
/** `topic`: the followed topic it was saved under (Card 190 / Form 185 B4), or HUB_TOPIC_OTHER. */
export type HubItem = { id: string; url: string; title: string; kind: HubKind; src?: string; at: string; note?: string; topic?: string };
/** Saved-filter label for items that match no followed topic. */
export const HUB_TOPIC_OTHER = "Other";
/** Version of the saved-item topic backfill (feedPrefs.hubTopicV). */
export const HUB_TOPIC_V = 1;
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
  /** Layout: Sources · N control (and pack chips) on Feed. Default on. */
  showSourcesStrip: boolean;
  /** Layout: Summary block under digest hero. Default on. */
  showSummary: boolean;
  /** Layout: Resource hub rail (desktop) / strip (phone). Default on. */
  showHub: boolean;
  /** Layout: roomy story rows when on; compact when off. Default on. */
  comfortableDensity: boolean;
  /** Topic Finder: dismissed story clusters, kept 30 days (Card 161 §3). */
  dismissed: DismissedPick[];
  /** Topic Finder "Less like this": title keywords that rank lower. */
  lessLike: string[];
  /** Options › Picks (Form 185): one "Why: …" line per pick. Default on. */
  showWhy: boolean;
  /** Options › Picks: leave dismissed stories out of Topics. Default on. */
  hideDismissed: boolean;
  /** Options › Picks: short helper copy across Feed › Topics / Saved / Options. Default off. */
  showHelper: boolean;
  /** Saved-item topic backfill version run so far (0 = never). */
  hubTopicV: number;
};

export type DismissedPick = { id: string; at: string; title?: string; link?: string };

/** Card 161 Needs Eric #4: dismissed picks are forgotten after 30 days. */
export const DISMISS_DAYS = 30;
const DISMISS_MAX = 500;
const LESS_MAX = 60;

export function pruneDismissed(list: readonly DismissedPick[], now = Date.now(), days = DISMISS_DAYS): DismissedPick[] {
  const cut = now - days * 86_400_000;
  return list.filter((d) => {
    const t = Date.parse(d.at);
    return Number.isFinite(t) && t >= cut;
  });
}

export const DIGEST_FREQS: { id: DigestFreq; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Weekly" },
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
  dismissed: [],
  lessLike: [],
  showWhy: true,
  hideDismissed: true,
  showHelper: false,
  hubTopicV: 0,
  pinned: [],
  hidden: [],
  muted: [],
  showSourcesStrip: true,
  showSummary: true,
  showHub: true,
  comfortableDensity: true,
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
  // Card 188 (Scout 186 §4): a topic needs at least one letter or digit ("  ", "," are not topics).
  if (!/[\p{L}\p{N}]/u.test(k)) return "";
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
  const note = typeof r.note === "string" ? r.note.trim().slice(0, 2000) : "";
  return {
    id: typeof r.id === "string" && r.id ? r.id : url,
    url,
    title: (typeof r.title === "string" && r.title.trim()) || hostOf(url),
    kind,
    src: typeof r.src === "string" && r.src.trim() ? r.src.trim() : undefined,
    at: typeof r.at === "string" ? r.at : "",
    ...(note ? { note } : {}),
    ...(typeof r.topic === "string" && r.topic.trim() ? { topic: r.topic.trim().slice(0, 40) } : {}),
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
    showSourcesStrip: r.showSourcesStrip !== false,
    showSummary: r.showSummary !== false,
    showHub: r.showHub !== false,
    comfortableDensity: r.comfortableDensity !== false,
    dismissed: pruneDismissed(
      (Array.isArray(r.dismissed) ? r.dismissed : [])
        .filter((d): d is DismissedPick => Boolean(d) && typeof (d as DismissedPick).id === "string" && typeof (d as DismissedPick).at === "string")
        .map((d) => ({ id: d.id, at: d.at, ...(typeof d.title === "string" ? { title: d.title.slice(0, 300) } : {}), ...(typeof d.link === "string" ? { link: d.link } : {}) })),
    ).slice(0, DISMISS_MAX),
    lessLike: strList(r.lessLike, LESS_MAX),
    showWhy: r.showWhy !== false,
    hideDismissed: r.hideDismissed !== false,
    showHelper: r.showHelper === true,
    hubTopicV: typeof r.hubTopicV === "number" && Number.isFinite(r.hubTopicV) ? Math.max(0, Math.floor(r.hubTopicV)) : 0,
  };
}

/** Move a followed topic by `delta` places (−1 up, +1 down); clamped. Order is the Topics order. */
export function moveInterest(p: FeedPrefs, label: string, delta: number): FeedPrefs {
  const from = p.interests.findIndex((i) => i.toLowerCase() === label.toLowerCase());
  if (from < 0 || !delta) return p;
  const to = Math.max(0, Math.min(p.interests.length - 1, from + delta));
  if (to === from) return p;
  const interests = [...p.interests];
  const [it] = interests.splice(from, 1);
  interests.splice(to, 0, it!);
  return { ...p, interests };
}

/** Edit a followed topic in place (keeps its position); saved items filed under it follow. */
export function renameInterest(p: FeedPrefs, from: string, raw: string): FeedPrefs {
  const to = cleanInterest(raw);
  const k = from.toLowerCase();
  if (!to || !p.interests.some((i) => i.toLowerCase() === k)) return p;
  if (to.toLowerCase() !== k && p.interests.some((i) => i.toLowerCase() === to.toLowerCase())) return p;
  return {
    ...p,
    interests: p.interests.map((i) => (i.toLowerCase() === k ? to : i)),
    interest: p.interest.toLowerCase() === k ? to : p.interest,
    hub: p.hub.map((h) => (h.topic?.toLowerCase() === k ? { ...h, topic: to } : h)),
  };
}

/**
 * Which followed topic a story belongs to (Form 185 B4): the active chip when it matches,
 * else the first followed topic (in Topics order) that matches, else HUB_TOPIC_OTHER.
 */
export function topicFor(s: Story, p: Pick<FeedPrefs, "interests" | "interest">, stockOf?: StockOf): string {
  if (p.interest !== FEED_ALL && matchTopic(s, p.interest, stockOf)) return p.interest;
  return p.interests.find((i) => matchTopic(s, i, stockOf)) ?? HUB_TOPIC_OTHER;
}

/**
 * Versioned migration (v1): saved items with no topic get one by re-matching title + note against
 * the current followed topics, else HUB_TOPIC_OTHER. Items that already have a topic are untouched.
 */
export function backfillHubTopics(p: FeedPrefs, stockOf?: StockOf): FeedPrefs {
  if (p.hubTopicV >= HUB_TOPIC_V) return p;
  const hub = p.hub.map((h) =>
    h.topic ? h : { ...h, topic: topicFor({ title: h.title, link: h.url, desc: h.note }, { interests: p.interests, interest: FEED_ALL }, stockOf) },
  );
  return { ...p, hub, hubTopicV: HUB_TOPIC_V };
}

/** Saved filter chips: topics present, in Topics order, then any others A–Z, "Other" last. */
export function hubTopics(p: Pick<FeedPrefs, "hub" | "interests">): string[] {
  const have = new Set(p.hub.map((h) => h.topic ?? HUB_TOPIC_OTHER));
  const followed = p.interests.filter((i) => have.has(i));
  const rest = [...have].filter((t) => t !== HUB_TOPIC_OTHER && !followed.includes(t)).sort((a, b) => a.localeCompare(b));
  return [...followed, ...rest, ...(have.has(HUB_TOPIC_OTHER) ? [HUB_TOPIC_OTHER] : [])];
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

/**
 * Save a link. The followed topic it belongs to is recorded (Form 185 B4): `item.topic` when the
 * caller knows it (Topics page), else re-matched from title + `match` (story summary fields).
 */
export function withHub(
  p: FeedPrefs,
  item: Omit<HubItem, "kind"> & { kind?: HubKind; match?: Pick<Story, "desc" | "category" | "region">; stockOf?: StockOf },
): FeedPrefs {
  const url = item.url.trim();
  if (!/^https?:\/\//i.test(url) || p.hub.some((h) => h.url === url)) return p;
  const note = typeof item.note === "string" ? item.note.trim().slice(0, 2000) : "";
  const { match, stockOf, ...rest } = item;
  const topic = cleanInterest(rest.topic ?? "") || topicFor({ title: rest.title, link: url, desc: match?.desc ?? note, category: match?.category, region: match?.region }, p, stockOf);
  const next: HubItem = {
    ...rest,
    topic,
    url,
    title: item.title.trim() || hostOf(url),
    kind: item.kind ?? hubKind(url),
    ...(note ? { note } : { note: undefined }),
  };
  if (!note) delete next.note;
  return { ...p, hub: [next, ...p.hub].slice(0, HUB_MAX) };
}

export function withoutHub(p: FeedPrefs, id: string): FeedPrefs {
  return { ...p, hub: p.hub.filter((h) => h.id !== id) };
}

export function patchHub(p: FeedPrefs, id: string, patch: Partial<Pick<HubItem, "title" | "note" | "url">>): FeedPrefs {
  return {
    ...p,
    hub: p.hub.map((h) => {
      if (h.id !== id) return h;
      const next = { ...h, ...patch };
      if (typeof patch.note === "string") {
        const note = patch.note.trim().slice(0, 2000);
        if (note) next.note = note;
        else delete next.note;
      }
      if (typeof patch.title === "string") next.title = patch.title.trim() || hostOf(next.url);
      if (typeof patch.url === "string" && /^https?:\/\//i.test(patch.url.trim())) {
        next.url = patch.url.trim();
        next.kind = hubKind(next.url);
      }
      return next;
    }),
  };
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

/** A topic's terms: comma alternatives, trimmed; blanks and punctuation-only parts dropped. */
export function topicTerms(topic: string): string[] {
  return topic
    .split(",")
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter((t) => /[\p{L}\p{N}]/u.test(t));
}

export type TopicHit = { term: string; field: "title" | "summary" };

/** Every word of a phrase, each with the same edge rule as a single term. */
function allWordsHit(text: string, phrase: string) {
  const words = phrase.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w));
  return words.length > 1 && words.every((w) => termHit(text, w));
}

/**
 * Card 188 (Scout 186 §2–§4): which term of a topic a story matches, and where.
 * - Matches the title, then the summary (desc + tag + region); never the source name, so
 *   "Cebu" doesn't hit every "Cebu Daily News" story.
 * - Exact phrase first; a multi-word term with no exact hit falls back to all of its words
 *   ("Philippine economy" → "Philippine" and "economy" anywhere in that field).
 * - Returns the term as typed (for "matches “{term}”"); null for a blank topic or no hit.
 * A stock-scoped topic/term (`stockOf`) keeps the quote-sheet rule (name or ticker in the title).
 */
export function matchTopic(s: Story, topic: string, stockOf?: StockOf): TopicHit | null {
  const k = topic.trim();
  if (!k || k.toLowerCase() === FEED_ALL.toLowerCase()) return null;
  const whole = stockOf?.(k);
  if (whole) return isRelatedStory(s, whole) ? { term: k, field: "title" } : null;
  const terms = topicTerms(k);
  const title = s.title.toLowerCase();
  const summary = `${s.desc ?? ""} ${tagStory(s)} ${s.region ?? ""}`.toLowerCase();
  for (const pass of [termHit, allWordsHit]) {
    for (const t of terms) {
      const stock = terms.length > 1 ? stockOf?.(t) : null;
      if (stock) {
        if (pass === termHit && isRelatedStory(s, stock)) return { term: t, field: "title" };
        continue;
      }
      const low = t.toLowerCase();
      if (pass(title, low)) return { term: t, field: "title" };
      if (pass(summary, low)) return { term: t, field: "summary" };
    }
  }
  return null;
}

/**
 * Interest is a phrase or comma list (any term matches) over title, desc and tag — not the source
 * name (Card 188); see matchTopic. All (or empty) shows everything in Latest.
 */
export function matchesInterest(s: Story, interest: string, stockOf?: StockOf): boolean {
  const k = interest.trim();
  if (!k || k.toLowerCase() === FEED_ALL.toLowerCase()) return true;
  return matchTopic(s, k, stockOf) !== null;
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
