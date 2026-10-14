/**
 * Card 204 desktop widgets: snap a float box after it stops moving.
 * Edges: within 16px of a work-area edge → sit 24px in from it; Card 206: or within 16px of
 * another widget → sit 24px beside it (or line up with its edge). Grid: round to 24px.
 */
import type { DeskSnap } from "./widget-prefs";

export type Box = { x: number; y: number; w: number; h: number };
export type Area = { x: number; y: number; w: number; h: number };

export const SNAP_RANGE = 16;
export const SNAP_MARGIN = 24;
export const SNAP_GRID = 24;

/** Nearest candidate within range, else the position unchanged. */
function nearest(pos: number, cands: number[]) {
  let best = pos;
  let gap = SNAP_RANGE + 1;
  for (const c of cands) {
    const d = Math.abs(pos - c);
    if (d < gap) {
      gap = d;
      best = c;
    }
  }
  return best;
}

/** Other widgets count only when they are beside this one on the other axis (within margin + range). */
function widgetCands(box: Box, others: Box[], axis: "x" | "y") {
  const out: number[] = [];
  for (const o of others) {
    const near = SNAP_MARGIN + SNAP_RANGE;
    const overlap = axis === "x" ? box.y < o.y + o.h + near && o.y < box.y + box.h + near : box.x < o.x + o.w + near && o.x < box.x + box.w + near;
    if (!overlap) continue;
    if (axis === "x") out.push(o.x + o.w + SNAP_MARGIN, o.x - SNAP_MARGIN - box.w, o.x, o.x + o.w - box.w);
    else out.push(o.y + o.h + SNAP_MARGIN, o.y - SNAP_MARGIN - box.h, o.y, o.y + o.h - box.h);
  }
  return out;
}

export function snapBox(box: Box, area: Area, mode: DeskSnap, others: Box[] = []): { x: number; y: number } {
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
  const ex = one(box.x, box.w, area.x, area.w);
  const ey = one(box.y, box.h, area.y, area.h);
  return {
    x: ex !== box.x ? ex : nearest(box.x, widgetCands(box, others, "x")),
    y: ey !== box.y ? ey : nearest(box.y, widgetCands(box, others, "y")),
  };
}

/** Widget float background with the chosen opacity (40–100%) on --card. */
export function cardAlpha(opacity: number) {
  const pct = Math.min(100, Math.max(40, Math.round(opacity)));
  return pct >= 100 ? "var(--color-card)" : `color-mix(in srgb, var(--color-card) ${pct}%, transparent)`;
}

/** Every other open desk float's box (widgets + pinned notes), from main's merged state. */
export function deskNeighbours(s: { windows: (Box & { id: string })[]; notes: (Box & { id: string; pinned: boolean })[] }, kind: "note" | "widget", id: string): Box[] {
  return [...s.windows.filter((w) => !(kind === "widget" && w.id === id)), ...s.notes.filter((n) => n.pinned && !(kind === "note" && n.id === id))].map(({ x, y, w, h }) => ({ x, y, w, h }));
}
