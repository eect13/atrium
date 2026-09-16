"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { uid } from "@/lib/format";
import { FEED_PACKS, FEED_PRESETS, packIsOn, probeFeed } from "@/lib/feeds";
import { NEWS_TAGS, asNewsFilter, asNewsTag, storyAge, tagStory, type NewsTag } from "@/lib/headline";
import { DEFAULT_FEEDS, useAtrium } from "@/lib/store";
import type { NewsItem } from "@/lib/types";
import { Chip, FIELD_SELECT } from "./finance-chip";

function storyKey(n: NewsItem, i: number) {
  return `${n.src}|${n.link}|${n.title}|${i}`;
}

function StoryTag({ tag }: { tag: NewsTag }) {
  return <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{tag}</span>;
}

function SourceLine({ n, className }: { n: NewsItem; className?: string }) {
  const age = storyAge(n.date);
  return (
    <p className={className ?? "mt-2 text-xs text-muted-foreground"}>
      {n.src}
      {age ? ` · ${age}` : ""}
    </p>
  );
}

export function NewsView({
  items,
  onRefresh,
  loading,
  error = false,
}: {
  items: NewsItem[];
  onRefresh: () => void;
  loading: boolean;
  error?: boolean;
}) {
  const { feeds, toggleFeed, addFeed, removeFeed, setFeedPack, enableStarterFeeds, newsQuery, newsTag, setNewsQuery, setNewsTag } = useAtrium(
    useShallow((s) => ({
      feeds: s.feeds,
      toggleFeed: s.toggleFeed,
      addFeed: s.addFeed,
      removeFeed: s.removeFeed,
      setFeedPack: s.setFeedPack,
      enableStarterFeeds: s.enableStarterFeeds,
      newsQuery: s.newsQuery,
      newsTag: s.newsTag,
      setNewsQuery: s.setNewsQuery,
      setNewsTag: s.setNewsTag,
    })),
  );
  const filter = asNewsFilter(newsTag);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [cat, setCat] = useState<string>("World");
  const [probing, setProbing] = useState(false);
  const [catalogQ, setCatalogQ] = useState("");
  const q = newsQuery.trim().toLowerCase();
  const onCount = feeds.filter((f) => f.enabled).length;
  const shown = items.filter((i) => {
    if (filter !== "All" && tagStory(i) !== filter) return false;
    if (!q) return true;
    return `${i.title} ${i.desc} ${i.src}`.toLowerCase().includes(q);
  });
  const hero = shown[0];
  const rest = shown.slice(1);
  const defaultIds = useMemo(() => new Set(DEFAULT_FEEDS.map((f) => f.id)), []);
  const catalog = useMemo(() => {
    const groups = new Map<NewsTag, typeof FEED_PRESETS>();
    for (const p of FEED_PRESETS) {
      const list = groups.get(p.category) ?? [];
      list.push(p);
      groups.set(p.category, list);
    }
    return NEWS_TAGS.filter((t) => groups.has(t)).map((tag) => ({ tag, items: groups.get(tag)! }));
  }, []);
  const listed = useMemo(() => {
    const needle = catalogQ.trim().toLowerCase();
    return [...feeds]
      .filter((f) => {
        if (needle) return `${f.name} ${f.category} ${f.url}`.toLowerCase().includes(needle);
        return f.enabled;
      })
      .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  }, [feeds, catalogQ]);
  const listedShown = catalogQ.trim() ? listed.slice(0, 24) : listed;

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
        category: asNewsTag(category),
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
    const hit = feeds.find((f) => f.url === p.url || f.name === p.name);
    if (hit) {
      if (!hit.enabled) toggleFeed(hit.id);
      toast(hit.enabled ? "Already on the desk" : `Enabled ${p.name}`);
      return;
    }
    const known = DEFAULT_FEEDS.find((f) => f.url === p.url);
    addFeed({
      id: known?.id ?? uid(),
      name: p.name,
      url: p.url,
      category: p.category,
      enabled: true,
    });
    toast(`Added ${p.name}`);
    onRefresh();
  }

  const emptyCopy = !onCount
    ? null
    : error
      ? "Couldn’t reach those feeds."
      : q
        ? `No stories matching “${newsQuery.trim()}”.`
        : filter !== "All"
          ? "No stories in this tag. Pick All or another source."
          : "No stories from the sources on. Try another feed or Refresh.";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-medium tracking-tight">Briefing</h2>
        <div className="grow" />
        <Button variant="outline" onClick={onRefresh} disabled={loading || !onCount}>
          {loading && onCount ? "Refreshing…" : "Refresh"}
        </Button>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {onCount ? `Feeds · ${onCount}` : "Feeds"}
        </Button>
      </div>
      {onCount || items.length ? (
        <>
          <form
            className="relative mb-4"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={newsQuery}
              onChange={(e) => setNewsQuery(e.target.value)}
              placeholder="Search this briefing"
              className="h-11 pl-9"
              aria-label="Search briefing"
              autoComplete="off"
            />
          </form>
          <div className="scroll-auto mb-4 flex flex-nowrap gap-2 overflow-x-auto pb-1">
            <Chip active={filter === "All"} onClick={() => setNewsTag("All")}>
              All
            </Chip>
            {NEWS_TAGS.map((c) => (
              <Chip key={c} active={filter === c} onClick={() => setNewsTag(c)}>
                {c}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
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
            <SourceLine n={hero} className="mt-3 text-xs text-muted-foreground" />
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
                <SourceLine n={n} className="mt-1 text-xs text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      ) : loading && onCount ? (
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
      ) : !onCount ? (
        <div className="mb-4 rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
          <p className="font-display text-xl font-medium tracking-tight">No sources on</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Feeds stay off until you pick them. One tap turns on Inquirer, Philstar, Rappler, BBC and a few more.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                enableStarterFeeds();
                toast("Starter feeds on");
                onRefresh();
              }}
            >
              Use starter feeds
            </Button>
            <Button variant="outline" onClick={() => setOpen(true)}>
              Open Feeds
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-sm text-muted-foreground">{emptyCopy}</p>
          {error ? (
            <Button className="mt-3" variant="outline" onClick={onRefresh}>
              Retry
            </Button>
          ) : null}
        </div>
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
            <SourceLine n={n} />
          </a>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>RSS feeds</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Nothing is on until you pick a source. Turn on a pack, paste a site or RSS URL, or choose from the catalog.
            </p>
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">Packs</p>
              <div className="flex flex-wrap gap-2">
                {FEED_PACKS.map((p) => {
                  const on = packIsOn(feeds, p.id);
                  return (
                    <Chip
                      key={p.id}
                      active={on}
                      onClick={() => {
                        setFeedPack(p.id, !on);
                        toast(on ? `${p.label} off` : `${p.label} on`);
                      }}
                    >
                      {p.label}
                    </Chip>
                  );
                })}
              </div>
            </div>
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
                placeholder="site or https://…"
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
            <div className="space-y-1">
              <Label htmlFor="feed-catalog">Add a source</Label>
              <select
                id="feed-catalog"
                className={FIELD_SELECT}
                defaultValue=""
                aria-label="Add a source"
                onChange={(e) => {
                  const url = e.target.value;
                  e.target.value = "";
                  const p = FEED_PRESETS.find((x) => x.url === url);
                  if (p) addPreset(p);
                }}
              >
                <option value="" disabled>
                  Choose a source
                </option>
                {catalog.map((g) => (
                  <optgroup key={g.tag} label={g.tag}>
                    {g.items.map((p) => (
                      <option key={p.url} value={p.url} disabled={feeds.some((f) => f.url === p.url && f.enabled)}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="space-y-2 pt-1">
              <Input
                value={catalogQ}
                onChange={(e) => setCatalogQ(e.target.value)}
                placeholder="Search the catalog"
                className="h-11"
                aria-label="Search the catalog"
              />
              <p className="text-xs text-muted-foreground">
                {onCount} on · {feeds.length - onCount} more
                {catalogQ.trim() ? "" : " — type a name to browse"}
              </p>
              {listedShown.length ? (
                listedShown.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{f.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {asNewsTag(f.category)} · {f.url.replace(/^https?:\/\//, "")}
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
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {catalogQ.trim()
                    ? "No sources match that filter."
                    : "Nothing on yet — use a pack, the dropdown, or search the catalog."}
                </p>
              )}
              {listed.length > listedShown.length ? (
                <p className="text-xs text-muted-foreground">Refine the name to see the rest.</p>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setOpen(false);
                  if (onCount) onRefresh();
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
