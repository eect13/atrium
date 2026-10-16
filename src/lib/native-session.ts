import { nativeWindows } from "@/lib/platform";
import { writeLocal } from "@/lib/quota";
import { closeAllNativeFloatsForExit } from "@/lib/native-float";
import { FLUSH_EVENT } from "@/lib/realm-sync";
import { flushStateFile, mirrorStateToFile } from "@/lib/state-file";

/** Card 217 R-b: Rust tray Quit → main captures + saves, then invokes `desk_quit`. */
export const QUIT_EVENT = "atrium:quit";

const KEY = "atrium.win";

type Box = { x: number; y: number; w: number; h: number };

function readBox(): Box | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Box> | null;
    if (!raw) return null;
    const x = Number(raw.x);
    const y = Number(raw.y);
    const w = Number(raw.w);
    const h = Number(raw.h);
    if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
    if (w < 390 || h < 640) return null;
    return { x, y, w, h };
  } catch {
    return null;
  }
}

/** Restore the last main-window size/spot, then keep writing it. */
/**
 * `beforeExit` runs on close (and on the Rust "atrium:flush") after the main box is saved and
 * before floats close: Card 203 S3b/S3c lost the last debounced box.
 */
export function rememberMainWindow(beforeExit?: () => Promise<void> | void) {
  if (!nativeWindows()) return () => {};
  let dead = false;
  let timer = 0;
  let un1: (() => void) | undefined;
  let un2: (() => void) | undefined;
  let unClose: (() => void) | undefined;
  let unFlush: (() => void) | undefined;
  let unQuit: (() => void) | undefined;
  void (async () => {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const { LogicalPosition, LogicalSize } = await import("@tauri-apps/api/dpi");
    const win = getCurrentWebviewWindow();
    const saved = readBox();
    if (saved) {
      try {
        await win.setPosition(new LogicalPosition(saved.x, saved.y));
        await win.setSize(new LogicalSize(saved.w, saved.h));
      } catch {
        /* ignore bad restore */
      }
    }
    const save = async () => {
      if (dead) return;
      try {
        const scale = await win.scaleFactor();
        const pos = await win.outerPosition();
        const size = await win.innerSize();
        const box: Box = {
          x: Math.round(pos.x / scale),
          y: Math.round(pos.y / scale),
          w: Math.round(size.width / scale),
          h: Math.round(size.height / scale),
        };
        writeLocal(KEY, JSON.stringify(box));
        mirrorStateToFile(); // Card 211: the box survives a hard kill too
      } catch {
        /* ignore a bad window read */
      }
    };
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void save(), 220);
    };
    try {
      const { listen } = await import("@tauri-apps/api/event");
      // Card 217 R-b: tray Quit takes the same path as the main close (live float boxes captured,
      // saved through the state file), then asks Rust to exit. Rust exits anyway after a timeout.
      const stopQuit = await listen(QUIT_EVENT, async () => {
        window.clearTimeout(timer);
        try {
          await save();
          await beforeExit?.();
          await flushStateFile();
        } finally {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("desk_quit").catch(() => {});
        }
      });
      if (dead) stopQuit();
      else unQuit = stopQuit;
      const stopFlush = await listen(FLUSH_EVENT, () => {
        window.clearTimeout(timer);
        void save().then(() => beforeExit?.());
      });
      if (dead) stopFlush();
      else unFlush = stopFlush;
    } catch {
      /* no event bridge */
    }
    un1 = await win.onMoved(bump);
    un2 = await win.onResized(bump);
    try {
      const stopClose = await win.onCloseRequested(async () => {
        window.clearTimeout(timer);
        await save();
        await beforeExit?.();
        await closeAllNativeFloatsForExit();
      });
      if (dead) stopClose();
      else unClose = stopClose;
    } catch {
      /* older webview */
    }
  })();
  return () => {
    dead = true;
    window.clearTimeout(timer);
    un1?.();
    un2?.();
    unClose?.();
    unFlush?.();
    unQuit?.();
  };
}
