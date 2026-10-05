/** User/data-driven calendar event categories (no hardcoded product copy in UI). */

export type EventCategory = {
  id: string;
  label: string;
  /** CSS color or theme token. Empty → palette fallback. */
  color?: string;
};

/** Starter set seeded once; users can rename, add, remove. */
export const DEFAULT_EVENT_CATS: EventCategory[] = [
  { id: "work", label: "Work", color: "var(--color-ring)" },
  { id: "personal", label: "Personal", color: "var(--color-foreground)" },
  { id: "family", label: "Family", color: "var(--color-destructive)" },
  { id: "health", label: "Health", color: "var(--color-ok)" },
  { id: "other", label: "Other", color: "var(--color-muted-foreground)" },
];

const FALLBACK_COLORS = [
  "var(--color-ring)",
  "var(--color-foreground)",
  "var(--color-destructive)",
  "var(--color-ok)",
  "var(--color-muted-foreground)",
  "var(--color-accent-foreground)",
];

export function slugCatId(label: string) {
  const base = label
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base || `cat-${Date.now().toString(36)}`;
}

export function normalizeEventCats(raw?: unknown): EventCategory[] {
  if (!Array.isArray(raw) || !raw.length) return DEFAULT_EVENT_CATS.map((c) => ({ ...c }));
  const out: EventCategory[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const color = typeof row.color === "string" && row.color.trim() ? row.color.trim() : undefined;
    out.push({ id, label, color });
  }
  return out.length ? out : DEFAULT_EVENT_CATS.map((c) => ({ ...c }));
}

export function findEventCat(cats: EventCategory[], id: string): EventCategory | undefined {
  return cats.find((c) => c.id === id);
}

export function eventCatLabel(cats: EventCategory[], id: string) {
  return findEventCat(cats, id)?.label ?? id;
}

export function eventCatColor(cats: EventCategory[], id: string) {
  const hit = findEventCat(cats, id);
  if (hit?.color) return hit.color;
  const i = Math.abs(hash(id)) % FALLBACK_COLORS.length;
  return FALLBACK_COLORS[i]!;
}

export function eventCatMark(cats: EventCategory[], id: string) {
  const label = eventCatLabel(cats, id);
  const ch = label.trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Ensure every event cat id still resolves (orphans keep a synthetic entry). */
export function catsWithOrphans(cats: EventCategory[], usedIds: string[]): EventCategory[] {
  const out = [...cats];
  const seen = new Set(cats.map((c) => c.id));
  for (const id of usedIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: id });
  }
  return out;
}
