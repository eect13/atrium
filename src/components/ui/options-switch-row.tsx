import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Finance Manager–style Options row: title + helper + Switch control. Atrium tokens only. */
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
    <div className={cn("flex min-h-11 items-center justify-between gap-4 py-2.5", className)}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center self-center">{children}</div>
    </div>
  );
}
