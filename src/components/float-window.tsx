"use client";

import { useRef, type ReactNode } from "react";
import { clampDesk, clampSize, keyBox, resizeFrom, snapDesk, type ResizeCorner, type ResizeEdge } from "@/lib/desk";
import { inkOnPaper } from "@/lib/format";
import { cn } from "@/lib/utils";
import { mergeGroups, type MenuGroups } from "@/lib/menu-groups";
import { TitleBar, type TitleAction } from "@/components/widget-shell";
import { useViewRows } from "@/lib/widget-menu";

export { clampDesk, fitBox, placeWindow } from "@/lib/desk";

type Handle = ResizeCorner | ResizeEdge;

const HANDLES: { id: Handle; box: string; cursor: string }[] = [
  // FORM-WCAG #9 / O3: ≥24px hit strips (2.5.8). Visual stay opacity-0; Form flip was 6px edges.
  { id: "n", box: "left-6 right-6 top-0 h-6", cursor: "cursor-n-resize" },
  { id: "s", box: "left-6 right-6 bottom-0 h-6", cursor: "cursor-s-resize" },
  { id: "e", box: "top-6 bottom-6 right-0 w-6", cursor: "cursor-e-resize" },
  { id: "w", box: "top-6 bottom-6 left-0 w-6", cursor: "cursor-w-resize" },
  { id: "nw", box: "left-0 top-0 size-6", cursor: "cursor-nw-resize" },
  { id: "ne", box: "right-0 top-0 size-6", cursor: "cursor-ne-resize" },
  { id: "sw", box: "bottom-0 left-0 size-6", cursor: "cursor-sw-resize" },
  { id: "se", box: "bottom-0 right-0 size-6", cursor: "cursor-se-resize" },
];

export function ResizeHandles({
  onCorner,
}: {
  onCorner: (e: React.PointerEvent, corner: Handle) => void;
}) {
  return (
    <>
      {HANDLES.map((c) => (
        <div
          key={c.id}
          aria-hidden="true"
          data-resize={c.id}
          className={cn(
            "absolute z-[3] touch-none opacity-0 hover:opacity-100",
            "before:absolute before:inset-0 before:bg-transparent",
            c.box,
            c.cursor,
          )}
          onPointerDown={(e) => {
            e.stopPropagation();
            onCorner(e, c.id);
          }}
        />
      ))}
    </>
  );
}

export function FloatWindow({
  x,
  y,
  z,
  w,
  h,
  title,
  minW = 220,
  minH = 140,
  paper,
  actions,
  overlay,
  viewKind,
  menu,
  onMove,
  onResize,
  onRaise,
  onClose,
  children,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  title: string;
  minW?: number;
  minH?: number;
  paper?: string;
  /** Card 219: title-bar actions (priority/steps apply; no inline bypass). */
  actions?: TitleAction[];
  /** Popover anchors that ride with the window (note Colour… / Delete confirm). */
  overlay?: ReactNode;
  /** Card 218 F2: widget kind whose view switches join this ⋯ (same as the native float). */
  viewKind?: string;
  /** Card 216: feature ⋯ groups (view options, Open in Atrium…); Close is appended last. */
  menu?: MenuGroups;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onRaise: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const viewRows = useViewRows(viewKind ?? "");
  const dragging = useRef(false);
  const live = useRef({ x, y, w, h });
  if (!dragging.current) live.current = { x, y, w, h };

  function drag(e: React.PointerEvent, kind: "move" | Handle) {
    if (e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    onRaise();
    dragging.current = true;
    const ox = e.clientX;
    const oy = e.clientY;
    const start = { ...live.current };
    const article = articleRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (article) article.style.willChange = "transform";
    const ac = new AbortController();
    const { signal } = ac;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - ox;
      const dy = ev.clientY - oy;
      if (kind === "move") {
        const next = clampDesk(start.x + dx, start.y + dy, live.current.w, live.current.h);
        live.current.x = next.x;
        live.current.y = next.y;
        if (article) {
          article.style.transform = `translate(${next.x - start.x}px, ${next.y - start.y}px)`;
        }
      } else {
        const raw = resizeFrom(kind, start, dx, dy, minW, minH);
        const sized = clampSize(raw.x, raw.y, raw.w, raw.h);
        const pos = clampDesk(raw.x, raw.y, sized.w, sized.h);
        live.current = { x: pos.x, y: pos.y, w: sized.w, h: sized.h };
        if (article) {
          article.style.transform = "";
          article.style.left = `${live.current.x}px`;
          article.style.top = `${live.current.y}px`;
          article.style.width = `${live.current.w}px`;
          article.style.height = `${live.current.h}px`;
        }
      }
    };
    const stop = () => {
      ac.abort();
      dragging.current = false;
      if (article) {
        article.style.transform = "";
        article.style.willChange = "";
        article.style.left = `${live.current.x}px`;
        article.style.top = `${live.current.y}px`;
      }
      if (kind === "move") {
        const snapped = snapDesk(live.current.x, live.current.y, live.current.w, live.current.h);
        live.current.x = snapped.x;
        live.current.y = snapped.y;
        if (article) {
          article.style.left = `${snapped.x}px`;
          article.style.top = `${snapped.y}px`;
        }
        onMove(snapped.x, snapped.y);
      } else {
        onMove(live.current.x, live.current.y);
        onResize(live.current.w, live.current.h);
      }
    };
    window.addEventListener("pointermove", move, { signal });
    window.addEventListener("pointerup", stop, { signal });
    window.addEventListener("pointercancel", stop, { signal });
    window.addEventListener("lostpointercapture", stop, { signal });
  }

  const geom = live.current;
  const ink = paper ? inkOnPaper(paper) : undefined;

  return (
    <article
      ref={articleRef}
      aria-label={title}
      className={cn(
        "group absolute flex flex-col overflow-hidden rounded-xl shadow-[var(--shadow-float)]",
        paper ? "" : "bg-card text-card-foreground",
      )}
      style={{
        left: geom.x,
        top: geom.y,
        width: geom.w,
        height: geom.h,
        zIndex: z,
        backgroundColor: paper || undefined,
        color: ink,
      }}
      onPointerDown={onRaise}
    >
      {/* Card 216 §6: the shared title bar; the header itself takes Arrow (move) / Shift+Arrow (resize). */}
      <TitleBar
        tabIndex={0}
        aria-label={`${title}: arrows move, Shift+arrows resize`}
        className={cn(
          "group/bar cursor-grab touch-none px-2 pl-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing",
          paper ? "" : "bg-card",
        )}
        title={title}
        titleClassName={paper ? "text-current opacity-80" : undefined}
        actions={actions}
        menuLabel={`${title} menu`}
        groups={mergeGroups({ view: viewRows }, menu, { close: [{ label: "Close", onSelect: onClose }] })}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button,input,label,a,[data-no-drag]")) return;
          drag(e, "move");
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const next = keyBox(live.current, e.key, e.shiftKey, minW, minH);
          if (!next) return;
          e.preventDefault();
          onRaise();
          live.current = next;
          if (next.x !== x || next.y !== y) onMove(next.x, next.y);
          if (next.w !== w || next.h !== h) onResize(next.w, next.h);
        }}
      />
      <div className="scroll-auto min-h-0 flex-1 bg-inherit px-4 pb-4">{children}</div>
      {overlay}
      <ResizeHandles onCorner={(e, corner) => drag(e, corner)} />
    </article>
  );
}
