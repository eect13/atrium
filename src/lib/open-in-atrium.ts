/**
 * Card 216 §6 "Open in Atrium": show, unminimise and focus the main window, go to the feature,
 * focus its heading. The float stays open. Capabilities: core:window allow-show/-unminimize/-set-focus.
 */
import { nativeWindows } from "./platform";
import type { ViewId } from "./types";

export const OPEN_VIEW_EVENT = "atrium:open-view";

/** Main window: focus the page heading after the view renders. */
export function focusViewHeading() {
  requestAnimationFrame(() => {
    const h = document.querySelector<HTMLElement>("main h2, main h1, h2");
    if (!h) return;
    if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
    h.focus();
  });
}

/** Card 244: optional section id on the page (e.g. Options › Calendar); main scrolls there instead of the heading. */
export type OpenView = { view: ViewId; section?: string };

/** From a native float: raise main and ask it to navigate. From an in-page float: navigate here. */
export async function openInAtrium(view: ViewId, local: (v: ViewId) => void, section?: string) {
  if (!nativeWindows()) {
    local(view);
    if (!section) focusViewHeading();
    return;
  }
  try {
    const [{ invoke }, { emitTo }] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
    // Card 222: Rust unminimises, shows, allows foreground and briefly pins main on top around set_focus.
    await invoke("desk_focus_main");
    await emitTo("main", OPEN_VIEW_EVENT, section ? ({ view, section } satisfies OpenView) : view);
  } catch {
    /* bridge unavailable: nothing to raise */
  }
}

export function listenOpenView(onView: (v: ViewId, section?: string) => void) {
  if (!nativeWindows()) return () => {};
  let off: (() => void) | undefined;
  let dead = false;
  void import("@tauri-apps/api/event")
    .then(({ listen }) => listen<ViewId | OpenView>(OPEN_VIEW_EVENT, (e) => (typeof e.payload === "string" ? onView(e.payload) : onView(e.payload.view, e.payload.section))))
    .then((u) => (dead ? u() : (off = u)))
    .catch(() => {});
  return () => {
    dead = true;
    off?.();
  };
}
