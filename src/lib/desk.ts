/** Geometry for floating windows — sidebar on desktop, header + dock on a phone. */

export const MD = 768;
export const DESK_SIDEBAR = 224;
export const DESK_HEADER = 56;
/** Tab chips + home-indicator. Matches `.pb-dock` (chips ~52px + safe-area). */
export const DESK_DOCK = 72;
/** Keep this much of a float on-screen so a big window can still be grabbed. */
export const DESK_GRIP = 48;

export type ResizeCorner = "nw" | "ne" | "sw" | "se";
export type ResizeEdge = "n" | "s" | "e" | "w";
export type ResizeHandle = ResizeCorner | ResizeEdge;

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

export function clampDesk(x: number, y: number, w = 0, h = 0) {
  if (typeof window === "undefined") return { x, y };
  const { minX, minY, padB } = deskMin();
  const grip = Math.min(DESK_GRIP, Math.max(32, w || DESK_GRIP));
  const gripY = Math.min(DESK_GRIP, Math.max(32, h || DESK_GRIP));
  const maxX = Math.max(minX, window.innerWidth - grip);
  const maxY = Math.max(minY, window.innerHeight - padB - gripY);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
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
