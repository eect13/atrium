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
import {
  fetchQuotes,
  nextQuoteSeed,
  POPULAR_AUTHORS,
  readQuoteSeed,
  writeQuoteSession,
  type DeskQuote,
} from "@/lib/quotes";
import { cn } from "@/lib/utils";

export function useDeskQuotes(mode: "random" | "popular" | "author", author = "", seed = "desk") {
  return useQuery({
    queryKey: ["quotes", mode, author.trim().toLowerCase(), mode === "random" ? seed : ""],
    queryFn: () =>
      fetchQuotes({
        data: {
          mode,
          author: author.trim() || undefined,
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
        "rounded-xl bg-card p-5 text-card-foreground shadow-[var(--shadow-border)]",
        featured && "lg:col-span-2",
      )}
    >
      <Quote className="mb-3 size-4 text-muted-foreground" aria-hidden />
      <p className={cn("font-display leading-snug", featured ? "text-2xl md:text-3xl" : "text-lg")}>{q.text}</p>
      <p className="mt-4 text-sm text-muted-foreground">— {q.author}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onPick ? (
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
        ) : null}
        <a
          href={q.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          BrainyQuote
        </a>
      </div>
    </article>
  );
}

export function QuotesView() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"random" | "popular" | "author">("random");
  const [person, setPerson] = useState("");
  const [search, setSearch] = useState("");
  const [seed, setSeed] = useState(readQuoteSeed);
  const quotes = useDeskQuotes(mode, mode === "author" ? search : "", seed);
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
      toast("Type a name — Einstein, Aurelius, Jobs");
      return;
    }
    setSearch(n);
    setMode("author");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-medium tracking-tight">Quotes</h2>
          <p className="text-xs text-muted-foreground">
            BrainyQuote daily feeds · new roll each session · search a person
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

      <form
        className="mb-5 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          goAuthor(person);
        }}
      >
        <Input
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          placeholder="Person — Einstein, Marcus Aurelius, Maya Angelou"
          className="h-11 min-w-0 flex-1"
          aria-label="Search quotes by person"
        />
        <Button type="submit" className="h-11">
          Search
        </Button>
      </form>

      <div className="scroll-auto mb-5 flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap">
        {POPULAR_AUTHORS.slice(0, 12).map((a) => (
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
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : quotes.isError ? (
        <p className="text-sm text-muted-foreground">
          Couldn’t reach BrainyQuote.{" "}
          <button type="button" className="underline" onClick={() => void quotes.refetch()}>
            Retry
          </button>
        </p>
      ) : !hero ? (
        <p className="text-sm text-muted-foreground">No quotes for that name. Try Einstein or Aurelius.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <QuoteCard q={hero} featured onPick={pin} />
          {rest.map((q) => (
            <QuoteCard key={`${q.author}-${q.text}`} q={q} onPick={pin} />
          ))}
        </div>
      )}
      {quotes.data?.from === "local" ? (
        <p className="mt-4 text-xs text-muted-foreground">
          BrainyQuote was quiet — showing the desk copy. Try again in a moment.
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">Sourced from BrainyQuote for personal use.</p>
      )}
    </div>
  );
}
