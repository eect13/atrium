/**
 * GoogleSource: talks to Atrium's own `/api/calendar/*` (never to Google directly).
 * Web: same-origin cookie session. Desktop/Android: Bearer session claimed via hand-off.
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

export type ApiClient = { base: string; session?: string | null; fetch?: typeof fetch };

export async function api<T>(c: ApiClient, path: string, init: RequestInit = {}): Promise<T> {
  const f = c.fetch ?? fetch;
  const headers: Record<string, string> = { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) };
  if (c.session) headers.authorization = `Bearer ${c.session}`;
  const res = await f(`${c.base}/api/calendar${path}`, { ...init, headers, credentials: c.session ? "omit" : "include" });
  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!res.ok) throw new CalendarApiError(res.status, json.error || `http_${res.status}`, json.message);
  return json;
}

export async function fetchStatus(c: ApiClient): Promise<ConnStatus> {
  try {
    return await api<ConnStatus>(c, "/status");
  } catch (e) {
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

  async deleteEvent(calendarId: string, remoteId: string, etag?: string) {
    await api(this.client, `/events/${encodeURIComponent(remoteId)}`, { method: "DELETE", body: JSON.stringify({ cal: calendarId, etag }) });
  }
}
