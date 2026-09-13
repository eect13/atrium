import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  applyTx,
  booksTitle,
  demoBooks,
  emptyBooks,
  inferAccountKind,
  normalizeAccount,
  normalizeBooks,
  normalizeBudget,
  normalizeTx,
  toBooksFile,
  withoutCvc,
  writeBooksSnap,
} from "./books";
import { fitBox, placeWindow } from "./desk";
import { fromManila, isAllDayEvent, manilaParts, NOTE_COLORS, staleTagline, uid } from "./format";
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
  NotesLayout,
  Profile,
  QuoteCcy,
  StickyNote,
  Tx,
  CalMode,
  ViewId,
  WatchItem,
  WidgetKind,
} from "./types";
import { applyDeskRegion, DEFAULT_REGION, regionOf } from "./region";
import { normalizeScreen, normalizeScreenCap, normalizeScreenPe, normalizeScreenVol, normalizeScreenYld } from "./screener";
import { DEFAULT_DASH, DASH_SPAN_N, normalizeDash, normalizeDashSpan, type DashCard } from "./dash";
import { asNewsFilter, asNewsTag } from "./headline";
import { FEED_PACKS, NEWS_CATALOG } from "./feeds";
import { DEFAULT_MARKET_PREFS, DEFAULT_TAGLINE, QUOTE_CCY, WATCH_CATALOG, withFactoryGlobals, normalizeStockTape } from "./types";

const STARTER_FEED_IDS = ["inquirer", "philstar", "rappler", "bilyonaryo", "inq-biz", "bbc", "gnews"] as const;

export const DEFAULT_FEEDS: Feed[] = NEWS_CATALOG.map((f) => ({
  ...f,
  enabled: (STARTER_FEED_IDS as readonly string[]).includes(f.id),
}));

function withDefaultFeeds(feeds: Feed[]) {
  const have = new Set(feeds.map((f) => f.id));
  const extra = DEFAULT_FEEDS.filter((f) => !have.has(f.id));
  const catalog = new Map(DEFAULT_FEEDS.map((f) => [f.id, f]));
  const next = extra.length ? [...feeds, ...extra] : feeds;
  return next.map((f) => {
    const def = catalog.get(f.id);
    return {
      ...f,
      name: def?.name ?? f.name,
      url: def?.url ?? f.url,
      category: asNewsTag(def?.category ?? f.category),
    };
  });
}

function seedStarterFeeds(feeds: Feed[]) {
  const next = withDefaultFeeds(feeds);
  if (next.some((f) => f.enabled)) return next;
  return next.map((f) => ({ ...f, enabled: (STARTER_FEED_IDS as readonly string[]).includes(f.id) }));
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
      title: "Focus block",
      start: at(day, 14),
      end: at(day, 16),
      cat: "work",
      loc: "",
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
      title: "Open day",
      start: fromManila(year, month, day + 3, 0).toISOString(),
      end: fromManila(year, month, day + 3, 23, 59).toISOString(),
      cat: "personal",
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
  notesLayout: NotesLayout;
  windows: FloatWin[];
  books: Books;
  accounts: Account[];
  budgets: Budget[];
  txs: Tx[];
  watch: WatchItem[];
  feeds: Feed[];
  quoteCcy: QuoteCcy;
  marketPrefs: MarketPrefs;
  dashOrder: DashCard[];
  dashLocked: boolean;
  dashSpan: Partial<Record<DashCard, number>>;
  calPeek: "auto" | "month" | "week";
  newsQuery: string;
  newsTag: string;
  railCollapsed: boolean;
  boardQuery: string;
  boardFocus: string | null;
  calMode: CalMode;
  calCursor: string;
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
  setNotesLayout: (v: NotesLayout) => void;
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
  updateBudget: (id: string, patch: Partial<Budget>) => void;
  addBudget: (b: Budget) => void;
  removeBudget: (id: string) => void;
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
  setDashOrder: (order: DashCard[]) => void;
  setDashLocked: (v: boolean) => void;
  setDashSpan: (id: DashCard, n: number) => void;
  resetDash: () => void;
  setCalPeek: (v: "auto" | "month" | "week") => void;
  setNewsQuery: (q: string) => void;
  setNewsTag: (t: string) => void;
  toggleFeed: (id: string) => void;
  setFeedPack: (packId: string, on: boolean) => void;
  addFeed: (f: Feed) => void;
  removeFeed: (id: string) => void;
  setRailCollapsed: (v: boolean) => void;
  setBoardQuery: (q: string) => void;
  setBoardFocus: (id: string | null) => void;
  setCalMode: (v: CalMode) => void;
  setCalCursor: (iso: string) => void;
  reset: () => void;
  wipeProfile: () => void;
};

const SPARK_RANGE_IDS = ["1d", "1w", "1m", "3m", "6m", "1y"] as const;

function asCoord(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asProfile(raw?: Partial<Profile> | null, fallback?: Profile): Profile {
  const name = typeof raw?.name === "string" ? raw.name : (fallback?.name ?? "");
  const city = typeof raw?.city === "string" ? raw.city : (fallback?.city ?? "");
  const demo = name === "Eric" && (city === "Las Piñas" || city === "Las Pinas");
  const line = typeof raw?.tagline === "string" ? raw.tagline.trim() : (fallback?.tagline ?? "");
  const tagline = staleTagline(line) || (fallback?.tagline ? staleTagline(fallback.tagline) : "");
  if (demo) return { name: "", city: "", lat: null, lon: null, tagline, region: DEFAULT_REGION };
  return {
    name,
    city,
    lat: asCoord(raw?.lat ?? fallback?.lat),
    lon: asCoord(raw?.lon ?? fallback?.lon),
    tagline,
    region: regionOf(raw?.region ?? fallback?.region).id,
  };
}

function asBooksName(books: Books | undefined, profileName: string): Books | undefined {
  if (!books) return books;
  if (books.name === "Eric — personal books" || books.name === "Eric - personal books") {
    return { ...books, name: booksTitle(profileName) };
  }
  return books;
}

function windowSize(kind: WidgetKind) {
  if (kind === "calendar") return { w: 460, h: 580 };
  if (kind === "news") return { w: 360, h: 240 };
  if (kind === "weather") return { w: 320, h: 360 };
  if (kind === "finance") return { w: 340, h: 280 };
  return { w: 300, h: 240 };
}

function snapBooks(slice: Pick<Data, "books" | "accounts" | "budgets" | "txs">) {
  writeBooksSnap(toBooksFile(slice));
}

function demoDesk(): Data {
  const demo = demoBooks();
  return {
    ...blankDesk(),
    events: seedEvents(),
    notes: [
      {
        id: uid(),
        text: "Welcome to Atrium\nName the desk in Options.",
        color: NOTE_COLORS[0],
        x: 36,
        y: 36,
        z: 1,
        w: 208,
        h: 200,
        pinned: false,
      },
      {
        id: uid(),
        text: "Pin a city for weather",
        color: NOTE_COLORS[3],
        x: 248,
        y: 48,
        z: 2,
        w: 208,
        h: 176,
        pinned: false,
      },
    ],
    books: demo.books,
    accounts: demo.accounts,
    budgets: demo.budgets,
    txs: demo.txs,
    watch: WATCH_CATALOG.filter((w) => ["bdo", "sm", "jfc", "btc", "eth", "usdphp", "spx", "gold"].includes(w.id)),
  };
}

function initial(): Data { return blankDesk(); }

function blankDesk(): Data {
  const empty = emptyBooks("");
  return {
    profile: { name: "", city: "", lat: null, lon: null, tagline: DEFAULT_TAGLINE, region: DEFAULT_REGION },
    theme: "dark",
    view: "dashboard",
    modules: { calendar: true, notes: true, finance: true, news: true, quotes: true },
    events: [],
    notes: [],
    notesLayout: "board",
    windows: [],
    books: empty.books,
    accounts: empty.accounts,
    budgets: empty.budgets,
    txs: empty.txs,
    watch: [],
    feeds: NEWS_CATALOG.map((f) => ({ ...f, enabled: false })),
    quoteCcy: "PHP",
    marketPrefs: { ...DEFAULT_MARKET_PREFS },
    dashOrder: [...DEFAULT_DASH],
    dashLocked: true,
    dashSpan: {},
    calPeek: "auto",
    newsQuery: "",
    newsTag: "All",
    railCollapsed: false,
    boardQuery: "",
    boardFocus: null,
    calMode: "month",
    calCursor: "",
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
          if (id === "quotes" && !next.quotes) {
            windows = windows.filter((w) => w.kind !== "quote");
          }
          return { modules: next, view, windows };
        }),
      setProfile: (p) =>
        set((s) => {
          const next = { ...s.profile, ...p };
          next.lat = asCoord(next.lat);
          next.lon = asCoord(next.lon);
          const line = typeof next.tagline === "string" ? next.tagline.trim() : "";
          next.tagline = (line || DEFAULT_TAGLINE).slice(0, 48);
          if (typeof next.name === "string") next.name = next.name.trim();
          if (typeof next.city === "string") next.city = next.city.trim();
          next.region = regionOf(next.region).id;
          applyDeskRegion(next.region);
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
      setNotesLayout: (notesLayout) => set({ notesLayout }),
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
      updateBudget: (id, patch) =>
        set((s) => {
          const budgets = s.budgets.map((b) => (b.id === id ? { ...b, ...patch } : b));
          snapBooks({ books: s.books, accounts: s.accounts, budgets, txs: s.txs });
          return { budgets };
        }),
      addBudget: (b) =>
        set((s) => {
          if (s.budgets.some((x) => x.id === b.id)) return s;
          const budgets = [...s.budgets, b];
          snapBooks({ books: s.books, accounts: s.accounts, budgets, txs: s.txs });
          return { budgets };
        }),
      removeBudget: (id) =>
        set((s) => {
          const budgets = s.budgets.filter((b) => b.id !== id);
          snapBooks({ books: s.books, accounts: s.accounts, budgets, txs: s.txs });
          return { budgets };
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
      setDashOrder: (order) => set({ dashOrder: normalizeDash(order) }),
      setDashLocked: (dashLocked) => set({ dashLocked }),
      setDashSpan: (id, n) =>
        set((s) => {
          const next = { ...s.dashSpan };
          if (n === DASH_SPAN_N[id]) delete next[id];
          else next[id] = n;
          return { dashSpan: next };
        }),
      resetDash: () => set({ dashOrder: [...DEFAULT_DASH], dashSpan: {} }),
      setCalPeek: (calPeek) => set({ calPeek }),
      setNewsQuery: (newsQuery) => set({ newsQuery }),
      setNewsTag: (newsTag) => set({ newsTag }),
      toggleFeed: (id) =>
        set((s) => ({
          feeds: s.feeds.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)),
        })),
      setFeedPack: (packId, on) =>
        set((s) => {
          const pack = FEED_PACKS.find((p) => p.id === packId);
          if (!pack) return s;
          const ids = new Set(pack.ids);
          return { feeds: s.feeds.map((f) => (ids.has(f.id) ? { ...f, enabled: on } : f)) };
        }),
      addFeed: (f) =>
        set((s) => {
          if (s.feeds.some((x) => x.url === f.url || x.id === f.id)) return s;
          return { feeds: [...s.feeds, f] };
        }),
      removeFeed: (id) => set((s) => ({ feeds: s.feeds.filter((f) => f.id !== id) })),
      setRailCollapsed: (railCollapsed) => set({ railCollapsed }),
      setBoardQuery: (boardQuery) => set({ boardQuery }),
      setBoardFocus: (boardFocus) => set({ boardFocus }),
      setCalMode: (calMode) => set({ calMode }),
      setCalCursor: (calCursor) => set({ calCursor }),
      reset: () => {
        const next = demoDesk();
        applyTheme(next.theme);
        set(next);
      },
      wipeProfile: () => {
        const next = blankDesk();
        applyTheme(next.theme);
        set(next);
      },
    }),
    {
      name: "atrium.v1",
      version: 27,
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
          const demo = demoBooks(p.profile?.name ?? "");
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
        if (version < 16) {
          const prev = p.profile;
          const line = typeof prev?.tagline === "string" ? prev.tagline.trim() : "";
          p = {
            ...p,
            profile: {
              name: prev?.name ?? "",
              city: prev?.city ?? "",
              lat: asCoord(prev?.lat),
              lon: asCoord(prev?.lon),
              tagline: (line || DEFAULT_TAGLINE).slice(0, 48),
              region: DEFAULT_REGION,
            },
          };
        }
        if (version < 17) {
          const prev = p.profile;
          const demoSeed = prev?.name === "Eric" && prev?.city === "Las Piñas";
          const rawLine = typeof prev?.tagline === "string" ? prev.tagline.trim() : "";
          const tagline =
            !rawLine || rawLine === "Local-first · Asia/Manila" ? DEFAULT_TAGLINE : rawLine.slice(0, 48);
          p = {
            ...p,
            feeds: withDefaultFeeds(p.feeds ?? []),
            profile: demoSeed
              ? { name: "", city: "", lat: null, lon: null, tagline, region: DEFAULT_REGION }
              : {
                  name: prev?.name ?? "",
                  city: prev?.city ?? "",
                  lat: asCoord(prev?.lat),
                  lon: asCoord(prev?.lon),
                  tagline,
                  region: DEFAULT_REGION,
                },
            books:
              p.books?.name === "Eric — personal books"
                ? { ...p.books, name: booksTitle() }
                : p.books,
          };
        }
        if (version < 18) {
          p = {
            ...p,
            feeds: withDefaultFeeds(p.feeds ?? []),
            profile: asProfile(p.profile),
            books: asBooksName(p.books, p.profile?.name ?? "") ?? p.books,
          };
        }
        if (version < 19) {
          p = {
            ...p,
            feeds: withDefaultFeeds(p.feeds ?? []).map((f) => ({ ...f, enabled: false })),
          };
        }
        if (version < 20) {
          p = {
            ...p,
            notesLayout: p.notesLayout === "list" ? "list" : "board",
            accounts: (p.accounts ?? []).map((a) => (a ? withoutCvc(a) : a)),
            books: p.books ? normalizeBooks(p.books) : p.books,
          };
        }
        if (version < 21) {
          p = { ...p, watch: withFactoryGlobals(p.watch ?? []) };
        }
        if (version < 22) {
          p = {
            ...p,
            modules: {
              calendar: true,
              notes: true,
              finance: true,
              news: true,
              quotes: true,
              ...(p.modules ?? {}),
            },
          };
        }
        if (version < 23) {
          p = {
            ...p,
            dashOrder: normalizeDash(p.dashOrder),
            marketPrefs: {
              ...DEFAULT_MARKET_PREFS,
              ...(p.marketPrefs ?? {}),
              stockTape: normalizeStockTape((p.marketPrefs as { stockTape?: string } | undefined)?.stockTape),
            },
          };
        }
        if (version < 24) {
          const prev = p.profile;
          p = {
            ...p,
            dashLocked: p.dashLocked !== false,
            dashSpan: normalizeDashSpan(p.dashSpan),
            calPeek: p.calPeek === "month" || p.calPeek === "week" || p.calPeek === "auto" ? p.calPeek : "auto",
            newsQuery: typeof p.newsQuery === "string" ? p.newsQuery : "",
            newsTag: asNewsFilter(typeof p.newsTag === "string" ? p.newsTag : "All"),
            profile: prev
              ? { ...prev, tagline: staleTagline(prev.tagline) }
              : prev,
          };
        }
        if (version < 25) {
          const peek = p.calPeek;
          p = {
            ...p,
            calPeek: peek === "month" || peek === "week" || peek === "auto" ? peek : "auto",
          };
        }
        if (version < 26) {
          p = {
            ...p,
            boardQuery: typeof p.boardQuery === "string" ? p.boardQuery : "",
            boardFocus: typeof p.boardFocus === "string" ? p.boardFocus : null,
            calMode: p.calMode === "week" || p.calMode === "day" || p.calMode === "agenda" || p.calMode === "month" ? p.calMode : "month",
            calCursor: typeof p.calCursor === "string" ? p.calCursor : "",
          };
        }
        if (version < 27) {
          p = { ...p, feeds: seedStarterFeeds(p.feeds ?? []) };
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
        notesLayout: s.notesLayout,
        windows: s.windows,
        books: s.books,
        accounts: s.accounts.map(withoutCvc),
        budgets: s.budgets,
        txs: s.txs,
        watch: s.watch,
        feeds: s.feeds,
        quoteCcy: s.quoteCcy,
        marketPrefs: s.marketPrefs,
        dashOrder: s.dashOrder,
        dashLocked: s.dashLocked,
        dashSpan: s.dashSpan,
        calPeek: s.calPeek,
        newsQuery: s.newsQuery,
        newsTag: s.newsTag,
        railCollapsed: s.railCollapsed,
        boardQuery: s.boardQuery,
        boardFocus: s.boardFocus,
        calMode: s.calMode,
        calCursor: s.calCursor,
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
        const demo = demoBooks(p.profile?.name ?? current.profile.name);
        const accounts = (p.accounts ?? current.accounts)
          .map((a, i) => normalizeAccount(a, i))
          .filter((a): a is Account => Boolean(a));
        const prefs = p.marketPrefs ?? current.marketPrefs;
        const sparkRaw = (prefs as { sparkRange?: string } | undefined)?.sparkRange ?? "";
        const profile = asProfile(p.profile, current.profile);
        const booksRaw = asBooksName(p.books ?? current.books, profile.name);
        return {
          ...current,
          ...p,
          view,
          boardQuery: typeof p.boardQuery === "string" ? p.boardQuery : current.boardQuery,
          boardFocus: typeof p.boardFocus === "string" || p.boardFocus === null ? p.boardFocus : current.boardFocus,
          calMode: p.calMode === "week" || p.calMode === "day" || p.calMode === "agenda" || p.calMode === "month" ? p.calMode : (current as Data).calMode ?? "month",
          calCursor: typeof p.calCursor === "string" ? p.calCursor : (current as Data).calCursor ?? "",
          profile,
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
          notesLayout: p.notesLayout === "list" ? "list" : "board",
          books: normalizeBooks(booksRaw ?? current.books ?? demo.books),
          accounts: (accounts.length ? accounts : current.accounts).map(withoutCvc),
          budgets: p.budgets ?? current.budgets,
          txs: p.txs ?? current.txs,
          watch: p.watch ?? current.watch,
          feeds: withDefaultFeeds(p.feeds ?? current.feeds),
          quoteCcy: QUOTE_CCY.includes((p.quoteCcy as QuoteCcy) ?? "PHP")
            ? ((p.quoteCcy as QuoteCcy) ?? "PHP")
            : current.quoteCcy,
          railCollapsed: Boolean(p.railCollapsed ?? current.railCollapsed),
          dashOrder: normalizeDash(p.dashOrder ?? current.dashOrder),
          dashLocked: (p.dashLocked ?? current.dashLocked) !== false,
          dashSpan: normalizeDashSpan(p.dashSpan ?? current.dashSpan),
          calPeek: ((p.calPeek ?? current.calPeek) === "month" || (p.calPeek ?? current.calPeek) === "week" || (p.calPeek ?? current.calPeek) === "auto") ? (p.calPeek ?? current.calPeek) as "auto" | "month" | "week" : "auto",
          newsQuery: typeof p.newsQuery === "string" ? p.newsQuery : current.newsQuery,
          newsTag: asNewsFilter(typeof p.newsTag === "string" ? p.newsTag : current.newsTag),
          modules: {
            calendar: true,
            notes: (p.modules?.notes ?? current.modules.notes) !== false,
            finance: (p.modules?.finance ?? current.modules.finance) !== false,
            news: (p.modules?.news ?? current.modules.news) !== false,
            quotes: (p.modules?.quotes ?? current.modules.quotes) !== false,
          },
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
            showMarkets: prefs?.showMarkets !== false,
            showBooks: prefs?.showBooks !== false,
            cmdtyPhp: prefs?.cmdtyPhp === true,
            stockTape: normalizeStockTape((prefs as { stockTape?: string } | undefined)?.stockTape),
            screen: normalizeScreen((prefs as { screen?: string } | undefined)?.screen),
            screenPe: normalizeScreenPe((prefs as { screenPe?: string } | undefined)?.screenPe),
            screenCap: normalizeScreenCap((prefs as { screenCap?: string } | undefined)?.screenCap),
            screenVol: normalizeScreenVol((prefs as { screenVol?: string } | undefined)?.screenVol),
            screenYld: normalizeScreenYld((prefs as { screenYld?: string } | undefined)?.screenYld),
          },
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme);
        applyDeskRegion(state?.profile?.region);
      },
    },
  ),
);

function nextZ(s: { notes: StickyNote[]; windows: FloatWin[] }) {
  return Math.max(1, ...s.notes.map((n) => n.z), ...s.windows.map((w) => w.z)) + 1;
}
