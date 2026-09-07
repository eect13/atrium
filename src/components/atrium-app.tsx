"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  LayoutGrid,
  Newspaper,
  NotebookPen,
  Settings2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { DesktopLayer } from "@/components/desktop-layer";
import { SaturnMark } from "@/components/atrium-mark";
import { ThemeSync, ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import { CalendarView } from "@/components/views/calendar-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { FinanceView } from "@/components/views/finance-view";
import { NewsView } from "@/components/views/news-view";
import { NotesView } from "@/components/views/notes-view";
import { OptionsView } from "@/components/views/options-view";
import { DeskMenu, WarmQueries } from "@/components/widgets";
import { fetchFeed } from "@/lib/feeds";
import { mixStories } from "@/lib/headline";
import { useAfterPaint } from "@/lib/boot";
import { TZ, NOTE_COLORS, isoDate, uid } from "@/lib/format";
import { parseWhen } from "@/lib/parse-when";
import { useAtrium } from "@/lib/store";
import type { Feed, NewsItem, ViewId } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV: {
  id: ViewId;
  label: string;
  short: string;
  icon: typeof LayoutGrid;
  module?: "notes" | "finance" | "news";
}[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", icon: LayoutGrid },
  { id: "calendar", label: "Calendar", short: "Cal", icon: CalendarDays },
  { id: "notes", label: "Notes", short: "Notes", icon: NotebookPen, module: "notes" },
  { id: "finance", label: "Finance", short: "Cash", icon: Wallet, module: "finance" },
  { id: "news", label: "News", short: "News", icon: Newspaper, module: "news" },
];

async function pullFeeds(list: Feed[]) {
  const batches = await Promise.allSettled(
    list.map((f) => fetchFeed({ data: { url: f.url, name: f.name, category: f.category } })),
  );
  const items: NewsItem[] = [];
  let failed = 0;
  for (const b of batches) {
    if (b.status === "fulfilled") items.push(...b.value);
    else failed += 1;
  }
  return { items, failed };
}

function ManilaClock() {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleString("en-PH", {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          timeZone: TZ,
        }),
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="hidden tabular-nums text-xs text-muted-foreground lg:inline">{clock}</span>
  );
}

export function AtriumApp() {
  const { view, setView, modules, addEvent, addNote, addTx, feeds } = useAtrium(
    useShallow((s) => ({
      view: s.view,
      setView: s.setView,
      modules: s.modules,
      addEvent: s.addEvent,
      addNote: s.addNote,
      addTx: s.addTx,
      feeds: s.feeds,
    })),
  );
  const [cmd, setCmd] = useState("");
  const queryClient = useQueryClient();
  const newsReady = useAfterPaint(900, view === "news");

  useEffect(() => {
    const ac = new AbortController();
    window.addEventListener(
      "keydown",
      (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          document.getElementById("omni")?.focus();
        }
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, []);

  const enabledIds = feeds.filter((f) => f.enabled).map((f) => f.id);
  const news = useQuery({
    queryKey: ["feeds", enabledIds],
    enabled: modules.news && (view === "news" || newsReady),
    queryFn: async () => {
      const enabled = feeds.filter((f) => f.enabled);
      const priority = enabled.filter((f) => f.id === "gnews" || f.id === "bbc" || f.id === "rappler");
      const rest = enabled.filter((f) => !priority.some((p) => p.id === f.id));
      const first = await pullFeeds(priority.length ? priority : enabled.slice(0, 2));
      if (rest.length) {
        void pullFeeds(rest).then((more) => {
          queryClient.setQueryData(
            ["feeds", enabledIds],
            mixStories([...first.items, ...more.items], 40),
          );
        });
      }
      if (!first.items.length && first.failed) throw new Error("feeds");
      return mixStories(first.items, 40);
    },
    staleTime: 15 * 60_000,
  });

  function runCommand(raw: string) {
    const s = raw.trim();
    if (!s) return;
    setCmd("");
    if (/^(note:|sticky:)/i.test(s)) {
      const text = s.replace(/^(note:|sticky:)/i, "").trim();
      if (!text) {
        toast("Write something after note:");
        return;
      }
      addNote({
        id: uid(),
        text,
        color: NOTE_COLORS[0],
        x: 40,
        y: 40,
        z: 99,
        w: 208,
        h: 176,
        pinned: false,
      });
      setView("notes");
      toast("Note added");
      return;
    }
    if (/^(spend|paid|expense)\s/i.test(s)) {
      const rest = s.replace(/^(spend|paid|expense)\s/i, "").trim();
      const num = rest.match(/-?\d[\d,]*(?:\.\d+)?/);
      if (!num) {
        toast("Need an amount — try spend 500 Grab");
        return;
      }
      const amount = -Math.abs(Number(num[0].replaceAll(",", "")));
      if (!Number.isFinite(amount) || amount === 0) {
        toast("Need an amount — try spend 500 Grab");
        return;
      }
      const payee =
        rest.replace(num[0], "").replace(/\s+/g, " ").trim() || "Expense";
      addTx({
        id: uid(),
        date: isoDate(),
        payee,
        amount,
        cat: "other",
      });
      setView("finance");
      toast("Logged expense");
      return;
    }
    const ev = parseWhen(s);
    addEvent({ id: uid(), ...ev, cat: "personal", loc: "", source: "local" });
    setView("calendar");
    toast("Event: " + ev.title);
  }

  const visible = NAV.filter((n) => !n.module || modules[n.module]);
  const title =
    view === "options" ? "Options" : (visible.find((n) => n.id === view)?.label ?? "Atrium");
  const headlines = news.data ?? [];

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-background text-foreground">
      <ThemeSync />
      <WarmQueries />
      <aside className="relative z-50 hidden w-56 shrink-0 flex-col border-r border-border bg-sidebar p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <SaturnMark className="size-6" />
          </div>
          <div>
            <p className="text-sm font-medium tracking-wide">Atrium</p>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Command center
            </p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {visible.map((n) => {
            const Icon = n.icon;
            const on = view === n.id;
            return (
              <button
                key={n.id}
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => setView(n.id)}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm",
                  on
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {n.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
          <button
            type="button"
            aria-current={view === "options" ? "page" : undefined}
            onClick={() => setView("options")}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm",
              view === "options"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Settings2 className="size-4" />
            Options
          </button>
          <p className="px-2 text-xs text-muted-foreground">Local-first · Asia/Manila</p>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="relative z-50 shrink-0 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-2 px-3 md:gap-3 md:px-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground md:hidden">
              <SaturnMark className="size-6" />
            </span>
            <p className="hidden text-sm font-medium sm:block">{title}</p>
            <div className="min-w-0 flex-1">
              <Input
                id="omni"
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runCommand(cmd);
                }}
                placeholder="Lunch Friday 1pm · note: buy rice · spend 500 Grab"
                className="h-10 bg-muted text-base md:text-sm"
                aria-label="Command bar"
              />
            </div>
            <ManilaClock />
            <DeskMenu />
            <ThemeToggle />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto bg-background p-4 md:p-6">
          {view === "dashboard" && (
            <DashboardView
              headlines={headlines}
              newsLoading={news.isPending}
              newsError={news.isError}
            />
          )}
          {view === "calendar" && <CalendarView />}
          {view === "notes" && modules.notes && <NotesView />}
          {view === "finance" && modules.finance && <FinanceView />}
          {view === "news" && modules.news && (
            <NewsView
              items={headlines}
              loading={news.isFetching}
              onRefresh={() => void news.refetch()}
            />
          )}
          {view === "options" && <OptionsView />}
        </main>
        <nav
          className="relative z-50 shrink-0 border-t border-border bg-muted px-1.5 pt-1.5 pb-dock md:hidden"
          aria-label="Sections"
        >
          <div className="flex gap-1">
            {visible.map((n) => {
              const Icon = n.icon;
              const on = view === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  aria-label={n.label}
                  aria-current={on ? "page" : undefined}
                  onClick={() => setView(n.id)}
                  className={cn(
                    "inline-flex min-h-11 min-w-14 shrink-0 flex-1 touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-md px-1.5 text-xs",
                    on ? "bg-background text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {n.short}
                </button>
              );
            })}
            <button
              type="button"
              aria-label="Options"
              aria-current={view === "options" ? "page" : undefined}
              onClick={() => setView("options")}
              className={cn(
                "inline-flex min-h-11 min-w-14 shrink-0 flex-1 touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-md px-1.5 text-xs",
                view === "options" ? "bg-background text-foreground" : "text-muted-foreground",
              )}
            >
              <Settings2 className="size-4" />
              Opts
            </button>
          </div>
        </nav>
      </div>

      <DesktopLayer headlines={headlines} newsLoading={news.isPending} newsError={news.isError} />
    </div>
  );
}
