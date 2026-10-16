/**
 * Card 212 (Form 209): per-widget desk flags. Keep on top and Stay behind are mutually exclusive.
 */
import type { FloatWin } from "./types";
import type { DeskNew } from "./widget-prefs";

export type DeskFlags = Pick<FloatWin, "locked" | "behind" | "frame" | "onTop">;

/** Flags a new widget starts with (only the ones that are on, so old saves stay identical). */
export function newDeskFlags(d: DeskNew): DeskFlags {
  return { ...(d.lock ? { locked: true } : {}), ...(d.behind ? { behind: true } : {}), ...(d.frame ? { frame: true } : {}) };
}

/** Toggle one flag; turning Stay behind on turns Keep on top off, and the reverse. */
export function toggleDeskFlag(w: DeskFlags, key: "locked" | "behind" | "frame" | "onTop"): DeskFlags {
  const on = !w[key];
  if (key === "behind" && on) return { behind: true, onTop: false };
  if (key === "onTop" && on) return { onTop: true, behind: false };
  return { [key]: on };
}
