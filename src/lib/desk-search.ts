import { findInstrument, matchQuery, queryScore, tabForKind } from "./market-board.ts";
import { looksLikeWhen } from "./parse-when.ts";
import { WATCH_CATALOG, type BoardTab, type ViewId, type WatchItem } from "./types.ts";

export type DeskCommand =
  | { type: "note"; text: string }
  | { type: "spend"; amount: number; payee: string }
  | { type: "view"; view: ViewId }
  | { type: "ticker"; item: WatchItem; tab: BoardTab }
  | { type: "search"; query: string }
  | { type: "event"; text: string }
  | { type: "unknown" };

export type CommandHit = {
  id: string;
  label: string;
  hint: string;
  fill: string;
};

const VIEWS: { id: ViewId; keys: string[]; hint: string }[] = [
  { id: "dashboard", keys: ["dashboard", "home", "desk", "today"], hint: "Go" },
  { id: "calendar", keys: ["calendar", "cal", "agenda", "events", "event"], hint: "Go" },
  { id: "weather", keys: ["weather", "forecast", "zip", "zipcode"], hint: "Go" },
  { id: "notes", keys: ["notes", "note", "sticky", "stickies"], hint: "Go" },
  { id: "finance", keys: ["finance", "markets", "market", "stocks", "stock", "watcher", "books", "wallet"], hint: "Go" },
  { id: "quotes", keys: ["quotes", "quote"], hint: "Go" },
  { id: "news", keys: ["news", "briefing", "rss", "headlines"], hint: "Go" },
  { id: "options", keys: ["options", "settings", "prefs", "preferences"], hint: "Go" },
];

function viewOf(word: string): ViewId | undefined {
  const k = word.trim().toLowerCase();
  if (!k) return undefined;
  return VIEWS.find((v) => v.id === k || v.keys.includes(k))?.id;
}

function viewLabel(id: ViewId) {
  return id[0]!.toUpperCase() + id.slice(1);
}

export function suggestCommands(raw: string, catalog = WATCH_CATALOG): CommandHit[] {
  const s = raw.trim();
  if (s.length < 1) return [];
  const stripped = s.replace(/^(go|open|show|find|search)\s+/i, "").trim() || s;
  const hits: CommandHit[] = [];

  if (/^(note:|sticky:)/i.test(s)) {
    const text = s.replace(/^(note:|sticky:)/i, "").trim();
    hits.push({ id: "note", label: text ? `Note: ${text}` : "Add a note", hint: "Sticky", fill: s });
  }
  if (/^(spend|paid|expense)\s/i.test(s)) {
    hits.push({ id: "spend", label: s, hint: "Books", fill: s });
  }

  const q = stripped.toLowerCase();
  for (const v of VIEWS) {
    const hit =
      v.id === q ||
      (q.length >= 2 && v.id.startsWith(q)) ||
      v.keys.some((k) => k === q || (q.length >= 2 && k.startsWith(q)) || (q.length >= 3 && k.includes(q)));
    if (hit) hits.push({ id: `view-${v.id}`, label: viewLabel(v.id), hint: v.hint, fill: v.id });
  }

  const tickers = catalog
    .map((item) => ({ item, score: queryScore(stripped, item) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
    .slice(0, 6);
  for (const t of tickers) {
    hits.push({
      id: `t-${t.item.id}`,
      label: t.item.label,
      hint: t.item.name ?? t.item.kind,
      fill: t.item.label,
    });
  }

  if ((tickers.length !== 1 || !findInstrument(stripped, catalog)) && stripped.length >= 2) {
    hits.unshift({
      id: "search",
      label: `Search markets for “${stripped}”`,
      hint: "Finance",
      fill: `search ${stripped}`,
    });
  }

  const seen = new Set<string>();
  return hits.filter((h) => {
    if (seen.has(h.id)) return false;
    seen.add(h.id);
    return true;
  }).slice(0, 8);
}

export function resolveCommand(raw: string, catalog = WATCH_CATALOG): DeskCommand {
  const s = raw.trim();
  if (!s) return { type: "unknown" };

  if (/^(note:|sticky:)/i.test(s)) {
    return { type: "note", text: s.replace(/^(note:|sticky:)/i, "").trim() };
  }
  if (/^(spend|paid|expense)\s/i.test(s)) {
    const rest = s.replace(/^(spend|paid|expense)\s/i, "").trim();
    const num = rest.match(/-?\d[\d,]*(?:\.\d+)?/);
    if (!num) return { type: "unknown" };
    const amount = -Math.abs(Number(num[0].replaceAll(",", "")));
    if (!Number.isFinite(amount) || amount === 0) return { type: "unknown" };
    const payee = rest.replace(num[0], "").replace(/\s+/g, " ").trim() || "Expense";
    return { type: "spend", amount, payee };
  }

  const stripped = s.replace(/^(go|open|show|find|search)\s+/i, "").trim() || s;
  const parts = stripped.split(/\s+/);
  const first = parts[0] ?? "";
  const rest = parts.slice(1).join(" ").trim();
  const view = viewOf(first);

  if (view && rest) {
    if (view === "notes") return { type: "note", text: rest };
    if (view === "calendar") return { type: "event", text: rest };
    if (view === "finance") {
      const item = findInstrument(rest, catalog);
      if (item) return { type: "ticker", item, tab: tabForKind(item.kind) };
      return { type: "search", query: rest };
    }
    return { type: "view", view };
  }
  if (view) return { type: "view", view };

  const item = findInstrument(stripped, catalog);
  if (item) return { type: "ticker", item, tab: tabForKind(item.kind) };

  const many = catalog.filter((i) => matchQuery(stripped, i));
  if (many.length > 1) return { type: "search", query: stripped };
  if (many.length === 1 && many[0]) {
    return { type: "ticker", item: many[0], tab: tabForKind(many[0].kind) };
  }

  if (looksLikeWhen(s) || /^(event:|cal:)/i.test(s)) {
    return { type: "event", text: s.replace(/^(event:|cal:)/i, "").trim() || s };
  }

  if (stripped.length >= 2 && !/\s/.test(stripped)) {
    return { type: "search", query: stripped };
  }

  return { type: "unknown" };
}