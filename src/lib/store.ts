import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  applyTx,
  demoBooks,
  emptyBooks,
  inferAccountKind,
  normalizeAccount,
  normalizeBooks,
  normalizeBudget,
  normalizeTx,
  toBooksFile,
  writeBooksSnap,
} from "./books";
import { fitBox, placeWindow } from "./desk";
import { fromManila, isAllDayEvent, manilaParts, NOTE_COLORS, uid } from "./format";
import { normalizeSort, normalizeTab } from "./market-board";
import type {
  Account,
  Books,
  Budget,
  CalendarEvent,
  Feed,
  FloatWin,
  MarketPrefs,
  ModuleId,
  Profile,
  QuoteCcy,
  StickyNote,
  Tx,
  ViewId,
  WatchItem,
  WidgetKind,
} from "./types";
import { DEFAULT_MARKET_PREFS, QUOTE_CCY, WATCH_CATALOG } from "./types";

export const DEFAULT_FEEDS: Feed[] = [
  {
    id: "gnews",
    name: "Top stories",
    url: "https://news.google.com/rss?hl=en-PH&gl=PH&ceid=PH:en",
    category: "Top",
    enabled: true,
  },
  {
    id: "bbc",
    name: "BBC World",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    category: "World",
    enabled: true,
  },
  {
    id: "verge",
    name: "The Verge",
    url: "https://www.theverge.com/rss/index.xml",
    category: "Tech",
    enabled: true,
  },
  {
    id: "rappler",
    name: "Rappler",
    url: "https://www.rappler.com/feed/",
    category: "PH",
    enabled: true,
  },
  {
    id: "bilyonaryo",
    name: "Bilyonaryo",
    url: "https://news.google.com/rss/search?q=site:bilyonaryo.com&hl=en-PH&gl=PH&ceid=PH:en",
    category: "PH",
    enabled: true,
  },
  {
    id: "x",
    name: "X",
    url: "https://news.google.com/rss/search?q=site:x.com&hl=en-PH&gl=PH&ceid=PH:en",
    category: "X",
    enabled: true,
  },
];

function withDefaultFeeds(feeds: Feed[]) {
  const have = new Set(feeds.map((f) => f.id));
  const extra = DEFAULT_FEEDS.filter((f) => !have.has(f.id));
  return extra.length ? [...feeds, ...extra] : feeds;
}

function seedEvents(): CalendarEvent[] {
  const { year, month, day } = manilaParts();
  const at = (d: number, h: number, min = 0) => fromManila(year, month, d, h, min).toISOString();
  return [
    {
      id: uid(),
      title: "Weekly planning",
      start: at(day, 9),
      end: at(day, 10),
      cat: "work",
      loc: "",
      source: "local",
    },
    {
      id: uid(),
      title: "Lunch at home",
      start: at(day, 12, 30),
      end: at(day, 14),
      cat: "family",
      loc: "Las Piñas",
      source: "local",
    },
    {
      id: uid(),
      title: "Deep work",
      start: at(day + 1, 14),
      end: at(day + 1, 17),
      cat: "work",
      loc: "",
      source: "local",
    },
    {
      id: uid(),
      title: "Gym",
      start: at(day + 2, 18),
      end: at(day + 2, 19),
      cat: "health",
      loc: "",
      source: "local",
    },
    {
      id: uid(),
      title: "Family day",
      start: fromManila(year, month, day + 3, 0).toISOString(),
      end: fromManila(year, month, day + 3, 23, 59).toISOString(),
      cat: "family",
      loc: "",
      source: "local",
      allDay: true,
    },
  ];
}

type Modules = Record<ModuleId, boolean>;

type Data = {
  profile: Profile;
  theme: "dark" | "light";
  view: ViewId;
  modules: Modules;
  events: CalendarEvent[];
  notes: StickyNote[];
  windows: FloatWin[];
  books: Books;
  accounts: Account[];
  budgets: Budget[];
  txs: Tx[];
  watch: WatchItem[];
  feeds: Feed[];
  quoteCcy: QuoteCcy;
  marketPrefs: MarketPrefs;
  railCollapsed: boolean;
};

type State = Data & {
  setView: (v: ViewId) => void;
  setTheme: (t: "dark" | "light") => void;
  toggleModule: (id: ModuleId) => void;
  setProfile: (p: Partial<Profile>) => void;
  addEvent: (e: CalendarEvent) => void;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  removeEvent: (id: string) => void;
  importEvents: (e: CalendarEvent[]) => number;
  addNote: (n: StickyNote) => void;
  updateNote: (id: string, patch: Partial<StickyNote>) => void;
  removeNote: (id: string) => void;
  pinNote: (id: string) => void;
  unpinNote: (id: string) => void;
  openWindow: (kind: WidgetKind) => void;
  updateWindow: (id: string, patch: Partial<FloatWin>) => void;
  closeWindow: (id: string) => void;
  closeAllWindows: () => void;
  raise: (kind: "note" | "win", id: string) => void;
  addTx: (t: Tx) => void;
  updateTx: (id: string, patch: Partial<Tx>) => void;
  removeTx: (id: string) => void;
  setAccounts: (a: Account[]) => void;
  addAccount: (a: Account) => void;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  removeAccount: (id: string, opts?: { unhook?: boolean }) => void;
  setBooks: (p: Partial<Books>) => void;
  replaceBooks: (file: { books: Books; accounts: Account[]; budgets: Budget[]; txs: Tx[] }, opts?: { snapshot?: boolean }) => void;
  clearBooks: () => void;
  reloadSampleBooks: () => void;
  addWatch: (item: WatchItem) => void;
  removeWatch: (id: string) => void;
  toggleWatchStar: (id: string) => void;
  updateWatch: (id: string, patch: Partial<WatchItem>) => void;
  setQuoteCcy: (ccy: QuoteCcy) => void;
  setMarketPrefs: (p: Partial<MarketPrefs>) => void;
  toggleFeed: (id: string) => void;
  addFeed: (f: Feed) => void;
  removeFeed: (id: string) => void;
  setRailCollapsed: (v: boolean) => void;
  reset: () => void;
};

const SPARK_RANGE_IDS = ["1d", "1w", "1m", "3m", "6m", "1y"] as const;

function windowSize(kind: WidgetKind) {
  if (kind === "calendar") return { w: 440, h: 540 };
  if (kind === "news") return { w: 360, h: 240 };
  if (kind === "weather") return { w: 320, h: 360 };
  if (kind === "finance") return { w: 340, h: 280 };
  return { w: 300, h: 240 };
}

function snapBooks(slice: Pick<Data, "books" | "accounts" | "budgets" | "txs">) {
  writeBooksSnap(toBooksFile(slice));
}

function initial(): Data {
  const demo = demoBooks("Eric");
  return {
    profile: { name: "Eric", city: "Las Piñas", lat: 14.4508, lon: 120.9828 },
    theme: "dark",
    view: "dashboard",
    modules: { calendar: true, notes: true, finance: true, news: true },
    events: seedEvents(),
    notes: [
      {
        id: uid(),
        text: "Ship Atrium v1\nCalendar ICS, finance, briefing",
        color: NOTE_COLORS[0],
        x: 36,
        y: 36,
        z: 1,
        w: 208,
        h: 176,
        pinned: false,
      },
      {
        id: uid(),
        text: "Read markets before 9am",
        color: NOTE_COLORS[3],
        x: 48,
        y: 220,
        z: 2,
        w: 208,
        h: 160,
        pinned: false,
      },
    ],
    windows: [],
    books: demo.books,
    accounts: demo.accounts,
    budgets: demo.budgets,
    txs: demo.txs,
    watch: WATCH_CATALOG.filter((w) => ["bdo", "sm", "jfc", "btc", "eth", "usdphp"].includes(w.id)),
    feeds: DEFAULT_FEEDS,
    quoteCcy: "PHP",
    marketPrefs: { ...DEFAULT_MARKET_PREFS },
    railCollapsed: false,
  };
}

function applyTheme(theme: "dark" | "light") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const already =
    root.classList.contains("light") === (theme === "light") && root.style.colorScheme === theme;
  const paint = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme === "light" ? "#f3efe6" : "#0c0c0d");
  };
  if (already) {
    paint();
    return;
  }
  const go = () => {
    root.classList.toggle("light", theme === "light");
    root.style.colorScheme = theme;
    paint();
  };
  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && typeof document.startViewTransition === "function") {
    document.startViewTransition(go);
  } else {
    go();
  }
}

function unhookTx(t: Tx, accountId: string): Tx {
  const hit = t.accountId === accountId || t.transferToId === accountId;
  if (!hit) return t;
  const next: Tx = { ...t };
  if (t.kind === "transfer" || t.transferToId) {
    next.kind = "expense";
    delete next.transferToId;
    if (next.amount > 0) next.amount = -Math.abs(next.amount);
  }
  if (t.accountId === accountId) delete next.accountId;
  return next;
}

export const useAtrium = create<State>()(
  persist(
    (set) => ({
      ...initial(),
      setView: (view) => set({ view }),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleModule: (id) =>
        set((s) => {
          if (id === "calendar") return s;
          const next = { ...s.modules, [id]: !s.modules[id] };
          const view = s.view === id && !next[id] ? "dashboard" : s.view;
          let windows = s.windows;
          if (id === "finance" && !next.finance) {
            windows = windows.filter((w) => w.kind !== "finance");
          }
          if (id === "news" && !next.news) {
            windows = windows.filter((w) => w.kind !== "news");
          }
          return { modules: next, view, windows };
        }),
      setProfile: (p) =>
        set((s) => {
          const next = { ...s.profile, ...p };
          const lat = Number(next.lat);
          const lon = Number(next.lon);
          next.lat = Number.isFinite(lat) ? lat : 14.4508;
          next.lon = Number.isFinite(lon) ? lon : 120.9828;
          return { profile: next };
        }),
      addEvent: (e) => set((s) => ({ events: [...s.events, e] })),
      updateEvent: (id, patch) =>
        set((s) => ({
          events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      removeEvent: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
      importEvents: (incoming) => {
        let added = 0;
        set((s) => {
          const ids = new Set(s.events.map((e) => e.id));
          const stamps = new Set(s.events.map((e) => `${e.start}|${e.title}`));
          const extra = incoming.filter((e) => {
            if (ids.has(e.id) || stamps.has(`${e.start}|${e.title}`)) return false;
            ids.add(e.id);
            stamps.add(`${e.start}|${e.title}`);
            return true;
          });
          added = extra.length;
          return extra.length ? { events: [...s.events, ...extra] } : s;
        });
        return added;
      },
      addNote: (n) => set((s) => ({ notes: [...s.notes, n] })),
      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      pinNote: (id) =>
        set((s) => {
          const z = nextZ(s);
          const n = s.windows.length;
          return {
            notes: s.notes.map((note) =>
              note.id === id
                ? {
                    ...note,
                    pinned: true,
                    z,
                    ...placeWindow({ w: note.w, h: note.h }, n),
                  }
                : note,
            ),
          };
        }),
      unpinNote: (id) =>
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, pinned: false, x: 32, y: 32 } : n)),
        })),
      openWindow: (kind) =>
        set((s) => {
          const existing = s.windows.find((w) => w.kind === kind);
          if (existing) {
            const z = nextZ(s);
            const fitted = fitBox(existing.x, existing.y, existing.w, existing.h);
            return { windows: s.windows.map((w) => (w.id === existing.id ? { ...w, z, ...fitted } : w)) };
          }
          const n = s.windows.length;
          return {
            windows: [
              ...s.windows,
              {
                id: uid(),
                kind,
                z: nextZ(s),
                ...placeWindow(windowSize(kind), n),
              },
            ],
          };
        }),
      updateWindow: (id, patch) =>
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        })),
      closeWindow: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),
      closeAllWindows: () => set({ windows: [] }),
      raise: (kind, id) =>
        set((s) => {
          const top = Math.max(0, ...s.notes.map((n) => n.z), ...s.windows.map((w) => w.z));
          const current =
            kind === "note"
              ? s.notes.find((n) => n.id === id)?.z
              : s.windows.find((w) => w.id === id)?.z;
          if (current === top) return s;
          const z = top + 1;
          if (kind === "note") {
            return { notes: s.notes.map((n) => (n.id === id ? { ...n, z } : n)) };
          }
          return { windows: s.windows.map((w) => (w.id === id ? { ...w, z } : w)) };
        }),
      addTx: (t) =>
        set((s) => {
          const accountId = t.accountId ?? s.accounts[0]?.id;
          const tx = { ...t, accountId };
          const accounts = applyTx(s.accounts, tx, 1);
          const next = { txs: [tx, ...s.txs], accounts };
          snapBooks({ books: s.books, budgets: s.budgets, ...next });
          return next;
        }),
      updateTx: (id, patch) =>
        set((s) => {
          const prev = s.txs.find((x) => x.id === id);
          if (!prev) return s;
          const nextTx = { ...prev, ...patch };
          const accounts = applyTx(applyTx(s.accounts, prev, -1), nextTx, 1);
          const txs = s.txs.map((x) => (x.id === id ? nextTx : x));
          snapBooks({ books: s.books, budgets: s.budgets, accounts, txs });
          return { txs, accounts };
        }),
      removeTx: (id) =>
        set((s) => {
          const t = s.txs.find((x) => x.id === id);
          const txs = s.txs.filter((x) => x.id !== id);
          const accounts = t ? applyTx(s.accounts, t, -1) : s.accounts;
          snapBooks({ books: s.books, budgets: s.budgets, accounts, txs });
          return { txs, accounts };
        }),
      setAccounts: (accounts) =>
        set((s) => {
          snapBooks({ books: s.books, accounts, budgets: s.budgets, txs: s.txs });
          return { accounts };
        }),
      addAccount: (a) =>
        set((s) => {
          const accounts = [...s.accounts, a];
          snapBooks({ books: s.books, accounts, budgets: s.budgets, txs: s.txs });
          return { accounts };
        }),
      updateAccount: (id, patch) =>
        set((s) => {
          const accounts = s.accounts.map((a) => {
            if (a.id !== id) return a;
            return (
              normalizeAccount({ ...a, ...patch, id }, 0) ?? {
                ...a,
                ...patch,
                id,
                kind: inferAccountKind({ ...a, ...patch, id }),
              }
            );
          });
          snapBooks({ books: s.books, accounts, budgets: s.budgets, txs: s.txs });
          return { accounts };
        }),
      removeAccount: (id, opts) =>
        set((s) => {
          if (s.accounts.length <= 1) return s;
          const accounts = s.accounts.filter((a) => a.id !== id);
          const txs = opts?.unhook ? s.txs.map((t) => unhookTx(t, id)) : s.txs.filter((t) => t.accountId !== id && t.transferToId !== id);
          snapBooks({ books: s.books, accounts, budgets: s.budgets, txs });
          return { accounts, txs };
        }),
      setBooks: (p) =>
        set((s) => {
          const books = { ...s.books, ...p };
          snapBooks({ books, accounts: s.accounts, budgets: s.budgets, txs: s.txs });
          return { books };
        }),
      replaceBooks: (file, opts) =>
        set(() => {
          const next = {
            books: normalizeBooks(file.books),
            accounts: file.accounts.map((a, i) => normalizeAccount(a, i)).filter((a): a is Account => Boolean(a)),
            budgets: file.budgets.map((b, i) => normalizeBudget(b, i)).filter((b): b is Budget => Boolean(b)),
            txs: file.txs.map((t, i) => normalizeTx(t, i)).filter((t): t is Tx => Boolean(t)),
          };
          if (opts?.snapshot !== false) snapBooks(next);
          return next;
        }),
      clearBooks: () =>
        set((s) => {
          const next = emptyBooks(s.books.name);
          snapBooks(next);
          return next;
        }),
      reloadSampleBooks: () =>
        set((s) => {
          const next = demoBooks(s.profile.name);
          snapBooks(next);
          return next;
        }),
      addWatch: (item) =>
        set((s) => {
          if (s.watch.some((w) => w.id === item.id || w.symbol === item.symbol)) return s;
          return { watch: [...s.watch, item] };
        }),
      removeWatch: (id) => set((s) => ({ watch: s.watch.filter((w) => w.id !== id) })),
      toggleWatchStar: (id) =>
        set((s) => ({
          watch: s.watch.map((w) => (w.id === id ? { ...w, starred: !w.starred } : w)),
        })),
      updateWatch: (id, patch) =>
        set((s) => ({
          watch: s.watch.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        })),
      setQuoteCcy: (quoteCcy) => set({ quoteCcy }),
      setMarketPrefs: (p) => set((s) => ({ marketPrefs: { ...s.marketPrefs, ...p } })),
      toggleFeed: (id) =>
        set((s) => ({
          feeds: s.feeds.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)),
        })),
      addFeed: (f) =>
        set((s) => {
          if (s.feeds.some((x) => x.url === f.url || x.id === f.id)) return s;
          return { feeds: [...s.feeds, f] };
        }),
      removeFeed: (id) => set((s) => ({ feeds: s.feeds.filter((f) => f.id !== id) })),
      setRailCollapsed: (railCollapsed) => set({ railCollapsed }),
      reset: () => {
        const next = initial();
        applyTheme(next.theme);
        set(next);
      },
    }),
    {
      name: "atrium.v1",
      version: 15,
      migrate: (persisted, version) => {
        let p = (persisted ?? {}) as Partial<Data>;
        if (version < 2) {
          const watch = [...(p.watch ?? [])];
          if (!watch.some((w) => w.id === "usdphp")) {
            const fx = WATCH_CATALOG.find((w) => w.id === "usdphp");
            if (fx) watch.push(fx);
          }
          p = {
            ...p,
            notes: (p.notes ?? []).map((n) => ({ ...n, pinned: false })),
            windows: [],
            watch,
          };
        }
        if (version < 3) {
          p = {
            ...p,
            feeds: withDefaultFeeds(p.feeds ?? []),
            windows: (p.windows ?? []).filter((w) => w.kind !== "agenda"),
          };
        }
        if (version < 4) {
          let watch = [...(p.watch ?? [])];
          for (const id of ["bdo", "sm", "jfc"] as const) {
            if (!watch.some((w) => w.id === id)) {
              const item = WATCH_CATALOG.find((w) => w.id === id);
              if (item) watch.push(item);
            }
          }
          p = { ...p, watch };
        }
        if (version < 5) {
          p = {
            ...p,
            feeds: withDefaultFeeds(p.feeds ?? []),
            quoteCcy: p.quoteCcy ?? "PHP",
          };
        }
        if (version < 6) {
          p = {
            ...p,
            events: (p.events ?? []).map((e) => ({
              ...e,
              allDay: e.allDay ?? (isAllDayEvent(e) || undefined),
            })),
          };
        }
        if (version < 14) {
          const demo = demoBooks(p.profile?.name ?? "Eric");
          const accounts = (p.accounts ?? demo.accounts)
            .map((a, i) => normalizeAccount(a, i))
            .filter((a): a is Account => Boolean(a));
          const txs = (p.txs ?? demo.txs)
            .map((t, i) => normalizeTx(t, i))
            .filter((t): t is Tx => Boolean(t));
          const budgets = (p.budgets ?? demo.budgets)
            .map((b, i) => normalizeBudget(b, i))
            .filter((b): b is Budget => Boolean(b));
          p = {
            ...p,
            books: normalizeBooks(p.books ?? demo.books),
            accounts: accounts.length ? accounts : demo.accounts,
            txs,
            budgets: budgets.length ? budgets : demo.budgets,
            marketPrefs: {
              ...DEFAULT_MARKET_PREFS,
              ...(p.marketPrefs ?? {}),
            },
          };
        }
        return p as Data;
      },
      partialize: (s) => ({
        profile: s.profile,
        theme: s.theme,
        view: s.view,
        modules: s.modules,
        events: s.events,
        notes: s.notes,
        windows: s.windows,
        books: s.books,
        accounts: s.accounts,
        budgets: s.budgets,
        txs: s.txs,
        watch: s.watch,
        feeds: s.feeds,
        quoteCcy: s.quoteCcy,
        marketPrefs: s.marketPrefs,
        railCollapsed: s.railCollapsed,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Data>;
        const rawView = (persisted as { view?: unknown } | null)?.view;
        const persistedView = typeof rawView === "string" ? rawView : "";
        const view: ViewId =
          persistedView === "modules"
            ? "options"
            : persistedView === "dashboard" ||
                persistedView === "calendar" ||
                persistedView === "notes" ||
                persistedView === "finance" ||
                persistedView === "quotes" ||
                persistedView === "news" ||
                persistedView === "options"
              ? persistedView
              : current.view;
        const rawLat = Number(p.profile?.lat ?? current.profile.lat);
        const rawLon = Number(p.profile?.lon ?? current.profile.lon);
        const demo = demoBooks(p.profile?.name ?? current.profile.name);
        const accounts = (p.accounts ?? current.accounts)
          .map((a, i) => normalizeAccount(a, i))
          .filter((a): a is Account => Boolean(a));
        const prefs = p.marketPrefs ?? current.marketPrefs;
        const sparkRaw = (prefs as { sparkRange?: string } | undefined)?.sparkRange ?? "";
        return {
          ...current,
          ...p,
          view,
          profile: {
            ...current.profile,
            ...(p.profile ?? {}),
            lat: Number.isFinite(rawLat) ? rawLat : 14.4508,
            lon: Number.isFinite(rawLon) ? rawLon : 120.9828,
          },
          windows: (p.windows ?? current.windows).map((w) => ({
            ...w,
            w: w.w ?? 300,
            h: w.h ?? 240,
          })),
          notes: (p.notes ?? current.notes).map((n) => ({
            ...n,
            w: n.w ?? 208,
            h: n.h ?? 176,
            pinned: n.pinned ?? false,
          })),
          books: normalizeBooks(p.books ?? current.books ?? demo.books),
          accounts: accounts.length ? accounts : current.accounts,
          budgets: p.budgets ?? current.budgets,
          txs: p.txs ?? current.txs,
          watch: p.watch ?? current.watch,
          feeds: withDefaultFeeds(p.feeds ?? current.feeds),
          quoteCcy: QUOTE_CCY.includes((p.quoteCcy as QuoteCcy) ?? "PHP")
            ? ((p.quoteCcy as QuoteCcy) ?? "PHP")
            : current.quoteCcy,
          railCollapsed: Boolean(p.railCollapsed ?? current.railCollapsed),
          marketPrefs: {
            ...DEFAULT_MARKET_PREFS,
            ...current.marketPrefs,
            ...prefs,
            tab: normalizeTab(prefs?.tab),
            sort: normalizeSort(prefs?.sort),
            sortDir: prefs?.sortDir === 1 ? 1 : -1,
            sparkRange: SPARK_RANGE_IDS.includes(sparkRaw as (typeof SPARK_RANGE_IDS)[number])
              ? (sparkRaw as MarketPrefs["sparkRange"])
              : "3m",
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme);
      },
    },
  ),
);

function nextZ(s: { notes: StickyNote[]; windows: FloatWin[] }) {
  return Math.max(1, ...s.notes.map((n) => n.z), ...s.windows.map((w) => w.z)) + 1;
}
