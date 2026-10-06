import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Finance Manager–style Options row: title + helper + Switch control. Atrium tokens only.
 *  The whole row is a <label>, so clicking anywhere toggles the Switch (its own aria-label still names it). */
export function OptionsSwitchRow({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2.5", className)}>
      <span className="block min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{hint}</span>
      </span>
      <span className="flex shrink-0 items-center self-center">{children}</span>
    </label>
  );
}
