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

/** Keys whose JSON differs between two persisted states. */
export function topLevelDiff(prev: Record<string, unknown> | null, next: Record<string, unknown>): Patch {
  const out: Patch = {};
  for (const k of Object.keys(next)) {
    if (!prev || JSON.stringify(prev[k]) !== JSON.stringify(next[k])) out[k] = next[k];
  }
  return out;
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
export function realmStorage(base: StateStorage, role: Role, send: (patch: Patch) => void): StateStorage {
  if (role === "main") return base;
  let last: Record<string, unknown> | null = null;
  return {
    getItem: (key) => {
      const raw = base.getItem(key) as string | null;
      last = stateOf(raw);
      return raw;
    },
    setItem: (_key, value) => {
      const next = stateOf(value);
      if (!next) return;
      const patch = topLevelDiff(last, next);
      last = next;
      if (Object.keys(patch).length) send(patch);
    },
    removeItem: () => {
      /* floats never clear the shared blob */
    },
  };
}

export const PATCH_EVENT = "atrium:patch";
export const FLUSH_EVENT = "atrium:flush";
