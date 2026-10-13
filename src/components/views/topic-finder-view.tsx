"use client";

import { useCallback, useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, Info, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Hub, HubAddDialog, InterestDialog } from "@/components/views/feed-panels";
import { interestStock, interestSuggestions, withHub, withoutHub, type StockRef } from "@/lib/feed";
import { picksFor, readMinutes, withDismissed, withLessLike, withoutDismissed, type TopicPick } from "@/lib/topic-finder";
import { useAtrium } from "@/lib/store";
import { uid } from "@/lib/format";
import { WATCH_CATALOG, type NewsItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const EYEBROW = "text-xs uppercase tracking-[0.08em] text-muted-foreground";
const SAVED = "__saved";
const DISMISSED = "__dismissed";

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
        <span className="truncate">{pick.reasons[0] ?? "Why this story"}</span>
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
          {lead ? ` · ${readMinutes(s)} min` : ""}
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

/** Card 161 §3 A: Topic Finder replaces Resource Hub. Topics = Feed interests; Saved = the Hub. */
export function TopicFinderView({ items }: { items: NewsItem[] }) {
  const { prefs, updateFeed, watch } = useAtrium(useShallow((s) => ({ prefs: s.feedPrefs, updateFeed: s.updateFeed, watch: s.watch })));
  const [sel, setSel] = useState<string>(() => prefs.interests[0] ?? SAVED);
  const [follow, setFollow] = useState(false);
  const [add, setAdd] = useState(false);
  const catalog = useMemo<StockRef[]>(() => [...watch, ...WATCH_CATALOG], [watch]);
  const stockOf = useCallback((i: string) => interestStock(i, catalog), [catalog]);
  const topic = sel === SAVED || sel === DISMISSED ? null : prefs.interests.includes(sel) ? sel : (prefs.interests[0] ?? null);
  const current = topic ?? (sel === DISMISSED ? DISMISSED : SAVED);
  const result = useMemo(() => (topic ? picksFor(topic, items, prefs, { stockOf }) : { picks: [], stories: 0 }), [topic, items, prefs, stockOf]);
  const savedUrls = new Set(prefs.hub.map((h) => h.url));
  const suggestions = useMemo(() => interestSuggestions(items, prefs.interests), [items, prefs.interests]);

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

  const entries = [...prefs.interests.map((i) => ({ id: i, label: i })), { id: SAVED, label: `Saved · ${prefs.hub.length}` }, { id: DISMISSED, label: `Dismissed · ${prefs.dismissed.length}` }];

  const body =
    current === SAVED ? (
      <Hub prefs={prefs} update={updateFeed} onAdd={() => setAdd(true)} layout="rail" title="Saved" />
    ) : current === DISMISSED ? (
      <section aria-label="Dismissed">
        <h3 className={EYEBROW}>Dismissed</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Kept for 30 days.</p>
        <ul className="mt-2">
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
    ) : (
      <section aria-labelledby="tf-head">
        <h3 id="tf-head" className="font-display text-xl font-medium tracking-tight">{topic}</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          {result.picks.length} pick{result.picks.length === 1 ? "" : "s"} from {result.stories} stor{result.stories === 1 ? "y" : "ies"} this week · best first
        </p>
        {result.picks[0] ? <PickRow lead pick={result.picks[0]} saved={savedUrls.has(result.picks[0].lead.link)} onSave={() => save(result.picks[0]!)} onDismiss={() => dismiss(result.picks[0]!)} /> : null}
        <div className="mt-2">
          {result.picks.slice(1).map((p) => (
            <PickRow key={p.id} pick={p} saved={savedUrls.has(p.lead.link)} onSave={() => save(p)} onDismiss={() => dismiss(p)} />
          ))}
        </div>
      </section>
    );

  return (
    <div>
      <h2 className="mb-4 font-display text-2xl font-medium tracking-tight">Topic Finder</h2>
      {/* Phone: chips; desktop: rail. */}
      <div className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1 md:hidden" role="tablist" aria-label="Topics">
        {entries.map((e) => (
          <button key={e.id} type="button" role="tab" aria-selected={current === e.id} className={cn("min-h-11 shrink-0 rounded-full px-3.5 text-sm", current === e.id ? "bg-foreground text-background" : "bg-muted text-foreground", FOCUS)} onClick={() => setSel(e.id)}>
            {e.label}
          </button>
        ))}
        <button type="button" className={cn("inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border px-3.5 text-sm", FOCUS)} onClick={() => setFollow(true)}>
          <Plus className="size-4" aria-hidden />
          Follow a topic
        </button>
      </div>
      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Topics" className="hidden md:block">
          <p className={EYEBROW}>Following</p>
          <ul className="mt-2 space-y-0.5">
            {prefs.interests.map((i) => (
              <li key={i}>
                <button type="button" aria-current={current === i ? "page" : undefined} className={cn("flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm", current === i ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground", FOCUS)} onClick={() => setSel(i)}>
                  <span className="truncate">{i}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className={cn("mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground", FOCUS)} onClick={() => setFollow(true)}>
            <Plus className="size-4" aria-hidden />
            Follow a topic
          </button>
          <div className="mt-4 border-t border-border pt-3">
            {[entries[entries.length - 2]!, entries[entries.length - 1]!].map((e) => (
              <button key={e.id} type="button" aria-current={current === e.id ? "page" : undefined} className={cn("flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm", current === e.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground", FOCUS)} onClick={() => setSel(e.id)}>
                {e.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="min-w-0">{body}</div>
      </div>
      <InterestDialog open={follow} setOpen={setFollow} prefs={prefs} update={updateFeed} suggestions={suggestions} />
      <HubAddDialog open={add} setOpen={setAdd} update={updateFeed} />
    </div>
  );
}
