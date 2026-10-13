/**
 * Topic Finder (Card 161 §3, direction A). Feed is a stream by source; Topic Finder groups
 * the same Feed items into stories covered by several sources and ranks them by value, and
 * every pick says why. Pure helpers; topics are the user's Feed interests.
 */
import { DISMISS_DAYS, hostOf, matchesInterest, pruneDismissed, type DismissedPick, type FeedPrefs, type StockOf } from "./feed.ts";

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

/** Minutes to read the lead's write-up at 200 wpm (feed descriptions only). */
export function readMinutes(s: TopicStory) {
  const words = (s.desc ?? "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Value score + every reason, in the order the why-this popover lists them. */
export function scorePick(c: Cluster, ctx: ScoreCtx): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const now = ctx.now ?? Date.now();
  const t = ctx.topic.trim();
  if (t) {
    const inTitle = matchesInterest({ ...c.lead, desc: "" }, t, ctx.stockOf);
    if (inTitle || c.items.some((s) => matchesInterest(s, t, ctx.stockOf))) {
      score += inTitle ? 3 : 1.5;
      reasons.push(`Matches ${t}${inTitle ? "" : " in the summary"}`);
    }
  }
  const n = c.sources.length;
  if (n > 1) {
    score += Math.min(4, (n - 1) * 1.25);
    reasons.push(`${n} sources covered it`);
  }
  const mins = readMinutes(c.lead);
  if (mins >= 2) {
    score += Math.min(1.5, mins * 0.3);
    reasons.push(`${mins} min read`);
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
  if (ageH < 24) reasons.push("New today");
  const less = ctx.lessLike ?? [];
  if (less.length) {
    const words = titleWords(c.lead.title);
    if (words.filter((w) => less.includes(w)).length >= 2) score -= 3;
  }
  return { score: Math.round(score * 100) / 100, reasons };
}

export type TopicPick<S extends TopicStory = TopicStory> = Cluster<S> & { score: number; reasons: string[] };

export const PICK_WINDOW_DAYS = 7;

/** A topic's picks this week, best first, minus dismissed and hidden stories. */
export function picksFor<S extends TopicStory>(topic: string, items: readonly S[], prefs: Pick<FeedPrefs, "hidden" | "muted" | "dismissed" | "hub" | "lessLike">, opts: { now?: number; stockOf?: StockOf } = {}) {
  const now = opts.now ?? Date.now();
  const cut = now - PICK_WINDOW_DAYS * 86_400_000;
  const hidden = new Set(prefs.hidden);
  const muted = new Set(prefs.muted.map((m) => m.toLowerCase()));
  const week = items.filter((s) => {
    const at = timeOf(s);
    return (!at || at >= cut) && !hidden.has(s.link) && !muted.has((s.src ?? "").toLowerCase());
  });
  const about = week.filter((s) => matchesInterest(s, topic, opts.stockOf));
  const gone = new Set(pruneDismissed(prefs.dismissed, now).map((d) => d.id));
  const picks: TopicPick<S>[] = clusterStories(about)
    .filter((c) => !gone.has(c.id) && !c.items.some((s) => gone.has(s.link)))
    .map((c) => ({ ...c, ...scorePick(c, { topic, saved: prefs.hub, lessLike: prefs.lessLike, now, stockOf: opts.stockOf }) }))
    .sort((a, b) => b.score - a.score || b.newest - a.newest);
  return { picks, stories: about.length };
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
