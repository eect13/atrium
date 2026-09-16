"use client";

import { useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { clampDesk, clampSize, resizeFrom, snapDesk, type ResizeCorner, type ResizeEdge } from "@/lib/desk";
import { inkOnPaper } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";

export { clampDesk, fitBox, placeWindow } from "@/lib/desk";

type Handle = ResizeCorner | ResizeEdge;

const HANDLES: { id: Handle; box: string; cursor: string }[] = [
  { id: "n", box: "left-3 right-3 top-0 h-1.5", cursor: "cursor-n-resize" },
  { id: "s", box: "left-3 right-3 bottom-0 h-1.5", cursor: "cursor-s-resize" },
  { id: "e", box: "top-3 bottom-3 right-0 w-1.5", cursor: "cursor-e-resize" },
  { id: "w", box: "top-3 bottom-3 left-0 w-1.5", cursor: "cursor-w-resize" },
  { id: "nw", box: "left-0 top-0 size-3", cursor: "cursor-nw-resize" },
  { id: "ne", box: "right-0 top-0 size-3", cursor: "cursor-ne-resize" },
  { id: "sw", box: "bottom-0 left-0 size-3", cursor: "cursor-sw-resize" },
  { id: "se", box: "bottom-0 right-0 size-3", cursor: "cursor-se-resize" },
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
          role="separator"
          aria-label={`Resize ${c.id}`}
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
          if ((e.target as HTMLElement).closest("button,input,label,a,[data-no-drag]")) return;
          drag(e, "move");
        }}
      >
        <span
          className={cn(
            "min-w-0 grow truncate px-1.5 text-xs font-medium tracking-wide",
            paper ? "opacity-80" : "text-muted-foreground",
          )}
        >
          {title}
        </span>
        {extra ? <span className="relative z-[4] flex shrink-0 items-center" data-no-drag>{extra}</span> : null}
        <Tip label="Close">
          <button
            type="button"
            className={cn(
              "relative z-[4] flex size-8 shrink-0 items-center justify-center rounded-sm",
              paper
                ? "opacity-70 hover:bg-black/10 hover:opacity-100"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-label="Close window"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </Tip>
      </header>
      <div className="scroll-auto min-h-0 flex-1 bg-inherit p-3">{children}</div>
      <ResizeHandles onCorner={(e, corner) => drag(e, corner)} />
    </article>
  );
}
