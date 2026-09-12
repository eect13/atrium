import { cn } from "@/lib/utils";

/**
 * Chevron in a ring — a command mark, not a planet.
 * Ring is a thin evenodd torus so it still reads at 16px; chevron sits through it.
 */
export const MARK_CHEVRON = "M16 4.4 26.8 27.6h-5.3L16 12.4 10.5 27.6H5.2Z";
export const MARK_RING =
  "M16 11.35a13.5 4.7 0 1 1 0 9.4 13.5 4.7 0 1 1 0-9.4Zm0 2.45a11 2.25 0 1 0 0 4.5 11 2.25 0 1 0 0-4.5Z";

export function AtriumMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path fill="currentColor" fillRule="evenodd" d={MARK_RING} />
      <path fill="currentColor" d={MARK_CHEVRON} />
    </svg>
  );
}

/** Sidebar / sheet badge: 40px tile, 32px mark — air around the ring. */
export function AtriumBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
    >
      <AtriumMark className="size-8" />
    </div>
  );
}