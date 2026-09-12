"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { NoteStroke } from "@/lib/types";

const MAX_STROKES = 80;
const MAX_PTS = 240;

export function NoteInk({
  strokes,
  color,
  active,
  onChange,
  className,
}: {
  strokes: NoteStroke[];
  color: string;
  active: boolean;
  onChange: (next: NoteStroke[]) => void;
  className?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const cur = useRef<{ pts: number[]; w: number } | null>(null);

  function local(e: React.PointerEvent) {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return null;
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  }

  function start(e: React.PointerEvent) {
    if (!active || e.button !== 0) return;
    const p = local(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    const w = Math.max(0.8, Math.min(3.4, 0.7 + (e.pressure > 0 ? e.pressure : 0.45) * 2.6));
    cur.current = { pts: [...p], w };
  }

  function move(e: React.PointerEvent) {
    if (!cur.current) return;
    const p = local(e);
    if (!p) return;
    if (e.pressure > 0) cur.current.w = Math.max(cur.current.w, 0.7 + e.pressure * 2.6);
    if (cur.current.pts.length < MAX_PTS * 2) cur.current.pts.push(p[0]!, p[1]!);
    const node = e.currentTarget.querySelector("[data-live]");
    if (node) {
      node.setAttribute("points", toPoints(cur.current.pts));
      node.setAttribute("stroke-width", String(cur.current.w));
    }
  }

  function end() {
    const stroke = cur.current;
    cur.current = null;
    const node = svg.current?.querySelector("[data-live]");
    if (node) node.setAttribute("points", "");
    if (!stroke || stroke.pts.length < 4) return;
    onChange([...strokes, { color, w: stroke.w, pts: stroke.pts }].slice(-MAX_STROKES));
  }

  return (
    <svg
      ref={svg}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn(
        "absolute inset-0 h-full w-full",
        active ? "z-10 cursor-crosshair touch-none" : "pointer-events-none",
        className,
      )}
      aria-hidden
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {strokes.map((s, i) => (
        <polyline
          key={i}
          fill="none"
          stroke={s.color}
          strokeWidth={s.w}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={toPoints(s.pts)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {active ? (
        <polyline
          data-live
          fill="none"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
          points=""
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}

function toPoints(pts: number[]) {
  const out: string[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push(`${pts[i]!.toFixed(2)},${pts[i + 1]!.toFixed(2)}`);
  return out.join(" ");
}
