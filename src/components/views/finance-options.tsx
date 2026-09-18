"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  booksTitle,
  DESK_QUOTA,
  downloadText,
  formatBytes,
  parseBooksFile,
  readBooksSnap,
  registerCsv,
  registerRows,
  requestPersistentStorage,
  storageInfo,
  toBooksFile,
} from "@/lib/books";
import { deskZone, isoDate } from "@/lib/format";
import { PRIMARY_TABS, tabSortPatch } from "@/lib/market-board";
import { useAtrium } from "@/lib/store";
import { STOCK_TAPES } from "@/lib/types";
import { Chip } from "./finance-chip";

function stampLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString(deskZone().locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: deskZone().tz,
    });
  } catch {
    return iso;
  }
}

function PrefSwitch({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

export function DeskStorage() {
  const [store, setStore] = useState<{ used: number; quota: number; persisted: boolean | null }>({
    used: 0,
    quota: DESK_QUOTA,
    persisted: null,
  });

  useEffect(() => {
    void storageInfo().then(setStore);
  }, []);

  const quota = DESK_QUOTA;
  const pct = Math.min(100, Math.round((store.used / quota) * 100));

  return (
    <Card id="opt-storage" className="scroll-mt-4">
      <CardHeader>
        <CardTitle>Storage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This desk keeps a flat 10 GB on the device — same idea as Finance Manager. Used is Atrium’s
          own data here. There is no cloud.
        </p>
        <p className="text-sm font-medium">
          {formatBytes(store.used)} used of 10 GB
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {pct}% · {formatBytes(Math.max(0, quota - store.used))} free
        </p>
        <p className="text-xs text-muted-foreground">
          {store.persisted === true
            ? "This browser agreed to keep the desk."
            : store.persisted === false
              ? "Not persistent yet — the browser may evict data if storage is tight."
              : "Persistence unknown on this browser."}
        </p>
        {store.persisted !== true ? (
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await requestPersistentStorage();
              toast(ok ? "Browser will try to keep this desk" : "Browser declined persistence");
              void storageInfo().then(setStore);
            }}
          >
            Keep data on this device
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function FinanceOptions() {
  const {
    books,
    setBooks,
    accounts,
    budgets,
    txs,
    profile,
    setProfile,
    replaceBooks,
    clearBooks,
    reloadSampleBooks,
    marketPrefs,
    setMarketPrefs,
  } = useAtrium(
    useShallow((s) => ({
      books: s.books,
      setBooks: s.setBooks,
      accounts: s.accounts,
      budgets: s.budgets,
      txs: s.txs,
      profile: s.profile,
      setProfile: s.setProfile,
      replaceBooks: s.replaceBooks,
      clearBooks: s.clearBooks,
      reloadSampleBooks: s.reloadSampleBooks,
      marketPrefs: s.marketPrefs,
      setMarketPrefs: s.setMarketPrefs,
    })),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(books.name);
  const [owner, setOwner] = useState(profile.name);
  const [confirm, setConfirm] = useState<"restore" | "remove" | "reload" | null>(null);
  const [snapAt, setSnapAt] = useState<string | null>(null);

  const marketsOn = marketPrefs.showMarkets !== false;
  const booksOn = marketPrefs.showBooks !== false;

  useEffect(() => {
    setName(books.name);
  }, [books.name]);
  useEffect(() => {
    setOwner(profile.name);
  }, [profile.name]);
  useEffect(() => {
    setSnapAt(readBooksSnap()?.savedAt ?? null);
  }, [books, accounts, txs]);

  function currentFile() {
    return toBooksFile({ books, accounts, budgets, txs });
  }

  function saveFile() {
    const file = currentFile();
    downloadText(
      `atrium-books-${isoDate()}.json`,
      JSON.stringify(file, null, 2),
      "application/json",
    );
    toast("Books file downloaded");
  }

  async function openFile(file: File) {
    try {
      const parsed = parseBooksFile(await file.text());
      replaceBooks(parsed);
      toast("Books file opened");
      setSnapAt(readBooksSnap()?.savedAt ?? null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not restore.");
    }
  }

  function restoreSnap() {
    const snap = readBooksSnap();
    if (!snap) {
      toast("No local copy yet — post or save once and this browser will keep one.");
      return;
    }
    replaceBooks(snap, { snapshot: false });
    toast("Last local copy restored");
    setConfirm(null);
  }

  function exportCsv() {
    const rows = registerRows(txs, accounts, {
      accountId: "all",
      range: "all",
      flow: "all",
      query: "",
      month: isoDate().slice(0, 7),
      year: isoDate().slice(0, 4),
    });
    downloadText(`atrium-register-${isoDate()}.csv`, registerCsv(rows, accounts), "text/csv;charset=utf-8");
    toast("Register CSV downloaded");
  }

  function togglePane(key: "showMarkets" | "showBooks", next: boolean) {
    if (!next && (key === "showMarkets" ? !booksOn : !marketsOn)) {
      toast("Keep Markets or Books on");
      return;
    }
    if (key === "showMarkets") {
      setMarketPrefs({
        showMarkets: next,
        home: next ? marketPrefs.home : "books",
      });
      return;
    }
    setMarketPrefs({
      showBooks: next,
      home: next ? marketPrefs.home : "markets",
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Cash tabs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Turn Markets or Books off to hide that tab. Keep at least one on. Options stays.
          </p>
          <PrefSwitch
            label="Markets"
            hint="Watcher, tape, converter"
            checked={marketsOn}
            onCheckedChange={(v) => togglePane("showMarkets", v)}
          />
          <PrefSwitch
            label="Books"
            hint="Wallet, register, budgets"
            checked={booksOn}
            onCheckedChange={(v) => togglePane("showBooks", v)}
          />
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">Open Cash on</p>
            <div className="flex flex-wrap gap-2">
              {booksOn ? (
                <Chip active={marketPrefs.home === "books"} onClick={() => setMarketPrefs({ home: "books" })}>
                  Books
                </Chip>
              ) : null}
              {marketsOn ? (
                <Chip active={marketPrefs.home === "markets"} onClick={() => setMarketPrefs({ home: "markets" })}>
                  Markets
                </Chip>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {booksOn ? (
      <Card>
        <CardHeader>
          <CardTitle>Local profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="books-name">Books name</Label>
            <Input
              id="books-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => setBooks({ name: e.target.value.trim() || booksTitle(profile.name) })}
            />
            <p className="text-xs text-muted-foreground">Printed on the register and on a downloaded books file.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="books-owner">Owner</Label>
            <Input
              id="books-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              onBlur={(e) => setProfile({ name: e.target.value.trim() })}
              placeholder="Owner of these books"
            />
          </div>
        </CardContent>
      </Card>
      ) : null}

      {booksOn ? (
      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Wallet and register each have their own list or grid. Compact still keeps a full tap target.</p>
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">Accounts</p>
            <div className="flex flex-wrap gap-2">
              <Chip active={books.walletLayout !== "list"} onClick={() => setBooks({ walletLayout: "grid" })}>
                Grid
              </Chip>
              <Chip active={books.walletLayout === "list"} onClick={() => setBooks({ walletLayout: "list" })}>
                List
              </Chip>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">Register</p>
            <div className="flex flex-wrap gap-2">
              <Chip active={books.registerLayout === "grid"} onClick={() => setBooks({ registerLayout: "grid" })}>
                Grid
              </Chip>
              <Chip active={books.registerLayout !== "grid"} onClick={() => setBooks({ registerLayout: "list" })}>
                List
              </Chip>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip active={books.density === "comfortable"} onClick={() => setBooks({ density: "comfortable" })}>
              Comfortable
            </Chip>
            <Chip active={books.density === "compact"} onClick={() => setBooks({ density: "compact" })}>
              Compact
            </Chip>
          </div>
        </CardContent>
      </Card>
      ) : null}

      {marketsOn ? (
      <Card>
        <CardHeader>
          <CardTitle>Market board</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Watcher layout. USDT last shows coins in dollars with PHP on the line below. Spark range is 1D–1Y — coins
            from Binance, FX from Frankfurter, PSE names from this desk's tape. Yahoo still feeds the PSEi index.
          </p>
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">Stock tape</p>
            <div className="flex flex-wrap gap-2">
              {STOCK_TAPES.map((t) => (
                <Chip
                  key={t.id}
                  active={(marketPrefs.stockTape ?? "auto") === t.id}
                  onClick={() => setMarketPrefs({ stockTape: t.id })}
                >
                  {t.label}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {(STOCK_TAPES.find((t) => t.id === (marketPrefs.stockTape ?? "auto")) ?? STOCK_TAPES[0]).blurb}
            </p>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">Default board</p>
            <div className="flex flex-wrap gap-2">
              {PRIMARY_TABS.map((t) => (
                <Chip key={t.id} active={marketPrefs.tab === t.id} onClick={() => setMarketPrefs(tabSortPatch(t.id, { tab: marketPrefs.tab, sort: marketPrefs.sort }))}>
                  {t.label}
                </Chip>
              ))}
            </div>
          </div>
          <PrefSwitch
            label="Spark"
            hint="1D–1Y curve. Coins from Binance, FX from Frankfurter, PSE from this desk."
            checked={marketPrefs.spark}
            onCheckedChange={(v) => setMarketPrefs({ spark: v })}
          />
          <PrefSwitch
            label="PHP under last"
            hint="Peso line under coins, FX, and global stocks — not commodities"
            checked={marketPrefs.dualPhp}
            onCheckedChange={(v) => setMarketPrefs({ dualPhp: v })}
          />
          <PrefSwitch
            label="Convert commodities"
            hint="Show gold, oil, and metals in PHP under last. Off by default — those quotes stay in dollars."
            checked={marketPrefs.cmdtyPhp}
            onCheckedChange={(v) => setMarketPrefs({ cmdtyPhp: v })}
          />
          <PrefSwitch
            label="USDT last"
            hint="Coins in dollars, PHP underneath"
            checked={marketPrefs.cryptoUsdt}
            onCheckedChange={(v) => setMarketPrefs({ cryptoUsdt: v })}
          />
          <PrefSwitch
            label="Volume line"
            hint="Turnover under the name"
            checked={marketPrefs.showVol}
            onCheckedChange={(v) => setMarketPrefs({ showVol: v })}
          />
          <PrefSwitch
            label="Tape"
            hint="Strip of live last prices"
            checked={marketPrefs.showTape}
            onCheckedChange={(v) => setMarketPrefs({ showTape: v })}
          />
          <PrefSwitch
            label="Compact rows"
            hint="Tighter board rows"
            checked={marketPrefs.compact}
            onCheckedChange={(v) => setMarketPrefs({ compact: v })}
          />
        </CardContent>
      </Card>
      ) : null}

      {booksOn ? (
      <>
      <Card>
        <CardHeader>
          <CardTitle>Backup and restore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This JSON is these books — accounts, register, budgets. There is no cloud. Save writes a file you can move to another phone. Open replaces the books on this device. After every post this browser also keeps a local copy.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveFile}>Save books file</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              Open books file
            </Button>
            <Button variant="outline" onClick={() => setConfirm("restore")} disabled={!snapAt}>
              Restore last local copy
            </Button>
            <Button variant="outline" onClick={exportCsv}>
              Export register CSV
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void openFile(file);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {snapAt
              ? `Last local copy ${stampLabel(snapAt)}.`
              : "No local copy yet — post or save once and this browser will keep one."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sample data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Demo cash, checking, wallet, and a few register lines ship with Atrium. Remove sample clears the register. Restore last local copy brings the last automatic snapshot back without reload. Reload sample puts the demo back.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setConfirm("remove")}>
              Remove sample
            </Button>
            <Button variant="outline" onClick={() => setConfirm("reload")}>
              Reload sample
            </Button>
          </div>
        </CardContent>
      </Card>
      </>
      ) : null}

      <DeskStorage />

      <Dialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "restore"
                ? "Restore last local copy?"
                : confirm === "remove"
                  ? "Remove sample?"
                  : "Reload sample?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirm === "restore"
              ? "This replaces the books on this device with the last automatic snapshot."
              : confirm === "remove"
                ? "Deletes demo accounts and the register. Restore last local copy can bring them back."
                : "Replaces the current register with the demo books. The last local copy is kept."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm === "remove" ? "destructive" : "default"}
              onClick={() => {
                if (confirm === "restore") restoreSnap();
                if (confirm === "remove") {
                  clearBooks();
                  toast("Sample removed");
                  setConfirm(null);
                }
                if (confirm === "reload") {
                  reloadSampleBooks();
                  toast("Demo books restored");
                  setConfirm(null);
                }
              }}
            >
              {confirm === "restore" ? "Restore copy" : confirm === "remove" ? "Clear books" : "Reload demo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
