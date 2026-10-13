/**
 * GoogleSource: talks to Atrium's own `/api/calendar/*` (never to Google directly).
 * Web: same-origin HttpOnly cookies. Desktop/Android: `credentials: "omit"` + a Bearer access
 * handle (Card 167 B1); never `include`. A `session_expired` 401 refreshes once and retries.
 */
import type { CalendarEvent } from "../types.ts";
import { fromGoogleList, toGoogleBody } from "./google-map.ts";
import { READ_WRITE, type CalendarMeta, type CalendarSource, type EventWrite, type ListEventsQuery, type ListEventsResult } from "./source.ts";
import type { GCalEvent } from "../google-cal.ts";

export type ConnStatus =
  | { state: "unconfigured"; missing: string[] }
  | { state: "disconnected" }
  | { state: "connected"; email: string | null; canEdit: boolean }
  | { state: "expired"; email: string | null }
  | { state: "unreachable"; message: string };

/** Desktop/Android pair from the hand-off claim or a rotation. */
export type SessionPair = { access: string; refresh: string; accessExp: number; refreshExp: number };

export class CalendarApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.name = "CalendarApiError";
  }
}

export type ApiClient = {
  base: string;
  /** Tauri builds: no cookies at all, Bearer only. */
  native?: boolean;
  session?: string | null;
  fetch?: typeof fetch;
  /** Called on 401 `session_expired`; returns a fresh access handle or null. */
  renew?: () => Promise<string | null>;
};

/** The fetch init `api()` sends; exported for the B1 unit test. */
export function requestInit(c: Pick<ApiClient, "native" | "session">, init: RequestInit = {}): RequestInit {
  const headers: Record<string, string> = { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) };
  if (c.native && c.session) headers.authorization = `Bearer ${c.session}`;
  return { ...init, headers, credentials: c.native ? "omit" : "same-origin" };
}

export async function api<T>(c: ApiClient, path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const f = c.fetch ?? fetch;
  const res = await f(`${c.base}/api/calendar${path}`, requestInit(c, init));
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (res.status === 401 && json.error === "session_expired" && !retried) {
    const next = c.native ? await c.renew?.() : "cookie";
    if (next) return api<T>({ ...c, session: c.native ? next : c.session }, path, init, true);
  }
  if (!res.ok) throw new CalendarApiError(res.status, json.error || `http_${res.status}`, json.message);
  return json;
}

export async function fetchStatus(c: ApiClient): Promise<ConnStatus> {
  try {
    return await api<ConnStatus>(c, "/status");
  } catch (e) {
    if (e instanceof CalendarApiError && (e.code === "disconnected" || e.code === "session_expired")) return { state: "disconnected" };
    return { state: "unreachable", message: e instanceof Error ? e.message : String(e) };
  }
}

export class GoogleSource implements CalendarSource {
  readonly kind = "google" as const;
  readonly capabilities = READ_WRITE;
  private readonly client: ApiClient;
  readonly id: string;
  constructor(client: ApiClient, id = "google") {
    this.client = client;
    this.id = id;
  }

  async listCalendars(): Promise<CalendarMeta[]> {
    const r = await api<{ calendars: CalendarMeta[] }>(this.client, "/calendars");
    return r.calendars;
  }

  async listEvents(calendarId: string, q: ListEventsQuery): Promise<ListEventsResult> {
    const p = new URLSearchParams({ cal: calendarId });
    if (q.syncToken) p.set("syncToken", q.syncToken);
    else {
      p.set("timeMin", q.timeMin ?? "");
      p.set("timeMax", q.timeMax ?? "");
    }
    const r = await api<{ items: GCalEvent[]; nextSyncToken?: string; gone?: boolean; truncated?: boolean }>(this.client, `/events?${p}`);
    if (r.gone) return { events: [], deleted: [], resync: true };
    return { ...fromGoogleList(r.items, calendarId), nextSyncToken: r.nextSyncToken, truncated: r.truncated };
  }

  private async one(path: string, method: string, ev: EventWrite, calendarId: string): Promise<CalendarEvent> {
    const r = await api<{ item: GCalEvent }>(this.client, path, { method, body: JSON.stringify({ cal: calendarId, etag: ev.etag, body: toGoogleBody(ev) }) });
    const mapped = fromGoogleList([r.item], calendarId).events[0];
    if (!mapped) throw new CalendarApiError(502, "bad_event");
    return mapped;
  }

  createEvent(calendarId: string, ev: EventWrite) {
    return this.one("/events", "POST", ev, calendarId);
  }

  updateEvent(calendarId: string, remoteId: string, ev: EventWrite) {
    return this.one(`/events/${encodeURIComponent(remoteId)}`, "PATCH", ev, calendarId);
  }

  async deleteEvent(calendarId: string, remoteId: string, etag?: string, notify: "all" | "none" = "none") {
    await api(this.client, `/events/${encodeURIComponent(remoteId)}`, { method: "DELETE", body: JSON.stringify({ cal: calendarId, etag, notify }) });
  }

  async moveEvent(calendarId: string, remoteId: string, to: string, notify: "all" | "none" = "none") {
    const r = await api<{ item: GCalEvent }>(this.client, `/events/${encodeURIComponent(remoteId)}/move`, { method: "POST", body: JSON.stringify({ cal: calendarId, to, notify }) });
    const mapped = fromGoogleList([r.item], to).events[0];
    if (!mapped) throw new CalendarApiError(502, "bad_event");
    return mapped;
  }
}
