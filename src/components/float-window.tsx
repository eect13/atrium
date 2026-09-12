"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { clampDesk, clampSize } from "@/lib/desk";
import { inkOnPaper } from "@/lib/format";
import { cn } from "@/lib/utils";

export { clampDesk, fitBox, placeWindow } from "@/lib/desk";

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

  function drag(e: React.PointerEvent, kind: "move" | "resize") {
    if (e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    onRaise();
    dragging.current = true;
    const ox = e.clientX;
    const oy = e.clientY;
    const sx = live.current.x;
    const sy = live.current.y;
    const sw = live.current.w;
    const sh = live.current.h;
    const article = articleRef.current;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (article) article.style.willChange = "transform";
    const ac = new AbortController();
    const { signal } = ac;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - ox;
      const dy = ev.clientY - oy;
      if (kind === "move") {
        const next = clampDesk(sx + dx, sy + dy, live.current.w, live.current.h);
        live.current.x = next.x;
        live.current.y = next.y;
        if (article) {
          article.style.transform = `translate(${next.x - sx}px, ${next.y - sy}px)`;
        }
      } else {
        const next = clampSize(sx, sy, Math.max(minW, sw + dx), Math.max(minH, sh + dy));
        live.current.w = next.w;
        live.current.h = next.h;
        if (article) {
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
      else onResize(live.current.w, live.current.h);
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
        "absolute flex flex-col overflow-hidden rounded-lg shadow-[var(--shadow-float)]",
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
          "flex h-11 shrink-0 cursor-grab touch-none items-center gap-1 border-b px-1.5 active:cursor-grabbing",
          paper ? "border-current/20" : "border-border bg-muted",
        )}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button,input,label")) return;
          drag(e, "move");
        }}
      >
        <span
          className={cn(
            "grow truncate px-1.5 text-xs font-medium uppercase tracking-[0.06em]",
            paper ? "opacity-70" : "text-muted-foreground",
          )}
        >
          {title}
        </span>
        {extra}
        <button
          type="button"
          className={cn(
            "flex size-9 items-center justify-center rounded-sm",
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
      <button
        type="button"
        aria-label="Resize window"
        className={cn(
          "absolute bottom-0 right-0 flex size-11 cursor-se-resize touch-none items-end justify-end p-2",
          paper ? "opacity-50" : "text-muted-foreground",
        )}
        onPointerDown={(e) => drag(e, "resize")}
      >
        <span className="block size-2.5 border-b-2 border-r-2 border-current" />
      </button>
    </article>
  );
}
