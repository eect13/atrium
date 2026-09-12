"use client";

import { useRef, type ReactNode } from "react";
import { GripHorizontal, X } from "lucide-react";
import { clampDesk, clampSize, resizeFrom, type ResizeCorner } from "@/lib/desk";
import { inkOnPaper } from "@/lib/format";
import { cn } from "@/lib/utils";

export { clampDesk, fitBox, placeWindow } from "@/lib/desk";

const CORNERS: { id: ResizeCorner; box: string; cursor: string; mark: string }[] = [
  { id: "nw", box: "left-0 top-0 items-start justify-start", cursor: "cursor-nw-resize", mark: "border-l-2 border-t-2" },
  { id: "ne", box: "right-0 top-0 items-start justify-end", cursor: "cursor-ne-resize", mark: "border-r-2 border-t-2" },
  { id: "sw", box: "bottom-0 left-0 items-end justify-start", cursor: "cursor-sw-resize", mark: "border-b-2 border-l-2" },
  { id: "se", box: "bottom-0 right-0 items-end justify-end", cursor: "cursor-se-resize", mark: "border-b-2 border-r-2" },
];

export function ResizeHandles({
  onCorner,
}: {
  onCorner: (e: React.PointerEvent, corner: ResizeCorner) => void;
}) {
  return (
    <>
      {CORNERS.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-label={`Resize ${c.id}`}
          className={cn(
            "absolute z-[3] flex size-8 touch-none p-1.5 opacity-30 md:size-5 md:p-0.5 md:opacity-0 md:group-hover:opacity-50 md:group-focus-within:opacity-50",
            c.box,
            c.cursor,
          )}
          onPointerDown={(e) => {
            e.stopPropagation();
            onCorner(e, c.id);
          }}
        >
          <span className={cn("block size-2.5 border-current", c.mark)} />
        </button>
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
  extra,
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
  extra?: ReactNode;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onRaise: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const dragging = useRef(false);
  const live = useRef({ x, y, w, h });
  if (!dragging.current) live.current = { x, y, w, h };

  function drag(e: React.PointerEvent, kind: "move" | ResizeCorner) {
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
      if (kind === "move") onMove(live.current.x, live.current.y);
      else {
        onMove(live.current.x, live.current.y);
        onResize(live.current.w, live.current.h);
      }
    };
    window.addEventListener("pointermove", move, { signal });
    window.addEventListener("pointerup", stop, { signal });
    window.addEventListener("pointercancel", stop, { signal });
  }

  const geom = live.current;
  const ink = paper ? inkOnPaper(paper) : undefined;

  return (
    <article
      ref={articleRef}
      className={cn(
        "group absolute flex flex-col overflow-hidden rounded-lg shadow-[var(--shadow-float)]",
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
      <header
        className={cn(
          "relative z-[2] flex h-11 shrink-0 cursor-grab touch-none items-center gap-1 border-b px-1.5 active:cursor-grabbing",
          paper ? "border-current/20" : "border-border bg-muted",
        )}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button,input,label")) return;
          drag(e, "move");
        }}
      >
        <span
          className={cn(
            "shrink-0 truncate px-1.5 text-xs font-medium uppercase tracking-[0.06em]",
            paper ? "opacity-70" : "text-muted-foreground",
          )}
        >
          {title}
        </span>
        <span className="flex min-w-0 grow justify-center" aria-hidden>
          <GripHorizontal className={cn("size-4 opacity-0 group-hover:opacity-40", paper ? "" : "text-muted-foreground")} />
        </span>
        {extra ? <span className="relative z-[4] flex items-center">{extra}</span> : null}
        <button
          type="button"
          className={cn(
            "relative z-[4] flex size-9 items-center justify-center rounded-sm",
            paper
              ? "opacity-70 hover:bg-black/10 hover:opacity-100"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          aria-label="Close window"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="scroll-auto min-h-0 flex-1 bg-inherit p-3">{children}</div>
      <ResizeHandles onCorner={(e, corner) => drag(e, corner)} />
    </article>
  );
}
