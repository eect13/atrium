import { isTauri } from "./http.ts";

export { isTauri };

function labelFor(kind: "note" | "widget", id: string) {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "x";
  return `${kind}-${safe}`;
}

export async function openNativeFloat(
  kind: "note" | "widget",
  id: string,
  opts: { x: number; y: number; w: number; h: number; title: string; pinned?: boolean },
) {
  if (!isTauri()) return false;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const label = labelFor(kind, id);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    // Already open — do not show/focus. Switching sidebar tabs re-renders the
    // desk and used to steal OS focus, popping every float in front.
    return true;
  }
  const q = new URLSearchParams({ float: kind, id });
  new WebviewWindow(label, {
    url: `index.html?${q.toString()}`,
    title: opts.title || (kind === "note" ? "Note" : "Atrium"),
    width: Math.max(240, Math.round(opts.w)),
    height: Math.max(180, Math.round(opts.h)),
    x: Math.round(opts.x),
    y: Math.round(opts.y),
    decorations: false,
    alwaysOnTop: Boolean(opts.pinned),
    skipTaskbar: kind === "note",
    resizable: true,
    focus: false,
    visible: true,
    dragDropEnabled: false,
  });
  return true;
}

export async function closeNativeFloat(kind: "note" | "widget", id: string) {
  if (!isTauri()) return;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const win = await WebviewWindow.getByLabel(labelFor(kind, id));
  if (win) await win.close();
}

export async function closeThisWindow() {
  if (!isTauri()) return;
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  await getCurrentWebviewWindow().close();
}

export async function setNativeAlwaysOnTop(on: boolean) {
  if (!isTauri()) return;
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  await getCurrentWebviewWindow().setAlwaysOnTop(on);
}

export function watchNativeBounds(onBox: (box: { x: number; y: number; w: number; h: number }) => void) {
  if (!isTauri()) return () => {};
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
