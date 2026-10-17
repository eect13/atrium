/**
 * Card 228 (Form 227 B4): the ⋯ of a desktop float opens in one shared, pre-created "menu" popup
 * window (Rust creates it hidden at startup) so the menu can leave the small float. The popup
 * renders the same rows; the float keeps the handlers (picks come back by index).
 * Events (emitTo by window label): owner → menu `atrium:menu-open` / `-update` / `-close`;
 * menu → owner `atrium:menu-shown` / `-pick` / `-closed`.
 */
import { isValidElement, type ReactNode } from "react";
import type { MenuItem } from "./menu-groups.ts";
import { nativeWindows } from "./platform.ts";

export const MENU_LABEL = "menu";
export const MENU_EV = {
  open: "atrium:menu-open",
  update: "atrium:menu-update",
  close: "atrium:menu-close",
  shown: "atrium:menu-shown",
  pick: "atrium:menu-pick",
  closed: "atrium:menu-closed",
} as const;

/** Physical screen px of the trigger. */
export type MenuAnchor = { x: number; y: number; w: number; h: number };
export type WireRow = { separator?: boolean; label?: string; checked?: boolean; destructive?: boolean };
export type MenuOpen = { seq: number; owner: string; label: string; menuClassName: string; theme: "dark" | "light"; anchor: MenuAnchor; items: WireRow[] };

/** Plain text of a row label (labels are strings; a few are small elements). */
export function nodeText(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(n)) return nodeText(n.props.children);
  return "";
}

export function wireRows(items: MenuItem[]): WireRow[] {
  return items.map((it) => (it.separator ? { separator: true } : { label: nodeText(it.label), checked: it.checked, destructive: it.destructive }));
}

/** This page is a native desktop float (note-/widget- window), not main or the web. */
export function inNativeFloat(): boolean {
  if (!nativeWindows() || typeof location === "undefined") return false;
  const kind = new URLSearchParams(location.search).get("float");
  return kind === "note" || kind === "widget";
}

/**
 * Popup placement in physical px: right edge on the trigger's right edge, 4px below; flip above if it
 * does not fit in the work area; shift into it (8px margin); height capped at work area − 16px.
 * `pad` is the transparent margin around the panel (room for its shadow).
 */
export function placeMenu(a: MenuAnchor, panel: { w: number; h: number }, work: { x: number; y: number; w: number; h: number }, scale: number, pad = 0) {
  const m = 8 * scale;
  const gap = 4 * scale;
  const w = Math.min(panel.w + 2 * pad, work.w - 2 * m);
  const h = Math.min(panel.h + 2 * pad, work.h - 2 * m);
  const below = a.y + a.h + gap - pad;
  const above = a.y - gap - h + pad;
  const fitsBelow = below + h <= work.y + work.h - m;
  const fitsAbove = above >= work.y + m;
  let y = fitsBelow || !fitsAbove ? below : above;
  y = Math.min(Math.max(y, work.y + m), work.y + work.h - m - h);
  let x = a.x + a.w - w + pad;
  x = Math.min(Math.max(x, work.x + m), work.x + work.w - m - w);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), flipped: !(fitsBelow || !fitsAbove) };
}

export type NativeMenuHandle = { update: () => void; close: () => void };
let seqN = 0;

/** Open the popup for this float's ⋯. Resolves null when the popup is unavailable (use the in-window menu). */
export async function openNativeMenu(o: {
  label: string;
  menuClassName: string;
  trigger: HTMLElement;
  items: () => MenuItem[];
  onClosed: (refocus: boolean) => void;
}): Promise<NativeMenuHandle | null> {
  try {
    const [{ getCurrentWebviewWindow, WebviewWindow }, { emitTo, listen }] = await Promise.all([import("@tauri-apps/api/webviewWindow"), import("@tauri-apps/api/event")]);
    if (!(await WebviewWindow.getByLabel(MENU_LABEL))) return null;
    const me = getCurrentWebviewWindow();
    const seq = ++seqN + Math.floor(Math.random() * 1e6) * 1000;
    const [scale, pos] = await Promise.all([me.scaleFactor(), me.innerPosition()]);
    const r = o.trigger.getBoundingClientRect();
    const anchor = { x: pos.x + r.left * scale, y: pos.y + r.top * scale, w: r.width * scale, h: r.height * scale };
    const offs: (() => void)[] = [];
    let done = false;
    const finish = (refocus: boolean) => {
      if (done) return;
      done = true;
      offs.forEach((f) => f());
      if (refocus) void me.setFocus().catch(() => undefined);
      o.onClosed(refocus);
      if (refocus) o.trigger.focus();
    };
    const shown = new Promise<boolean>((res) => {
      const t = setTimeout(() => res(false), 1200);
      void listen<{ seq: number }>(MENU_EV.shown, (e) => {
        if (e.payload.seq === seq) {
          clearTimeout(t);
          res(true);
        }
      }).then((u) => offs.push(u));
    });
    offs.push(
      await listen<{ seq: number; index: number }>(MENU_EV.pick, (e) => {
        if (e.payload.seq !== seq) return;
        const it = o.items()[e.payload.index];
        if (it && !it.separator) it.onSelect();
      }),
      await listen<{ seq: number; refocus: boolean }>(MENU_EV.closed, (e) => {
        if (e.payload.seq === seq) finish(e.payload.refocus);
      }),
      // Owner moved or resized: the anchor is stale, close.
      await me.onMoved(() => void emitTo(MENU_LABEL, MENU_EV.close, { seq })),
      await me.onResized(() => void emitTo(MENU_LABEL, MENU_EV.close, { seq })),
    );
    const theme = document.documentElement.classList.contains("light") ? "light" : "dark";
    const payload: MenuOpen = { seq, owner: me.label, label: o.label, menuClassName: o.menuClassName, theme, anchor, items: wireRows(o.items()) };
    await emitTo(MENU_LABEL, MENU_EV.open, payload);
    if (!(await shown)) {
      done = true;
      offs.forEach((f) => f());
      void emitTo(MENU_LABEL, MENU_EV.close, { seq });
      return null;
    }
    return {
      update: () => void emitTo(MENU_LABEL, MENU_EV.update, { seq, items: wireRows(o.items()) }),
      close: () => {
        if (done) return;
        void emitTo(MENU_LABEL, MENU_EV.close, { seq });
        done = true;
        offs.forEach((f) => f());
      },
    };
  } catch {
    return null;
  }
}
