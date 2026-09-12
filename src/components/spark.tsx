import { chgPct } from "@/lib/format";
import { pointsToPath } from "@/lib/sparks";
import { cn } from "@/lib/utils";

function lastDot(values: number[], w: number, h: number, pad = 1) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const v = values[values.length - 1]!;
  return {
    x: w,
    y: h - ((v - min) / span) * (h - pad * 2) - pad,
  };
}

export function Spark({ values, up, className }: { values?: number[]; up: boolean; className?: string }) {
  if (!values || values.length < 2) {
    return <span className={cn("inline-block h-8 w-full sm:h-9", className)} />;
  }
  const w = 160;
  const h = 44;
  const { line, area } = pointsToPath(values, w, h);
  const dot = lastDot(values, w, h);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-8 w-full shrink-0 sm:h-9", up ? "text-ok" : "text-destructive", className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path fill="currentColor" opacity="0.1" d={area} />
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" d={line} />
      <circle cx={Math.max(3, dot.x - 2)} cy={dot.y} r="2.4" fill="currentColor" />
    </svg>
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
