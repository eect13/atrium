"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  LayoutGrid,
  Menu,
  Newspaper,
  NotebookPen,
  PanelLeft,
  PanelLeftClose,
  Quote,
  Search,
  Settings2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { DesktopLayer } from "@/components/desktop-layer";
import { AtriumBadge } from "@/components/atrium-mark";
import { ThemeSync, ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarView } from "@/components/views/calendar-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { FinanceView } from "@/components/views/finance-view";
import { NewsView } from "@/components/views/news-view";
import { NotesView } from "@/components/views/notes-view";
import { OptionsView } from "@/components/views/options-view";
import { QuotesView } from "@/components/views/quotes-view";
import { DeskMenu, WarmQueries } from "@/components/widgets";
import { fetchFeed } from "@/lib/feeds";
import { mixStories } from "@/lib/headline";
import { TZ, NOTE_COLORS, isoDate, uid } from "@/lib/format";
import { parseWhen } from "@/lib/parse-when";
import { useAtrium } from "@/lib/store";
import type { Feed, ModuleId, NewsItem, ViewId } from "@/lib/types";
import { cn } from "@/lib/utils";

const NEWS_SNAP = "atrium.news.snap";

function readNewsSnap(ids: string[]): NewsItem[] | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = JSON.parse(localStorage.getItem(NEWS_SNAP) ?? "null") as { key?: string; items?: NewsItem[] };
    if (!raw || raw.key !== ids.join(",") || !Array.isArray(raw.items) || !raw.items.length) return undefined;
    return raw.items;
  } catch {
    return undefined;
  }
}

function writeNewsSnap(ids: string[], items: NewsItem[]) {
  if (typeof localStorage === "undefined" || !items.length) return;
  try {
    localStorage.setItem(NEWS_SNAP, JSON.stringify({ key: ids.join(","), items }));
  } catch {
    /* quota */
  }
}

const NAV: {
  id: ViewId;
  label: string;
  icon: typeof LayoutGrid;
  module?: ModuleId;
}[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "notes", label: "Notes", icon: NotebookPen, module: "notes" },
  { id: "finance", label: "Finance", icon: Wallet, module: "finance" },
  { id: "quotes", label: "Quotes", icon: Quote },
  { id: "news", label: "News", icon: Newspaper, module: "news" },
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

function NavButton({
  label,
  icon: Icon,
  on,
  onClick,
  collapsed = false,
}: {
  label: string;
  icon: typeof LayoutGrid;
  on: boolean;
  onClick: () => void;
  collapsed?: boolean;
}) {
  const btn = (
    <button
      type="button"
      aria-current={on ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center rounded-md text-left text-sm transition-[background-color,color] duration-150 ease-out",
        collapsed ? "w-full justify-center px-0" : "gap-3 px-3",
        on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {collapsed ? null : <span className="font-medium">{label}</span>}
    </button>
  );
  if (!collapsed) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailFoot({
  optionsOn,
  onOptions,
  collapsed,
  onToggle,
}: {
  optionsOn: boolean;
  onOptions: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="mt-auto border-t border-border pt-3">
      <NavButton label="Options" icon={Settings2} on={optionsOn} onClick={onOptions} collapsed={collapsed} />
      {onToggle ? (
        <button
          type="button"
          className={cn(
            "mt-1 flex min-h-11 w-full items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
            collapsed ? "justify-center" : "gap-3 px-3",
          )}
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
          {collapsed ? null : <span className="text-sm">Collapse</span>}
        </button>
      ) : null}
      {collapsed ? null : <p className="px-3 pt-2 text-xs text-muted-foreground">Local-first · Asia/Manila</p>}
    </div>
  );
}

export function AtriumApp() {
  const { view, setView, modules, toggleModule, addEvent, addNote, addTx, feeds, railCollapsed, setRailCollapsed } = useAtrium(
    useShallow((s) => ({
      view: s.view,
      setView: s.setView,
      modules: s.modules,
      toggleModule: s.toggleModule,
      addEvent: s.addEvent,
      addNote: s.addNote,
      addTx: s.addTx,
      feeds: s.feeds,
      railCollapsed: s.railCollapsed,
      setRailCollapsed: s.setRailCollapsed,
    })),
  );
  const [cmd, setCmd] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const queryClient = useQueryClient();

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
    enabled: modules.news,
    queryFn: async () => {
      const enabled = feeds.filter((f) => f.enabled);
      const priority = enabled.filter((f) => f.id === "gnews" || f.id === "bbc" || f.id === "rappler");
      const rest = enabled.filter((f) => !priority.some((p) => p.id === f.id));
      const first = await pullFeeds(priority.length ? priority : enabled.slice(0, 2));
      if (rest.length) {
        void pullFeeds(rest).then((more) => {
          const mixed = mixStories([...first.items, ...more.items], 40);
          writeNewsSnap(enabledIds, mixed);
          queryClient.setQueryData(["feeds", enabledIds], mixed);
        });
      }
      if (!first.items.length && first.failed) throw new Error("feeds");
      const mixed = mixStories(first.items, 40);
      writeNewsSnap(enabledIds, mixed);
      return mixed;
    },
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    placeholderData: (prev) => prev ?? readNewsSnap(enabledIds),
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
      const payee = rest.replace(num[0], "").replace(/\s+/g, " ").trim() || "Expense";
      addTx({
        id: uid(),
        date: isoDate(),
        payee,
        amount,
        cat: "other",
        kind: "expense",
        status: "cleared",
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

  function go(id: ViewId) {
    const item = NAV.find((n) => n.id === id);
    if (item?.module && !modules[item.module]) toggleModule(item.module);
    setView(id);
    setMenuOpen(false);
  }

  const title = view === "options" ? "Options" : (NAV.find((n) => n.id === view)?.label ?? "Atrium");
  const headlines = news.data ?? [];
  const newsLoading = news.isPending && !headlines.length;

  const navButtons = NAV.map((n) => {
    const off = Boolean(n.module && !modules[n.module]);
    return (
      <NavButton
        key={n.id}
        label={off ? `${n.label} · off` : n.label}
        icon={n.icon}
        on={view === n.id}
        onClick={() => go(n.id)}
        collapsed={railCollapsed}
      />
    );
  });

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-background text-foreground">
      <ThemeSync />
      <WarmQueries />
      <aside
        className={cn(
          "relative z-50 hidden shrink-0 flex-col border-r border-border bg-sidebar lg:flex",
          railCollapsed ? "w-[4.5rem] p-2" : "w-56 p-4",
        )}
      >
        <div className={cn("mb-6 flex items-center gap-3", railCollapsed ? "justify-center px-0" : "px-2")}>
          <AtriumBadge />
          {railCollapsed ? null : (
            <div>
              <p className="text-sm font-medium tracking-wide">Atrium</p>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Command center</p>
            </div>
          )}
        </div>
        <nav
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-1",
            railCollapsed ? "overflow-hidden" : "scroll-auto",
          )}
          aria-label="Sections"
        >
          {navButtons}
        </nav>
        <RailFoot
          optionsOn={view === "options"}
          onOptions={() => go("options")}
          collapsed={railCollapsed}
          onToggle={() => setRailCollapsed(!railCollapsed)}
        />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex flex-col bg-sidebar">
          <div className="mb-6 flex items-center gap-3 pr-10">
            <AtriumBadge />
            <div>
              <SheetTitle className="text-sm font-medium tracking-wide">Atrium</SheetTitle>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                Command center
              </p>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1" aria-label="All sections">
            {NAV.map((n) => {
              const off = Boolean(n.module && !modules[n.module]);
              return (
                <NavButton
                  key={n.id}
                  label={off ? `${n.label} · off` : n.label}
                  icon={n.icon}
                  on={view === n.id}
                  onClick={() => go(n.id)}
                />
              );
            })}
          </nav>
          <RailFoot optionsOn={view === "options"} onOptions={() => go("options")} />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="relative z-50 shrink-0 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
          <div className="flex h-14 items-center gap-2 px-3 md:gap-3 md:px-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted lg:hidden"
                  aria-label="Open menu"
                  aria-expanded={menuOpen}
                  aria-haspopup="dialog"
                  onClick={() => setMenuOpen(true)}
                >
                  <Menu className="size-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Menu</TooltipContent>
            </Tooltip>
            <p className="shrink-0 font-display text-lg leading-none lg:hidden">{title}</p>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Input
                    id="omni"
                    value={cmd}
                    onChange={(e) => setCmd(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") runCommand(cmd);
                    }}
                    placeholder="Command — event, note:, or spend"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-10 bg-muted pl-9 pr-12 text-base md:pr-16 md:text-sm"
                    aria-label="Command bar"
                  />
                </TooltipTrigger>
                <TooltipContent>Lunch Friday 1pm · note: buy rice · spend 500 Grab</TooltipContent>
              </Tooltip>
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-sm border border-border bg-background px-1.5 font-mono text-[0.65rem] leading-5 text-muted-foreground md:inline">
                ⌘K
              </kbd>
            </div>
            <ManilaClock />
            <DeskMenu />
            <ThemeToggle />
          </div>
        </header>
        <main className="scroll-auto min-h-0 flex-1 bg-background p-4 pb-dock md:p-6 lg:pb-6">
          {view === "dashboard" && (
            <DashboardView headlines={headlines} newsLoading={newsLoading} newsError={news.isError} />
          )}
          {view === "calendar" && <CalendarView />}
          {view === "notes" && modules.notes && <NotesView />}
          {view === "finance" && modules.finance && <FinanceView />}
          {view === "quotes" && <QuotesView />}
          {view === "news" && modules.news && (
            <NewsView items={headlines} loading={news.isFetching} onRefresh={() => void news.refetch()} />
          )}
          {view === "options" && <OptionsView />}
        </main>
      </div>

      <DesktopLayer headlines={headlines} newsLoading={newsLoading} newsError={news.isError} />
    </div>
  );
}
