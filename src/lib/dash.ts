import type { MenuGroups } from "./menu-groups.ts";
import { WIDGET_LABEL, type ViewId, type WidgetKind } from "./types.ts";

/** Module switch a dashboard card depends on (absent = always on). */
export type DashNeed = "weather" | "clock" | "quotes" | "finance" | "notes" | "news";

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
  /** Card 216: page this card / its float opens ("Open {Feature}", "Open in Atrium"). */
  view: ViewId;
  /** Card 216: the one action allowed to stay inline (empty states, md+ headers). */
  primary?: "new-note" | "new-event";
  /** Card 216: floats one item at a time (Notes); the ⋯ carries "Float all". */
  floatMany?: boolean;
  /** Card 216: feature items for the shared ⋯ (merged into the canonical groups). */
  menu?: (ctx: MenuCtx) => MenuGroups;
  /** Card 241: what "{Feature} options…" runs instead of plain Options (e.g. scroll to its section). */
  optionsAct?: MenuAction;
};

/** Context-neutral hooks a registry `menu` may call; the shell supplies them. */
export type MenuAction = "new-note" | "new-event" | "board" | "float-all" | "unfloat-all" | "import-ics" | "add-ical" | "export-ics" | "calendar-options";
export type MenuCtx = { floats: boolean; manyOn: boolean; act: (a: MenuAction) => () => void };

// New note is the primary title-bar action. Card 218 F3: Float all / Back to board live only here.
const notesMenu = (c: MenuCtx): MenuGroups => ({
  view: [{ label: "Board", onSelect: c.act("board") }],
  window: c.floats ? [{ label: c.manyOn ? "Back to board" : "Float all", onSelect: c.act(c.manyOn ? "unfloat-all" : "float-all") }] : [],
});

// Card 241: one calendar entry list — Import ICS… · Add iCal link… · Export ICS (create/act group).
const calendarMenu = (c: MenuCtx): MenuGroups => ({
  create: [
    { label: "Import ICS…", onSelect: c.act("import-ics") },
    { label: "Add iCal link…", onSelect: c.act("add-ical") },
    { label: "Export ICS", onSelect: c.act("export-ics") },
  ],
});

export const DASH_REGISTRY = [
  { id: "weather", span: 5, float: "weather", need: "weather", view: "weather" },
  { id: "agenda", span: 4, float: "calendar", view: "calendar" },
  { id: "quote", span: 3, float: "quote", need: "quotes", view: "quotes" },
  { id: "finance", span: 4, float: "finance", need: "finance", view: "finance" },
  { id: "notes", span: 4, need: "notes", title: "Notes", view: "notes", primary: "new-note", floatMany: true, menu: notesMenu },
  { id: "news", span: 4, float: "news", need: "news", view: "news" },
  { id: "calendar", span: 8, float: "calendar", view: "calendar", menu: calendarMenu, optionsAct: "calendar-options" },
  { id: "clock", span: 4, float: "clock", need: "clock", view: "clock" },
] as const satisfies readonly DashEntry[];

/** Float kind → the page "Open in Atrium" lands on. */
export const FLOAT_VIEW: Record<WidgetKind, ViewId> = {
  weather: "weather",
  agenda: "calendar",
  calendar: "calendar",
  quote: "quotes",
  finance: "finance",
  news: "news",
  clock: "clock",
};

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
    if (need === "weather" || need === "clock" || need === "quotes") return modules[need] !== false;
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
