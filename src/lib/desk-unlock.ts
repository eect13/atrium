/**
 * Card 212: Unlock all. Rust clears click-through on every widget (tray, Ctrl+Shift+F12, or
 * Options via `desk_unlock_all`) and emits `atrium:unlock-all`; main clears `locked` and persists.
 */
import { nativeWindows } from "./platform";

export const UNLOCK_EVENT = "atrium:unlock-all";
export const UNLOCK_SHORTCUT = "Ctrl+Shift+F12";

export function listenUnlockAll(onUnlock: () => void) {
  if (!nativeWindows()) return () => {};
  let off: (() => void) | undefined;
  let dead = false;
  void import("@tauri-apps/api/event")
    .then(({ listen }) => listen(UNLOCK_EVENT, () => onUnlock()))
    .then((u) => (dead ? u() : (off = u)))
    .catch(() => {});
  return () => {
    dead = true;
    off?.();
  };
}

/** Options › Unlock all: same Rust path as the tray; falls back to the store if the bridge fails. */
export async function unlockAllNow(fallback: () => void) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("desk_unlock_all");
  } catch {
    fallback();
  }
}

/** False when another app owns Ctrl+Shift+F12 (the tray and Options still unlock). */
export async function unlockShortcutOk(): Promise<boolean> {
  if (!nativeWindows()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("desk_shortcut_ok");
  } catch {
    return false;
  }
}
