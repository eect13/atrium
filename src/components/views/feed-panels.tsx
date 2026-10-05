"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { uid } from "@/lib/format";
import { onExternalAnchorClick } from "@/lib/http";
import { storyAge, storyDesk, tagStory } from "@/lib/headline";
import {
  DIGEST_FREQS,
  digestLabel,
  hostOf,
  toggleHide,
  toggleMute,
  togglePin,
  withHub,
  withInterest,
  withoutHub,
  withoutInterest,
  type DigestFreq,
  type DigestLine,
  type FeedPrefs,
  type FeedSummary,
  type HubItem,
  storyKey,
} from "@/lib/feed";
import type { NewsItem } from "@/lib/types";
import { Chip, FIELD_SELECT } from "./finance-chip";

type Update = (fn: (p: FeedPrefs) => FeedPrefs) => void;

const EYEBROW = "text-xs uppercase tracking-[0.08em] text-muted-foreground";
const CARD = "rounded-xl bg-card text-card-foreground shadow-[var(--shadow-border)]";

export function StoryTag({ tag }: { tag: string }) {
  return <span className={EYEBROW}>{tag}</span>;
}

export function SourceLine({ n, className }: { n: NewsItem; className?: string }) {
  const age = storyAge(n.date);
  const desk = storyDesk(n);
  return (
    <p className={className ?? "mt-2 text-xs text-muted-foreground"}>
      {n.src}
      {desk ? ` · ${desk}` : ""}
      {age ? ` · ${age}` : ""}
    </p>
  );
}

function partOfDay(time: string) {
  const h = Number(time.slice(0, 2));
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

/** B · digest hero — first block of the main column. */
export function DigestHero({
  lines,
  prefs,
  loading,
  onSettings,
}: {
  lines: DigestLine<NewsItem>[];
  prefs: FeedPrefs;
  loading: boolean;
  onSettings: () => void;
}) {
  const steer = prefs.interests.length
    ? "Lines drawn from interests you defined."
    : "Top lines from the sources you turned on. Add an interest to steer the digest.";
  return (
    <section aria-labelledby="feed-digest" className={`${CARD} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <p className={EYEBROW}>Daily digest</p>
        <button
          type="button"
          onClick={onSettings}
          className="min-h-9 shrink-0 rounded-full bg-muted px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Digest settings, ${digestLabel(prefs)}`}
        >
          {digestLabel(prefs)}
        </button>
      </div>
      <h3 id="feed-digest" className="font-display mt-1 text-2xl font-medium tracking-tight md:text-3xl">
        {prefs.digestOn ? `Your ${partOfDay(prefs.digestTime)} brief` : "Digest is off"}
      </h3>
      {prefs.digestOn ? (
        <>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">{steer}</p>
          {lines.length ? (
            <ol className="mt-4 divide-y divide-border">
              {lines.map((l, i) => (
                <li key={storyKey(l.story, i)} className="py-3 first:pt-0 last:pb-0">
                  <a href={l.story.link} target="_blank" rel="noopener noreferrer" onClick={onExternalAnchorClick} className="block">
                    <span className="text-sm font-medium leading-snug">
                      {i + 1}. {l.story.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {l.label} · {l.story.src}
                      {storyAge(l.story.date) ? ` · ${storyAge(l.story.date)}` : ""}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{loading ? "Gathering lines…" : "Empty until sources are on."}</p>
          )}
        </>
      ) : (
        <Button className="mt-3" variant="outline" onClick={onSettings}>
          Digest settings
        </Button>
      )}
    </section>
  );
}

/** B · summary block — counted from what is in view. */
export function SummaryBlock({
  summary,
  interest,
  sourcesOn,
  stock,
}: {
  summary: FeedSummary;
  interest: string;
  sourcesOn: number;
  /** Ticker label when the interest resolved to a stock — stories are scoped to it. */
  stock?: string;
}) {
  return (
    <section aria-labelledby="feed-summary" className="rounded-xl bg-muted p-4">
      <p id="feed-summary" className={EYEBROW}>
        Summary{interest !== "All" ? ` · ${interest}` : ""}
        {stock ? ` · only stories about ${stock}` : ""}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed">{summary.line}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Updated from {sourcesOn} {sourcesOn === 1 ? "source" : "sources"} you enabled
        {summary.newest && storyAge(summary.newest) ? ` · newest ${storyAge(summary.newest)}` : ""}
      </p>
    </section>
  );
}

function HubCard({ item, onRemove, compact }: { item: HubItem; onRemove: () => void; compact?: boolean }) {
  return (
    <article className={`${CARD} group relative p-3 ${compact ? "w-44 shrink-0" : ""}`}>
      <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={onExternalAnchorClick} className="block">
        <div className={`flex items-center justify-center rounded-lg bg-muted ${compact ? "h-24" : "aspect-video"}`}>
          <span className={EYEBROW}>{item.kind}</span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.src || hostOf(item.url)}</p>
      </a>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.title} from hub`}
        className="absolute right-1.5 top-1.5 inline-flex size-9 items-center justify-center rounded-md bg-card/80 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" />
      </button>
    </article>
  );
}

/** B · resource hub. `rail` = desktop 320px column; `strip` = phone horizontal scroller. */
export function Hub({ prefs, update, onAdd, layout }: { prefs: FeedPrefs; update: Update; onAdd: () => void; layout: "rail" | "strip" }) {
  const head = (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className={EYEBROW}>Resource hub</h3>
      <Button variant="ghost" size="sm" className="min-h-11" onClick={onAdd}>
        Add
      </Button>
    </div>
  );
  const remove = (h: HubItem) => {
    update((p) => withoutHub(p, h.id));
    toast(`Removed ${h.title}`);
  };
  if (!prefs.hub.length) {
    return (
      <section aria-label="Resource hub">
        {head}
        <div className={`${CARD} p-4 text-sm text-muted-foreground`}>
          Save links, videos, or docs here. Add one, or save a story from Curate.
        </div>
      </section>
    );
  }
  return (
    <section aria-label="Resource hub">
      {head}
      {layout === "rail" ? (
        <div className="space-y-3">
          {prefs.hub.map((h) => (
            <HubCard key={h.id} item={h} onRemove={() => remove(h)} />
          ))}
        </div>
      ) : (
        <div className="scroll-auto -mx-3 flex gap-3 overflow-x-auto px-3 pb-1">
          {prefs.hub.map((h) => (
            <HubCard key={h.id} item={h} compact onRemove={() => remove(h)} />
          ))}
        </div>
      )}
    </section>
  );
}

export function HubAddDialog({ open, setOpen, update }: { open: boolean; setOpen: (v: boolean) => void; update: Update }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const ok = /^https?:\/\/\S+\.\S+/i.test(url.trim());
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to hub</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ok) return;
            update((p) => withHub(p, { id: uid(), url: url.trim(), title, at: new Date().toISOString() }));
            toast("Saved to hub");
            setUrl("");
            setTitle("");
            setOpen(false);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="hub-url">Link, video, or doc URL</Label>
            <Input id="hub-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-11" autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hub-title">Title (optional)</Label>
            <Input id="hub-title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-11" autoComplete="off" />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={!ok}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InterestDialog({
  open,
  setOpen,
  prefs,
  update,
  suggestions,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  prefs: FeedPrefs;
  update: Update;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");
  const add = (label: string) => {
    update((p) => withInterest(p, label));
    setDraft("");
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Interests</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Your own sub-tabs. A word or phrase matches titles, sources, and tags — separate alternatives with commas.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add(draft);
            }}
          >
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Interest name" className="h-11" aria-label="Interest name" autoComplete="off" />
            <Button type="submit" className="h-11" disabled={!draft.trim()}>
              Add
            </Button>
          </form>
          {suggestions.length ? (
            <div>
              <p className={`${EYEBROW} mb-2`}>From your stories</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <Chip key={s} active={false} onClick={() => add(s)}>
                    + {s}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <p className={`${EYEBROW} mb-2`}>Yours</p>
            {prefs.interests.length ? (
              <ul className="space-y-1">
                {prefs.interests.map((i) => (
                  <li key={i} className="flex min-h-11 items-center justify-between gap-2">
                    <span className="truncate text-sm">{i}</span>
                    <Button variant="ghost" size="sm" className="min-h-11" onClick={() => update((p) => withoutInterest(p, i))}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None yet — All shows every story.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DigestDialog({ open, setOpen, prefs, update }: { open: boolean; setOpen: (v: boolean) => void; prefs: FeedPrefs; update: Update }) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Digest</DialogTitle>
        </DialogHeader>
        <DigestFields prefs={prefs} update={update} />
      </DialogContent>
    </Dialog>
  );
}

/** Shared by the Feed Digest hook and the Options › Feed card. */
export function DigestFields({ prefs, update }: { prefs: FeedPrefs; update: Update }) {
  return (
    <div className="space-y-3">
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
        <span>Daily digest hero</span>
        <Switch checked={prefs.digestOn} onCheckedChange={(v) => update((p) => ({ ...p, digestOn: v }))} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="digest-time">Time</Label>
          <Input
            id="digest-time"
            type="time"
            value={prefs.digestTime}
            onChange={(e) => update((p) => ({ ...p, digestTime: e.target.value }))}
            className="h-11"
            disabled={!prefs.digestOn}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="digest-freq">Frequency</Label>
          <select
            id="digest-freq"
            className={FIELD_SELECT}
            value={prefs.digestFreq}
            onChange={(e) => update((p) => ({ ...p, digestFreq: e.target.value as DigestFreq }))}
            disabled={!prefs.digestOn}
          >
            {DIGEST_FREQS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Lines come from your interests, in order, then the top of the feed.</p>
    </div>
  );
}

export function CurateDialog({
  open,
  setOpen,
  prefs,
  update,
  stories,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  prefs: FeedPrefs;
  update: Update;
  stories: NewsItem[];
}) {
  const sources = [...new Set(stories.map((s) => s.src).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const pinned = new Set(prefs.pinned);
  const inHub = new Set(prefs.hub.map((h) => h.url));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Curate</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <p className={`${EYEBROW} mb-2`}>Stories in view</p>
            {stories.length ? (
              <ul className="divide-y divide-border">
                {stories.slice(0, 12).map((s, i) => (
                  <li key={storyKey(s, i)} className="py-2">
                    <p className="line-clamp-2 text-sm leading-snug">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {tagStory(s)} · {s.src}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" className="min-h-11" aria-pressed={pinned.has(s.link)} onClick={() => update((p) => togglePin(p, s.link))}>
                        {pinned.has(s.link) ? "Unpin" : "Pin"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        onClick={() => {
                          update((p) => toggleHide(p, s.link));
                          toast("Hidden");
                        }}
                      >
                        Hide
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11"
                        disabled={inHub.has(s.link)}
                        onClick={() => {
                          update((p) => withHub(p, { id: uid(), url: s.link, title: s.title, src: s.src, at: new Date().toISOString() }));
                          toast("Saved to hub");
                        }}
                      >
                        {inHub.has(s.link) ? "In hub" : "Save to hub"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No stories in view.</p>
            )}
          </div>
          <div>
            <p className={`${EYEBROW} mb-2`}>Mute a source</p>
            <div className="flex flex-wrap gap-2">
              {[...new Set([...sources, ...prefs.muted])].map((src) => {
                const muted = prefs.muted.some((m) => m.toLowerCase() === src.toLowerCase());
                return (
                  <Chip key={src} active={muted} onClick={() => update((p) => toggleMute(p, src))}>
                    {muted ? `Muted · ${src}` : src}
                  </Chip>
                );
              })}
              {!sources.length && !prefs.muted.length ? <p className="text-sm text-muted-foreground">No sources in view.</p> : null}
            </div>
          </div>
          {prefs.hidden.length || prefs.pinned.length ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {prefs.pinned.length} pinned · {prefs.hidden.length} hidden
              </span>
              <Button variant="outline" size="sm" className="min-h-11" onClick={() => update((p) => ({ ...p, hidden: [], pinned: [] }))}>
                Reset pins and hidden
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
