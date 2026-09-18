"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CloudSun,
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
import { Component, lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { AtriumBadge } from "@/components/atrium-mark";
import { ThemeSync, ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
const DesktopLayer = lazy(() =>
  import("@/components/desktop-layer").then((m) => ({ default: m.DesktopLayer })),
);
const DashboardView = lazy(() =>
  import("@/components/views/dashboard-view").then((m) => ({ default: m.DashboardView })),
);
const CalendarView = lazy(() =>
  import("@/components/views/calendar-view").then((m) => ({ default: m.CalendarView })),
);
const NotesView = lazy(() =>
  import("@/components/views/notes-view").then((m) => ({ default: m.NotesView })),
);
const OptionsView = lazy(() =>
  import("@/components/views/options-view").then((m) => ({ default: m.OptionsView })),
);
const FinanceView = lazy(() =>
  import("@/components/views/finance-view").then((m) => ({ default: m.FinanceView })),
);
const NewsView = lazy(() =>
  import("@/components/views/news-view").then((m) => ({ default: m.NewsView })),
);
const QuotesView = lazy(() =>
  import("@/components/views/quotes-view").then((m) => ({ default: m.QuotesView })),
);
const WeatherView = lazy(() =>
  import("@/components/views/weather-view").then((m) => ({ default: m.WeatherView })),
);
const WarmQueries = lazy(() =>
  import("@/components/warm-queries").then((m) => ({ default: m.WarmQueries })),
);
import { DeskMenu } from "@/components/desk-chrome";
import { resolveCommand, suggestCommands } from "@/lib/desk-search";
import { fetchFeed } from "@/lib/feeds";
import { mixStories } from "@/lib/headline";
import { NOTE_COLORS, deskZone, isoDate, uid } from "@/lib/format";
import { applyDeskRegion, regionOf } from "@/lib/region";
import { useModHint } from "@/lib/keys";
import { parseWhen } from "@/lib/parse-when";
import { useAtrium } from "@/lib/store";
import { tabSortPatch } from "@/lib/market-board";
import type { Feed, ModuleId, NewsItem, ViewId } from "@/lib/types";
import { DEFAULT_TAGLINE } from "@/lib/types";
import { rememberMainWindow } from "@/lib/native-session";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";


class ViewCrash extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("Atrium view crashed", err, info.componentStack);
  }
  render() {
    if (this.state.err) {
      return (
        <div className="p-6 text-sm">
          <p className="font-medium">This tab crashed.</p>
          <p className="mt-1 text-muted-foreground">{this.state.err.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  if (typeof localStorage === "undefined") return;
  try {
    if (!ids.length || !items.length) {
      localStorage.removeItem(NEWS_SNAP);
      return;
    }
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
  { id: "weather", label: "Weather", icon: CloudSun, module: "weather" },
  { id: "notes", label: "Notes", icon: NotebookPen, module: "notes" },
  { id: "finance", label: "Finance", icon: Wallet, module: "finance" },
  { id: "quotes", label: "Quotes", icon: Quote, module: "quotes" },
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

function ViewFallback() {
  const region = useAtrium((s) => s.profile.region);
  const z = deskZone();
  const today = new Date();
  return (
    <div className="p-1">
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">Today</p>
      <p className="mt-1 font-display text-2xl font-medium tracking-tight">
        {today.toLocaleDateString(z.locale, {
          weekday: "long",
          month: "long",
          day: "numeric",
          timeZone: z.tz,
        })}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {today.toLocaleDateString(z.locale, { year: "numeric", timeZone: z.tz })}
        {` · ${regionOf(region).name}`}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
    </div>
  );
}

function DeskClock() {
  const region = useAtrium((s) => s.profile.region);
  const [clock, setClock] = useState("");
  useEffect(() => {
    applyDeskRegion(region);
    const tick = () => {
      const z = deskZone();
      const r = regionOf(region);
      setClock(
        `${new Date().toLocaleString(z.locale, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          timeZone: z.tz,
        })} · ${r.id}`,
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [region]);
  return (
    <>
      <span className="tabular-nums text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground lg:hidden">
        {regionOf(region).id}
      </span>
      <span className="hidden tabular-nums text-xs text-muted-foreground lg:inline">{clock}</span>
    </>
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
  tagline,
  onTagline,
}: {
  optionsOn: boolean;
  onOptions: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
  tagline: string;
  onTagline: (v: string) => void;
}) {
  const [draft, setDraft] = useState(tagline);
  useEffect(() => {
    setDraft(tagline);
  }, [tagline]);
  return (
    <div className="mt-auto border-t border-border pt-3">
      {onToggle ? (
        <button
          type="button"
          className={cn(
            "flex min-h-11 w-full items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
            collapsed ? "justify-center" : "gap-3 px-3",
          )}
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
          {collapsed ? null : <span className="text-sm">Collapse</span>}
        </button>
      ) : null}
      <NavButton label="Options" icon={Settings2} on={optionsOn} onClick={onOptions} collapsed={collapsed} />
      {collapsed ? null : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onTagline(draft.trim() || DEFAULT_TAGLINE)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          maxLength={48}
          aria-label="Sidebar tagline"
          placeholder="Tagline"
          className="mt-1 w-full bg-transparent px-3 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus:text-foreground"
        />
      )}
    </div>
  );
}

export function AtriumApp() {
  const {
    view,
    setView,
    modules,
    toggleModule,
    addEvent,
    addNote,
    addTx,
    feeds,
    railCollapsed,
    setRailCollapsed,
    profile,
    setProfile,
    setMarketPrefs,
    setBoardQuery,
    setBoardFocus,
    marketPrefs,
  } = useAtrium(
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
      profile: s.profile,
      setProfile: s.setProfile,
      setMarketPrefs: s.setMarketPrefs,
      setBoardQuery: s.setBoardQuery,
      setBoardFocus: s.setBoardFocus,
      marketPrefs: s.marketPrefs,
    })),
  );
  const [cmd, setCmd] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [hit, setHit] = useState(-1);
  const [omniBox, setOmniBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const omniWrap = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const modHint = useModHint();
  const hits = useMemo(() => suggestCommands(cmd), [cmd]);

  useLayoutEffect(() => {
    const el = omniWrap.current;
    if (!el || !cmd.trim() || !hits.length) {
      setOmniBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setOmniBox({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [cmd, hits.length]);

  useEffect(() => {
    setHit(-1);
  }, [cmd]);

  useEffect(() => rememberMainWindow(), []);

  useEffect(() => {
    const dash = window.setTimeout(() => {
      void import("@/components/views/dashboard-view");
    }, 50);
    const rest = window.setTimeout(() => {
      void import("@/components/views/finance-view");
      void import("@/components/views/weather-view");
    }, 400);
    return () => {
      window.clearTimeout(dash);
      window.clearTimeout(rest);
    };
  }, []);

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

  useEffect(() => {
    const ac = new AbortController();
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!omniWrap.current?.contains(e.target as Node)) setHit(-1);
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, []);

  const enabledIds = feeds.filter((f) => f.enabled).map((f) => f.id);
  const newsOn = modules.news && enabledIds.length > 0;
  const news = useQuery({
    queryKey: ["feeds", enabledIds],
    enabled: newsOn,
    queryFn: async () => {
      const enabled = feeds.filter((f) => f.enabled);
      if (!enabled.length) return [];
      const items: NewsItem[] = [];
      let failed = 0;
      const size = 4;
      for (let i = 0; i < enabled.length; i += size) {
        const batch = await pullFeeds(enabled.slice(i, i + size));
        items.push(...batch.items);
        failed += batch.failed;
        if (i + size < enabled.length && items.length) {
          const mixed = mixStories(items, 40);
          writeNewsSnap(enabledIds, mixed);
          queryClient.setQueryData(["feeds", enabledIds], mixed);
        }
      }
      if (!items.length && failed) throw new Error("feeds");
      const mixed = mixStories(items, 40);
      writeNewsSnap(enabledIds, mixed);
      return mixed;
    },
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    placeholderData: (prev) => {
      if (!newsOn) return [];
      return prev ?? readNewsSnap(enabledIds);
    },
  });

  function runCommand(raw: string) {
    const s = raw.trim();
    if (!s) return;
    setCmd("");
    const cmd = resolveCommand(s);
    if (cmd.type === "note") {
      if (!cmd.text) {
        toast("Write something after note:");
        return;
      }
      addNote({
        id: uid(),
        text: cmd.text,
        color: NOTE_COLORS[0],
        x: 40,
        y: 40,
        z: 99,
        w: 208,
        h: 176,
        pinned: false,
      });
      if (!modules.notes) toggleModule("notes");
      setView("notes");
      toast("Note added");
      return;
    }
    if (cmd.type === "spend") {
      addTx({
        id: uid(),
        date: isoDate(),
        payee: cmd.payee,
        amount: cmd.amount,
        cat: "other",
        kind: "expense",
        status: "cleared",
      });
      if (!modules.finance) toggleModule("finance");
      setMarketPrefs({ home: "books", showBooks: true });
      setView("finance");
      toast("Logged expense");
      return;
    }
    if (cmd.type === "view") {
      go(cmd.view);
      return;
    }
    if (cmd.type === "ticker") {
      if (!modules.finance) toggleModule("finance");
      setMarketPrefs({ ...tabSortPatch(cmd.tab, { tab: marketPrefs.tab, sort: marketPrefs.sort }), home: "markets", showMarkets: true });
      setBoardQuery(cmd.item.label);
      setBoardFocus(cmd.item.symbol);
      setView("finance");
      toast(cmd.item.label);
      return;
    }
    if (cmd.type === "search") {
      if (!modules.finance) toggleModule("finance");
      setMarketPrefs({ home: "markets", showMarkets: true });
      setBoardQuery(cmd.query);
      setBoardFocus(null);
      setView("finance");
      toast(`Search “${cmd.query}”`);
      return;
    }
    if (cmd.type === "event") {
      const ev = parseWhen(cmd.text);
      addEvent({ id: uid(), ...ev, cat: "personal", loc: "", source: "local" });
      setView("calendar");
      toast("Event: " + ev.title);
      return;
    }
    toast("Nothing matched — try BDO, finance, or Lunch Friday 1pm");
  }

  function go(id: ViewId) {
    const item = NAV.find((n) => n.id === id);
    if (item?.module && !modules[item.module]) toggleModule(item.module);
    setView(id);
    setMenuOpen(false);
  }

  const title = view === "options" ? "Options" : (NAV.find((n) => n.id === view)?.label ?? "Atrium");
  const headlines = newsOn ? (news.data ?? []) : [];
  const newsLoading = newsOn && news.isLoading && !headlines.length;

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
      <Suspense fallback={null}>
        <WarmQueries />
      </Suspense>
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
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{`v${APP_VERSION}`}</p>
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
          tagline={profile.tagline}
          onTagline={(tagline) => setProfile({ tagline })}
        />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex flex-col bg-sidebar">
          <div className="mb-6 flex items-center gap-3 pr-10">
            <AtriumBadge />
            <div>
              <SheetTitle className="text-sm font-medium tracking-wide">Atrium</SheetTitle>
              <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                {`v${APP_VERSION}`}
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
          <RailFoot
            optionsOn={view === "options"}
            onOptions={() => go("options")}
            onToggle={() => {
              setRailCollapsed(true);
              setMenuOpen(false);
            }}
            tagline={profile.tagline}
            onTagline={(tagline) => setProfile({ tagline })}
          />
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
            <p className="sr-only">{title}</p>
            <div className="relative min-w-0 flex-1" ref={omniWrap}>
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Input
                    id="omni"
                    value={cmd}
                    onChange={(e) => setCmd(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" && hits.length) {
                        e.preventDefault();
                        setHit((i) => (i + 1) % hits.length);
                        return;
                      }
                      if (e.key === "ArrowUp" && hits.length) {
                        e.preventDefault();
                        setHit((i) => (i <= 0 ? hits.length - 1 : i - 1));
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setCmd("");
                        setHit(-1);
                        return;
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const pick = hit >= 0 ? hits[hit] : undefined;
                        runCommand(pick?.fill ?? cmd);
                      }
                    }}
                    placeholder="Search"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-10 bg-muted pl-9 pr-3 text-base md:pr-16 md:text-sm"
                    aria-label="Command bar"
                    aria-autocomplete="list"
                    aria-expanded={Boolean(cmd.trim() && hits.length)}
                    aria-controls="omni-hits"
                  />
                </TooltipTrigger>
                <TooltipContent>BDO · finance · note: buy rice · Lunch Friday 1pm</TooltipContent>
              </Tooltip>
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-sm border border-border bg-background px-1.5 font-mono text-[0.65rem] leading-5 text-muted-foreground md:inline">
                {modHint}
              </kbd>
              {cmd.trim() && hits.length && omniBox ? (
                <ul
                  id="omni-hits"
                  role="listbox"
                  style={{ top: omniBox.top, left: omniBox.left, width: omniBox.width }}
                  className="fixed z-[80] max-h-72 overflow-auto rounded-md border border-border bg-card py-1 shadow-[var(--shadow-border)]"
                >
                  {hits.map((h, i) => (
                    <li key={h.id} role="option" aria-selected={i === hit}>
                      <button
                        type="button"
                        className={cn(
                          "flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm",
                          i === hit ? "bg-muted" : "hover:bg-muted",
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          runCommand(h.fill);
                        }}
                      >
                        <span className="truncate">{h.label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{h.hint}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <DeskClock />
            <DeskMenu />
            <ThemeToggle />
          </div>
        </header>
        <main className="scroll-auto min-h-0 min-w-0 flex-1 bg-background p-3 pb-dock md:p-5 lg:p-6 lg:pb-6">
          <ViewCrash>
          {view === "dashboard" && (
            <Suspense fallback={<ViewFallback />}>
              <DashboardView headlines={headlines} newsLoading={newsLoading} newsError={news.isError} />
            </Suspense>
          )}
          {view === "calendar" && (
            <Suspense fallback={<ViewFallback />}>
              <CalendarView />
            </Suspense>
          )}
          {view === "weather" && modules.weather !== false && (
            <Suspense fallback={<ViewFallback />}>
              <WeatherView />
            </Suspense>
          )}
          {view === "notes" && modules.notes && (
            <Suspense fallback={<ViewFallback />}>
              <NotesView />
            </Suspense>
          )}
          {view === "finance" && modules.finance && (
            <Suspense fallback={<ViewFallback />}>
              <FinanceView />
            </Suspense>
          )}
          {view === "quotes" && modules.quotes && (
            <Suspense fallback={<ViewFallback />}>
              <QuotesView />
            </Suspense>
          )}
          {view === "news" && modules.news && (
            <Suspense fallback={<ViewFallback />}>
              <NewsView
              items={headlines}
              loading={news.isFetching}
              error={news.isError}
              onRefresh={() => void news.refetch()}
            />
            </Suspense>
          )}
          {view === "options" && (
            <Suspense fallback={<ViewFallback />}>
              <OptionsView />
            </Suspense>
          )}
          </ViewCrash>
        </main>
      </div>

      <div className="pointer-events-none fixed inset-0 z-40 hidden lg:block">
        <Suspense fallback={null}>
          <DesktopLayer headlines={headlines} newsLoading={newsLoading} newsError={news.isError} />
        </Suspense>
      </div>
    </div>
  );
}
