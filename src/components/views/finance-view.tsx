"use client";

import { useEffect, useState } from "react";
import { FloatBtn } from "@/components/widgets";
import { useAtrium } from "@/lib/store";
import { FinanceBooks } from "./finance-books";
import { Chip } from "./finance-chip";
import { FinanceMarkets } from "./finance-markets";
import { FinanceOptions } from "./finance-options";

type Pane = "books" | "markets" | "options";

function clampPane(
  pane: Pane,
  marketsOn: boolean,
  booksOn: boolean,
  home: "books" | "markets",
): Pane {
  if (pane === "options") return "options";
  if (pane === "markets" && marketsOn) return "markets";
  if (pane === "books" && booksOn) return "books";
  if (home === "markets" && marketsOn) return "markets";
  if (booksOn) return "books";
  if (marketsOn) return "markets";
  return "options";
}

export function FinanceView() {
  const booksName = useAtrium((s) => s.books.name);
  const prefs = useAtrium((s) => s.marketPrefs);
  const boardFocus = useAtrium((s) => s.boardFocus);
  const marketsOn = prefs.showMarkets !== false;
  const booksOn = prefs.showBooks !== false;
  const home = prefs.home === "books" ? "books" : "markets";
  const [pane, setPane] = useState<Pane>(() => clampPane(home, marketsOn, booksOn, home));
  const shown = clampPane(pane, marketsOn, booksOn, home);

  useEffect(() => {
    setPane((p) => clampPane(p, marketsOn, booksOn, home));
  }, [marketsOn, booksOn, home]);

  useEffect(() => {
    if (boardFocus && marketsOn) setPane("markets");
  }, [boardFocus, marketsOn]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-medium tracking-tight sm:text-2xl">
            {shown === "markets" ? "Markets" : shown === "options" ? "Books options" : booksName}
          </h2>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {shown === "markets"
              ? "Watcher, tape, converter — all on this device."
              : shown === "options"
                ? "Backup, density, sample — all on this device."
                : "Register, wallet, backup — all on this device."}
          </p>
        </div>
        <FloatBtn kind="finance" />
        <div className="grow" />
        <div className="flex flex-wrap gap-2">
          {marketsOn ? (
            <Chip active={shown === "markets"} onClick={() => setPane("markets")}>
              Markets
            </Chip>
          ) : null}
          {booksOn ? (
            <Chip active={shown === "books"} onClick={() => setPane("books")}>
              Books
            </Chip>
          ) : null}
          <Chip active={shown === "options"} onClick={() => setPane("options")}>
            Options
          </Chip>
        </div>
      </div>
      {shown === "markets" ? <FinanceMarkets /> : shown === "books" ? <FinanceBooks /> : <FinanceOptions />}
    </div>
  );
}
