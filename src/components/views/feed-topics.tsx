"use client";

/**
 * Card 188 (Form 185 A + Rev 1): Topics, Saved and Options panes inside Feed (formerly a separate view).
 * One data model: topics = feedPrefs.interests, Saved = the Hub, dismissed / less-like = feedPrefs.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Info, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionsSwitchRow } from "@/components/ui/options-switch-row";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { Switch } from "@/components/ui/switch";
import { Hub, HubAddDialog, InterestDialog } from "@/components/views/feed-panels";
import { unfollowWithUndo } from "@/components/views/unfollow-undo";
import { HUB_TOPIC_OTHER, cleanInterest, hubTopics, interestStock, interestSuggestions, moveInterest, renameInterest, withHub, withInterest, withoutHub, withoutInterest, type FeedPrefs, type StockRef } from "@/lib/feed";
import { picksFor, suggestFor, whyLine, withDismissed, withLessLike, withoutDismissed, type TopicPick } from "@/lib/topic-finder";
import { useAtrium } from "@/lib/store";
import { uid } from "@/lib/format";
import { WATCH_CATALOG, type NewsItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Chip } from "./finance-chip";

/** Options › "Show helper text" (Form 185: off by default). */
const HELP = {
  other: "Saved items that don't match a followed topic.",
  reorder: "Use ⋯ or Alt+↑/↓ to reorder.",
  dismissed: "Kept for 30 days.",
} as const;

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

function PickRow({ pick, lead, saved, why, onSave, onDismiss }: { pick: TopicPick; lead?: boolean; saved: boolean; why: boolean; onSave: () => void; onDismiss: () => void }) {
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
        {why ? <WhyThis pick={pick} /> : null}
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
  const result = useMemo(() => (topic ? picksFor(topic, items, prefs, { stockOf, hideDismissed: prefs.hideDismissed }) : { picks: [], stories: 0, pool: 0 }), [topic, items, prefs, stockOf]);
  const savedUrls = new Set(prefs.hub.map((h) => h.url));
  const suggestions = useMemo(() => interestSuggestions(items, prefs.interests), [items, prefs.interests]);
  // Form 194 G1: only words that would return picks, over the same uncapped pool, ≤2.
  const shorter = useMemo(() => (topic && result.picks.length === 0 ? suggestFor(topic, items, prefs, { stockOf, hideDismissed: prefs.hideDismissed }) : []), [topic, result.picks.length, items, prefs, stockOf]);

  function save(p: TopicPick) {
    const url = p.lead.link;
    const hit = prefs.hub.find((h) => h.url === url);
    if (hit) {
      updateFeed((f) => withoutHub(f, hit.id));
      toast("Removed from Saved");
      return;
    }
    const id = uid();
    updateFeed((f) => withHub(f, { id, url, title: p.lead.title, src: p.lead.src, at: new Date().toISOString(), topic: topic ?? undefined, stockOf }));
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
              {shorter.map(({ term: w, n: k }) => (
                <Chip key={w} active={false} ariaLabel={`Follow ${w} instead, ${k} ${k === 1 ? "pick" : "picks"}`} onClick={() => (updateFeed((f) => replaceTopic(f, topic, w)), setSel(w))}>
                  {w} · <span className="tabular-nums">{k}</span>
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <PickRow lead pick={result.picks[0]!} saved={savedUrls.has(result.picks[0]!.lead.link)} why={prefs.showWhy} onSave={() => save(result.picks[0]!)} onDismiss={() => dismiss(result.picks[0]!)} />
          <div className="mt-2">
            {result.picks.slice(1).map((p) => (
              <PickRow key={p.id} pick={p} saved={savedUrls.has(p.lead.link)} why={prefs.showWhy} onSave={() => save(p)} onDismiss={() => dismiss(p)} />
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

/** Feed › Saved: topic filter chips (Form 185 B4) + the Hub with Export (.md / PDF) of what is shown. */
export function FeedSaved() {
  const { prefs, updateFeed } = useAtrium(useShallow((s) => ({ prefs: s.feedPrefs, updateFeed: s.updateFeed })));
  const [add, setAdd] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const topics = useMemo(() => hubTopics(prefs), [prefs]);
  const active = pick && topics.includes(pick) ? pick : null;
  const shown = active ? prefs.hub.filter((h) => (h.topic ?? HUB_TOPIC_OTHER) === active) : prefs.hub;
  return (
    <div className="max-w-3xl">
      {prefs.showHelper && active === HUB_TOPIC_OTHER ? <p className="mb-3 text-sm text-muted-foreground">{HELP.other}</p> : null}
      {topics.some((t) => t !== HUB_TOPIC_OTHER) ? (
        <div className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1" role="group" aria-label="Filter saved by topic">
          <Chip active={!active} onClick={() => setPick(null)} className="shrink-0">
            All
          </Chip>
          {topics.map((t) => (
            <Chip key={t} active={active === t} onClick={() => setPick(t)} className="shrink-0">
              {t}
            </Chip>
          ))}
        </div>
      ) : null}
      <Hub prefs={prefs} items={shown} update={updateFeed} onAdd={() => setAdd(true)} layout="rail" title={active ? `Saved · ${active}` : "Saved"} />
      <HubAddDialog open={add} setOpen={setAdd} update={updateFeed} />
    </div>
  );
}

/** One followed topic in Options: ⋯ (move) · name / inline Edit · Edit · Unfollow. Alt+↑/↓ moves it. */
function TopicRow({ label, index, count, onMove, onRename, onUnfollow }: { label: string; index: number; count: number; onMove: (delta: number) => void; onRename: (to: string) => boolean; onUnfollow: () => void }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(label);
  const first = index === 0;
  const last = index === count - 1;
  const items = [
    ...(first ? [] : [{ label: "Move to top", onSelect: () => onMove(-index) }, { label: "Move up", onSelect: () => onMove(-1) }]),
    ...(last ? [] : [{ label: "Move down", onSelect: () => onMove(1) }, { label: "Move to bottom", onSelect: () => onMove(count - 1 - index) }]),
  ];
  return (
    <li
      className="flex min-h-11 items-center gap-2 border-b border-border"
      onKeyDown={(e) => {
        if (edit || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();
        onMove(e.key === "ArrowUp" ? -1 : 1);
      }}
    >
      {count > 1 ? <OverflowMenu label={`Move ${label} (${index + 1} of ${count})`} items={items} menuClassName="w-44" /> : null}
      {edit ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (onRename(draft)) setEdit(false);
          }}
        >
          <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Edit ${label}`} className="h-11 min-w-0 flex-1" onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setDraft(label), setEdit(false))} />
          <Button type="submit" variant="outline" className="min-h-11" disabled={!cleanInterest(draft)}>
            Save
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={() => (setDraft(label), setEdit(false))}>
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
          <Button variant="ghost" className="min-h-11" aria-label={`Edit ${label}`} onClick={() => (setDraft(label), setEdit(true))}>
            Edit
          </Button>
          <Button variant="ghost" size="icon" className="size-11" aria-label={`Unfollow ${label}`} onClick={onUnfollow}>
            <X className="size-4" aria-hidden />
          </Button>
        </>
      )}
    </li>
  );
}

/** Feed › Options (Finance pattern): Sources · Followed topics · Picks. */
export function FeedOptions({ sourcesOn, onSources }: { sourcesOn: number; onSources: () => void }) {
  const { prefs, updateFeed } = useAtrium(useShallow((s) => ({ prefs: s.feedPrefs, updateFeed: s.updateFeed })));
  const [review, setReview] = useState(false);
  const [manage, setManage] = useState(false);
  const [follow, setFollow] = useState("");
  const [said, setSaid] = useState("");
  const list = useRef<HTMLUListElement | null>(null);
  const help = prefs.showHelper;

  function move(label: string, delta: number) {
    const from = prefs.interests.indexOf(label);
    const to = Math.max(0, Math.min(prefs.interests.length - 1, from + delta));
    if (from < 0 || to === from) return;
    updateFeed((p) => moveInterest(p, label, delta));
    setSaid(`${label} moved to ${to + 1} of ${prefs.interests.length}`);
    // Keep focus on the moved row's ⋯ so Alt+↑/↓ can repeat.
    requestAnimationFrame(() => list.current?.querySelectorAll<HTMLElement>("li")[to]?.querySelector<HTMLElement>("button")?.focus());
  }
  function rename(from: string, raw: string) {
    const to = cleanInterest(raw);
    if (!to) return false;
    if (to.toLowerCase() !== from.toLowerCase() && prefs.interests.some((i) => i.toLowerCase() === to.toLowerCase())) {
      toast(`Already following ${to}`);
      return false;
    }
    updateFeed((p) => renameInterest(p, from, to));
    return true;
  }
  const followOk = cleanInterest(follow) && !prefs.interests.some((i) => i.toLowerCase() === cleanInterest(follow).toLowerCase());

  return (
    <div className="grid max-w-5xl items-start gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
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
          {help ? <p className="text-sm text-muted-foreground">{HELP.reorder}</p> : null}
          <p className="sr-only" aria-live="polite">
            {said}
          </p>
          {prefs.interests.length ? (
            <ul ref={list} aria-label="Followed topics, in order">
              {prefs.interests.map((i, n) => (
                <TopicRow key={i} label={i} index={n} count={prefs.interests.length} onMove={(d) => move(i, d)} onRename={(to) => rename(i, to)} onUnfollow={() => unfollowWithUndo({ update: updateFeed, label: i, index: n, list: list.current, fallback: () => document.getElementById("feed-follow-input"), announce: setSaid })} />
              ))}
            </ul>
          ) : null}
          <form
            className="flex items-center gap-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!followOk) return;
              updateFeed((p) => withInterest(p, follow));
              setFollow("");
            }}
          >
            <Input id="feed-follow-input" value={follow} onChange={(e) => setFollow(e.target.value)} placeholder="Topic or phrase, e.g. heat pumps" aria-label="Follow a topic" className="h-11 min-w-0 flex-1" />
            <Button type="submit" variant="outline" className="min-h-11" disabled={!followOk}>
              <Plus className="size-4" aria-hidden />
              Follow
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Picks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <OptionsSwitchRow title="Show why lines" hint={null} className="border-b border-border">
            <Switch checked={prefs.showWhy} onCheckedChange={(v) => updateFeed((p) => ({ ...p, showWhy: v }))} aria-label="Show why lines" />
          </OptionsSwitchRow>
          <OptionsSwitchRow title="Hide stories I dismissed" hint={null} className="border-b border-border">
            <Switch checked={prefs.hideDismissed} onCheckedChange={(v) => updateFeed((p) => ({ ...p, hideDismissed: v }))} aria-label="Hide stories I dismissed" />
          </OptionsSwitchRow>
          <OptionsSwitchRow title="Show helper text" hint={null} className="border-b border-border">
            <Switch checked={prefs.showHelper} onCheckedChange={(v) => updateFeed((p) => ({ ...p, showHelper: v }))} aria-label="Show helper text" />
          </OptionsSwitchRow>
          <div className="flex min-h-11 items-center gap-2 border-b border-border py-1">
            <p className="min-w-0 flex-1 text-sm">Less like this · {prefs.lessLike.length}</p>
            <Button variant="outline" className="min-h-11" aria-expanded={manage} disabled={!prefs.lessLike.length} onClick={() => setManage((v) => !v)}>
              Manage
            </Button>
          </div>
          {manage && prefs.lessLike.length ? (
            <section aria-label="Less like this">
              <ul className="flex flex-wrap gap-2 py-2">
                {prefs.lessLike.map((w) => (
                  <li key={w}>
                    <Chip active={false} onClick={() => updateFeed((p) => ({ ...p, lessLike: p.lessLike.filter((x) => x !== w) }))}>
                      <span className="sr-only">Remove </span>
                      {w}
                      <X className="size-3.5" aria-hidden />
                    </Chip>
                  </li>
                ))}
              </ul>
              <Button variant="ghost" className="min-h-11" onClick={() => (updateFeed((p) => ({ ...p, lessLike: [] })), setManage(false), toast("Less like this cleared"))}>
                Clear all
              </Button>
            </section>
          ) : null}
          <div className="flex min-h-11 items-center gap-2 py-1">
            <p className="min-w-0 flex-1 text-sm">Dismissed · {prefs.dismissed.length}</p>
            <Button variant="outline" className="min-h-11" aria-expanded={review} disabled={!prefs.dismissed.length} onClick={() => setReview((v) => !v)}>
              Review
            </Button>
          </div>
          {help ? <p className="text-xs text-muted-foreground">{HELP.dismissed}</p> : null}
          {review ? (
            <section aria-label="Dismissed">
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
    </div>
  );
}
