/**
 * Topic Finder (Card 161 §3, direction A). Feed is a stream by source; Topic Finder groups
 * the same Feed items into stories covered by several sources and ranks them by value, and
 * every pick says why. Pure helpers; topics are the user's Feed interests.
 */
import { DISMISS_DAYS, hostOf, matchTopic, pruneDismissed, topicTerms, type DismissedPick, type FeedPrefs, type StockOf } from "./feed.ts";

export type TopicStory = { title: string; link: string; desc?: string; src?: string; date?: string; category?: string; region?: string };

export type Cluster<S extends TopicStory = TopicStory> = {
  /** Stable id (lead link), used for Dismissed. */
  id: string;
  lead: S;
  items: S[];
  /** Distinct source names, lead first. */
  sources: string[];
  newest: number;
};

const STOP = new Set("the a an and or of to in on for with at by from as is are was were be been it its this that after over into says said new will could would amid about than more what how why who".split(" "));

export function titleWords(title: string): string[] {
  return [
    ...new Set(
      title
        .toLowerCase()
        .replace(/\s+[-—|]\s+[^-—|]+$/, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(" ")
        .filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  ];
}

function overlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const B = new Set(b);
  const hit = a.filter((w) => B.has(w)).length;
  return hit / Math.min(a.length, b.length);
}

const srcOf = (s: TopicStory) => (s.src?.trim() || hostOf(s.link)).trim();
const timeOf = (s: TopicStory) => Date.parse(s.date ?? "") || 0;

/** Group near-duplicate headlines (≥60% shared keywords, at least 3 words) into one story. */
export function clusterStories<S extends TopicStory>(items: readonly S[]): Cluster<S>[] {
  const out: (Cluster<S> & { words: string[] })[] = [];
  const seen = new Set<string>();
  for (const s of [...items].sort((a, b) => timeOf(b) - timeOf(a))) {
    if (!s.link || seen.has(s.link)) continue;
    seen.add(s.link);
    const words = titleWords(s.title);
    const hit = out.find((c) => {
      const shared = words.filter((w) => c.words.includes(w)).length;
      return shared >= 3 && overlap(words, c.words) >= 0.6;
    });
    if (hit) {
      hit.items.push(s);
      const src = srcOf(s);
      if (src && !hit.sources.includes(src)) hit.sources.push(src);
      // The longest write-up leads (more depth), ties keep the newest.
      if ((s.desc?.length ?? 0) > (hit.lead.desc?.length ?? 0) + 80) hit.lead = s;
      continue;
    }
    out.push({ id: s.link, lead: s, items: [s], sources: srcOf(s) ? [srcOf(s)] : [], newest: timeOf(s), words });
  }
  return out.map(({ words: _w, ...c }) => c);
}

export type ScoreCtx = {
  topic: string;
  /** Saved (Hub) items, to learn which sources the user keeps. */
  saved: readonly { url: string; src?: string }[];
  lessLike?: readonly string[];
  now?: number;
  stockOf?: StockOf;
};

/** Matched term + field, title hits first across the cluster (Form 185 B9). */
function bestHit(c: Cluster, topic: string, stockOf?: StockOf) {
  const hits = c.items.map((s) => matchTopic(s, topic, stockOf)).filter((h) => h !== null);
  return hits.find((h) => h.field === "title") ?? hits[0] ?? null;
}

/**
 * Value score + every reason, in the order the why-this popover lists them.
 * Form 185 Rev 1: "min read" and its boost are gone (B10: feed descriptions are cut to 180 chars);
 * "In the last 24 h" replaces "New today" and only shows when nothing matched (B11).
 */
export function scorePick(c: Cluster, ctx: ScoreCtx): { score: number; reasons: string[]; hit: { term: string; field: "title" | "summary" } | null } {
  const reasons: string[] = [];
  let score = 0;
  const now = ctx.now ?? Date.now();
  const hit = ctx.topic.trim() ? bestHit(c, ctx.topic, ctx.stockOf) : null;
  if (hit) {
    score += hit.field === "title" ? 3 : 1.5;
    reasons.push(`Matches “${hit.term.toLowerCase()}” in the ${hit.field}`);
  }
  const n = c.sources.length;
  if (n > 1) {
    score += Math.min(4, (n - 1) * 1.25);
    reasons.push(`${n} sources covered it`);
  }
  const keep = new Map<string, number>();
  for (const h of ctx.saved) {
    const k = (h.src?.trim() || hostOf(h.url)).toLowerCase();
    keep.set(k, (keep.get(k) ?? 0) + 1);
  }
  const kept = c.sources.find((s) => (keep.get(s.toLowerCase()) ?? 0) >= 2);
  if (kept) {
    score += 1;
    reasons.push(`You save ${kept} often`);
  }
  const ageH = c.newest ? (now - c.newest) / 3_600_000 : 999;
  score += 2 * Math.exp(-Math.max(0, ageH) / 48);
  if (ageH < 24 && !hit) reasons.push("In the last 24 h");
  const less = ctx.lessLike ?? [];
  if (less.length) {
    const words = titleWords(c.lead.title);
    if (words.filter((w) => less.includes(w)).length >= 2) score -= 3;
  }
  return { score: Math.round(score * 100) / 100, reasons, hit };
}

export type TopicPick<S extends TopicStory = TopicStory> = Cluster<S> & { score: number; reasons: string[]; hit: { term: string; field: "title" | "summary" } | null };

/** Form 185 R1.2: the one "Why: …" line under a pick. */
export function whyLine(p: Pick<TopicPick, "hit" | "sources" | "reasons">) {
  const n = p.sources.length;
  if (p.hit) return `Why: matches “${p.hit.term.toLowerCase()}” in the ${p.hit.field}${n > 1 ? ` · ${n} sources` : ""}`;
  return p.reasons[0] ? `Why: ${p.reasons[0]}` : "Why this story";
}

/**
 * Form 185 R1.1 B6 / Form 194 G1: "Try a shorter word" candidates — every single word of the topic
 * (longest first, ≥3 letters), never the topic itself. suggestFor() filters and caps them.
 */
export function shorterWords(topic: string): string[] {
  const terms = topicTerms(topic);
  const words = [...new Set(terms.flatMap((t) => t.split(" ")).map((w) => w.replace(/[^\p{L}\p{N}-]/gu, "")).filter((w) => w.length >= 3))];
  const self = new Set(terms.map((t) => t.toLowerCase()));
  return words.filter((w) => !self.has(w.toLowerCase())).sort((a, b) => b.length - a.length);
}

/**
 * Form 194 G1: shorter-word suggestions that would actually return picks over the same pool:
 * ≥1 pick, most picks first, then the longer word, then A–Z; at most 2. Empty → hide the row.
 */
export function suggestFor<S extends TopicStory>(
  topic: string,
  items: readonly S[],
  prefs: Pick<FeedPrefs, "hidden" | "muted" | "dismissed" | "hub" | "lessLike">,
  opts: { now?: number; stockOf?: StockOf; hideDismissed?: boolean } = {},
): { term: string; n: number }[] {
  return shorterWords(topic)
    .map((term) => ({ term, n: picksFor(term, items, prefs, opts).picks.length }))
    .filter((x) => x.n >= 1)
    .sort((a, b) => b.n - a.n || b.term.length - a.term.length || a.term.localeCompare(b.term))
    .slice(0, 2);
}

export const PICK_WINDOW_DAYS = 7;

/** A topic's picks this week, best first, minus dismissed and hidden stories. */
export function picksFor<S extends TopicStory>(topic: string, items: readonly S[], prefs: Pick<FeedPrefs, "hidden" | "muted" | "dismissed" | "hub" | "lessLike">, opts: { now?: number; stockOf?: StockOf; hideDismissed?: boolean } = {}) {
  const now = opts.now ?? Date.now();
  // Scout 186 §4 / Form B7: a blank topic has no picks (it used to mean "everything").
  if (!topicTerms(topic).length) return { picks: [] as TopicPick<S>[], stories: 0, pool: 0 };
  const cut = now - PICK_WINDOW_DAYS * 86_400_000;
  const hidden = new Set(prefs.hidden);
  const muted = new Set(prefs.muted.map((m) => m.toLowerCase()));
  const week = items.filter((s) => {
    const at = timeOf(s);
    return (!at || at >= cut) && !hidden.has(s.link) && !muted.has((s.src ?? "").toLowerCase());
  });
  const about = week.filter((s) => matchTopic(s, topic, opts.stockOf) !== null);
  // Options › "Hide stories I dismissed" (default on). Off: dismissed picks rank as normal.
  const gone = new Set(opts.hideDismissed === false ? [] : pruneDismissed(prefs.dismissed, now).map((d) => d.id));
  const picks: TopicPick<S>[] = clusterStories(about)
    .filter((c) => !gone.has(c.id) && !c.items.some((s) => gone.has(s.link)))
    .map((c) => ({ ...c, ...scorePick(c, { topic, saved: prefs.hub, lessLike: prefs.lessLike, now, stockOf: opts.stockOf }) }))
    .sort((a, b) => b.score - a.score || b.newest - a.newest);
  return { picks, stories: about.length, pool: week.length };
}

/** Dismiss (with Undo) and "Less like this". */
export function withDismissed(p: FeedPrefs, c: Cluster, now = Date.now()): FeedPrefs {
  const entry: DismissedPick = { id: c.id, at: new Date(now).toISOString(), title: c.lead.title, link: c.lead.link };
  return { ...p, dismissed: [entry, ...pruneDismissed(p.dismissed, now).filter((d) => d.id !== c.id)] };
}

export function withoutDismissed(p: FeedPrefs, id: string): FeedPrefs {
  return { ...p, dismissed: p.dismissed.filter((d) => d.id !== id) };
}

export function withLessLike(p: FeedPrefs, title: string): FeedPrefs {
  const words = titleWords(title).slice(0, 4);
  return { ...p, lessLike: [...new Set([...words, ...p.lessLike])].slice(0, 60) };
}

export { DISMISS_DAYS };
