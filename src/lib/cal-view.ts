/** Calendar widget / float view control — Today | Week | Month, remembered per widget id. */

export const CAL_VIEWS = ["today", "week", "month"] as const;
export type CalView = (typeof CAL_VIEWS)[number];

export const CAL_VIEW_LABEL: Record<CalView, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
};

export const DEFAULT_CAL_VIEW: CalView = "month";

export function isCalView(v: unknown): v is CalView {
  return typeof v === "string" && (CAL_VIEWS as readonly string[]).includes(v);
}

/** Keep only well-formed `{ widgetId: view }` pairs. */
export function normalizeCalViews(raw?: unknown): Record<string, CalView> {
  const out: Record<string, CalView> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k && isCalView(v)) out[k] = v;
  }
  return out;
}

/** Remembered view for a widget, else Month. */
export function calViewFor(map: Record<string, CalView> | undefined, id: string): CalView {
  const v = map?.[id];
  return isCalView(v) ? v : DEFAULT_CAL_VIEW;
}

/** Split a day's event count into solid pill bars + `+N` overflow. */
export function pillBars(count: number, max: number): { bars: number; more: number } {
  const n = Math.max(0, Math.floor(count));
  const cap = Math.max(1, Math.floor(max));
  if (n <= cap) return { bars: n, more: 0 };
  // Reserve the last slot for "+N" so the cell never grows.
  return { bars: cap - 1, more: n - (cap - 1) };
}
