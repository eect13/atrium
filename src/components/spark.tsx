import { chgPct } from "@/lib/format";
import { pointsToPath } from "@/lib/sparks";
import { cn } from "@/lib/utils";

export function Spark({ values, up, className }: { values?: number[]; up: boolean; className?: string }) {
  if (!values || values.length < 2) {
    return <span className={cn("inline-block h-7 w-14 sm:h-8 sm:w-16", className)} />;
  }
  const w = 120;
  const h = 36;
  const { line, area } = pointsToPath(values, w, h);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-7 w-14 shrink-0 sm:h-8 sm:w-16", up ? "text-ok" : "text-destructive", className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path fill="currentColor" opacity="0.16" d={area} />
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" d={line} />
    </svg>
  );
}

export function ChangePill({ value }: { value?: number }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="inline-flex h-9 min-w-16 items-center justify-center text-xs text-muted-foreground">—</span>;
  }
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex h-9 min-w-16 items-center justify-center rounded-md px-2 font-mono text-xs tabular-nums",
        up ? "bg-ok/20 text-ok" : "bg-destructive/20 text-destructive",
      )}
    >
      {chgPct(value)}
    </span>
  );
}

export function TickMark({ label }: { label: string }) {
  const letters = label.replace(/[^A-Za-z0-9]/g, "").slice(0, 2) || "?";
  return (
    <span
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs text-foreground"
      aria-hidden
    >
      {letters}
    </span>
  );
}
