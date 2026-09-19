"use client";

import { useEffect, useState } from "react";
import { FloatBtn } from "@/components/desk-chrome";
import { useAtrium } from "@/lib/store";
import { FinanceBooks } from "./finance-books";
import { Chip } from "./finance-chip";
import { FinanceAnalyze } from "./finance-analyze";
import { FinanceMarkets } from "./finance-markets";
import { FinanceOptions } from "./finance-options";

type Pane = "books" | "markets" | "options" | "analyze";

function clampPane(
  pane: Pane,
  marketsOn: boolean,
  booksOn: boolean,
  home: "books" | "markets",
): Pane {
  if (pane === "options") return "options";
  if (pane === "analyze") return "analyze";
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
  const analyzeSeed = useAtrium((s) => s.analyzeSeed);
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

  useEffect(() => {
    if (analyzeSeed) setPane("analyze");
  }, [analyzeSeed]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-medium tracking-tight sm:text-2xl">
            {shown === "markets"
              ? "Markets"
              : shown === "analyze"
                ? "Analyze"
                : shown === "options"
                  ? "Options"
                  : booksName}
          </h2>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {shown === "markets"
              ? "Watcher, tape, converter — all on this device."
              : shown === "analyze"
                ? "CFA-style take. You ask — it does not run itself."
                : shown === "options"
                  ? "Cash tabs, board, backup — all on this device."
                  : "Register, wallet, backup — all on this device."}
          </p>
        </div>
        <div className="grow" />
        <div className="flex flex-wrap gap-2">
          {marketsOn ? (
            <Chip active={shown === "markets"} onClick={() => setPane("markets")}>
              Markets
            </Chip>
          ) : null}
          <Chip active={shown === "analyze"} onClick={() => setPane("analyze")}>
            Analyze
          </Chip>
          {booksOn ? (
            <Chip active={shown === "books"} onClick={() => setPane("books")}>
              Books
            </Chip>
          ) : null}
          <Chip active={shown === "options"} onClick={() => setPane("options")}>
            Options
          </Chip>
        </div>
        <FloatBtn kind="finance" />
      </div>
      {shown === "markets" ? (
        <FinanceMarkets />
      ) : shown === "analyze" ? (
        <FinanceAnalyze />
      ) : shown === "books" ? (
        <FinanceBooks />
      ) : (
        <FinanceOptions />
      )}
    </div>
  );
}
