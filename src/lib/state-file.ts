/**
 * Card 208/211 (Card 207 K1, Card 210 lows): in the Tauri app (desktop + Android), main mirrors
 * every `atrium.v1` save to an app-data file through Rust (`state_save`: atomic temp+fsync+rename,
 * rename retried on Windows sharing/AV locks). WebView2 can lose uncommitted localStorage on a
 * hard kill; at launch the file wins when its `rev` is higher.
 * - `rev` is a counter that only goes up (persisted in localStorage and the file), so a clock
 *   step back can no longer make a newer file lose. Older files carry `savedAt` (Date.now()).
 * - The main-window box and the crash mark ride along in `side`, so they survive a kill too.
 * Web: localStorage only (nothing here runs).
 */
import { isTauri } from "./http.ts";

export const STATE_KEY = "atrium.v1";
export const REV_KEY = "atrium.v1.rev";
/** Card 208 key (timestamp); read for migration only. */
export const SAVED_AT_KEY = "atrium.v1.savedAt";
/** Separate localStorage keys mirrored with the blob. */
export const SIDE_KEYS = ["atrium.win", "atrium.crashedView"] as const;

export type FileBlob = { rev?: number; savedAt?: number; blob: string; side?: Record<string, string | null> };
export type Stamp = { rev?: number; savedAt?: number };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

export function parseFileBlob(text: string | null | undefined): FileBlob | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as Partial<FileBlob>;
    if (typeof v.blob !== "string") return null;
    const rev = num(v.rev);
    const savedAt = num(v.savedAt);
    if (rev === undefined && savedAt === undefined) return null;
    const side = v.side && typeof v.side === "object" ? (v.side as Record<string, string | null>) : undefined;
    return { blob: v.blob, ...(rev !== undefined ? { rev } : {}), ...(savedAt !== undefined ? { savedAt } : {}), ...(side ? { side } : {}) };
  } catch {
    return null;
  }
}

/**
 * Is the file newer than localStorage? Both with `rev` → compare revs. A side with `rev` beats a
 * timestamp-only (Card 208) side, since it was written by a later build. Both timestamp-only →
 * compare timestamps (the one-time migration case).
 */
export function fileIsNewer(file: Stamp, ls: Stamp): boolean {
  if (file.rev !== undefined && ls.rev !== undefined) return file.rev > ls.rev;
  if (file.rev !== undefined) return true;
  if (ls.rev !== undefined) return false;
  return (file.savedAt ?? 0) > (ls.savedAt ?? 0);
}

/** Pure: which blob to start from. The file wins only when newer (or storage lost the blob). */
export function pickLaunchBlob(file: FileBlob | null, lsBlob: string | null, ls: Stamp): string | null {
  if (!file) return null;
  if (!lsBlob) return file.blob;
  return fileIsNewer(file, ls) ? file.blob : null;
}

/** Next rev: always above anything seen on either side. */
export function nextRev(...seen: (number | undefined)[]) {
  return Math.max(0, ...seen.map((n) => n ?? 0)) + 1;
}

type Warn = (message: string) => void;
const warners = new Set<Warn>();
/** Non-blocking warning when the Rust write fails after its retries (e.g. AV holding the file). */
export function onStateFileWarning(fn: Warn) {
  warners.add(fn);
  return () => void warners.delete(fn);
}

/** Latest-wins writer: one Rust write in flight; later saves coalesce into the next one. */
export function fileMirror(write: (text: string) => Promise<unknown>, warn: Warn = (m) => warners.forEach((f) => f(m))) {
  let inFlight = false;
  let next: string | null = null;
  let warned = false;
  let done: Promise<void> = Promise.resolve();
  const pump = async () => {
    if (inFlight) return done;
    inFlight = true;
    let finish = () => {};
    done = new Promise<void>((r) => (finish = r));
    while (next !== null) {
      const text = next;
      next = null;
      try {
        await write(text);
        warned = false;
      } catch (err) {
        // localStorage still has it; the next save retries. Say so once per failure run.
        if (!warned) {
          warned = true;
          console.warn("Atrium: backup save failed", err);
          warn("Couldn't write Atrium's backup file. Your changes are kept and will be retried.");
        }
      }
    }
    inFlight = false;
    finish();
  };
  const push = (text: string) => {
    next = text;
    void pump();
  };
  /** Card 217 R-b: resolves once every queued write has been handed to Rust. */
  push.idle = () => done;
  return push;
}

let mirror: ReturnType<typeof fileMirror> | null = null;
let rev = 0;
let lastBlob: string | null = null;

function lsGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function sides() {
  const out: Record<string, string | null> = {};
  for (const k of SIDE_KEYS) out[k] = lsGet(k);
  return out;
}

/** Main realm, Tauri only: called after each localStorage write of atrium.v1 (and of a side key). */
export function mirrorStateToFile(blob?: string) {
  if (!isTauri()) return;
  if (blob !== undefined) lastBlob = blob;
  const b = lastBlob ?? lsGet(STATE_KEY);
  if (!b) return;
  rev = nextRev(rev, Number(lsGet(REV_KEY)) || 0);
  try {
    localStorage.setItem(REV_KEY, String(rev));
  } catch {
    /* quota */
  }
  mirror ??= fileMirror((text) => import("@tauri-apps/api/core").then(({ invoke }) => invoke("state_save", { text })));
  mirror(JSON.stringify({ rev, blob: b, side: sides() } satisfies FileBlob));
}

/** Main realm, Tauri only, before the store is created: restore from the file when it is newer. */
/** Card 217 R-b (tray Quit): mirror the latest state and wait until the file write is done. */
export async function flushStateFile() {
  mirrorStateToFile();
  await mirror?.idle();
}

export async function restoreStateFromFile() {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const file = parseFileBlob(await invoke<string | null>("state_load"));
    const ls: Stamp = { rev: num(Number(lsGet(REV_KEY) ?? NaN)), savedAt: num(Number(lsGet(SAVED_AT_KEY) ?? NaN)) };
    const pick = pickLaunchBlob(file, lsGet(STATE_KEY), ls);
    rev = Math.max(file?.rev ?? 0, ls.rev ?? 0);
    if (pick && file) {
      localStorage.setItem(STATE_KEY, pick);
      for (const k of SIDE_KEYS) {
        const v = file.side?.[k];
        if (typeof v === "string") localStorage.setItem(k, v);
        else if (file.side && k in file.side) localStorage.removeItem(k);
      }
    }
    localStorage.setItem(REV_KEY, String(rev));
    localStorage.removeItem(SAVED_AT_KEY);
  } catch {
    /* no file / no bridge: start from localStorage */
  }
}
