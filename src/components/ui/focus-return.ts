import * as React from "react";

/**
 * Form 173 §1: when a sheet or dialog closes (Esc, ×, overlay, Cancel), focus goes back to the
 * control that opened it. If that control is gone or disabled, it goes to the view's
 * `[data-focus-home]` heading, then the first toolbar control. Never document.body.
 */
let lastFocus: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      // Menu items vanish when the menu closes; the menu's own button is the logical opener.
      if (t instanceof HTMLElement && !t.closest('[role="menu"]')) lastFocus = t;
    },
    true,
  );
}

export function usableFocus(el: HTMLElement | null | undefined): HTMLElement | null {
  if (!el || !el.isConnected || el === document.body) return null;
  if ((el as HTMLButtonElement).disabled || el.closest("[inert],[aria-hidden='true']")) return null;
  if (!el.getClientRects().length) return null;
  return el;
}

export function focusHome(): HTMLElement | null {
  const visible = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((el) => usableFocus(el) && !el.closest('[role="dialog"]')) ?? null;
  return visible("[data-focus-home]") ?? visible("main [role='toolbar'] button, main button");
}

type AutoFocus = (e: Event) => void;

export function useFocusReturn(user: { onOpenAutoFocus?: AutoFocus; onCloseAutoFocus?: AutoFocus }) {
  const opener = React.useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (e: Event) => {
      const a = document.activeElement;
      opener.current = a instanceof HTMLElement && a !== document.body && !a.closest('[role="menu"]') ? a : lastFocus;
      user.onOpenAutoFocus?.(e);
    },
    onCloseAutoFocus: (e: Event) => {
      user.onCloseAutoFocus?.(e);
      if (e.defaultPrevented) return;
      e.preventDefault();
      const target = usableFocus(opener.current) ?? focusHome();
      target?.focus();
    },
  };
}
