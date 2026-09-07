import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Account,
  Budget,
  CalendarEvent,
  Feed,
  FloatWin,
  ModuleId,
  Profile,
  QuoteCcy,
  StickyNote,
  Tx,
  ViewId,
  WatchItem,
  WidgetKind,
} from "./types";
import { QUOTE_CCY, WATCH_CATALOG } from "./types";
import { fitBox, placeWindow } from "./desk";
import { addDays, fromManila, isoDate, isAllDayEvent, manilaParts, NOTE_COLORS, uid } from "./format";

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
  const at = (d: number, h: number, min = 0) =>
    fromManila(year, month, d, h, min).toISOString();
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
  accounts: Account[];
  budgets: Budget[];
  txs: Tx[];
  watch: WatchItem[];
  feeds: Feed[];
  quoteCcy: QuoteCcy;
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
  removeTx: (id: string) => void;
  setAccounts: (a: Account[]) => void;
  addWatch: (item: WatchItem) => void;
  removeWatch: (id: string) => void;
  setQuoteCcy: (ccy: QuoteCcy) => void;
  toggleFeed: (id: string) => void;
  addFeed: (f: Feed) => void;
  reset: () => void;
};

function windowSize(kind: WidgetKind) {
  if (kind === "calendar") return { w: 440, h: 540 };
  if (kind === "news") return { w: 360, h: 240 };
  if (kind === "weather") return { w: 320, h: 360 };
  if (kind === "finance") return { w: 340, h: 280 };
  return { w: 300, h: 240 };
}

function initial(): Data {
  const now = new Date();
  const today = isoDate(now);
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
    accounts: [
      { id: "cash", name: "Cash", balance: 8500 },
      { id: "bank", name: "BDO checking", balance: 126400 },
      { id: "gcash", name: "GCash", balance: 4320 },
    ],
    budgets: [
      { id: "food", name: "Food", limit: 15000 },
      { id: "trans", name: "Transport", limit: 4000 },
      { id: "bills", name: "Bills", limit: 18000 },
      { id: "fun", name: "Discretionary", limit: 6000 },
    ],
    txs: [
      { id: uid(), date: today, payee: "Grocery — S&R", amount: -2850, cat: "food", accountId: "cash" },
      { id: uid(), date: today, payee: "Salary", amount: 72000, cat: "income", accountId: "bank" },
      {
        id: uid(),
        date: isoDate(addDays(now, -1)),
        payee: "Grab",
        amount: -248,
        cat: "trans",
        accountId: "gcash",
      },
      {
        id: uid(),
        date: isoDate(addDays(now, -2)),
        payee: "Meralco",
        amount: -4200,
        cat: "bills",
        accountId: "bank",
      },
    ],
    watch: WATCH_CATALOG.filter((w) =>
      ["bdo", "sm", "jfc", "btc", "eth", "usdphp"].includes(w.id),
    ),
    feeds: DEFAULT_FEEDS,
    quoteCcy: "PHP",
  };
}

function applyTheme(theme: "dark" | "light") {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const already =
    root.classList.contains("light") === (theme === "light") &&
    root.style.colorScheme === theme;
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
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce && typeof document.startViewTransition === "function") {
    document.startViewTransition(go);
  } else {
    go();
  }
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
      removeEvent: (id) =>
        set((s) => ({ events: s.events.filter((e) => e.id !== id) })),
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
      addNote: (n) =>
        set((s) => ({
          notes: [...s.notes, n],
        })),
      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        })),
      removeNote: (id) =>
        set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
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
      closeWindow: (id) =>
        set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),
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
          return {
            txs: [tx, ...s.txs],
            accounts: accountId
              ? s.accounts.map((a) =>
                  a.id === accountId ? { ...a, balance: a.balance + tx.amount } : a,
                )
              : s.accounts,
          };
        }),
      removeTx: (id) =>
        set((s) => {
          const t = s.txs.find((x) => x.id === id);
          return {
            txs: s.txs.filter((x) => x.id !== id),
            accounts: t?.accountId
              ? s.accounts.map((a) =>
                  a.id === t.accountId ? { ...a, balance: a.balance - t.amount } : a,
                )
              : s.accounts,
          };
        }),
      setAccounts: (accounts) => set({ accounts }),
      addWatch: (item) =>
        set((s) => {
          if (s.watch.some((w) => w.id === item.id || w.symbol === item.symbol)) return s;
          return { watch: [...s.watch, item] };
        }),
      removeWatch: (id) =>
        set((s) => ({ watch: s.watch.filter((w) => w.id !== id) })),
      setQuoteCcy: (quoteCcy) => set({ quoteCcy }),
      toggleFeed: (id) =>
        set((s) => ({
          feeds: s.feeds.map((f) =>
            f.id === id ? { ...f, enabled: !f.enabled } : f,
          ),
        })),
      addFeed: (f) => set((s) => ({ feeds: [...s.feeds, f] })),
      reset: () => {
        const next = initial();
        applyTheme(next.theme);
        set(next);
      },
    }),
    {
      name: "atrium.v1",
      version: 6,
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
        accounts: s.accounts,
        budgets: s.budgets,
        txs: s.txs,
        watch: s.watch,
        feeds: s.feeds,
        quoteCcy: s.quoteCcy,
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
                persistedView === "news" ||
                persistedView === "options"
              ? persistedView
              : current.view;
        const rawLat = Number(p.profile?.lat ?? current.profile.lat);
        const rawLon = Number(p.profile?.lon ?? current.profile.lon);
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
          watch: p.watch ?? current.watch,
          feeds: withDefaultFeeds(p.feeds ?? current.feeds),
          quoteCcy: QUOTE_CCY.includes((p.quoteCcy as QuoteCcy) ?? "PHP")
            ? ((p.quoteCcy as QuoteCcy) ?? "PHP")
            : current.quoteCcy,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state?.theme) applyTheme(state.theme);
      },
    },
  ),
);

function nextZ(s: { notes: StickyNote[]; windows: FloatWin[] }) {
  return (
    Math.max(1, ...s.notes.map((n) => n.z), ...s.windows.map((w) => w.z)) + 1
  );
}
