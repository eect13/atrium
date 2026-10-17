"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { autoUpdate, flip, offset, shift, size, useFloating } from "@floating-ui/react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/lib/menu-groups";
import { inNativeFloat, openNativeMenu, type NativeMenuHandle } from "@/lib/native-menu";
import { MENU_PANEL, focusFirstRow, menuKeys } from "@/lib/menu-keys";

export type OverflowItem = MenuItem;

/** The rows (separators, 44px items, switch toggles, destructive in red). Same markup everywhere. */
export function MenuRows({ items, onPick }: { items: PanelRow[]; onPick: (index: number) => void }) {
  return (
    <>
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} role="separator" aria-orientation="horizontal" className="my-1 h-px bg-border" />
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
              onPick(i);
            }}
          >
            <span className="min-w-0 flex-1">{it.label}</span>
            {it.checked === undefined ? null : (
              <span aria-hidden className={cn("inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors", it.checked ? "border-transparent bg-ok" : "border-border bg-muted")}>
                <span className={cn("block size-5 rounded-full shadow-sm transition-transform", it.checked ? "translate-x-5 bg-background" : "translate-x-0 bg-foreground")} />
              </span>
            )}
          </button>
        ),
      )}
    </>
  );
}

type PanelRow = { label?: React.ReactNode; checked?: boolean; destructive?: boolean; separator?: boolean };
/** The ⋯ panel (role="menu"): one component for the page portal and the desktop popup window. */
export function MenuPanel({
  ref,
  label,
  items,
  onPick,
  className,
  ...rest
}: { ref?: React.Ref<HTMLDivElement>; label: string; items: PanelRow[]; onPick: (index: number) => void; className?: string } & Omit<React.HTMLAttributes<HTMLDivElement>, "role">) {
  return (
    <div ref={ref} role="menu" aria-label={label} className={cn(MENU_PANEL, className)} {...rest}>
      <MenuRows items={items} onPick={onPick} />
    </div>
  );
}

/**
 * 44px "⋯" trigger + menu (extracted from the Hub card menu, Form 152 N11).
 * Esc / outside click close and return focus to the trigger; Arrow Up/Down/Home/End move between items.
 * `open`/`onOpenChange` are optional so a parent can open it (e.g. Shift+F10 on a card).
 * Card 228 (Form 227 B4–B7): the menu is portalled to <body> and placed with floating-ui (bottom-end,
 * flip/shift/size, 8px padding). In a desktop float it opens in the shared "menu" popup window instead,
 * so it can leave the float; if that window is unavailable it falls back to the in-window portal.
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
  const native = useRef<NativeMenuHandle | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  /** "native" while the popup window shows it; "page" for the in-window portal. */
  const [mode, setMode] = useState<"page" | "native" | null>(null);

  const set = useCallback(
    (next: boolean, refocus = false) => {
      if (openProp === undefined) setOwn(next);
      onOpenChange?.(next);
      if (!next && refocus) trigger.current?.focus();
    },
    [openProp, onOpenChange],
  );

  const { refs, floatingStyles, isPositioned } = useFloating({
    open: open && mode === "page",
    placement: "bottom-end",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(88, Math.floor(availableHeight))}px`;
        },
      }),
    ],
  });
  const setReference = refs.setReference;
  const setFloating = refs.setFloating;

  // Choose where to render on open: the popup window in a desktop float, else the page portal.
  useEffect(() => {
    if (!open) {
      setMode(null);
      native.current?.close();
      native.current = null;
      return;
    }
    if (!inNativeFloat() || !trigger.current) {
      setMode("page");
      return;
    }
    let dead = false;
    void openNativeMenu({
      label,
      menuClassName,
      trigger: trigger.current,
      items: () => itemsRef.current,
      onClosed: (refocus) => {
        native.current = null;
        if (!dead) set(false, refocus);
      },
    }).then((h) => {
      if (dead) return h?.close();
      if (h) {
        native.current = h;
        setMode("native");
      } else setMode("page");
    });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => native.current?.close(), []);

  // Toggle rows keep the menu open: push new checked states to the popup window.
  useEffect(() => {
    if (mode === "native") native.current?.update();
  }, [items, mode]);

  useLayoutEffect(() => {
    if (open && mode === "page" && isPositioned) focusFirstRow(menu.current);
  }, [open, mode, isPositioned]);

  useEffect(() => {
    if (!open || mode !== "page") return;
    const ac = new AbortController();
    window.addEventListener(
      "pointerdown",
      (e) => {
        const t = e.target as Node;
        if (!root.current?.contains(t) && !menu.current?.contains(t)) set(false, true);
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, [open, mode, set]);

  const portalTo = typeof document === "undefined" ? null : ((trigger.current?.closest('[role="dialog"]') as HTMLElement | null) ?? document.body);

  return (
    <div ref={root} className={cn("relative shrink-0", className)}>
      <button
        ref={(el) => {
          trigger.current = el;
          setReference(el);
        }}
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
      {open && mode === "page" && portalTo
        ? createPortal(
            <MenuPanel
              ref={(el) => {
                menu.current = el;
                setFloating(el);
              }}
              label={label}
              data-no-drag=""
              data-overflow-menu=""
              onKeyDown={(e) => menuKeys(e, menu.current, () => set(false, true), () => set(false))}
              style={{ ...floatingStyles, visibility: isPositioned ? undefined : "hidden" }}
              className={cn("z-[60] max-h-[calc(100dvh-16px)]", menuClassName)}
              items={items}
              onPick={(i) => {
                const it = items[i];
                if (!it || it.separator) return;
                if (it.checked === undefined) set(false, true);
                it.onSelect();
              }}
            />,
            portalTo,
          )
        : null}
    </div>
  );
}
