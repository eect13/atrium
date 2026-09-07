"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { uid } from "@/lib/format";
import { useAtrium } from "@/lib/store";
import type { NewsItem } from "@/lib/types";

function storyKey(n: NewsItem, i: number) {
  return `${n.src}|${n.link}|${n.title}|${i}`;
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
  const { feeds, toggleFeed, addFeed } = useAtrium(
    useShallow((s) => ({
      feeds: s.feeds,
      toggleFeed: s.toggleFeed,
      addFeed: s.addFeed,
    })),
  );
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [cat, setCat] = useState("Other");
  const cats = ["All", ...new Set(feeds.map((f) => f.category))];
  const shown = items.filter((i) => filter === "All" || i.category === filter);
  const hero = shown[0];
  const rest = shown.slice(1);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-medium tracking-tight">Briefing</h2>
        <div className="grow" />
        <Button variant="outline" onClick={onRefresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>
        <Button variant="outline" onClick={() => setOpen(true)}>Feeds</Button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`min-h-11 rounded-full border px-3 py-1.5 text-xs ${filter === c ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
          >
            {c}
          </button>
        ))}
      </div>
      {hero ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <a href={hero.link} target="_blank" rel="noopener noreferrer" className="flex min-h-52 flex-col justify-end rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{hero.src}</p>
            <h3 className="font-display mt-2 text-2xl font-medium leading-snug tracking-tight">{hero.title}</h3>
            {hero.desc ? <p className="mt-2 text-sm text-muted-foreground">{hero.desc}</p> : null}
          </a>
          <div className="space-y-3">
            {rest.slice(0, 4).map((n, i) => (
              <a key={storyKey(n, i)} href={n.link} target="_blank" rel="noopener noreferrer" className="block border-b border-border pb-3">
                <span className="text-sm leading-snug">{n.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{n.src}</span>
              </a>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{loading ? "Fetching briefing…" : "No stories yet. Refresh feeds or add an RSS URL."}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rest.slice(4).map((n, i) => (
          <a key={storyKey(n, i + 4)} href={n.link} target="_blank" rel="noopener noreferrer" className="flex min-h-36 flex-col rounded-lg bg-card p-4 shadow-[var(--shadow-border)]">
            <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">{n.src} · {n.category}</p>
            <h4 className="mt-2 text-sm font-medium leading-snug">{n.title}</h4>
            <p className="mt-2 grow text-xs text-muted-foreground">{n.desc}</p>
          </a>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>RSS feeds</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {feeds.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{f.category}</p>
                </div>
                <Switch checked={f.enabled} onCheckedChange={() => toggleFeed(f.id)} />
              </div>
            ))}
            <div className="grid gap-2 pt-2">
              <Label htmlFor="feed-name">Name</Label><Input id="feed-name" value={name} onChange={(e) => setName(e.target.value)} />
              <Label htmlFor="feed-cat">Category</Label><Input id="feed-cat" value={cat} onChange={(e) => setCat(e.target.value)} />
              <Label htmlFor="feed-url">RSS URL</Label><Input id="feed-url" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                if (!name.trim() || !url.trim()) return;
                if (!URL.canParse(url.trim())) {
                  toast("Need a valid URL");
                  return;
                }
                addFeed({ id: uid(), name: name.trim(), url: url.trim(), category: cat.trim() || "Other", enabled: true });
                setName(""); setUrl(""); toast("Feed added");
              }}>Add</Button>
              <Button onClick={() => { setOpen(false); onRefresh(); }}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
