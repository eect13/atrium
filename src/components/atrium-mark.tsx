import { cn } from "@/lib/utils";

/**
 * Planet with an A cut out — Saturn as a world, the letter as the void.
 * Disk sits in a 32 viewBox (~2.5 units of pad) so a rounded tile never clips it.
 */
export const SATURN_PATH =
  "M16 2.5c7.456 0 13.5 6.044 13.5 13.5S23.456 29.5 16 29.5 2.5 23.456 2.5 16 8.544 2.5 16 2.5Zm0 4.99 7.69 13.29H8.31L16 7.49Zm0 3.53 4.57 7.89h-9.14L16 11.02Z";

export function SaturnMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path fill="currentColor" fillRule="evenodd" d={SATURN_PATH} />
    </svg>
  );
}

/** Sidebar / sheet badge: 40px tile, 36px mark — a little air, not a floating speck. */
export function AtriumBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
    >
      <SaturnMark className="size-9" />
    </div>
  );
}
