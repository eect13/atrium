import { WIDGET_LABEL, type WidgetKind } from "./types.ts";

/** Module switch a dashboard card depends on (absent = always on). */
export type DashNeed = "weather" | "quotes" | "finance" | "notes" | "news";

/**
 * Dashboard widget registry — the single place a card is declared.
 * The Dashboard grid, Options order list, spans, float buttons and labels all
 * read from here: add an entry and the card appears in the existing grid
 * (appended to saved orders by `normalizeDash`); drop one and it falls out.
 */
export type DashEntry = {
  id: string;
  /** Default 12-col span on lg+. */
  span: number;
  /** Float window kind opened from the card header, if any. */
  float?: WidgetKind;
  /** Module toggle that hides the card when off. */
  need?: DashNeed;
  /** Card title only when id is not a widget kind (e.g. notes); widget cards use `WIDGET_LABEL[id]`. */
  title?: string;
};

export const DASH_REGISTRY = [
  { id: "weather", span: 5, float: "weather", need: "weather" },
  { id: "agenda", span: 4, float: "calendar" },
  { id: "quote", span: 3, float: "quote", need: "quotes" },
  { id: "finance", span: 4, float: "finance", need: "finance" },
  { id: "notes", span: 4, need: "notes", title: "Notes" },
  { id: "news", span: 4, float: "news", need: "news" },
  { id: "calendar", span: 8, float: "calendar" },
  { id: "clock", span: 4, float: "clock" },
] as const satisfies readonly DashEntry[];

export type DashCard = (typeof DASH_REGISTRY)[number]["id"];
export const DASH_CARDS = DASH_REGISTRY.map((e) => e.id) as readonly DashCard[];

const ENTRY = Object.fromEntries(DASH_REGISTRY.map((e) => [e.id, e])) as Record<DashCard, DashEntry>;

export function dashEntry(id: DashCard): DashEntry {
  return ENTRY[id];
}

export const DEFAULT_DASH: DashCard[] = [...DASH_CARDS];

function isWidgetKind(id: string): id is WidgetKind {
  return Object.prototype.hasOwnProperty.call(WIDGET_LABEL, id);
}

/** Card title: registry override, else the shared `WIDGET_LABEL`. */
export function dashLabel(id: DashCard): string {
  const e = ENTRY[id];
  if (e.title) return e.title;
  return isWidgetKind(id) ? WIDGET_LABEL[id] : id;
}

export const DASH_LABEL = Object.fromEntries(DASH_CARDS.map((id) => [id, dashLabel(id)])) as Record<DashCard, string>;

export const DASH_SPAN_N = Object.fromEntries(DASH_REGISTRY.map((e) => [e.id, e.span])) as Record<DashCard, number>;

export const SPAN_CLASS: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
};

export const DASH_SPAN = Object.fromEntries(
  DASH_REGISTRY.map((e) => [e.id, SPAN_CLASS[e.span] ?? "lg:col-span-4"]),
) as Record<DashCard, string>;

/** Saved order filtered to cards whose module is on. */
export function dashVisible(order: readonly DashCard[], modules: Partial<Record<DashNeed, boolean>>): DashCard[] {
  return order.filter((id) => {
    const need = ENTRY[id]?.need;
    if (!need) return true;
    // Weather / quotes default on; finance / notes / news follow their toggle.
    if (need === "weather" || need === "quotes") return modules[need] !== false;
    return Boolean(modules[need]);
  });
}

const SPAN_CYCLE = [3, 4, 5, 6, 8, 12] as const;

export function dashSpanClass(id: DashCard, override?: number) {
  const n = override && SPAN_CLASS[override] ? override : DASH_SPAN_N[id];
  return SPAN_CLASS[n] ?? DASH_SPAN[id];
}

export function cycleDashSpan(current?: number): number {
  const i = SPAN_CYCLE.indexOf((current as (typeof SPAN_CYCLE)[number]) ?? -1);
  return SPAN_CYCLE[(i + 1) % SPAN_CYCLE.length]!;
}

export function normalizeDashSpan(raw?: unknown): Partial<Record<DashCard, number>> {
  const out: Partial<Record<DashCard, number>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const id of DASH_CARDS) {
    const n = Number((raw as Record<string, unknown>)[id]);
    if (SPAN_CLASS[n]) out[id] = n;
  }
  return out;
}

export function normalizeDash(raw?: unknown): DashCard[] {
  const seen = new Set<DashCard>();
  const out: DashCard[] = [];
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id !== "string") continue;
      if (!(DASH_CARDS as readonly string[]).includes(id)) continue;
      const card = id as DashCard;
      if (seen.has(card)) continue;
      seen.add(card);
      out.push(card);
    }
  }
  for (const id of DASH_CARDS) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

export function moveDash(order: DashCard[], from: string, to: string): DashCard[] {
  if (from === to) return order;
  const next = [...order];
  const i = next.indexOf(from as DashCard);
  const j = next.indexOf(to as DashCard);
  if (i < 0 || j < 0) return order;
  const [item] = next.splice(i, 1);
  next.splice(j, 0, item!);
  return next;
}

export function shiftDash(order: DashCard[], id: DashCard, dir: -1 | 1): DashCard[] {
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  return moveDash(order, id, order[j]!);
}
