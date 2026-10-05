/** User/data-driven calendar event categories (no hardcoded product copy in UI). */

import { catLabel } from "@/lib/format";

export type EventCategory = {
  id: string;
  label: string;
  /** CSS color or theme token (`var(--cat-*)`). Empty → palette fallback. */
  color?: string;
};

/**
 * Category palette (Card 109 B vivid · solid fills). Every entry is a pair of
 * theme tokens in `src/styles.css`: `--cat-<key>` fill + `--cat-<key>-fg` label.
 * The first five double as the starter categories; the rest are extra swatches
 * for user-made categories. `name` is a hue word for swatch aria-labels only.
 */
export const CAT_PALETTE = [
  { key: "work", name: "Blue" },
  { key: "personal", name: "Purple" },
  { key: "family", name: "Orange" },
  { key: "health", name: "Teal" },
  { key: "other", name: "Stone" },
  { key: "pink", name: "Pink" },
  { key: "sky", name: "Sky" },
  { key: "amber", name: "Amber" },
  { key: "mint", name: "Mint" },
] as const;

export type CatPaletteKey = (typeof CAT_PALETTE)[number]["key"];

export function catToken(key: string) {
  return `var(--cat-${key})`;
}

export function catFgToken(key: string) {
  return `var(--cat-${key}-fg)`;
}

/** Swatch list for pickers (unique hues — no duplicate purple). */
export const CAT_SWATCHES = CAT_PALETTE.map((p) => ({ ...p, color: catToken(p.key) }));

/** Starter set seeded once; users can rename, add, remove. */
export const DEFAULT_EVENT_CATS: EventCategory[] = [
  { id: "work", label: "Work", color: catToken("work") },
  { id: "personal", label: "Personal", color: catToken("personal") },
  { id: "family", label: "Family", color: catToken("family") },
  { id: "health", label: "Health", color: catToken("health") },
  { id: "other", label: "Other", color: catToken("other") },
];

/** Where deleted categories send their events. */
export const REMAP_CAT_ID = "other";

/**
 * Card 108 stored chrome tokens / ad-hoc hex as category colours. Map those to
 * the dedicated palette so old desks pick up B vivid without a store migration.
 */
const LEGACY_COLORS: Record<string, string> = {
  "var(--color-ring)": catToken("work"),
  "var(--color-foreground)": catToken("personal"),
  "var(--color-destructive)": catToken("family"),
  "var(--color-ok)": catToken("health"),
  "var(--color-muted-foreground)": catToken("other"),
  "var(--color-accent-foreground)": catToken("sky"),
  "#3b82f6": catToken("sky"),
  "#a855f7": catToken("personal"),
  "#f59e0b": catToken("amber"),
  "#14b8a6": catToken("mint"),
  "#ec4899": catToken("pink"),
};

export function normalizeCatColor(color?: string): string | undefined {
  const c = color?.trim();
  if (!c) return undefined;
  return LEGACY_COLORS[c.toLowerCase()] ?? c;
}

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
    const color = normalizeCatColor(typeof row.color === "string" ? row.color : undefined);
    out.push({ id, label, color });
  }
  return out.length ? out : DEFAULT_EVENT_CATS.map((c) => ({ ...c }));
}

export function findEventCat(cats: EventCategory[], id: string): EventCategory | undefined {
  return cats.find((c) => c.id === id);
}

/** Visible name for a category id — never the raw id. */
export function eventCatLabel(cats: EventCategory[], id: string) {
  return findEventCat(cats, id)?.label ?? catLabel(id);
}

function isPaletteKey(id: string): id is CatPaletteKey {
  return CAT_PALETTE.some((p) => p.key === id);
}

/**
 * Fill colour for a category: stored colour → same-name palette slot → a palette
 * slot no other category uses (stable per id) → hashed palette slot.
 */
export function eventCatColor(cats: EventCategory[], id: string) {
  const hit = normalizeCatColor(findEventCat(cats, id)?.color);
  if (hit) return hit;
  if (isPaletteKey(id)) return catToken(id);
  const taken = new Set(
    cats.filter((c) => c.id !== id).map((c) => normalizeCatColor(c.color) ?? (isPaletteKey(c.id) ? catToken(c.id) : "")),
  );
  const free = CAT_SWATCHES.filter((sw) => !taken.has(sw.color));
  const pool = free.length ? free : CAT_SWATCHES;
  return pool[Math.abs(hash(id)) % pool.length]!.color;
}

/** First palette colour no category uses yet (cycles once every slot is taken). */
export function nextCatColor(cats: EventCategory[]) {
  const used = new Set(cats.map((c) => eventCatColor(cats, c.id)));
  const free = CAT_SWATCHES.find((s) => !used.has(s.color));
  return (free ?? CAT_SWATCHES[cats.length % CAT_SWATCHES.length]!).color;
}

const DARK_FG = "#0c0c0d";
const LIGHT_FG = "#ffffff";

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]) {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Label colour on a solid category fill. Palette tokens use their paired
 * `--cat-*-fg`; a raw hex (custom or Google colour) picks whichever of dark /
 * white text has the higher WCAG contrast.
 */
export function catFg(color: string) {
  const token = /^var\(--cat-([a-z0-9-]+)\)$/i.exec(color.trim());
  if (token && !token[1]!.endsWith("-fg")) return catFgToken(token[1]!);
  const rgb = hexRgb(color);
  if (rgb) {
    const l = luminance(rgb);
    const onDark = (l + 0.05) / (luminance(hexRgb(DARK_FG)!) + 0.05);
    const onLight = 1.05 / (l + 0.05);
    return onDark >= onLight ? DARK_FG : LIGHT_FG;
  }
  return "var(--color-background)";
}

/** Inline custom properties for a `.cat-tag` (Shape 1 pill) or dot. */
export function catTagStyle(color: string): Record<string, string> {
  return { "--tag-bg": color, "--tag-fg": catFg(color) };
}

/** Tag style for an event's category, honouring a per-event colour override. */
export function eventCatTagStyle(cats: EventCategory[], id: string, override?: string) {
  return catTagStyle(normalizeCatColor(override) ?? eventCatColor(cats, id));
}

/** Which category takes a deleted category's events (Other, else the first remaining). */
export function remapCatId(cats: EventCategory[], removing: string, preferred?: string) {
  if (preferred && preferred !== removing && cats.some((c) => c.id === preferred)) return preferred;
  if (removing !== REMAP_CAT_ID && cats.some((c) => c.id === REMAP_CAT_ID)) return REMAP_CAT_ID;
  return cats.find((c) => c.id !== removing)?.id ?? REMAP_CAT_ID;
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
    out.push({ id, label: catLabel(id) });
  }
  return out;
}
