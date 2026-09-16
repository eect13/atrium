/** Geometry for floating windows — sidebar on desktop, header + dock on a phone. */

export const MD = 768;
export const DESK_SIDEBAR = 224;
export const DESK_HEADER = 56;
/** Tab chips + home-indicator. Matches `.pb-dock` (chips ~52px + safe-area). */
export const DESK_DOCK = 72;
/** Title bar height — close control lives here, so it must stay on-screen. */
export const DESK_BAR = 44;
/** Snap-to-edge distance. */
export const DESK_SNAP = 24;

export type ResizeCorner = "nw" | "ne" | "sw" | "se";
export type ResizeEdge = "n" | "s" | "e" | "w";
export type ResizeHandle = ResizeCorner | ResizeEdge;
export type DeskBox = { x: number; y: number; w: number; h: number };
export const WIDGET_KINDS = ["weather", "agenda", "calendar", "quote", "finance", "news"] as const;

export function isNarrow(width = typeof window === "undefined" ? 1280 : window.innerWidth) {
  return width < MD;
}

export function deskMin(width?: number) {
  const w = width ?? (typeof window === "undefined" ? 1280 : window.innerWidth);
  const narrow = isNarrow(w);
  return {
    minX: narrow ? 8 : DESK_SIDEBAR,
    minY: DESK_HEADER,
    padB: narrow ? DESK_DOCK : 16,
  };
}

function maxOrigin(min: number, span: number, limit: number) {
  return Math.max(min, limit - Math.max(span, DESK_BAR));
}

export function clampDesk(x: number, y: number, w = 0, h = 0) {
  if (typeof window === "undefined") return { x, y };
  const { minX, minY, padB } = deskMin();
  const ww = w > 0 ? w : DESK_BAR;
  const maxX = maxOrigin(minX, ww, window.innerWidth);
  const maxY = maxOrigin(minY, DESK_BAR, window.innerHeight - padB);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

/** Pull a box onto the nearest desk edge when it is close enough. */
export function snapDesk(x: number, y: number, w: number, h: number) {
  if (typeof window === "undefined") return { x, y };
  const next = clampDesk(x, y, w, h);
  const { minX, minY, padB } = deskMin();
  const maxX = maxOrigin(minX, w > 0 ? w : DESK_BAR, window.innerWidth);
  const maxY = maxOrigin(minY, DESK_BAR, window.innerHeight - padB);
  let nx = next.x;
  let ny = next.y;
  if (Math.abs(nx - minX) <= DESK_SNAP) nx = minX;
  else if (Math.abs(nx - maxX) <= DESK_SNAP) nx = maxX;
  if (Math.abs(ny - minY) <= DESK_SNAP) ny = minY;
  else if (Math.abs(ny - maxY) <= DESK_SNAP) ny = maxY;
  return { x: nx, y: ny };
}

export function clampSize(x: number, y: number, w: number, h: number) {
  if (typeof window === "undefined") return { w, h };
  const { padB } = deskMin();
  const maxW = Math.max(180, window.innerWidth - Math.min(x, window.innerWidth - 180) - 8);
  const maxH = Math.max(140, window.innerHeight - Math.min(y, window.innerHeight - 140) - padB);
  return {
    w: Math.min(Math.max(w, 180), maxW),
    h: Math.min(Math.max(h, 120), maxH),
  };
}

export function fitBox(x: number, y: number, w: number, h: number) {
  if (typeof window === "undefined") return { x, y, w, h };
  const { minX, minY, padB } = deskMin();
  const maxW = Math.max(180, window.innerWidth - minX - 8);
  const maxH = Math.max(140, window.innerHeight - minY - padB);
  const nw = Math.min(Math.max(w, 180), maxW);
  const nh = Math.min(Math.max(h, 120), maxH);
  return { ...clampDesk(x, y, nw, nh), w: nw, h: nh };
}

export function placeWindow(size: { w: number; h: number }, index = 0) {
  if (typeof window === "undefined") {
    return { x: 248 + index * 28, y: 80 + index * 24, w: size.w, h: size.h };
  }
  const { minX, minY } = deskMin();
  const step = isNarrow() ? 12 : 28;
  return fitBox(minX + 8 + index * step, minY + 8 + index * (isNarrow() ? 16 : 24), size.w, size.h);
}

export function normalizeWinBox(raw?: unknown): Partial<Record<(typeof WIDGET_KINDS)[number], DeskBox>> {
  const out: Partial<Record<(typeof WIDGET_KINDS)[number], DeskBox>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const id of WIDGET_KINDS) {
    const b = (raw as Record<string, unknown>)[id];
    if (!b || typeof b !== "object") continue;
    const box = b as Record<string, unknown>;
    const x = Number(box.x);
    const y = Number(box.y);
    const w = Number(box.w);
    const h = Number(box.h);
    if ([x, y, w, h].every(Number.isFinite)) out[id] = { x, y, w, h };
  }
  return out;
}

/** Reopen a float at its last box; fall back to a cascade if we never saved one. */
export function restoreBox(saved: DeskBox | undefined, size: { w: number; h: number }, index = 0): DeskBox {
  if (!saved) return placeWindow(size, index);
  return fitBox(saved.x, saved.y, saved.w || size.w, saved.h || size.h);
}

/** True when clamp would move the box — title bar / close would not stay on-screen. */
export function boxOffscreen(x: number, y: number, w: number, h: number) {
  if (typeof window === "undefined") return false;
  const next = clampDesk(x, y, w, h);
  return next.x !== x || next.y !== y;
}

/** Resize from a corner or edge. North/west moves origin; south/east grows. */
export function resizeFrom(
  handle: ResizeHandle,
  start: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
  minW = 180,
  minH = 120,
) {
  let x = start.x;
  let y = start.y;
  let w = start.w;
  let h = start.h;
  if (handle === "se") {
    w = start.w + dx;
    h = start.h + dy;
  } else if (handle === "sw") {
    w = start.w - dx;
    h = start.h + dy;
    x = start.x + dx;
  } else if (handle === "ne") {
    w = start.w + dx;
    h = start.h - dy;
    y = start.y + dy;
  } else if (handle === "nw") {
    w = start.w - dx;
    h = start.h - dy;
    x = start.x + dx;
    y = start.y + dy;
  } else if (handle === "n") {
    h = start.h - dy;
    y = start.y + dy;
  } else if (handle === "s") {
    h = start.h + dy;
  } else if (handle === "e") {
    w = start.w + dx;
  } else if (handle === "w") {
    w = start.w - dx;
    x = start.x + dx;
  }
  if (w < minW) {
    if (handle === "nw" || handle === "sw" || handle === "w") x -= minW - w;
    w = minW;
  }
  if (h < minH) {
    if (handle === "nw" || handle === "ne" || handle === "n") y -= minH - h;
    h = minH;
  }
  return { x, y, w, h };
}
