import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared native <select> look (border-input boundary, 44px). Used by Finance and Calendar. */
export const FIELD_SELECT =
  "h-11 w-full rounded-md border border-input bg-muted px-3 text-sm";

export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 min-w-hit shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-xs",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
