import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { applyRealmPatch, realmRole, realmStorage, topLevelDiff, type Patch } from "./realm-sync.ts";
import { normalizeDashPrefs, widgetLook, WIDGET_DEFAULTS, WIDGET_OPTION_ROWS } from "./widget-prefs.ts";
import { cardAlpha, snapBox } from "./desk-snap.ts";
import { googleStatusRow } from "./calendar/google-status.ts";

const root = new URL("../../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

type Win = { id: string; x: number; y: number; onTop?: boolean };
type S = { theme: string; view: string; windows: Win[]; setTheme: (t: string) => void; setView: (v: string) => void; move: (id: string, x: number, y: number) => void };

/** One shared localStorage (with cross-realm storage events) + main/float realms like the app. */
function world() {
  const data = new Map<string, string>();
  const realms: { role: "main" | "float"; onStorage: () => void }[] = [];
  const base = (self: number): StateStorage => ({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
      realms.forEach((r, i) => i !== self && r.onStorage());
    },
    removeItem: (k) => void data.delete(k),
  });
  let main: ReturnType<typeof make> | null = null;
  const send = (p: Patch) => main!.setState(applyRealmPatch(main!.getState() as unknown as Record<string, unknown>, p) as Partial<S>);
  // Card 208: floats only move windows main opened, so main is seeded with them.
  function make(role: "main" | "float", seed: Win[] = [], storage: (i: number) => StateStorage = (i) => realmStorage(base(i), role, send)) {
    const idx = realms.length;
    const st = createStore<S>()(
      persist(
        (set) => ({
          theme: "dark",
          view: "dashboard",
          windows: seed,
          setTheme: (theme) => set({ theme }),
          setView: (view) => set({ view }),
          move: (id, x, y) => set((s) => ({ windows: s.windows.some((w) => w.id === id) ? s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)) : [...s.windows, { id, x, y }] })),
        }),
        { name: "atrium.v1", storage: createJSONStorage(() => storage(idx)), partialize: ({ theme, view, windows }) => ({ theme, view, windows }) as unknown as S },
      ),
    );
    realms.push({ role, onStorage: () => void st.persist.rehydrate() });
    if (role === "main") {
      main = st;
      if (seed.length) st.setState({ windows: seed });
    }
    return st;
  }
  const saved = () => (JSON.parse(data.get("atrium.v1") ?? "{}") as { state: { theme: string; view: string; windows: Win[] } }).state;
  return { make, saved };
}

test("C204/C203: two stores on one storage — A writes windows, B writes theme, both survive", () => {
  const w = world();
  const main = w.make("main", [{ id: "clock", x: 0, y: 0 }]);
  const float = w.make("float");
  float.getState().move("clock", 700, 500);
  main.getState().setTheme("light");
  assert.equal(w.saved().theme, "light");
  assert.deepEqual(w.saved().windows, [{ id: "clock", x: 700, y: 500 }]);
  assert.equal(float.getState().theme, "light", "float reloads on the storage event");
});

test("C203 S1: move a float, switch tab in main → float box kept", () => {
  const w = world();
  const main = w.make("main", [{ id: "clock", x: 0, y: 0 }]);
  const clock = w.make("float");
  clock.getState().move("clock", 700, 500);
  main.getState().setView("weather");
  assert.deepEqual(w.saved().windows[0], { id: "clock", x: 700, y: 500 });
  assert.equal(w.saved().view, "weather");
});

test("C203 S2: theme/tab in main, then move a float → settings kept", () => {
  const w = world();
  const main = w.make("main", [{ id: "weather", x: 0, y: 0 }]);
  const weather = w.make("float");
  main.getState().setTheme("light");
  main.getState().setView("clock");
  weather.getState().move("weather", 40, 60);
  assert.equal(w.saved().theme, "light");
  assert.equal(w.saved().view, "clock");
});

test("C203 S6: three floats moved in turn → all three boxes kept, windows never shrinks", () => {
  const w = world();
  w.make("main", [{ id: "clock", x: 0, y: 0 }, { id: "weather", x: 0, y: 0 }, { id: "quote", x: 0, y: 0 }]);
  const fl = ["clock", "weather", "quote"].map(() => w.make("float"));
  const sizes: number[] = [];
  ["clock", "weather", "quote"].forEach((id, i) => {
    fl[i]!.getState().move(id, 100 * (i + 1), 50);
    sizes.push(w.saved().windows.length);
  });
  assert.deepEqual(sizes, [3, 3, 3]);
  assert.deepEqual(w.saved().windows.map((x) => x.x), [100, 200, 300]);
});

test("C203 S7: onTop is stored on the window like any box field", () => {
  const w = world();
  const main = w.make("main", [{ id: "clock", x: 0, y: 0 }]);
  const f = w.make("float");
  f.getState().move("clock", 1, 1);
  f.setState({ windows: f.getState().windows.map((x) => ({ ...x, onTop: true })) });
  assert.equal(w.saved().windows[0]!.onTop, true);
  assert.equal(main.getState().windows[0]!.onTop, true);
});

test("C204 realm: floats never write storage; only changed keys are sent", () => {
  assert.equal(realmRole("index.html?float=widget&id=w1"), "float");
  assert.equal(realmRole("https://atrium.local/"), "main");
  assert.deepEqual(topLevelDiff({ a: 1, b: [1] }, { a: 1, b: [2] }), { b: [2] });
  let wrote = 0;
  const sent: Patch[] = [];
  const s = realmStorage({ getItem: () => JSON.stringify({ state: { a: 1 } }), setItem: () => void wrote++, removeItem: () => void wrote++ }, "float", (p) => sent.push(p));
  s.getItem("k");
  s.setItem("k", JSON.stringify({ state: { a: 2 } }));
  s.removeItem("k");
  assert.equal(wrote, 0);
  assert.deepEqual(sent, [{ a: 2 }]);
});

test("C204 S3/S4 wiring: close saves before floats close; Rust flush on exit; pin passed to open", () => {
  const sess = read("src/lib/native-session.ts");
  assert.ok(sess.indexOf("await save();") < sess.indexOf("await closeAllNativeFloatsForExit();"));
  assert.match(sess, /FLUSH_EVENT/);
  assert.match(read("src-tauri/src/lib.rs"), /RunEvent::ExitRequested[\s\S]*emit_to\("main", "atrium:flush"/);
  assert.match(read("src/components/desktop-layer.tsx"), /pinned: w\.onTop/);
  assert.match(read("src/components/float-shell.tsx"), /updateWindow\(id, \{ onTop: next \}\)/);
});

test("C204 migration: bands/freeBusy dropped, seconds off by default, look normalized", () => {
  assert.equal("bands" in WIDGET_DEFAULTS.clock, false);
  assert.equal("freeBusy" in WIDGET_DEFAULTS.calendar, false);
  assert.equal(WIDGET_DEFAULTS.clock.seconds, false);
  assert.ok(!WIDGET_OPTION_ROWS.clock.some((r) => (r.key as string) === "bands"));
  assert.deepEqual(normalizeDashPrefs({ widgets: { clock: { bands: false, seconds: true }, calendar: { freeBusy: false } } }), { widgets: { clock: { seconds: true }, calendar: {} } });
  const p = normalizeDashPrefs({ widgets: {}, look: { clockStyle: "analog", compact: true, deskOpacity: 10, deskSnap: "nope" } });
  assert.deepEqual(p.look, { clockStyle: "analog", compact: true, deskOpacity: 40 });
  assert.deepEqual(widgetLook(undefined), { clockStyle: "digital", compact: false, deskOpacity: 86, deskSnap: "off", deskNew: { lock: false, behind: false, frame: false } });
  assert.match(read("src/lib/store.ts"), /dashPrefs: \{ \.\.\.s\.dashPrefs, widgets:/);
});

test("C204 snap + opacity", () => {
  const area = { x: 0, y: 0, w: 1920, h: 1040 };
  assert.deepEqual(snapBox({ x: 10, y: 500, w: 300, h: 200 }, area, "edges"), { x: 24, y: 500 });
  assert.deepEqual(snapBox({ x: 1600, y: 820, w: 300, h: 200 }, area, "edges"), { x: 1596, y: 816 });
  assert.deepEqual(snapBox({ x: 500, y: 500, w: 300, h: 200 }, area, "edges"), { x: 500, y: 500 });
  assert.deepEqual(snapBox({ x: 37, y: 11, w: 1, h: 1 }, area, "grid"), { x: 48, y: 0 });
  assert.deepEqual(snapBox({ x: 37, y: 11, w: 1, h: 1 }, area, "off"), { x: 37, y: 11 });
  assert.equal(cardAlpha(86), "color-mix(in srgb, var(--color-card) 86%, transparent)");
  assert.equal(cardAlpha(100), "var(--color-card)");
});

test("C204 Google status row + widget is Reconnect-only", () => {
  const f = () => "14:02";
  assert.equal(googleStatusRow({ email: "e@x", canEdit: true, banner: null, lastSync: "x" }, f).sub, "Connected · can edit · synced 14:02");
  assert.equal(googleStatusRow({ email: "e@x", canEdit: false, banner: null, lastSync: null }, f).sub, "Can view only");
  assert.equal(googleStatusRow({ email: "e@x", canEdit: true, banner: "expired", lastSync: null }, f).sub, "Sign-in expired");
  assert.equal(googleStatusRow({ email: null, canEdit: false, banner: null, lastSync: null }, f).sub, "Not connected");
  const tiles = read("src/components/calendar-tiles.tsx");
  assert.doesNotMatch(tiles, /synced/);
  assert.match(tiles, /Google sign-in expired · as of/);
  assert.match(tiles, /@\[240px\]:block/);
  assert.match(tiles, /@\[520px\]:block/);
});

test("C204 no time bars: DayBand and the free/busy strip are gone; clock ladder + analog", () => {
  const w = read("src/components/widgets.tsx");
  assert.doesNotMatch(w, /DayBand|freeBusy|CalendarPeek/);
  assert.match(w, /@\[220px\]:text-\[76px\]/);
  assert.match(w, /@\[420px\]:block/);
  assert.match(read("src/components/analog-clock.tsx"), /role="img"/);
  assert.match(read("src/components/notes-header.tsx"), /@\[300px\]:flex/);
});
