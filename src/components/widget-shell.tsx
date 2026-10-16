"use client";

/**
 * Card 216 §4–§6 + 216b: one TitleBar for every widget surface (dashboard card, in-page float,
 * native float). 44px bar · title left, truncates first · actions right in one cluster · ⋯ last.
 * One ResizeObserver sets data-step (xs|sm|md|lg); actions are declared once with a group and
 * either sit inline or in ⋯, never both.
 */
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import type { MenuGroups } from "@/lib/menu-groups";
import { SHELL_REVEAL, SHELL_TITLE } from "@/lib/widget-menu";
import { splitBar, stepFor, type BarAction, type Step } from "@/lib/title-bar";
import { cn } from "@/lib/utils";

export type TitleAction = BarAction<ReactNode>;

export function TitleBar({
  title,
  titleClassName,
  titleProps,
  trail,
  extra,
  actions = [],
  groups,
  menuLabel,
  desk = false,
  phone = false,
  compact = false,
  className,
  ...rest
}: {
  title: ReactNode;
  titleClassName?: string;
  titleProps?: HTMLAttributes<HTMLElement> & Record<string, unknown>;
  /** Status glyph right of the title (desk lock). */
  trail?: ReactNode;
  /** Surface-owned controls kept inline (note paper tools). */
  extra?: ReactNode;
  actions?: TitleAction[];
  groups: MenuGroups;
  menuLabel: string;
  /** Desktop float: ⋯ on hover/focus (always on touch); inline actions only at lg, on hover. */
  desk?: boolean;
  phone?: boolean;
  compact?: boolean;
} & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const raw: Step = width ? stepFor(width, { phone, compact }) : "xs";
  const step: Step = desk && raw !== "lg" ? "xs" : raw;
  const { inline, items } = splitBar(actions, groups, step);
  const flags = inline.filter((a) => a.group === "flags");
  const rest2 = inline.filter((a) => a.group !== "flags");
  return (
    <header ref={ref} data-step={step} className={cn("flex h-11 shrink-0 items-center gap-2", className)} {...rest}>
      <h3 className={cn(SHELL_TITLE, titleClassName)} {...titleProps}>
        {title}
      </h3>
      {trail}
      <div data-no-drag className={cn("flex shrink-0 items-center gap-2", desk && SHELL_REVEAL)}>
        {extra}
        {rest2.map((a) => (
          <span key={a.id} data-action={a.id} className="flex">
            {a.node}
          </span>
        ))}
        {flags.length ? (
          <span className="flex items-center gap-1">
            {flags.map((a) => (
              <span key={a.id} data-action={a.id} className="flex">
                {a.node}
              </span>
            ))}
          </span>
        ) : null}
        {items.length ? <OverflowMenu label={menuLabel} items={items} menuClassName="w-60" /> : null}
      </div>
    </header>
  );
}
