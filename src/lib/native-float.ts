import { isTauri } from "./http.ts";
import { nativeWindows } from "./platform.ts";

export { isTauri };

const KEEP_KEY = "atrium.float.keep";

function keepCount() {
  try {
    if (typeof localStorage === "undefined") return 0;
    const n = Number(localStorage.getItem(KEEP_KEY) || "0");
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** True while the main window is closing floats on purpose. Child realms share localStorage, not JS memory. */
export function floatKeepRequested() {
  return keepCount() > 0;
}

export function beginFloatKeep() {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(KEEP_KEY, String(keepCount() + 1));
  } catch {
    /* private mode */
  }
}

export function endFloatKeep() {
  try {
    if (typeof localStorage === "undefined") return;
    const n = keepCount() - 1;
    if (n <= 0) localStorage.removeItem(KEEP_KEY);
    else localStorage.setItem(KEEP_KEY, String(n));
  } catch {
    /* private mode */
  }
}

function releaseFloatKeepSoon() {
  if (typeof window === "undefined") {
    endFloatKeep();
    return;
  }
  window.setTimeout(() => endFloatKeep(), 400);
}

export function labelFor(kind: "note" | "widget", id: string) {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "x";
  return `${kind}-${safe}`;
}

const goneWatch = new Set<string>();
let closingAll = false;

async function watchGone(label: string, win: { once: (ev: string, cb: () => void) => Promise<unknown> | unknown }, onGone?: () => void) {
  if (!onGone || goneWatch.has(label)) return;
  goneWatch.add(label);
  try {
    await win.once("tauri://destroyed", () => {
      goneWatch.delete(label);
      if (closingAll || floatKeepRequested()) return;
      onGone();
    });
  } catch {
    goneWatch.delete(label);
  }
}

export async function openNativeFloat(
  kind: "note" | "widget",
  id: string,
  opts: { x: number; y: number; w: number; h: number; title: string; pinned?: boolean; behind?: boolean; frame?: boolean },
  onGone?: () => void,
) {
  if (!nativeWindows()) return false;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const label = labelFor(kind, id);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    // Already open — do not show/focus. Switching sidebar tabs re-renders the
    // desk and used to steal OS focus, popping every float in front.
    void watchGone(label, existing, onGone);
    return true;
  }
  const q = new URLSearchParams({ float: kind, id });
  const win = new WebviewWindow(label, {
    url: `index.html?${q.toString()}`,
    title: opts.title || (kind === "note" ? "Note" : "Atrium"),
    width: Math.max(240, Math.round(opts.w)),
    height: Math.max(180, Math.round(opts.h)),
    x: Math.round(opts.x),
    y: Math.round(opts.y),
    decorations: false,
    // Card 204: frameless + see-through so the widget opacity setting shows the desktop.
    transparent: kind === "widget",
    // Card 212: widget frame off by default (no OS shadow); Stay behind excludes Keep on top.
    shadow: kind !== "widget" || Boolean(opts.frame),
    alwaysOnTop: Boolean(opts.pinned) && !opts.behind,
    alwaysOnBottom: Boolean(opts.behind),
    skipTaskbar: kind === "note",
    resizable: true,
    focus: false,
    visible: true,
    dragDropEnabled: false,
  });
  void watchGone(label, win, onGone);
  return true;
}

export async function closeNativeFloat(kind: "note" | "widget", id: string) {
  if (!nativeWindows()) return;
  beginFloatKeep();
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const win = await WebviewWindow.getByLabel(labelFor(kind, id));
    if (win) await win.close();
  } finally {
    releaseFloatKeepSoon();
  }
}

/** Close every child float. The store keeps which pads were up so the next open restores them. */
export async function closeAllNativeFloats() {
  if (!nativeWindows()) return;
  beginFloatKeep();
  try {
    const { getAllWebviewWindows, getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const self = getCurrentWebviewWindow().label;
    const all = await getAllWebviewWindows();
    await Promise.all(
      all.map(async (win) => {
        if (win.label === self) return;
        try {
          await win.close();
        } catch {
          /* already gone */
        }
      }),
    );
  } finally {
    releaseFloatKeepSoon();
  }
}

/**
 * Main window is going away: close the floats, wait until they are gone, then
 * drop the keep flag. The 400 ms release timer dies with the main window, which
 * left `atrium.float.keep` stuck in localStorage for every later session.
 */
export async function closeAllNativeFloatsForExit(timeoutMs = 1500) {
  if (!nativeWindows()) return;
  closingAll = true;
  await closeAllNativeFloats();
  try {
    const { getAllWebviewWindows, getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const self = getCurrentWebviewWindow().label;
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const all = await getAllWebviewWindows();
      if (all.every((w) => w.label === self)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
  } catch {
    /* window list unavailable: clear anyway */
  }
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(KEEP_KEY);
  } catch {
    /* private mode */
  }
}

/** Card 204 (Card 203 S3c): read every open float's box from main before closing, so a pending debounce is not lost. */
export async function captureFloatBoxes(): Promise<{ label: string; box: { x: number; y: number; w: number; h: number } }[]> {
  if (!nativeWindows()) return [];
  try {
    const { getAllWebviewWindows, getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const self = getCurrentWebviewWindow().label;
    const out: { label: string; box: { x: number; y: number; w: number; h: number } }[] = [];
    for (const w of await getAllWebviewWindows()) {
      if (w.label === self) continue;
      try {
        const scale = await w.scaleFactor();
        const pos = await w.outerPosition();
        const size = await w.innerSize();
        out.push({ label: w.label, box: { x: Math.round(pos.x / scale), y: Math.round(pos.y / scale), w: Math.round(size.width / scale), h: Math.round(size.height / scale) } });
      } catch {
        /* window already gone */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function closeThisWindow() {
  if (!nativeWindows()) return;
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  await getCurrentWebviewWindow().close();
}

/**
 * Card 212: apply this widget's desk flags to its own window. Lock = click-through (the Rust tray /
 * Ctrl+Shift+F12 / Options can always clear it); behind and onTop are exclusive.
 */
export async function applyDeskFlags(f: { locked?: boolean; behind?: boolean; onTop?: boolean; frame?: boolean }) {
  if (!nativeWindows()) return;
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const w = getCurrentWebviewWindow();
  await Promise.allSettled([
    w.setIgnoreCursorEvents(Boolean(f.locked)),
    f.behind ? w.setAlwaysOnTop(false).then(() => w.setAlwaysOnBottom(true)) : w.setAlwaysOnBottom(false).then(() => w.setAlwaysOnTop(Boolean(f.onTop))),
    w.setShadow(Boolean(f.frame)),
  ]);
}

export async function setNativeAlwaysOnTop(on: boolean) {
  if (!nativeWindows()) return;
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  await getCurrentWebviewWindow().setAlwaysOnTop(on);
}

/** Persist the last box then dock/close in the store when the OS chrome dismisses the window. */
export function watchNativeClose(onClose: () => void) {
  if (!nativeWindows()) return () => {};
  let un: (() => void) | undefined;
  let dead = false;
  void (async () => {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const win = getCurrentWebviewWindow();
    const stop = await win.onCloseRequested(() => {
      if (dead || floatKeepRequested()) return;
      onClose();
    });
    if (dead) stop();
    else un = stop;
  })();
  return () => {
    dead = true;
    un?.();
  };
}

export function watchNativeBounds(onBox: (box: { x: number; y: number; w: number; h: number }) => void) {
  if (!nativeWindows()) return () => {};
  let dead = false;
  let timer = 0;
  let un1: (() => void) | undefined;
  let un2: (() => void) | undefined;
  void (async () => {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const win = getCurrentWebviewWindow();
    const save = async () => {
      if (dead) return;
      try {
        const scale = await win.scaleFactor();
        const pos = await win.outerPosition();
        const size = await win.innerSize();
        onBox({
          x: Math.round(pos.x / scale),
          y: Math.round(pos.y / scale),
          w: Math.round(size.width / scale),
          h: Math.round(size.height / scale),
        });
      } catch {
        /* window gone */
      }
    };
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void save(), 160);
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

/** Card 204: move this float to a snapped spot on its monitor's work area (logical px). */
export async function snapThisWindow(box: { x: number; y: number; w: number; h: number }, place: (box: { x: number; y: number; w: number; h: number }, area: { x: number; y: number; w: number; h: number }) => { x: number; y: number }) {
  if (!nativeWindows()) return;
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const { currentMonitor } = await import("@tauri-apps/api/window");
    const { LogicalPosition } = await import("@tauri-apps/api/dpi");
    const mon = await currentMonitor();
    if (!mon) return;
    const sc = mon.scaleFactor || 1;
    const wa = mon.workArea ?? { position: mon.position, size: mon.size };
    const area = { x: wa.position.x / sc, y: wa.position.y / sc, w: wa.size.width / sc, h: wa.size.height / sc };
    const to = place(box, area);
    if (Math.round(to.x) !== box.x || Math.round(to.y) !== box.y) await getCurrentWebviewWindow().setPosition(new LogicalPosition(Math.round(to.x), Math.round(to.y)));
  } catch {
    /* monitor unavailable */
  }
}

export function parseFloatHash(href = typeof location !== "undefined" ? location.href : "") {
  try {
    const u = new URL(href, "https://atrium.local/");
    const kind = u.searchParams.get("float") || new URLSearchParams(u.hash.replace(/^#/, "")).get("float");
    const id = u.searchParams.get("id") || new URLSearchParams(u.hash.replace(/^#/, "")).get("id");
    if ((kind === "note" || kind === "widget") && id) return { kind: kind as "note" | "widget", id };
  } catch {
    /* ignore */
  }
  return null;
}
