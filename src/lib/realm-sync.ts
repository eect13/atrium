/**
 * Card 204 / Card 203 root cause 1: every desk float is its own JS realm with its own store,
 * and all of them used to write the whole `atrium.v1` blob (last stale writer won).
 * Now the main window is the only writer. A float realm never writes storage: each of its
 * saves becomes a top-level patch (only the keys that changed) sent to main, which applies
 * it with setState and persists. Every realm re-reads the blob on the `storage` event.
 * Pure (no store import) so it can be tested with two stores on one storage.
 */
import type { StateStorage } from "zustand/middleware";

export type Patch = Record<string, unknown>;
export type Role = "main" | "float";

export function realmRole(href = typeof location !== "undefined" ? location.href : ""): Role {
  try {
    const u = new URL(href, "https://atrium.local/");
    const kind = u.searchParams.get("float") || new URLSearchParams(u.hash.replace(/^#/, "")).get("float");
    return kind === "note" || kind === "widget" ? "float" : "main";
  } catch {
    return "main";
  }
}

/**
 * Card 206 (Card 205 R1/R2): lists of `{id}` items are never replaced whole. A float sends only
 * the items it changed (`put`) and the ids it removed (`del`); main merges them by id, so a
 * float's stale copy cannot revert another float's move or drop a window main just opened.
 */
export const ID_LISTS = ["windows", "notes"] as const;
export const ITEMS = "__items";
type Item = { id: string };
export type ItemOps = { put: Item[]; del: string[] };

const isIdList = (v: unknown): v is Item[] => Array.isArray(v) && v.every((x) => x && typeof x === "object" && typeof (x as Item).id === "string");

function itemOps(prev: unknown, next: Item[]): ItemOps {
  const old = new Map((isIdList(prev) ? prev : []).map((x) => [x.id, JSON.stringify(x)]));
  const ids = new Set(next.map((x) => x.id));
  return {
    put: next.filter((x) => old.get(x.id) !== JSON.stringify(x)),
    del: [...old.keys()].filter((id) => !ids.has(id)),
  };
}

/** Keys whose JSON differs between two persisted states; id lists become item ops under `__items`. */
export function topLevelDiff(prev: Record<string, unknown> | null, next: Record<string, unknown>): Patch {
  const out: Patch = {};
  const items: Record<string, ItemOps> = {};
  for (const k of Object.keys(next)) {
    if (prev && JSON.stringify(prev[k]) === JSON.stringify(next[k])) continue;
    const v = next[k];
    if ((ID_LISTS as readonly string[]).includes(k) && isIdList(v)) {
      const ops = itemOps(prev?.[k], v);
      if (ops.put.length || ops.del.length) items[k] = ops;
    } else out[k] = v;
  }
  if (Object.keys(items).length) out[ITEMS] = items;
  return out;
}

/** Main: turn a float patch into a state update (id lists merged by id; only ids main already has). */
export function applyRealmPatch<S extends Record<string, unknown>>(state: S, patch: Patch): Partial<S> {
  const { [ITEMS]: items, ...plain } = patch as Patch & { [ITEMS]?: Record<string, ItemOps> };
  const out: Record<string, unknown> = { ...plain };
  for (const [k, ops] of Object.entries(items ?? {})) {
    const cur = isIdList(state[k]) ? (state[k] as Item[]) : [];
    const put = new Map(ops.put.map((x) => [x.id, x]));
    const del = new Set(ops.del);
    const merged = cur.filter((x) => !del.has(x.id)).map((x) => put.get(x.id) ?? x);
    // Card 208 (Card 207): floats never create items, so a put for an id main no longer has (a
    // float closed while its move was in flight) is dropped instead of resurrecting the float.
    out[k] = merged;
  }
  return out as Partial<S>;
}

function stateOf(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { state?: Record<string, unknown> };
    return p && typeof p.state === "object" ? p.state : null;
  } catch {
    return null;
  }
}

/**
 * Main: pass-through. Float: reads pass through (and remember what was read);
 * writes become `send(patch)` and never touch storage.
 */
export type RealmStorage = StateStorage & { resend?: () => void };

export function realmStorage(base: StateStorage, role: Role, send: (patch: Patch) => void): RealmStorage {
  if (role === "main") return base;
  let last: Record<string, unknown> | null = null;
  // Card 206 (R6): patches sent since main last wrote; re-sent when a reloaded main says it is ready.
  let unseen: Patch[] = [];
  return {
    getItem: (key) => {
      const raw = base.getItem(key) as string | null;
      last = stateOf(raw);
      unseen = [];
      return raw;
    },
    setItem: (_key, value) => {
      const next = stateOf(value);
      if (!next) return;
      const patch = topLevelDiff(last, next);
      last = next;
      if (!Object.keys(patch).length) return;
      unseen.push(patch);
      send(patch);
    },
    resend: () => {
      for (const p of unseen) send(p);
    },
    removeItem: () => {
      /* floats never clear the shared blob */
    },
  };
}

export const PATCH_EVENT = "atrium:patch";
export const FLUSH_EVENT = "atrium:flush";
export const READY_EVENT = "atrium:main-ready";

/**
 * Card 206 (R6): main holds patches while it is (re)hydrating and applies them after,
 * in arrival order.
 */
export function patchGate(apply: (p: Patch) => void) {
  let busy = 0;
  const queue: Patch[] = [];
  return {
    push: (p: Patch) => (busy ? queue.push(p) : apply(p)),
    async during(work: () => Promise<void> | void) {
      busy++;
      try {
        await work();
      } finally {
        busy--;
        if (!busy) while (queue.length) apply(queue.shift()!);
      }
    },
    get held() {
      return queue.length;
    },
  };
}
