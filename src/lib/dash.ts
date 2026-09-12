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
