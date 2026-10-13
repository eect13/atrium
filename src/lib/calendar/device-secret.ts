/**
 * Card 170 (Card 167 M2): where the desktop/Android calendar refresh handle lives. Tauri: a
 * file in the app's private data dir via Rust commands, never WebView localStorage. The access
 * handle stays in memory only. Web never holds either (HttpOnly cookies).
 */
import { isTauri } from "../http.ts";

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv<T>(cmd, args);
}

export async function readRefresh(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return (await invoke<string | null>("cal_secret_get")) ?? null;
  } catch {
    return null;
  }
}

export async function saveRefresh(value: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("cal_secret_set", { value });
}

export async function clearRefresh(): Promise<void> {
  if (!isTauri()) return;
  await invoke("cal_secret_clear").catch(() => undefined);
}
