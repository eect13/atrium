import { Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Trigger attr: ConfirmRow returns focus here on Cancel and moves to the next one on confirm. */
const TRIGGER = "data-confirm-trigger";
/** Put on the list's search/primary input: the focus target when no row is left. */
export const CONFIRM_HOME = { "data-confirm-home": "" } as const;

function triggerIn(el: Element | null | undefined) {
  return el?.querySelector<HTMLElement>(`[${TRIGGER}]`) ?? null;
}

function focusLater(get: () => HTMLElement | null | undefined) {
  requestAnimationFrame(() => get()?.focus());
}

/** 44×44 Trash icon that opens a ConfirmRow for `id`. */
export function ConfirmTrigger({
  id,
  label,
  onClick,
  className,
}: {
  id: string;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      {...{ [TRIGGER]: id }}
      className={cn(
        "inline-flex size-hit shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label={label}
      onClick={onClick}
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  );
}

type Props = {
  /** The item being removed, shown in bold. */
  subject: string;
  verb: "Delete" | "Remove";
  /** One neutral consequence sentence. */
  detail?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Id carried by this row's trigger (ConfirmTrigger or `data-confirm-trigger`). */
  triggerId?: string;
  as?: "div" | "li";
  className?: string;
  bodyClassName?: string;
  messageClassName?: string;
  actionsClassName?: string;
  buttonClassName?: string;
  /** Leading slot (e.g. a drag grip that keeps the row's shape). */
  lead?: React.ReactNode;
  /** Extra lines under the message; when set, `detail` is not inlined. */
  children?: React.ReactNode;
};

/** The shared inline destructive confirm (interests, hub, categories, clocks, feed sources). */
export function ConfirmRow({
  subject,
  verb,
  detail,
  onConfirm,
  onCancel,
  triggerId,
  as: As = "div",
  className,
  bodyClassName,
  messageClassName,
  actionsClassName,
  buttonClassName,
  lead,
  children,
}: Props) {
  const ref = React.useRef<HTMLElement | null>(null);
  const cancel = () => {
    onCancel();
    if (triggerId) focusLater(() => document.querySelector<HTMLElement>(`[${TRIGGER}="${CSS.escape(triggerId)}"]`));
  };
  const confirm = () => {
    const row = ref.current;
    const next =
      triggerIn(row?.nextElementSibling)
      ?? triggerIn(row?.previousElementSibling)
      ?? row?.closest('[role="dialog"]')?.querySelector<HTMLElement>("[data-confirm-home]")
      ?? null;
    onConfirm();
    focusLater(() => (next?.isConnected ? next : null));
  };
  return (
    <As
      ref={ref as never}
      role="group"
      aria-label={`${verb} ${subject}?`}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5",
        className,
      )}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        cancel();
      }}
    >
      {lead}
      <div className={cn("min-w-0 grow", bodyClassName)}>
        <p className={cn("text-sm", messageClassName)}>
          {verb} <strong className="font-semibold">{subject}</strong>?{detail && !children ? ` ${detail}` : null}
        </p>
        {children}
      </div>
      <div className={cn("ml-auto flex gap-2", actionsClassName)}>
        <Button type="button" variant="outline" className={buttonClassName} onClick={cancel} autoFocus>
          Cancel
        </Button>
        <Button type="button" variant="destructive" className={buttonClassName} onClick={confirm}>
          {verb}
        </Button>
      </div>
    </As>
  );
}
