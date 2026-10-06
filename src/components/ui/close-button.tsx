import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** The one close control for dialogs, sheets and float windows: 44×44 box, 16px glyph. */
export const CloseButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }
>(({ label = "Close", className, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-label={label}
    title={label}
    className={cn(
      "inline-flex size-hit shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
      className,
    )}
    {...props}
  >
    <X className="size-4" aria-hidden />
  </button>
));
CloseButton.displayName = "CloseButton";
