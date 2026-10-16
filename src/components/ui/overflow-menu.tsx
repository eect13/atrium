"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/lib/menu-groups";


export type OverflowItem = MenuItem;

/**
 * 44px "⋯" trigger + menu (extracted from the Hub card menu, Form 152 N11).
 * Esc / outside click close and return focus to the trigger; Arrow Up/Down/Home/End move between items.
 * `open`/`onOpenChange` are optional so a parent can open it (e.g. Shift+F10 on a card).
 */
export function OverflowMenu({
  label,
  items,
  open: openProp,
  onOpenChange,
  className,
  triggerClassName,
  menuClassName = "w-40",
  icon,
}: {
  label: string;
  items: OverflowItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  /** Trigger glyph; ⋯ unless a feature menu has its own icon (e.g. the desk Windows menu). */
  icon?: React.ReactNode;
}) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const root = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const menu = useRef<HTMLDivElement | null>(null);

  function set(next: boolean, refocus = false) {
    if (openProp === undefined) setOwn(next);
    onOpenChange?.(next);
    if (!next && refocus) trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    menu.current
      ?.querySelector<HTMLElement>('[role="menuitem"],[role="menuitemcheckbox"]')
      ?.focus();
    const ac = new AbortController();
    window.addEventListener(
      "pointerdown",
      (e) => {
        if (!root.current?.contains(e.target as Node)) set(false, true);
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    const rows = Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"],[role="menuitemcheckbox"]') ??
        [],
    );
    const at = rows.indexOf(document.activeElement as HTMLElement);
    let to = -1;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      set(false, true);
      return;
    }
    if (e.key === "ArrowDown") to = (at + 1) % rows.length;
    else if (e.key === "ArrowUp") to = (at - 1 + rows.length) % rows.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = rows.length - 1;
    else if (e.key === "Tab") set(false);
    if (to >= 0) {
      e.preventDefault();
      rows[to]?.focus();
    }
  }

  return (
    <div ref={root} className={cn("relative shrink-0", className)}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          triggerClassName ?? "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        onClick={(e) => {
          e.stopPropagation();
          set(!open);
        }}
      >
        {icon ?? <MoreHorizontal className="size-4" />}
      </button>
      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          onKeyDown={onKey}
          className={cn(
            "absolute right-0 top-12 z-30 rounded-md bg-card p-1.5 text-card-foreground shadow-[var(--shadow-float)]",
            menuClassName,
          )}
        >
          {items.map((it, i) =>
            it.separator ? (
              <div
                key={i}
                role="separator"
                aria-orientation="horizontal"
                className="my-1 h-px bg-border"
              />
            ) : (
              <button
                key={i}
                type="button"
                role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={it.checked}
                tabIndex={-1}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-sm px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  it.destructive ? "text-destructive hover:bg-destructive/15" : "hover:bg-muted",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (it.checked === undefined) set(false, true);
                  it.onSelect();
                }}
              >
                <span className="min-w-0 flex-1">{it.label}</span>
                {it.checked === undefined ? null : (
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                      it.checked ? "border-transparent bg-ok" : "border-border bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "block size-5 rounded-full shadow-sm transition-transform",
                        it.checked ? "translate-x-5 bg-background" : "translate-x-0 bg-foreground",
                      )}
                    />
                  </span>
                )}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}
