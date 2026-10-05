"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { MoreHorizontal, Rss, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { onExternalAnchorClick } from "@/lib/http";
import { tagStory } from "@/lib/headline";
import { FEED_ALL, feedDigest, feedSummary, interestStock, interestSuggestions, storiesFor, storyKey, type StockRef } from "@/lib/feed";
import { fetchRelatedStories, stockNewsKey } from "@/lib/research";
import { useAtrium } from "@/lib/store";
import { WATCH_CATALOG, type NewsItem } from "@/lib/types";
import { Chip } from "./finance-chip";
import { FeedSources } from "./feed-sources";
import {
  CurateDialog,
  DigestDialog,
  DigestHero,
  Hub,
  HubAddDialog,
  InterestDialog,
  SourceLine,
  StoryTag,
  SummaryBlock,
} from "./feed-panels";

const EYEBROW = "text-xs uppercase tracking-[0.08em] text-muted-foreground";

type Hook = "sources" | "digest" | "curate" | "interest" | "hub" | null;

/** Feed (was News) — layout B: interest chips in the topbar → digest hero → summary → stories, with a hub rail. */
export function FeedView({
  items,
  onRefresh,
  loading,
  error = false,
  errorMessage,
  missed = [],
}: {
  items: NewsItem[];
  onRefresh: () => void;
  loading: boolean;
  error?: boolean;
  errorMessage?: string;
  missed?: string[];
}) {
  const { feeds, enableStarterFeeds, newsQuery, setNewsQuery, prefs, updateFeed, watch } = useAtrium(
    useShallow((s) => ({
      feeds: s.feeds,
      enableStarterFeeds: s.enableStarterFeeds,
      newsQuery: s.newsQuery,
      setNewsQuery: s.setNewsQuery,
      prefs: s.feedPrefs,
      updateFeed: s.updateFeed,
      watch: s.watch,
    })),
  );
  const [hook, setHook] = useState<Hook>(null);
  const [more, setMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const onCount = feeds.filter((f) => f.enabled).length;
  const interest = prefs.interest;
  // Stock-scoped interests: `$TICKER`, an UPPERCASE ticker, or an exact company name resolve to a stock.
  const catalog = useMemo<StockRef[]>(() => [...watch, ...WATCH_CATALOG], [watch]);
  const stockOf = useCallback((i: string) => interestStock(i, catalog), [catalog]);
  const stock = interest !== FEED_ALL ? stockOf(interest) : null;
  const stockNews = useQuery({
    queryKey: stock ? stockNewsKey(stock) : ["stock-news", "none"],
    queryFn: () => fetchRelatedStories({ data: { label: stock!.label, symbol: stock!.symbol, name: stock!.name, kind: stock!.kind } }),
    enabled: Boolean(stock),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
  // Harvested stock copy joins the RSS pool; storiesFor keeps only stories about the stock either way.
  const pool = useMemo(() => {
    const d = stock ? stockNews.data : undefined;
    if (!d) return items;
    const seen = new Set(items.map((n) => n.link));
    const extra: NewsItem[] = [...d.facts, ...d.rumors, ...d.earlier]
      .filter((r) => r.link && !seen.has(r.link) && (seen.add(r.link), true))
      .map((r) => ({ title: r.title, link: r.link, desc: r.desc, date: r.date, src: r.src, category: "markets" }));
    return [...items, ...extra].sort((a, b) => (Date.parse(b.date || "") || 0) - (Date.parse(a.date || "") || 0));
  }, [items, stock, stockNews.data]);
  const shown = useMemo(() => storiesFor(pool, prefs, newsQuery, stockOf), [pool, prefs, newsQuery, stockOf]);
  const inInterest = useMemo(() => storiesFor(pool, prefs, "", stockOf), [pool, prefs, stockOf]);
  const digest = useMemo(() => feedDigest(pool, prefs, 3, stockOf), [pool, prefs, stockOf]);
  const summary = useMemo(() => feedSummary(inInterest, interest), [inInterest, interest]);
  const suggestions = useMemo(() => interestSuggestions(items, prefs.interests), [items, prefs.interests]);
  const hero = shown[0];
  const rest = shown.slice(1);
  const q = newsQuery.trim();
  const open = (h: Hook) => {
    setMore(false);
    setHook(h);
  };
  const setOpen = (h: Exclude<Hook, null>) => (v: boolean) => setHook(v ? h : null);

  const emptyCopy = error
    ? errorMessage || "Couldn’t reach those sources."
    : q
      ? `No stories matching “${q}”.`
      : stock
        ? stockNews.isFetching
          ? `Looking for stories about ${stock.label}…`
          : `No stories about ${stock.label} yet — unrelated headlines stay out.`
        : interest !== FEED_ALL
          ? `No stories for ${interest} yet. Pick All or edit the interest.`
        : "No stories from the sources on. Try another source or Refresh.";

  const roomy = prefs.comfortableDensity !== false;
  const storyGap = roomy ? "space-y-3" : "space-y-1.5";
  const storyPad = roomy ? "pb-3" : "pb-1.5";
  const cardPad = roomy ? "p-4" : "p-3";
  const cardMin = roomy ? "min-h-36" : "min-h-28";
  const gridGap = roomy ? "gap-4" : "gap-2";
  const restGap = roomy ? "gap-3" : "gap-2";

  const chips = (
    <div className="scroll-auto flex min-w-0 flex-nowrap gap-2 overflow-x-auto pb-1 lg:justify-end lg:pb-0" role="group" aria-label="Interests">
      <Chip active={interest === FEED_ALL} onClick={() => updateFeed((p) => ({ ...p, interest: FEED_ALL }))}>
        All
      </Chip>
      {prefs.interests.map((i) => (
        <Chip key={i} active={interest === i} onClick={() => updateFeed((p) => ({ ...p, interest: i }))}>
          {i}
        </Chip>
      ))}
      <Chip active={false} onClick={() => open("interest")} className="min-w-11 justify-center border-dashed">
        <span aria-hidden>+</span>
        <span className="sr-only">Add or edit interests</span>
      </Chip>
    </div>
  );

  return (
    <div>
      {/* Topbar: title · interest chips · hooks (Sources / Digest / Curate). */}
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-border pb-3 lg:flex-nowrap">
        <h2 className="font-display text-2xl font-medium tracking-tight">Feed</h2>
        <div className="order-last w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">{chips}</div>
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          <div className="hidden items-center gap-2 md:flex">
            {prefs.showSourcesStrip ? (
              <Button variant="outline" className="min-h-11" onClick={() => open("sources")}>
                {onCount ? `Sources · ${onCount}` : "Sources"}
              </Button>
            ) : null}
            <Button variant="outline" className="min-h-11" onClick={() => open("digest")}>
              Digest
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => open("curate")}>
              Curate
            </Button>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            {prefs.showSourcesStrip ? (
              <Button variant="outline" size="icon" className="size-11" aria-label={`Sources${onCount ? `, ${onCount} on` : ""}`} onClick={() => open("sources")}>
                <Rss />
              </Button>
            ) : null}
            <div
              ref={moreRef}
              className="relative"
              onBlur={(e) => {
                if (!moreRef.current?.contains(e.relatedTarget as Node | null)) setMore(false);
              }}
            >
              <Button variant="outline" size="icon" className="size-11" aria-label="More Feed options" aria-expanded={more} aria-haspopup="menu" onClick={() => setMore((v) => !v)}>
                <MoreHorizontal />
              </Button>
              {more ? (
                <div role="menu" className="absolute right-0 top-12 z-30 w-44 rounded-md bg-card p-1.5 text-card-foreground shadow-[var(--shadow-float)]">
                  {(
                    [
                      ["Digest", () => open("digest")],
                      ["Curate", () => open("curate")],
                      ["Refresh", () => (setMore(false), onRefresh())],
                    ] as const
                  ).map(([label, fn]) => (
                    <button
                      key={label}
                      type="button"
                      role="menuitem"
                      onClick={fn}
                      className="flex min-h-11 w-full items-center rounded-sm px-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {missed.length && !error ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {missed.length === 1
            ? `${missed[0]} didn’t answer. The rest of the feed is still here.`
            : `${missed.length} sources didn’t answer (${missed.slice(0, 4).join(", ")}${missed.length > 4 ? "…" : ""}). The rest of the feed is still here.`}
        </p>
      ) : null}

      <div className={`grid gap-4 lg:items-start ${prefs.showHub ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        <div className="min-w-0 space-y-4">
          {!onCount && !items.length ? (
            <section className="rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
              <p className={EYEBROW}>Daily digest</p>
              <p className="font-display mt-1 text-xl font-medium tracking-tight">No sources on</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Sources stay off until you pick them. One tap turns on a starter set for this desk.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  className="min-h-11"
                  onClick={() => {
                    enableStarterFeeds();
                    toast("Starter sources on");
                    onRefresh();
                  }}
                >
                  Use starter sources
                </Button>
                <Button variant="outline" className="min-h-11" onClick={() => open("sources")}>
                  Open Sources
                </Button>
              </div>
            </section>
          ) : (
            <>
              <DigestHero lines={digest} prefs={prefs} loading={loading || stockNews.isFetching} onSettings={() => open("digest")} />
              {prefs.showSummary ? (
                <SummaryBlock summary={summary} interest={interest} sourcesOn={onCount} stock={stock?.label} />
              ) : null}
            </>
          )}

          {prefs.showHub ? (
            <div className="lg:hidden">
              <Hub prefs={prefs} update={updateFeed} onAdd={() => open("hub")} layout="strip" />
            </div>
          ) : null}

          <section aria-labelledby="feed-stories">
            <div className="mb-2 flex items-center gap-2">
              <h3 id="feed-stories" className={EYEBROW}>
                Stories
              </h3>
              <div className="grow" />
              <Button variant="ghost" size="sm" className="min-h-11" onClick={onRefresh} disabled={loading || !onCount}>
                {loading && onCount ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
            {onCount || items.length ? (
              <form className="relative mb-3" onSubmit={(e) => e.preventDefault()}>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={newsQuery}
                  onChange={(e) => setNewsQuery(e.target.value)}
                  placeholder="Search sources & topics"
                  className="h-11 pl-9"
                  aria-label="Search sources and topics"
                  autoComplete="off"
                />
              </form>
            ) : null}
            {(() => {
              const qn = newsQuery.trim().toLowerCase();
              if (!qn) return null;
              const topics = prefs.interests.filter((i) => i.toLowerCase().includes(qn)).slice(0, 6);
              const sources = [...new Set(pool.map((n) => n.src).filter(Boolean))]
                .filter((s) => (s ?? "").toLowerCase().includes(qn))
                .slice(0, 6) as string[];
              if (!topics.length && !sources.length) return null;
              return (
                <div className="mb-3 flex flex-wrap gap-2" aria-label="Matching topics and sources">
                  {topics.map((i) => (
                    <span key={`int-${i}`} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      Topic · {i}
                    </span>
                  ))}
                  {sources.map((s) => (
                    <span key={`src-${s}`} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      Source · {s}
                    </span>
                  ))}
                </div>
              );
            })()}
            {hero ? (
              <div className={`grid md:grid-cols-[1.4fr_1fr] ${gridGap}`}>
                <a
                  href={hero.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onExternalAnchorClick}
                  className={`flex flex-col justify-end rounded-xl bg-card shadow-[var(--shadow-border)] ${roomy ? "min-h-44 p-5" : "min-h-36 p-4"}`}
                >
                  <StoryTag tag={tagStory(hero)} />
                  <h4 className={`font-display mt-2 font-medium leading-snug tracking-tight ${roomy ? "text-2xl" : "text-xl"}`}>{hero.title}</h4>
                  {hero.desc ? <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{hero.desc}</p> : null}
                  <SourceLine n={hero} className="mt-3 text-xs text-muted-foreground" />
                </a>
                <div className={storyGap}>
                  {rest.slice(0, 4).map((n, i) => (
                    <a
                      key={storyKey(n, i)}
                      href={n.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={onExternalAnchorClick}
                      className={`block border-b border-border ${storyPad}`}
                    >
                      <StoryTag tag={tagStory(n)} />
                      <span className="mt-1 block text-sm leading-snug">{n.title}</span>
                      <SourceLine n={n} className="mt-1 text-xs text-muted-foreground" />
                    </a>
                  ))}
                </div>
              </div>
            ) : loading && onCount ? (
              <div className={`grid md:grid-cols-[1.4fr_1fr] ${gridGap}`} aria-busy>
                <div className="flex min-h-44 flex-col justify-end rounded-xl bg-card p-5 shadow-[var(--shadow-border)]">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="mt-3 h-8 w-5/6" />
                  <Skeleton className="mt-2 h-4 w-3/4" />
                  <Skeleton className="mt-4 h-3 w-20" />
                </div>
                <div className={storyGap}>
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={`border-b border-border ${storyPad}`}>
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="mt-2 h-4 w-full" />
                      <Skeleton className="mt-1 h-3 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            ) : onCount || items.length ? (
              <div>
                <p className="text-sm text-muted-foreground">{emptyCopy}</p>
                {error ? (
                  <Button className="mt-3 min-h-11" variant="outline" onClick={onRefresh}>
                    Retry
                  </Button>
                ) : null}
              </div>
            ) : null}
            {rest.length > 4 ? (
              <div className={`mt-4 grid sm:grid-cols-2 xl:grid-cols-3 ${restGap}`}>
                {rest.slice(4).map((n, i) => (
                  <a
                    key={storyKey(n, i + 4)}
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onExternalAnchorClick}
                    className={`flex flex-col rounded-lg bg-card shadow-[var(--shadow-border)] ${cardMin} ${cardPad}`}
                  >
                    <StoryTag tag={tagStory(n)} />
                    <h4 className="mt-2 text-sm font-medium leading-snug">{n.title}</h4>
                    <p className="mt-2 line-clamp-3 grow text-xs text-muted-foreground">{n.desc}</p>
                    <SourceLine n={n} />
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        {prefs.showHub ? (
          <aside className="hidden lg:block" aria-label="Resource hub rail">
            <Hub prefs={prefs} update={updateFeed} onAdd={() => open("hub")} layout="rail" />
          </aside>
        ) : null}
      </div>

      <FeedSources
        open={hook === "sources"}
        setOpen={setOpen("sources")}
        onRefresh={onRefresh}
      />
      <DigestDialog open={hook === "digest"} setOpen={setOpen("digest")} prefs={prefs} update={updateFeed} />
      <CurateDialog open={hook === "curate"} setOpen={setOpen("curate")} prefs={prefs} update={updateFeed} stories={inInterest} />
      <InterestDialog open={hook === "interest"} setOpen={setOpen("interest")} prefs={prefs} update={updateFeed} suggestions={suggestions} />
      <HubAddDialog open={hook === "hub"} setOpen={setOpen("hub")} update={updateFeed} />
    </div>
  );
}
