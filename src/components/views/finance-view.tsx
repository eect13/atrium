"use client";

import { useState } from "react";
import { FloatBtn } from "@/components/widgets";
import { useAtrium } from "@/lib/store";
import { FinanceBooks } from "./finance-books";
import { Chip } from "./finance-chip";
import { FinanceMarkets } from "./finance-markets";
import { FinanceOptions } from "./finance-options";

type Pane = "books" | "markets" | "options";

export function FinanceView() {
  const booksName = useAtrium((s) => s.books.name);
  const home = useAtrium((s) => s.marketPrefs.home) ?? "markets";
  const [pane, setPane] = useState<Pane>(home);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-medium tracking-tight">
            {pane === "markets" ? "Markets" : pane === "options" ? "Books options" : booksName}
          </h2>
          <p className="text-xs text-muted-foreground">
            {pane === "markets"
              ? "Watcher, tape, converter — all on this device."
              : pane === "options"
                ? "Backup, density, sample — all on this device."
                : "Register, wallet, backup — all on this device."}
          </p>
        </div>
        <FloatBtn kind="finance" />
        <div className="grow" />
        <div className="flex flex-wrap gap-2">
          <Chip active={pane === "markets"} onClick={() => setPane("markets")}>
            Markets
          </Chip>
          <Chip active={pane === "books"} onClick={() => setPane("books")}>
            Books
          </Chip>
          <Chip active={pane === "options"} onClick={() => setPane("options")}>
            Options
          </Chip>
        </div>
      </div>
      {pane === "markets" ? <FinanceMarkets /> : pane === "books" ? <FinanceBooks /> : <FinanceOptions />}
    </div>
  );
}
