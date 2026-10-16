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

/** From a native float: raise main and ask it to navigate. From an in-page float: navigate here. */
export async function openInAtrium(view: ViewId, local: (v: ViewId) => void) {
  if (!nativeWindows()) {
    local(view);
    focusViewHeading();
    return;
  }
  try {
    const [{ Window }, { emitTo }] = await Promise.all([import("@tauri-apps/api/window"), import("@tauri-apps/api/event")]);
    const main = await Window.getByLabel("main");
    await main?.unminimize();
    await main?.show();
    await main?.setFocus();
    await emitTo("main", OPEN_VIEW_EVENT, view);
  } catch {
    /* bridge unavailable: nothing to raise */
  }
}

export function listenOpenView(onView: (v: ViewId) => void) {
  if (!nativeWindows()) return () => {};
  let off: (() => void) | undefined;
  let dead = false;
  void import("@tauri-apps/api/event")
    .then(({ listen }) => listen<ViewId>(OPEN_VIEW_EVENT, (e) => onView(e.payload)))
    .then((u) => (dead ? u() : (off = u)))
    .catch(() => {});
  return () => {
    dead = true;
    off?.();
  };
}
