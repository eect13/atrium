import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fromManila, manilaParts } from "./format.ts";
import type { GCalDesk } from "./types.ts";

type GCalEvent = {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
};

type RawCal = {
  id?: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
  description?: string;
};

function normalize(data: unknown): GCalEvent[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as GCalEvent[];
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as GCalEvent[];
    if (Array.isArray(o.events)) return o.events as GCalEvent[];
  }
  return [];
}

function nextToken(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const token = (data as { nextPageToken?: unknown; next_page_token?: unknown }).nextPageToken
    ?? (data as { next_page_token?: unknown }).next_page_token;
  return typeof token === "string" && token ? token : undefined;
}

function normalizeCals(data: unknown): RawCal[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as RawCal[];
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as RawCal[];
    if (Array.isArray(o.calendars)) return o.calendars as RawCal[];
  }
  return [];
}

export function gcalLane(c: RawCal): GCalDesk {
  const id = String(c.id || c.summary || "primary");
  const label = (c.summary || id).trim() || "Calendar";
  const primary = Boolean(c.primary) || id === "primary";
  if (primary) return { id, label: "Mine", lane: "mine" };
  if (/family/i.test(label)) return { id, label: label === "Family" ? "Family" : label, lane: "family" };
  if (/holiday|birthday/i.test(label)) return { id, label, lane: "other" };
  return { id, label, lane: "other" };
}

export function defaultGcalOff(cals: GCalDesk[]): string[] {
  return cals.filter((c) => c.lane !== "mine").map((c) => c.id);
}

export function mineCalId(cals: { id: string; lane: string }[] | undefined) {
  return cals?.find((c) => c.lane === "mine")?.id;
}

/** Extra pages after the first. A token left after this cap is a partial pull, not a full month. */
export const GCAL_EXTRA_PAGES = 8;

export type GcalPage<T> = { ok: boolean; events: T[]; next?: string };

/** Fold one later page. A failed page marks the list incomplete. An empty page ends it cleanly. */
export function noteGcalPage<T>(
  state: { events: T[]; token?: string; seen: Set<string>; truncated: boolean },
  page: GcalPage<T>,
) {
  if (!page.ok) {
    state.truncated = true;
    state.token = undefined;
    return;
  }
  if (!page.events.length) {
    state.token = undefined;
    return;
  }
  state.events.push(...page.events);
  const next = page.next;
  if (!next || state.seen.has(next)) {
    state.token = undefined;
    return;
  }
  state.seen.add(next);
  state.token = next;
}

/** Desk-local month window as real instants. Not UTC midnight of that calendar date. */
export function gcalRange(cursor: Date): { timeMin: string; timeMax: string } {
  const p = manilaParts(cursor);
  return {
    timeMin: fromManila(p.year, p.month - 1, 1).toISOString(),
    timeMax: fromManila(p.year, p.month + 2, 1).toISOString(),
  };
}

/** Untagged Google rows follow Mine, so hiding Family does not leave them stuck on. */
export function visibleCalEvents<T extends { source: string; calId?: string }>(
  events: T[],
  off: string[],
  mineId?: string,
): T[] {
  if (!off.length) return events;
  const hide = new Set(off);
  return events.filter((e) => {
    if (e.source !== "google") return true;
    const id = e.calId || mineId;
    return !id || !hide.has(id);
  });
}

export const listGoogleCalendars = createServerFn({ method: "POST" }).handler(async () => {
  const { callTool } = await import("@/lib/app-data/client.server");
  const { ConnectorType } = await import("@/lib/app-data");
  const names = ["google_calendar_list_calendars", "list_calendars", "calendar_list_calendars"];
  let last: Awaited<ReturnType<typeof callTool>> | null = null;
  for (const tool of names) {
    const result = await callTool(tool, { maxResults: 100 }, { connectorType: ConnectorType.GoogleCalendar });
    last = result;
    if (result.loginRequired) return { loginRequired: true, loginUrl: result.loginUrl, calendars: [] as GCalDesk[] };
    if (result.ok) {
      const calendars = normalizeCals(result.data).map(gcalLane);
      return { loginRequired: false, calendars };
    }
  }
  return {
    loginRequired: false,
    error: last?.errorMessage || "Could not list Google calendars",
    calendars: [] as GCalDesk[],
  };
});

export const listGoogleEvents = createServerFn({ method: "POST" })
  .validator(
    z.object({
      timeMin: z.string(),
      timeMax: z.string(),
      calendarId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { callTool } = await import("@/lib/app-data/client.server");
    const { ConnectorType } = await import("@/lib/app-data");
    const names = [
      "google_calendar_list_events",
      "google_calendar_search",
      "list_events",
      "calendar_list_events",
    ];
    let last: Awaited<ReturnType<typeof callTool>> | null = null;
    for (const tool of names) {
      const args: Record<string, unknown> = {
        timeMin: data.timeMin,
        timeMax: data.timeMax,
        maxResults: 250,
        singleEvents: true,
        orderBy: "startTime",
      };
      if (data.calendarId) args.calendarId = data.calendarId;
      const result = await callTool(tool, args, { connectorType: ConnectorType.GoogleCalendar });
      last = result;
      if (result.loginRequired) return { loginRequired: true, loginUrl: result.loginUrl, events: [] as GCalEvent[] };
      if (result.ok) {
        const events = normalize(result.data);
        let token = nextToken(result.data);
        const seen = new Set<string>();
        if (token) seen.add(token);
        let truncated = false;
        for (let page = 0; page < GCAL_EXTRA_PAGES && token; page += 1) {
          const more = await callTool(tool, { ...args, pageToken: token }, { connectorType: ConnectorType.GoogleCalendar });
          const state: { events: GCalEvent[]; token?: string; seen: Set<string>; truncated: boolean } = {
            events,
            token,
            seen,
            truncated,
          };
          noteGcalPage(state, {
            ok: more.ok,
            events: more.ok ? normalize(more.data) : [],
            next: more.ok ? nextToken(more.data) : undefined,
          });
          token = state.token;
          truncated = state.truncated;
        }
        if (token) truncated = true;
        return { loginRequired: false, events, truncated: truncated || undefined };
      }
    }
    return {
      loginRequired: false,
      error: last?.errorMessage || "Could not read Google Calendar",
      events: [] as GCalEvent[],
    };
  });
