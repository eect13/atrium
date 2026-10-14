/**
 * Card 204 desktop widgets: snap a float box after it stops moving.
 * Edges: within 16px of a work-area edge → sit 24px in from it. Grid: round to 24px.
 */
import type { DeskSnap } from "./widget-prefs";

export type Box = { x: number; y: number; w: number; h: number };
export type Area = { x: number; y: number; w: number; h: number };

export const SNAP_RANGE = 16;
export const SNAP_MARGIN = 24;
export const SNAP_GRID = 24;

export function snapBox(box: Box, area: Area, mode: DeskSnap): { x: number; y: number } {
  if (mode === "grid") {
    return { x: area.x + Math.round((box.x - area.x) / SNAP_GRID) * SNAP_GRID, y: area.y + Math.round((box.y - area.y) / SNAP_GRID) * SNAP_GRID };
  }
  if (mode !== "edges") return { x: box.x, y: box.y };
  // Near an edge (from just past it up to range beyond the margin line) → the margin line.
  const one = (pos: number, size: number, start: number, len: number) => {
    const lo = start + SNAP_MARGIN;
    const hi = start + len - SNAP_MARGIN - size;
    if (pos >= start - SNAP_RANGE && pos <= lo + SNAP_RANGE) return lo;
    if (pos >= hi - SNAP_RANGE && pos <= start + len - size + SNAP_RANGE) return hi;
    return pos;
  };
  return { x: one(box.x, box.w, area.x, area.w), y: one(box.y, box.h, area.y, area.h) };
}

/** Widget float background with the chosen opacity (40–100%) on --card. */
export function cardAlpha(opacity: number) {
  const pct = Math.min(100, Math.max(40, Math.round(opacity)));
  return pct >= 100 ? "var(--color-card)" : `color-mix(in srgb, var(--color-card) ${pct}%, transparent)`;
}
