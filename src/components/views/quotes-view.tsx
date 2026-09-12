"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Quote, Shuffle, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Chip } from "@/components/views/finance-chip";
import { FloatBtn } from "@/components/widgets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchQuotes, nextQuoteSeed, POPULAR_AUTHORS, QUOTE_TOPICS, readQuoteSeed, writeQuoteSession, type DeskQuote } from "@/lib/quotes";
import { cn } from "@/lib/utils";

export function useDeskQuotes(
  mode: "random" | "popular" | "author",
  author = "",
  seed = "desk",
  topic = "all",
  q = "",
  exact = false,
) {
  return useQuery({
    queryKey: ["quotes", mode, author.trim().toLowerCase(), mode === "random" ? seed : "", topic, q.trim().toLowerCase(), exact],
    queryFn: () =>
      fetchQuotes({
        data: {
          mode,
          author: author.trim() || undefined,
          topic: topic === "all" ? undefined : topic,
          q: q.trim() || undefined,
          exact: exact || undefined,
          limit: mode === "author" ? 24 : 16,
          seed,
        },
      }),
    staleTime: mode === "random" ? Infinity : 30 * 60_000,
    gcTime: 6 * 60 * 60_000,
  });
}

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
      <p className="mt-4 text-sm text-muted-foreground">— {q.author}</p>
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
  const [mode, setMode] = useState<"random" | "popular" | "author">("random");
  const [person, setPerson] = useState("");
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const [exact, setExact] = useState(false);
  const [seed, setSeed] = useState(readQuoteSeed);
  const quotes = useDeskQuotes(
    mode === "author" && search.trim() ? "author" : mode === "popular" ? "popular" : "random",
    mode === "author" ? search : "",
    seed,
    mode === "author" && search.trim() ? "all" : topic,
    search.trim() ? "" : person,
    exact,
  );
  const list = quotes.data?.quotes ?? [];
  const hero = list[0];
  const rest = list.slice(1);

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

  function goAuthor(name: string) {
    const n = name.trim();
    if (n.length < 2) {
      toast("Type a name or a word — Einstein, courage, bicycle");
      return;
    }
    setSearch(n);
    setMode("author");
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-medium tracking-tight">Quotes</h2>
          <p className="text-xs text-muted-foreground">
            {mode === "author" && search
              ? `By ${search}`
              : topic !== "all"
                ? QUOTE_TOPICS.find((t) => t.id === topic)?.label ?? "Topic"
                : mode === "popular"
                  ? "Popular voices"
                  : "A new roll each session"}
          </p>
        </div>
        <FloatBtn kind="quote" />
        <div className="grow" />
        <Chip active={mode === "random"} onClick={goRandom}>
          <Shuffle className="size-3.5" />
          Random
        </Chip>
        <Chip active={mode === "popular"} onClick={goPopular}>
          <Star className="size-3.5" />
          Popular
        </Chip>
      </div>

      {mode !== "author" ? (
        <div className="scroll-auto mb-5 flex flex-nowrap gap-2 overflow-x-auto pb-1">
          {QUOTE_TOPICS.map((t) => (
            <Chip
              key={t.id}
              active={topic === t.id}
              onClick={() => {
                setTopic(t.id);
              }}
            >
              {t.label}
            </Chip>
          ))}
        </div>
      ) : null}

      <form
        className="mb-6 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = person.trim();
          if (n.length < 2) return;
          if (exact) goAuthor(n);
        }}
      >
        <Input
          value={person}
          onChange={(e) => {
            setPerson(e.target.value);
            if (mode === "author") setSearch("");
          }}
          placeholder="A line, a person, or a word"
          className="h-11 min-w-0 flex-1"
          aria-label="Search quotes"
        />
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

      <div className="mb-6 hidden flex-wrap gap-2 sm:flex">
        {POPULAR_AUTHORS.slice(0, 8).map((a) => (
          <Chip
            key={a.slug}
            active={mode === "author" && search.toLowerCase() === a.name.toLowerCase()}
            onClick={() => {
              setPerson(a.name);
              goAuthor(a.name);
            }}
          >
            {a.name}
          </Chip>
        ))}
      </div>

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
      {quotes.data?.from === "local" ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Public feed was quiet — showing the desk copy. Try Random again in a moment.
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">Source: public quote feed.</p>
      )}
    </div>
  );
}
