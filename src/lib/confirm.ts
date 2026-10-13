/** Two-step destructive confirm: ask(id) → confirm(id) commits; anything else clears. */
export type ConfirmAct =
  | { type: "ask"; id: string }
  | { type: "confirm"; id: string }
  | { type: "cancel" }
  | { type: "close" };

export function confirmStep(current: string | null, act: ConfirmAct): { confirmId: string | null; commit: string | null } {
  if (act.type === "ask") return { confirmId: act.id, commit: null };
  if (act.type === "confirm") {
    return current === act.id ? { confirmId: null, commit: act.id } : { confirmId: current, commit: null };
  }
  return { confirmId: null, commit: null };
}
