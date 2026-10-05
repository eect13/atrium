"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { uid } from "@/lib/format";
import { FEED_PRESETS, compareRegion, packIsOn, probeFeed, sortedFeedPacks, sourceRegion } from "@/lib/feeds";
import { NEWS_TAGS, asNewsTag } from "@/lib/headline";
import { DEFAULT_FEEDS, useAtrium } from "@/lib/store";
import { Chip, FIELD_SELECT } from "./finance-chip";

/** Feed › Sources — evolved from the old Feeds dialog (packs, URL probe, catalog). Tags are story metadata only. */
export function FeedSources({
  open,
  setOpen,
  onRefresh,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onRefresh: () => void;
}) {
  const { feeds, toggleFeed, addFeed, removeFeed, setFeedPack } = useAtrium(
    useShallow((s) => ({
      feeds: s.feeds,
      toggleFeed: s.toggleFeed,
      addFeed: s.addFeed,
      removeFeed: s.removeFeed,
      setFeedPack: s.setFeedPack,
    })),
  );
  const [url, setUrl] = useState("");
  const [cat, setCat] = useState<string>("World");
  const [probing, setProbing] = useState(false);
  const [catalogQ, setCatalogQ] = useState("");
  const onCount = feeds.filter((f) => f.enabled).length;
  const catalog = useMemo(() => {
    const groups = new Map<string, typeof FEED_PRESETS>();
    for (const p of FEED_PRESETS) {
      const region = sourceRegion(p);
      const list = groups.get(region) ?? [];
      list.push(p);
      groups.set(region, list);
    }
    return [...groups.keys()].sort(compareRegion).map((tag) => ({ tag, items: groups.get(tag)! }));
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

  return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sources</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Nothing is on until you pick a source. Turn on a pack, paste a site or RSS URL, or choose from the catalog.
            </p>
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">Packs</p>
              <div className="flex flex-wrap gap-2">
                {sortedFeedPacks().map((p) => {
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
                  aria-label="Story tag"
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
                placeholder="Search sources"
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
                      {sourceRegion(f)} · {asNewsTag(f.category)} · {f.url.replace(/^https?:\/\//, "")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        removeFeed(f.id);
                        toast(`Removed ${f.name}`);
                      }}
                    >
                      Remove
                    </button>
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
  );
}
