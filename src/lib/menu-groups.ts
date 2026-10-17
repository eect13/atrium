/**
 * Card 216 §5: one ⋯ rule. Every ⋯ (widget card, float, page, row) is built from these
 * slots in this order; empty slots drop out and a separator sits between non-empty ones.
 */
import type { ReactNode } from "react";

export type MenuRow = {
  separator?: undefined;
  label: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  /** A toggle row (menuitemcheckbox with a Switch look). The menu stays open. */
  checked?: boolean;
  /** Card 242 (Critic 238 P2): the pick moves focus to another window (e.g. Open in Atrium); closing must not refocus the owner. */
  leaves?: boolean;
};
export type MenuItem = { separator: true } | MenuRow;

/** create/act · view options · window · go · close · danger (Card 219: destructive rows last, own group). */
export const MENU_SLOTS = ["create", "view", "window", "go", "close", "danger"] as const;
export type MenuSlot = (typeof MENU_SLOTS)[number];
export type MenuGroups = Partial<Record<MenuSlot, MenuRow[]>>;

/** Later groups append to earlier ones slot by slot (registry extras + shell defaults). */
export function mergeGroups(...all: (MenuGroups | undefined)[]): MenuGroups {
  const out: MenuGroups = {};
  for (const g of all) {
    if (!g) continue;
    for (const k of MENU_SLOTS) if (g[k]?.length) out[k] = [...(out[k] ?? []), ...g[k]!];
  }
  return out;
}

export function groupItems(groups: MenuGroups): MenuItem[] {
  const out: MenuItem[] = [];
  for (const k of MENU_SLOTS) {
    const rows = groups[k];
    if (!rows?.length) continue;
    if (out.length) out.push({ separator: true });
    out.push(...rows);
  }
  return out;
}
