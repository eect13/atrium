import { isTauri } from "@/lib/http";

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
export function rememberMainWindow() {
  if (!isTauri()) return () => {};
  let dead = false;
  let timer = 0;
  let un1: (() => void) | undefined;
  let un2: (() => void) | undefined;
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
        localStorage.setItem(KEY, JSON.stringify(box));
      } catch {
        /* ignore */
      }
    };
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void save(), 220);
    };
    un1 = await win.onMoved(bump);
    un2 = await win.onResized(bump);
  })();
  return () => {
    dead = true;
    window.clearTimeout(timer);
    un1?.();
    un2?.();
  };
}
