"use client";

/**
 * Card 188 (Form 185 A + Rev 1): Topics, Saved and Options panes inside Feed (formerly a separate view).
 * One data model: topics = feedPrefs.interests, Saved = the Hub, dismissed / less-like = feedPrefs.
 */
import { useCallback, useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, Info, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Hub, HubAddDialog, InterestDialog } from "@/components/views/feed-panels";
import { interestStock, interestSuggestions, withHub, withoutHub, withoutInterest, type FeedPrefs, type StockRef } from "@/lib/feed";
import { picksFor, shorterWords, whyLine, withDismissed, withLessLike, withoutDismissed, type TopicPick } from "@/lib/topic-finder";
import { useAtrium } from "@/lib/store";
import { uid } from "@/lib/format";
import { WATCH_CATALOG, type NewsItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Chip } from "./finance-chip";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const EYEBROW = "text-xs uppercase tracking-[0.08em] text-muted-foreground";

function ago(iso?: string) {
  const t = Date.parse(iso ?? "");
  if (!t) return "";
  const h = Math.max(0, Math.round((Date.now() - t) / 3_600_000));
  return h < 1 ? "now" : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function sourceLine(p: TopicPick) {
  return p.sources.length > 1 ? `${p.sources[0]} + ${p.sources.length - 1} more` : (p.sources[0] ?? "");
}

function WhyThis({ pick }: { pick: TopicPick }) {
  const [open, setOpen] = useState(false);
  const id = `why-${pick.id}`;
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} aria-controls={id} className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-sm text-xs text-muted-foreground hover:text-foreground", FOCUS)} onClick={() => setOpen((v) => !v)}>
        <Info className="size-3.5" aria-hidden />
        <span className="truncate">{whyLine(pick)}</span>
      </button>
      {open ? (
        <div id={id} role="dialog" aria-label="Why this story" className="absolute left-0 top-11 z-30 w-72 rounded-md bg-card p-3 text-sm text-card-foreground shadow-[var(--shadow-float)]" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <p className="mb-1 text-xs font-semibold">Why this story</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            {pick.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PickRow({ pick, lead, saved, onSave, onDismiss }: { pick: TopicPick; lead?: boolean; saved: boolean; onSave: () => void; onDismiss: () => void }) {
  const s = pick.lead;
  return (
    <article className={cn("flex gap-2", lead ? "rounded-xl bg-card p-5 shadow-[var(--shadow-border)]" : "border-b border-border py-3")}>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          {sourceLine(pick)}
          {s.date ? ` · ${ago(s.date)}` : ""}
        </p>
        <a href={s.link} target="_blank" rel="noopener noreferrer" className={cn("mt-0.5 block rounded-sm hover:underline", lead ? "font-display text-2xl font-medium leading-tight tracking-tight" : "text-[15px] font-medium leading-snug", FOCUS)}>
          {s.title}
        </a>
        {lead && s.desc ? <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{s.desc}</p> : null}
        <WhyThis pick={pick} />
      </div>
      <div className={cn("flex shrink-0", lead ? "flex-row items-start" : "flex-col items-center sm:flex-row sm:items-start")}>
        <button type="button" aria-pressed={saved} aria-label={saved ? `Saved: ${s.title}` : `Save ${s.title}`} className={cn("inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", saved && "text-foreground", FOCUS)} onClick={onSave}>
          {saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
        </button>
        <button type="button" aria-label={`Dismiss ${s.title}`} className={cn("inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", FOCUS)} onClick={onDismiss}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </article>
  );
}

/** Replace one followed topic in place (Form 185 R1.1 "Try a shorter word"). */
function replaceTopic(p: FeedPrefs, from: string, to: string): FeedPrefs {
  if (p.interests.some((i) => i.toLowerCase() === to.toLowerCase())) return { ...withoutInterest(p, from), interest: to };
  return { ...p, interests: p.interests.map((i) => (i === from ? to : i)), interest: p.interest === from ? to : p.interest };
}

/** Feed › Topics: Following list (desktop) / chips (phone) + one topic's page, ranked over every story fetched. */
export function FeedTopics({ items, sourcesOn, onAddSources }: { items: NewsItem[]; sourcesOn: number; onAddSources: () => void }) {
  const { prefs, updateFeed, watch } = useAtrium(useShallow((s) => ({ prefs: s.feedPrefs, updateFeed: s.updateFeed, watch: s.watch })));
  const [sel, setSel] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  const catalog = useMemo<StockRef[]>(() => [...watch, ...WATCH_CATALOG], [watch]);
  const stockOf = useCallback((i: string) => interestStock(i, catalog), [catalog]);
  const topic = sel && prefs.interests.includes(sel) ? sel : (prefs.interests[0] ?? null);
  const result = useMemo(() => (topic ? picksFor(topic, items, prefs, { stockOf }) : { picks: [], stories: 0, pool: 0 }), [topic, items, prefs, stockOf]);
  const savedUrls = new Set(prefs.hub.map((h) => h.url));
  const suggestions = useMemo(() => interestSuggestions(items, prefs.interests), [items, prefs.interests]);
  const shorter = useMemo(() => (topic ? shorterWords(topic) : []), [topic]);

  function save(p: TopicPick) {
    const url = p.lead.link;
    const hit = prefs.hub.find((h) => h.url === url);
    if (hit) {
      updateFeed((f) => withoutHub(f, hit.id));
      toast("Removed from Saved");
      return;
    }
    const id = uid();
    updateFeed((f) => withHub(f, { id, url, title: p.lead.title, src: p.lead.src, at: new Date().toISOString() }));
    toast("Saved", { action: { label: "Undo", onClick: () => updateFeed((f) => withoutHub(f, id)) } });
  }

  function dismiss(p: TopicPick) {
    updateFeed((f) => withDismissed(f, p));
    toast("Dismissed", {
      action: { label: "Undo", onClick: () => updateFeed((f) => withoutDismissed(f, p.id)) },
      cancel: { label: "Less like this", onClick: () => updateFeed((f) => withLessLike(f, p.lead.title)) },
    });
  }

  const n = result.picks.length;
  const count = `${n} pick${n === 1 ? "" : "s"} from ${result.pool} stor${result.pool === 1 ? "y" : "ies"} this week · best first`;

  const page = !topic ? (
    <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
      <p className="text-sm text-muted-foreground">Follow a topic to see the best stories about it from your sources.</p>
      <Button className="mt-3 min-h-11" onClick={() => setFollow(true)}>
        <Plus className="size-4" aria-hidden />
        Follow a topic
      </Button>
    </section>
  ) : (
    <section aria-labelledby="topic-head">
      <h3 id="topic-head" className="font-display text-xl font-medium tracking-tight">{topic}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{count}</p>
      {n === 0 ? (
        <div role="status" className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
          <p className="font-display text-lg font-medium tracking-tight">No stories on “{topic}” yet</p>
          <p className="mt-1 text-sm text-muted-foreground">None of your {sourcesOn} sources mentioned it this week.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={onAddSources}>
              Add sources
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => setFollow(true)}>
              Edit topic
            </Button>
          </div>
          {shorter.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Try a shorter word:</span>
              {shorter.map((w) => (
                <Chip key={w} active={false} onClick={() => (updateFeed((f) => replaceTopic(f, topic, w)), setSel(w))}>
                  {w}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <PickRow lead pick={result.picks[0]!} saved={savedUrls.has(result.picks[0]!.lead.link)} onSave={() => save(result.picks[0]!)} onDismiss={() => dismiss(result.picks[0]!)} />
          <div className="mt-2">
            {result.picks.slice(1).map((p) => (
              <PickRow key={p.id} pick={p} saved={savedUrls.has(p.lead.link)} onSave={() => save(p)} onDismiss={() => dismiss(p)} />
            ))}
          </div>
        </>
      )}
    </section>
  );

  return (
    <div>
      {/* Phone: topic chips + "+" above the page; desktop: Following list. */}
      <div className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 md:hidden" role="group" aria-label="Topics">
        {prefs.interests.map((i) => (
          <Chip key={i} active={topic === i} onClick={() => setSel(i)} className="shrink-0">
            {i}
          </Chip>
        ))}
        <Chip active={false} onClick={() => setFollow(true)} className="min-w-11 shrink-0 justify-center border-dashed">
          <span aria-hidden>+</span>
          <span className="sr-only">Follow a topic</span>
        </Chip>
      </div>
      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Topics" className="hidden md:block">
          <p className={EYEBROW}>Following</p>
          <ul className="mt-2 space-y-0.5">
            {prefs.interests.map((i) => (
              <li key={i}>
                <button type="button" aria-current={topic === i ? "page" : undefined} className={cn("flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm", topic === i ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground", FOCUS)} onClick={() => setSel(i)}>
                  <span className="truncate">{i}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={cn("mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground", FOCUS)} onClick={() => setFollow(true)}>
            <Plus className="size-4" aria-hidden />
            Follow a topic
          </button>
        </nav>
        <div className="min-w-0">{page}</div>
      </div>
      <InterestDialog open={follow} setOpen={setFollow} prefs={prefs} update={updateFeed} suggestions={suggestions} />
    </div>
  );
}

/** Feed › Saved: the Hub, with Export (.md / PDF). */
export function FeedSaved() {
  const { prefs, updateFeed } = useAtrium(useShallow((s) => ({ prefs: s.feedPrefs, updateFeed: s.updateFeed })));
  const [add, setAdd] = useState(false);
  return (
    <div className="max-w-3xl">
      <Hub prefs={prefs} update={updateFeed} onAdd={() => setAdd(true)} layout="rail" title="Saved" />
      <HubAddDialog open={add} setOpen={setAdd} update={updateFeed} />
    </div>
  );
}

/** Feed › Options (Finance pattern): Sources · Followed topics · Picks. */
export function FeedOptions({ sourcesOn, onSources }: { sourcesOn: number; onSources: () => void }) {
  const { prefs, updateFeed } = useAtrium(useShallow((s) => ({ prefs: s.feedPrefs, updateFeed: s.updateFeed })));
  const [follow, setFollow] = useState(false);
  const [review, setReview] = useState(false);
  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle id="feed-opt-sources" tabIndex={-1}>
            Sources
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{sourcesOn ? `${sourcesOn} on` : "None on"}</p>
          <Button className="min-h-11" onClick={onSources}>
            {sourcesOn ? `Sources · ${sourcesOn}` : "Sources"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Followed topics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {prefs.interests.length ? (
            <ul>
              {prefs.interests.map((i) => (
                <li key={i} className="flex min-h-11 items-center gap-2 border-b border-border">
                  <span className="min-w-0 flex-1 truncate text-sm">{i}</span>
                  <Button variant="ghost" size="icon" className="size-11" aria-label={`Unfollow ${i}`} onClick={() => updateFeed((p) => withoutInterest(p, i))}>
                    <X className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button variant="outline" className="mt-2 min-h-11" onClick={() => setFollow(true)}>
            <Plus className="size-4" aria-hidden />
            Follow a topic
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Picks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex min-h-11 items-center gap-2">
            <p className="min-w-0 flex-1 text-sm">Less like this · {prefs.lessLike.length}</p>
            <Button variant="outline" className="min-h-11" disabled={!prefs.lessLike.length} onClick={() => (updateFeed((p) => ({ ...p, lessLike: [] })), toast("Less like this cleared"))}>
              Clear
            </Button>
          </div>
          <div className="flex min-h-11 items-center gap-2">
            <p className="min-w-0 flex-1 text-sm">Dismissed · {prefs.dismissed.length}</p>
            <Button variant="outline" className="min-h-11" aria-expanded={review} disabled={!prefs.dismissed.length} onClick={() => setReview((v) => !v)}>
              Review
            </Button>
          </div>
          {review ? (
            <section aria-label="Dismissed">
              <p className="text-xs text-muted-foreground">Kept for 30 days.</p>
              <ul className="mt-1">
                {prefs.dismissed.map((d) => (
                  <li key={d.id} className="flex min-h-11 items-center gap-2 border-b border-border py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{d.title ?? d.link ?? d.id}</span>
                    <Button variant="ghost" className="h-11" onClick={() => updateFeed((f) => withoutDismissed(f, d.id))}>
                      Undo
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </CardContent>
      </Card>
      <InterestDialog open={follow} setOpen={setFollow} prefs={prefs} update={updateFeed} suggestions={[]} />
    </div>
  );
}
