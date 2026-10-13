/** Google Calendar API v3 calls, server-side with a short-lived access token. */
import type { Fetch } from "./oauth.server.ts";

const BASE = "https://www.googleapis.com/calendar/v3";

export class GoogleApiError extends Error {
  readonly status: number;
  readonly reason: string;
  constructor(status: number, reason: string) {
    super(`Google Calendar ${status}${reason ? ` ${reason}` : ""}`);
    this.status = status;
    this.reason = reason;
    this.name = "GoogleApiError";
  }
}

export type GEvent = Record<string, unknown> & { id?: string; etag?: string; status?: string };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One call with backoff on 429 / 5xx / rateLimitExceeded (Card 163 §6). */
export async function gcal<T>(f: Fetch, token: string, path: string, init: RequestInit = {}, tries = 4, delay = 400): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await f(`${BASE}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers as Record<string, string>) },
    });
    if (res.status === 204) return undefined as T;
    const json = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } };
    if (res.ok) return json as T;
    const reason = json.error?.errors?.[0]?.reason ?? "";
    const retry = res.status === 429 || res.status >= 500 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(reason));
    if (!retry || attempt >= tries - 1) throw new GoogleApiError(res.status, reason);
    await wait(delay * 2 ** attempt + Math.floor(Math.random() * 100));
  }
}

export type GCalListEntry = { id: string; summary?: string; summaryOverride?: string; accessRole: string; primary?: boolean; backgroundColor?: string; deleted?: boolean; hidden?: boolean };

export async function listCalendarList(f: Fetch, token: string) {
  const out: GCalListEntry[] = [];
  let page: string | undefined;
  do {
    const q = new URLSearchParams({ maxResults: "250", showHidden: "false" });
    if (page) q.set("pageToken", page);
    const r = await gcal<{ items?: GCalListEntry[]; nextPageToken?: string }>(f, token, `/users/me/calendarList?${q}`);
    out.push(...(r.items ?? []).filter((c) => !c.deleted));
    page = r.nextPageToken;
  } while (page);
  return out;
}

/**
 * Full window (timeMin/timeMax) or incremental (syncToken). Masters with RRULE are kept
 * (singleEvents=false) so the desk paints series itself. 410 → `{ gone: true }`.
 */
export async function listEventsPage(f: Fetch, token: string, calendarId: string, q: { syncToken?: string; timeMin?: string; timeMax?: string }, maxPages = 10) {
  const items: GEvent[] = [];
  let page: string | undefined;
  let nextSyncToken: string | undefined;
  let pages = 0;
  try {
    do {
      const p = new URLSearchParams({ maxResults: "250", showDeleted: "true", singleEvents: "false" });
      if (q.syncToken) p.set("syncToken", q.syncToken);
      else {
        if (q.timeMin) p.set("timeMin", q.timeMin);
        if (q.timeMax) p.set("timeMax", q.timeMax);
      }
      if (page) p.set("pageToken", page);
      const r = await gcal<{ items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string }>(f, token, `/calendars/${encodeURIComponent(calendarId)}/events?${p}`);
      items.push(...(r.items ?? []));
      page = r.nextPageToken;
      nextSyncToken = r.nextSyncToken ?? nextSyncToken;
      pages += 1;
    } while (page && pages < maxPages);
  } catch (e) {
    if (e instanceof GoogleApiError && e.status === 410) return { items: [], gone: true as const };
    throw e;
  }
  return { items, nextSyncToken, truncated: Boolean(page) };
}

const evPath = (cal: string, id?: string) => `/calendars/${encodeURIComponent(cal)}/events${id ? `/${encodeURIComponent(id)}` : ""}`;

export const insertEvent = (f: Fetch, t: string, cal: string, body: GEvent) => gcal<GEvent>(f, t, evPath(cal), { method: "POST", body: JSON.stringify(body) }, 2);

/** If-Match makes a stale write fail with 412 instead of overwriting a newer Google copy. */
export const patchEvent = (f: Fetch, t: string, cal: string, id: string, body: GEvent, etag?: string) =>
  gcal<GEvent>(f, t, evPath(cal, id), { method: "PATCH", body: JSON.stringify(body), headers: etag ? { "if-match": etag } : {} }, 2);

export const deleteEvent = (f: Fetch, t: string, cal: string, id: string, etag?: string) =>
  gcal<void>(f, t, evPath(cal, id), { method: "DELETE", headers: etag ? { "if-match": etag } : {} }, 2);
