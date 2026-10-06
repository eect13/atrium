/** Persistent per-view quote cache (survives reloads). Pure: storage and clock are injected. */

export const QUOTE_TTL_MS = 7 * 24 * 60 * 60_000;
const PREFIX = "atrium.quotes.v1";

export type QuoteRow = { text: string; author: string; href: string; source: string };
export type CacheEntry<T extends QuoteRow = QuoteRow> = { quotes: T[]; fetchedAt: number; title?: string };
export type KV = Pick<Storage, "getItem" | "setItem">;
export type ViewState<T extends QuoteRow = QuoteRow> = {
  quotes: T[];
  /** live = fetched now · cache = fresh entry · stale = fetch failed/empty, old entry kept · none = nothing yet */
  from: "live" | "cache" | "stale" | "none";
  fetchedAt?: number;
  title?: string;
};

/** `{kind}:{normalized key}` — one entry per daily date, topic, or author. */
export function quoteCacheKey(kind: string, key: string) {
  const norm = key
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${PREFIX}:${kind}:${norm || "_"}`;
}

export function readEntry<T extends QuoteRow>(kv: KV | undefined, key: string): CacheEntry<T> | null {
  if (!kv) return null;
  try {
    const raw = JSON.parse(kv.getItem(key) ?? "null") as CacheEntry<T> | null;
    if (!raw || !Array.isArray(raw.quotes) || typeof raw.fetchedAt !== "number") return null;
    return raw;
  } catch {
    return null;
  }
}

/** Writes only a non-empty result: good cached data is never replaced by an empty/failed fetch. */
export function writeEntry<T extends QuoteRow>(kv: KV | undefined, key: string, entry: CacheEntry<T>) {
  if (!kv || !entry.quotes.length) return false;
  try {
    kv.setItem(key, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

export function isFresh(entry: CacheEntry | null, now: number, ttl = QUOTE_TTL_MS) {
  return Boolean(entry && entry.quotes.length && now - entry.fetchedAt < ttl);
}

/**
 * Stale-while-revalidate for one view. Fresh cache → no network. `force` (Refresh) rechecks this
 * key only. A failed or empty fetch keeps the previous entry and reports it as stale.
 */
export async function loadView<T extends QuoteRow>(
  key: string,
  fetcher: () => Promise<{ quotes: T[]; title?: string }>,
  opts: { kv?: KV; now?: () => number; force?: boolean; ttl?: number } = {},
): Promise<ViewState<T>> {
  const now = opts.now ?? Date.now;
  const prev = readEntry<T>(opts.kv, key);
  if (!opts.force && prev && isFresh(prev, now(), opts.ttl)) {
    return { quotes: prev.quotes, from: "cache", fetchedAt: prev.fetchedAt, title: prev.title };
  }
  let got: { quotes: T[]; title?: string } = { quotes: [] };
  try {
    got = await fetcher();
  } catch {
    got = { quotes: [] };
  }
  if (got.quotes.length) {
    const entry: CacheEntry<T> = { quotes: got.quotes, fetchedAt: now(), title: got.title };
    writeEntry(opts.kv, key, entry);
    return { quotes: entry.quotes, from: "live", fetchedAt: entry.fetchedAt, title: entry.title };
  }
  if (prev?.quotes.length) return { quotes: prev.quotes, from: "stale", fetchedAt: prev.fetchedAt, title: prev.title };
  return { quotes: [], from: "none" };
}

/** Browser storage when present (webview/PWA); undefined on the server or in tests. */
export function browserKV(): KV | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
