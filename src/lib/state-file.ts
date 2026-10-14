/**
 * Card 208 (Card 207 K1): in the Tauri app (desktop + Android), main mirrors every `atrium.v1`
 * save to an app-data file through Rust (`state_save`, atomic temp+fsync+rename). WebView2 can
 * lose uncommitted localStorage on a hard kill; at launch the file wins when it is newer.
 * Web: localStorage only (nothing here runs).
 */
import { isTauri } from "./http.ts";

export const STATE_KEY = "atrium.v1";
export const SAVED_AT_KEY = "atrium.v1.savedAt";

type FileBlob = { savedAt: number; blob: string };

/** Pure: which blob to start from. The file wins only when strictly newer (or storage is empty). */
export function pickLaunchBlob(file: FileBlob | null, lsBlob: string | null, lsSavedAt: number): string | null {
  if (!file || typeof file.blob !== "string") return null;
  if (!lsBlob) return file.blob;
  return file.savedAt > lsSavedAt ? file.blob : null;
}

export function parseFileBlob(text: string | null | undefined): FileBlob | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as Partial<FileBlob>;
    return typeof v.savedAt === "number" && typeof v.blob === "string" ? { savedAt: v.savedAt, blob: v.blob } : null;
  } catch {
    return null;
  }
}

/** Latest-wins writer: one Rust write in flight; later saves coalesce into the next one. */
export function fileMirror(write: (text: string) => Promise<unknown>) {
  let inFlight = false;
  let next: string | null = null;
  const pump = async () => {
    if (inFlight) return;
    inFlight = true;
    while (next !== null) {
      const text = next;
      next = null;
      try {
        await write(text);
      } catch {
        /* disk full / no app dir: localStorage still has it */
      }
    }
    inFlight = false;
  };
  return (blob: string, savedAt: number) => {
    next = JSON.stringify({ savedAt, blob } satisfies FileBlob);
    void pump();
  };
}

let mirror: ReturnType<typeof fileMirror> | null = null;

/** Main realm, Tauri only: called after each localStorage write of atrium.v1. */
export function mirrorStateToFile(blob: string) {
  if (!isTauri()) return;
  const savedAt = Date.now();
  try {
    localStorage.setItem(SAVED_AT_KEY, String(savedAt));
  } catch {
    /* quota */
  }
  mirror ??= fileMirror((text) => import("@tauri-apps/api/core").then(({ invoke }) => invoke("state_save", { text })));
  mirror(blob, savedAt);
}

/** Main realm, Tauri only, before the store is created: restore from the file when it is newer. */
export async function restoreStateFromFile() {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const file = parseFileBlob(await invoke<string | null>("state_load"));
    const lsBlob = localStorage.getItem(STATE_KEY);
    const lsAt = Number(localStorage.getItem(SAVED_AT_KEY) ?? 0) || 0;
    const pick = pickLaunchBlob(file, lsBlob, lsAt);
    if (pick && file) {
      localStorage.setItem(STATE_KEY, pick);
      localStorage.setItem(SAVED_AT_KEY, String(file.savedAt));
    }
  } catch {
    /* no file / no bridge: start from localStorage */
  }
}
