/** Card 228: keyboard + panel classes shared by the in-page ⋯ and the desktop popup window. */
import type React from "react";

const ROW_SEL = '[role="menuitem"],[role="menuitemcheckbox"]';
/** Card 216 look, unchanged. Card 227/228: the panel is portalled; max-height + scroll is the safety net. */
export const MENU_PANEL = "rounded-md bg-card p-1.5 text-card-foreground shadow-[var(--shadow-float)] overflow-y-auto overscroll-contain";

/** Arrow Up/Down/Home/End between rows; Esc → onEscape; Tab → onTab. Shared by the in-page and popup-window menus. */
export function menuKeys(e: React.KeyboardEvent, root: HTMLElement | null, onEscape: () => void, onTab?: () => void) {
  const rows = Array.from(root?.querySelectorAll<HTMLElement>(ROW_SEL) ?? []);
  const at = rows.indexOf(document.activeElement as HTMLElement);
  let to = -1;
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    onEscape();
    return;
  }
  if (e.key === "ArrowDown") to = (at + 1) % rows.length;
  else if (e.key === "ArrowUp") to = (at - 1 + rows.length) % rows.length;
  else if (e.key === "Home") to = 0;
  else if (e.key === "End") to = rows.length - 1;
  else if (e.key === "Tab") onTab?.();
  if (to >= 0) {
    e.preventDefault();
    rows[to]?.focus();
  }
}

export function focusFirstRow(root: HTMLElement | null) {
  root?.querySelector<HTMLElement>(ROW_SEL)?.focus();
}

