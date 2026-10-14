// Card 205 Critic (Skye), brought into the suite by Card 206: async storage-event delivery (real
// browsers/WebView2 deliver `storage` as a queued task). The critic's EXPECTED-BUG assertions are
// flipped to the fixed behaviour; patches reach main through applyRealmPatch like realm-wire does.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { readFileSync } from "node:fs";
import { applyRealmPatch, patchGate, realmStorage, type Patch } from "./realm-sync.ts";
import { safeLaunchView, CRASHED_VIEW_KEY } from "./view-crash.ts";

type Win = { id: string; x: number; y: number };
type S = { theme: string; windows: Win[]; move: (id: string, x: number, y: number) => void; add: (id: string) => void };

function world() {
  const data = new Map<string, string>();
  const queue: (() => void)[] = [];
  const realms: (() => void)[] = [];
  const base = (self: number): StateStorage => ({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); realms.forEach((r, i) => i !== self && queue.push(r)); },
    removeItem: (k) => void data.delete(k),
  });
  let main: any = null;
  const pending: Patch[] = [];
  const send = (p: Patch) => pending.push(p); // emitTo is async too
  function make(role: "main" | "float", seed: Win[] = []) {
    const idx = realms.length;
    const st = createStore<S>()(persist((set) => ({
      theme: "dark", windows: seed,
      move: (id, x, y) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)) })),
      add: (id) => set((s) => ({ windows: [...s.windows, { id, x: 0, y: 0 }] })),
    }), { name: "atrium.v1", storage: createJSONStorage(() => realmStorage(base(idx), role, send)), partialize: ({ theme, windows }) => ({ theme, windows }) as any }));
    realms.push(() => void st.persist.rehydrate());
    if (role === "main") main = st;
    return st;
  }
  const flushPatches = () => { while (pending.length) main.setState(applyRealmPatch(main.getState(), pending.shift()!)); };
  const flushEvents = async () => { while (queue.length) queue.shift()!(); await new Promise((r) => setTimeout(r, 0)); };
  const saved = () => JSON.parse(data.get("atrium.v1")!).state as { windows: Win[] };
  return { make, flushPatches, flushEvents, saved, get main() { return main; } };
}

test("C205 R1 fixed: two floats moved before either sees the other's storage event → both boxes kept", async () => {
  const w = world();
  const seed = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 0 }];
  const main = w.make("main", seed); main.getState().move("a", 0, 0); // write seed
  const a = w.make("float"); const b = w.make("float");
  await a.persist.rehydrate(); await b.persist.rehydrate();
  a.getState().move("a", 100, 100);
  b.getState().move("b", 200, 200); // b has not processed main's write of a's patch yet
  w.flushPatches(); await w.flushEvents();
  const s = w.saved().windows;
  assert.deepEqual(s.find((x) => x.id === "b"), { id: "b", x: 200, y: 200 });
  assert.deepEqual(s.find((x) => x.id === "a"), { id: "a", x: 100, y: 100 }, "a's move survives (item patch)");
});

test("C205 R2 fixed: main opens a new float while another float's patch is in flight → new float kept", async () => {
  const w = world();
  const main = w.make("main", [{ id: "a", x: 0, y: 0 }]); main.getState().move("a", 0, 0);
  const a = w.make("float"); await a.persist.rehydrate();
  a.getState().move("a", 50, 50);          // patch queued (emitTo async)
  main.getState().add("new");              // main opens a float
  w.flushPatches(); await w.flushEvents();
  assert.ok(w.saved().windows.some((x) => x.id === "new"), "the new float stays");
  assert.deepEqual(w.saved().windows.find((x) => x.id === "a"), { id: "a", x: 50, y: 50 });
});

test("C205 R3: safeLaunchView consumes the mark, so the store calls it only in main on first load", () => {
  const ls = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) };
  ls.set(CRASHED_VIEW_KEY, "calendar");
  assert.notEqual(safeLaunchView("calendar", "dashboard", "options"), "calendar");
  assert.equal(ls.get(CRASHED_VIEW_KEY), undefined);
  delete (globalThis as any).localStorage;
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  assert.match(store, /realmRole\(\) === "main" && !launchViewDone \? safeLaunchView\(toViewId\(/);
  assert.match(store, /launchViewDone = true;/);
});

test("C206 R5: hubTopics side copy is written by main only", () => {
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  assert.match(store, /typeof localStorage !== "undefined" && realmRole\(\) === "main"\) \{\n {2}let last = "";/);
});

test("C206 R6: patches held while main hydrates are applied after, in order; float re-sends unseen patches", async () => {
  const got: Patch[] = [];
  const gate = patchGate((p) => got.push(p));
  let release!: () => void;
  const run = gate.during(() => new Promise<void>((r) => (release = r)));
  gate.push({ n: 1 });
  gate.push({ n: 2 });
  assert.equal(got.length, 0);
  assert.equal(gate.held, 2);
  release();
  await run;
  assert.deepEqual(got, [{ n: 1 }, { n: 2 }]);
  gate.push({ n: 3 });
  assert.deepEqual(got.at(-1), { n: 3 });
  const sent: Patch[] = [];
  const s = realmStorage({ getItem: () => JSON.stringify({ state: { theme: "dark" } }), setItem: () => {}, removeItem: () => {} }, "float", (p) => sent.push(p));
  s.getItem("k");
  s.setItem("k", JSON.stringify({ state: { theme: "light" } }));
  s.resend!();
  assert.deepEqual(sent, [{ theme: "light" }, { theme: "light" }]);
  s.getItem("k"); // main wrote: nothing unseen
  s.resend!();
  assert.equal(sent.length, 2);
});

test("C206 item patches: put/del by id, other keys plain", () => {
  const st = { windows: [{ id: "a", x: 0 }, { id: "b", x: 0 }], theme: "dark" };
  const next = applyRealmPatch(st, { theme: "light", __items: { windows: { put: [{ id: "b", x: 9 }, { id: "c", x: 1 }], del: ["a"] } } } as Patch);
  assert.deepEqual(next, { theme: "light", windows: [{ id: "b", x: 9 }] }, "Card 208: unknown id c is not created");
});

test("C206 Form 202A: snap to another widget; date 'Wed 14 Oct'", async () => {
  const { snapBox } = await import("./desk-snap.ts");
  const { formatZoneDate } = await import("./clock.ts");
  const area = { x: 0, y: 0, w: 1920, h: 1040 };
  const other = { x: 400, y: 300, w: 300, h: 200 };
  assert.deepEqual(snapBox({ x: 735, y: 310, w: 200, h: 150 }, area, "edges", [other]), { x: 724, y: 300 }, "24px beside it, tops lined up");
  assert.deepEqual(snapBox({ x: 1000, y: 700, w: 200, h: 150 }, area, "edges", [other]), { x: 1000, y: 700 }, "far away: unchanged");
  const d = new Date("2026-10-14T05:00:00Z");
  assert.equal(formatZoneDate(d, "Asia/Manila", "en-US"), "Wed 14 Oct");
  assert.equal(formatZoneDate(d, "Asia/Manila", "en-GB"), "Wed 14 Oct");
  assert.match(formatZoneDate(d, "Asia/Manila", "de-DE"), /^Mi 14 Okt$/);
});
