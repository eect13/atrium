export const DASH_CARDS = ["weather", "agenda", "quote", "finance", "notes", "news"] as const;
export type DashCard = (typeof DASH_CARDS)[number];

export const DEFAULT_DASH: DashCard[] = [...DASH_CARDS];

export const DASH_SPAN: Record<DashCard, string> = {
  weather: "lg:col-span-5",
  agenda: "lg:col-span-4",
  quote: "lg:col-span-3",
  finance: "lg:col-span-4",
  notes: "lg:col-span-4",
  news: "lg:col-span-4",
};

export const DASH_SPAN_N: Record<DashCard, number> = {
  weather: 5,
  agenda: 4,
  quote: 3,
  finance: 4,
  notes: 4,
  news: 4,
};

export const SPAN_CLASS: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
};

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

export const DASH_LABEL: Record<DashCard, string> = {
  weather: "Today",
  agenda: "Up next",
  quote: "Quote",
  finance: "Finance",
  notes: "Notes",
  news: "Headlines",
};

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
