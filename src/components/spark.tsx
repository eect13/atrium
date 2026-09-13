import { useEffect, useRef, useState } from "react";
import { chgPct } from "@/lib/format";
import { pointsToPath } from "@/lib/sparks";
import { cn } from "@/lib/utils";

function lastDot(values: number[], w: number, h: number, pad: number, lo: number, span: number) {
  const v = values[values.length - 1]!;
  return {
    x: w,
    y: h - ((v - lo) / span) * (h - pad * 2) - pad,
  };
}

export function Spark({ values, up, className }: { values?: number[]; up: boolean; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState({ w: 160, h: 36 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(48, Math.round(r.width * (window.devicePixelRatio || 1)));
      const h = Math.max(24, Math.round(r.height * (window.devicePixelRatio || 1)));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!values || values.length < 2) {
    return <span ref={box} className={cn("inline-block h-8 w-full sm:h-9", className)} />;
  }

  const pad = 3;
  const { line, area, lo, span } = pointsToPath(values, size.w, size.h, pad);
  const dot = lastDot(values, size.w, size.h, pad, lo, span);
  return (
    <span ref={box} className={cn("inline-block h-8 w-full sm:h-9", className)}>
      <svg
        viewBox={`0 0 ${size.w} ${size.h}`}
        className={cn("h-full w-full", up ? "text-ok" : "text-destructive")}
        preserveAspectRatio="none"
        aria-hidden
      >
        <path fill="currentColor" opacity="0.12" d={area} />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={Math.max(1.2, size.h / 28)}
          strokeLinejoin="round"
          strokeLinecap="round"
          d={line}
        />
        <circle cx={Math.max(3, dot.x - 2)} cy={dot.y} r={Math.max(2, size.h / 16)} fill="currentColor" />
      </svg>
    </span>
  );
}

export function ChangePill({ value }: { value?: number }) {
  if (value == null || !Number.isFinite(value)) {
    return (
      <span className="inline-flex h-9 min-w-14 items-center justify-center text-xs text-muted-foreground sm:min-w-16">
        —
      </span>
    );
  }
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex h-9 min-w-14 items-center justify-center rounded-md px-1.5 font-mono text-xs tabular-nums sm:min-w-16 sm:px-2",
        up ? "bg-ok/20 text-ok" : "bg-destructive/20 text-destructive",
      )}
    >
      {chgPct(value)}
    </span>
  );
}

export function TickMark({ label }: { label: string }) {
  const letters = label.replace(/[^A-Za-z0-9]/g, "").slice(0, 3) || "?";
  return (
    <span
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[0.65rem] font-medium tracking-tight text-foreground"
      aria-hidden
    >
      {letters}
    </span>
  );
}
