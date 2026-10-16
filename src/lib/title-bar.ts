import { groupItems, mergeGroups, type MenuGroups, type MenuRow, type MenuSlot } from "./menu-groups.ts";

/**
 * Card 216b responsive title bar. Title always (truncates first) · ⋯ always last.
 * Inline by measured width: <220 none · 220–299 primary · 300–419 + Float · ≥420 + window flags.
 * Phone caps at sm; Compact uses xs. Anything not inline sits in ⋯ in its §5 group — never both.
 */
export type Step = "xs" | "sm" | "md" | "lg";
export const STEP_PX = { sm: 220, md: 300, lg: 420 } as const;
const RANK: Record<Step, number> = { xs: 0, sm: 1, md: 2, lg: 3 };
export type ActionGroup = "primary" | "float" | "flags";
/** Global priority: primary > Float > flags (Lock, then Stay behind). */
export const INLINE_AT: Record<ActionGroup, Step> = { primary: "sm", float: "md", flags: "lg" };
const GROUP_SLOT: Record<ActionGroup, MenuSlot> = { primary: "create", float: "window", flags: "window" };

export function stepFor(width: number, opts: { phone?: boolean; compact?: boolean } = {}): Step {
  if (opts.compact || width < STEP_PX.sm) return "xs";
  const s: Step = width >= STEP_PX.lg ? "lg" : width >= STEP_PX.md ? "md" : "sm";
  return opts.phone && RANK[s] > RANK.sm ? "sm" : s;
}

export type BarAction<N = unknown> = { id: string; group: ActionGroup; node: N; row: MenuRow };

/** Splits actions for a step; spilled rows join their ⋯ group in front of the group's own rows. */
export function splitBar<N>(actions: BarAction<N>[], groups: MenuGroups, step: Step) {
  const order: ActionGroup[] = ["primary", "float", "flags"];
  const sub = (id: string) => (id === "lock" ? 0 : id === "behind" ? 1 : 2); // flags: Lock, then Stay behind
  const sorted = [...actions].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || sub(a.id) - sub(b.id));
  const inline = sorted.filter((a) => RANK[step] >= RANK[INLINE_AT[a.group]]);
  const spill: MenuGroups = {};
  for (const a of sorted) {
    if (inline.includes(a)) continue;
    const k = GROUP_SLOT[a.group];
    spill[k] = [...(spill[k] ?? []), a.row];
  }
  return { inline, items: groupItems(mergeGroups(spill, groups)) };
}
