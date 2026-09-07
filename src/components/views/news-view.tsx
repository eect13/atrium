"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { uid } from "@/lib/format";
import { FEED_PRESETS, probeFeed } from "@/lib/feeds";
import { NEWS_TAGS, newsTagList, tagStory, type NewsTag } from "@/lib/headline";
import { DEFAULT_FEEDS, useAtrium } from "@/lib/store";
import type { NewsItem } from "@/lib/types";
import { Chip, FIELD_SELECT } from "./finance-chip";

function storyKey(n: NewsItem, i: number) {
  return `${n.src}|${n.link}|${n.title}|${i}`;
}

function StoryTag({ tag }: { tag: NewsTag }) {
  return <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{tag}</span>;
}

export function NewsView({
  items,
  onRefresh,
  loading,
}: {
  items: NewsItem[];
  onRefresh: () => void;
  loading: boolean;
}) {
  const { feeds, toggleFeed, addFeed, removeFeed } = useAtrium(
    useShallow((s) => ({
      feeds: s.feeds,
      toggleFeed: s.toggleFeed,
      addFeed: s.addFeed,
      removeFeed: s.removeFeed,
    })),
  );
  const [filter, setFilter] = useState<NewsTag | "All">("All");
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [cat, setCat] = useState<string>("World");
  const [probing, setProbing] = useState(false);
  const tags = useMemo(() => newsTagList(items), [items]);
  const shown = items.filter((i) => filter === "All" || tagStory(i) === filter);
  const hero = shown[0];
  const rest = shown.slice(1);
  const defaultIds = useMemo(() => new Set(DEFAULT_FEEDS.map((f) => f.id)), []);

  async function addFromInput(raw: string, category = cat) {
    const input = raw.trim();
    if (!input) return;
    setProbing(true);
    try {
      const probe = await probeFeed({ data: { input } });
      if (!probe.ok) {
        toast(probe.error ?? "Could not add that feed");
        return;
      }
      if (feeds.some((f) => f.url === probe.url)) {
        toast("Already on the desk");
        return;
      }
      addFeed({
        id: uid(),
        name: probe.title || "Feed",
        url: probe.url,
        category: category.trim() || "World",
        enabled: true,
      });
      setUrl("");
      toast(`Added ${probe.title || "feed"}`);
      onRefresh();
    } finally {
      setProbing(false);
    }
  }

  function addPreset(p: (typeof FEED_PRESETS)[number]) {
    if (feeds.some((f) => f.url === p.url || f.name === p.name)) {
      const hit = feeds.find((f) => f.url === p.url || f.name === p.name);
      if (hit && !hit.enabled) toggleFeed(hit.id);
      toast(hit?.enabled ? "Already on the desk" : `Enabled ${p.name}`);
      return;
    }
    addFeed({
      id: uid(),
      name: p.name,
      url: p.url,
      category: p.category,
      enabled: true,
    });
    toast(`Added ${p.name}`);
    onRefresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-medium tracking-tight">Briefing</h2>
        <div className="grow" />
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Feeds
        </Button>
      </div>
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addFromInput(url);
        }}
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Add a site or RSS — inquirer, bbc.com, https://…"
          className="h-11 min-w-0 flex-1"
          aria-label="Add RSS feed"
          autoComplete="off"
        />
        <Button type="submit" className="h-11" disabled={probing || !url.trim()}>
          {probing ? "Looking…" : "Add feed"}
        </Button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2">
        {FEED_PRESETS.slice(0, 6).map((p) => {
          const on = feeds.some((f) => f.url === p.url && f.enabled);
          return (
            <Chip key={p.url} active={on} onClick={() => addPreset(p)}>
              {p.name}
            </Chip>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip active={filter === "All"} onClick={() => setFilter("All")}>
          All
        </Chip>
        {tags.map((c) => (
          <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>
            {c}
          </Chip>
        ))}
      </div>
      {hero ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <a
            href={hero.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-52 flex-col justify-end rounded-xl bg-card p-5 shadow-[var(--shadow-border)]"
          >
            <StoryTag tag={tagStory(hero)} />
            <h3 className="font-display mt-2 text-2xl font-medium leading-snug tracking-tight">{hero.title}</h3>
            {hero.desc ? <p className="mt-2 text-sm text-muted-foreground">{hero.desc}</p> : null}
            <p className="mt-3 text-xs text-muted-foreground">{hero.src}</p>
          </a>
          <div className="space-y-3">
            {rest.slice(0, 4).map((n, i) => (
              <a
                key={storyKey(n, i)}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block border-b border-border pb-3"
              >
                <StoryTag tag={tagStory(n)} />
                <span className="mt-1 block text-sm leading-snug">{n.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{n.src}</span>
              </a>
            ))}
          </div>
        </div>
      ) : loading ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]" aria-busy>
          <div className="flex min-h-52 flex-col justify-end rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="mt-3 h-8 w-5/6" />
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-4 h-3 w-20" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="border-b border-border pb-3">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1 h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No stories in this tag. Refresh feeds or pick All.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rest.slice(4).map((n, i) => (
          <a
            key={storyKey(n, i + 4)}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-36 flex-col rounded-lg bg-card p-4 shadow-[var(--shadow-border)]"
          >
            <StoryTag tag={tagStory(n)} />
            <h4 className="mt-2 text-sm font-medium leading-snug">{n.title}</h4>
            <p className="mt-2 grow text-xs text-muted-foreground">{n.desc}</p>
            <p className="mt-2 text-xs text-muted-foreground">{n.src}</p>
          </a>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>RSS feeds</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Paste a site or RSS URL. Atrium finds the feed.</p>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void addFromInput(url);
              }}
            >
              <Label htmlFor="feed-url">Site or RSS URL</Label>
              <Input
                id="feed-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="inquirer.net or https://…"
                autoComplete="off"
              />
              <div className="flex items-center gap-2">
                <select
                  className={FIELD_SELECT}
                  value={cat}
                  onChange={(e) => setCat(e.target.value)}
                  aria-label="Tag"
                >
                  {NEWS_TAGS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <Button type="submit" disabled={probing || !url.trim()}>
                  {probing ? "Looking…" : "Add"}
                </Button>
              </div>
            </form>
            <div className="flex flex-wrap gap-2">
              {FEED_PRESETS.map((p) => {
                const on = feeds.some((f) => f.url === p.url && f.enabled);
                return (
                  <Chip key={p.url} active={on} onClick={() => addPreset(p)}>
                    {p.name}
                  </Chip>
                );
              })}
            </div>
            <div className="space-y-2 pt-1">
              {feeds.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{f.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.category} · {f.url.replace(/^https?:\/\//, "")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {defaultIds.has(f.id) ? null : (
                      <button
                        type="button"
                        className="px-2 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => removeFeed(f.id)}
                      >
                        Remove
                      </button>
                    )}
                    <Switch checked={f.enabled} onCheckedChange={() => toggleFeed(f.id)} />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setOpen(false);
                  onRefresh();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
