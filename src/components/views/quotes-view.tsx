"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Quote, RefreshCw, Shuffle, Star } from "lucide-react";
import { toast } from "sonner";
import { Chip } from "@/components/views/finance-chip";
import { FloatBtn } from "@/components/desk-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  authorChipsFromQuotes,
  loadDeskQuotes,
  nextQuoteSeed,
  quoteTopicChips,
  readQuoteSeed,
  suggestAuthors,
  writeQuoteSession,
  type DeskQuote,
  type QuoteMode,
} from "@/lib/quotes";
import { WQ_LICENSE, WQ_SITE } from "@/lib/wikiquote";
import { onExternalAnchorClick } from "@/lib/http";
import { cn } from "@/lib/utils";

export function useDeskQuotes(
  mode: QuoteMode,
  author = "",
  seed = "desk",
  topic = "all",
  q = "",
  exact = false,
) {
  // Refresh rechecks the current view's cache key only (no global bust, not in the query key).
  const force = useRef(false);
  const query = useQuery({
    queryKey: ["quotes", mode, author.trim().toLowerCase(), mode === "random" ? seed : "", topic, q.trim().toLowerCase(), exact],
    queryFn: async () => {
      const again = force.current;
      force.current = false;
      return loadDeskQuotes({
        mode,
        author: author.trim() || undefined,
        topic,
        q: q.trim() || undefined,
        exact,
        limit: mode === "author" ? 24 : 16,
        seed,
        force: again,
      });
    },
    staleTime: 5 * 60_000,
    gcTime: 6 * 60 * 60_000,
    refetchOnWindowFocus: false,
  });
  const recheck = () => {
    force.current = true;
    return query.refetch();
  };
  return Object.assign(query, { recheck });
}

/** Attribution links: text-sized look, 44px tall target. */
const LINK = "inline-flex min-h-hit items-center rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function QuoteCard({
  q,
  featured = false,
  onPick,
}: {
  q: DeskQuote;
  featured?: boolean;
  onPick?: (q: DeskQuote) => void;
}) {
  return (
    <article
      className={cn(
        "rounded-xl bg-card text-card-foreground shadow-[var(--shadow-border)]",
        featured ? "p-6 md:p-8" : "p-5",
      )}
    >
      <Quote className="mb-3 size-4 text-muted-foreground" aria-hidden />
      <p className={cn("font-display leading-snug", featured ? "text-2xl md:text-4xl" : "text-lg")}>{q.text}</p>
      <p className="mt-4 text-sm text-muted-foreground">
        — {q.author}
        <span aria-hidden> · </span>
        {q.source === "wikiquote" ? (
          <a href={q.href} onClick={onExternalAnchorClick} className={LINK} target="_blank" rel="noreferrer">
            Wikiquote
          </a>
        ) : (
          <span>Built-in</span>
        )}
      </p>
      {onPick ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onPick(q);
              toast("Pinned to this session");
            }}
          >
            Use this
          </Button>
        </div>
      ) : null}
    </article>
  );
}

export function QuotesView() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"random" | "popular" | "author">("popular");
  const [person, setPerson] = useState("");
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const [exact, setExact] = useState(false);
  const [seed, setSeed] = useState(readQuoteSeed);
  const [filterFallback, setFilterFallback] = useState<string | null>(null);
  const filterQ = mode === "author" ? "" : person;
  const quotes = useDeskQuotes(
    mode === "author" && search.trim() ? "author" : mode === "popular" ? "popular" : "random",
    mode === "author" ? search : "",
    seed,
    topic,
    filterQ,
    exact,
  );
  const list = useMemo(() => quotes.data?.quotes ?? [], [quotes.data?.quotes]);
  const hero = list[0];
  const rest = list.slice(1);
  // Chips from desk corpus + current result set (not a hardcoded dump).
  const topicChips = useMemo(() => quoteTopicChips(), []);
  const authorChips = useMemo(() => authorChipsFromQuotes(list), [list]);

  function pin(q: DeskQuote) {
    writeQuoteSession(q);
    queryClient.setQueryData(["quotes", "session"], q);
  }

  function goRandom() {
    setSeed(nextQuoteSeed());
    setMode("random");
    setSearch("");
  }

  function goPopular() {
    setMode("popular");
    setSearch("");
  }

  /** Recheck Wikiquote for the view on screen only; Random also reshuffles. */
  function refresh() {
    if (mode === "random") setSeed(nextQuoteSeed());
    void quotes.recheck();
  }

  function goAuthor(name: string) {
    const n = name.trim();
    if (n.length < 2) {
      toast("Type a name or a word — Einstein, courage, bicycle");
      return;
    }
    setSearch(n);
    setPerson(n);
    setMode("author");
  }

  /** Modular search: Exact → author; otherwise text filter on popular/random.
   *  When the filter yields empty, fall through to author mode (c35599a / Card 125). */
  function runSearch() {
    const n = person.trim();
    if (n.length < 2) return;
    if (exact) {
      goAuthor(n);
      return;
    }
    setSearch("");
    if (mode === "author") setMode("popular");
    // Already filtering this query on popular/random and nothing matches → author.
    if (mode !== "author") {
      if (!list.length) goAuthor(n);
      return;
    }
    // Just left author — confirm empty after the popular pool loads.
    setFilterFallback(n);
  }

  useEffect(() => {
    if (!filterFallback || quotes.isFetching || quotes.isLoading) return;
    const q = filterFallback;
    setFilterFallback(null);
    if (!(quotes.data?.quotes ?? []).length) goAuthor(q);
  }, [filterFallback, quotes.isFetching, quotes.isLoading, quotes.data?.quotes]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-medium tracking-tight">Quotes</h2>
          <p className="text-xs text-muted-foreground">
            {mode === "author" && search
              ? `By ${search}`
              : filterQ.trim()
                ? `Filter: ${filterQ.trim()}`
                : mode === "popular"
                  ? "Popular voices"
                  : "Fresh roll — refresh anytime"}
          </p>
        </div>
        <div className="grow" />
        <Chip active={mode === "random"} onClick={goRandom}>
          <Shuffle className="size-3.5" />
          Random
        </Chip>
        <Chip active={mode === "popular"} onClick={goPopular}>
          <Star className="size-3.5" />
          Popular
        </Chip>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={refresh}
          disabled={quotes.isFetching}
          aria-label="Refresh quotes"
        >
          <RefreshCw className={cn("size-3.5", quotes.isFetching && "animate-spin")} />
          Refresh
        </Button>
        <FloatBtn kind="quote" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {topicChips.map((t) => (
          <Chip
            key={t.id}
            active={topic === t.id}
            onClick={() => {
              setTopic(t.id);
              if (mode === "author") setMode("popular");
            }}
          >
            {t.label}
          </Chip>
        ))}
      </div>
      {authorChips.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {authorChips.map((name) => (
            <Chip key={name} active={mode === "author" && search === name} onClick={() => goAuthor(name)}>
              {name}
            </Chip>
          ))}
        </div>
      ) : null}

      <form
        className="mb-6 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Input
            value={person}
            onChange={(e) => {
              setPerson(e.target.value);
              if (mode === "author" && !exact) {
                setSearch("");
                setMode("popular");
              }
            }}
            placeholder="Search text or name — courage, Einstein, bicycle"
            className="h-11 min-w-0 w-full"
            aria-label="Search quotes"
            autoComplete="off"
          />
          {person.trim().length >= 2 && suggestAuthors(person).length ? (
            <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-card p-1 shadow-[var(--shadow-float)]">
              {suggestAuthors(person).map((a) => (
                <li key={a.slug}>
                  <button
                    type="button"
                    className="flex min-h-hit w-full items-center rounded-sm px-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setPerson(a.name);
                      goAuthor(a.name);
                    }}
                  >
                    {a.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button type="submit" className="h-11 shrink-0">
          Search
        </Button>
        <Chip
          active={exact}
          onClick={() => {
            const next = !exact;
            setExact(next);
            if (next && person.trim().length >= 2) goAuthor(person);
          }}
        >
          Exact
        </Chip>
      </form>

      {quotes.isPending && !list.length ? (
        <div className="space-y-4">
          <Skeleton className="h-52 rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      ) : quotes.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn’t load quotes.{" "}
          <button type="button" className="underline" onClick={() => void quotes.refetch()}>
            Retry
          </button>
        </p>
      ) : !hero ? (
        <p className="text-sm text-muted-foreground">
          {mode === "author"
            ? "No quotes for that name. Try Einstein or Aurelius."
            : "No quotes for that yet. Try All, Random, or another word."}
        </p>
      ) : (
        <div className="space-y-4">
          <QuoteCard q={hero} featured onPick={pin} />
          {rest.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {rest.map((q) => (
                <QuoteCard key={`${q.author}-${q.text}`} q={q} onPick={pin} />
              ))}
            </div>
          ) : null}
        </div>
      )}
      <QuoteSourceNote data={quotes.data} />
    </div>
  );
}

/** Attribution + state line. CC BY-SA needs a visible link to the page and the license. */
function QuoteSourceNote({ data }: { data?: { from: string; state: string; page?: { title: string; href: string } } }) {
  if (!data) return null;
  const offline = data.from === "local";
  return (
    <p className="mt-4 text-xs text-muted-foreground" data-quote-source={data.from} data-quote-state={data.state}>
      {offline ? (
        <>Wikiquote didn’t answer — showing the built-in set. Refresh to try again. </>
      ) : (
        <>
          Quotes from{" "}
          <a href={data.page?.href ?? WQ_SITE} onClick={onExternalAnchorClick} className={LINK} target="_blank" rel="noreferrer">
            {data.page ? `Wikiquote · ${data.page.title}` : "Wikiquote"}
          </a>
          , text under{" "}
          <a href={WQ_LICENSE.href} onClick={onExternalAnchorClick} className={LINK} target="_blank" rel="noreferrer">
            {WQ_LICENSE.label}
          </a>
          {data.state === "stale" ? " · saved copy (Wikiquote didn’t answer)" : ""}. Built-in quotes fill in after.
        </>
      )}
    </p>
  );
}
