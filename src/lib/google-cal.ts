import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fromManila, inclusiveAllDayEnd, manilaAt, manilaParts } from "./format.ts";
import { parseRrule } from "./repeat.ts";
import type { CalendarEvent, GCalDesk } from "./types.ts";

type GCalEvent = {
  id?: string;
  summary?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  originalStartTime?: { dateTime?: string; date?: string };
  location?: string;
  recurrence?: string[];
  recurringEventId?: string;
  hangoutLink?: string;
  attendees?: { email?: string; displayName?: string; self?: boolean; resource?: boolean }[];
  reminders?: { overrides?: { minutes?: number }[] };
  colorId?: string;
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

export function isBirthdayCal(c: { id: string; label: string }) {
  const hay = `${c.id} ${c.label}`;
  if (/holiday/i.test(hay)) return false;
  if (/birthday/i.test(c.label)) return true;
  return /addressbook#contacts/i.test(c.id);
}

export function defaultGcalOff(cals: GCalDesk[]): string[] {
  return cals.filter((c) => c.lane !== "mine" && !isBirthdayCal(c)).map((c) => c.id);
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

/** The connector expanded instances and did not give a rule. Fall back to singleEvents. */
export function googleNeedsInstances(events: { recurrence?: string[]; recurringEventId?: string }[]) {
  if (events.some((e) => e.recurrence?.some((r) => /FREQ=/i.test(r)))) return false;
  return events.some((e) => Boolean(e.recurringEventId));
}

const GOOGLE_COLORS: Record<string, string> = {
  "1": "#795548",
  "2": "#33b679",
  "3": "#8e24aa",
  "4": "#e67c73",
  "5": "#f6bf26",
  "6": "#f5511d",
  "7": "#039be5",
  "8": "#616161",
  "9": "#3f51b5",
  "10": "#0b8043",
  "11": "#d50000",
};

function googleDay(stamp?: { dateTime?: string; date?: string }) {
  if (!stamp) return "";
  if (stamp.date) return stamp.date.slice(0, 10);
  if (!stamp.dateTime) return "";
  const p = manilaParts(new Date(stamp.dateTime));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function googleId(calendarId: string | undefined, id: string) {
  return "g-" + (calendarId ? calendarId + "-" : "") + id;
}

/** One master per rule. Date-only Google ends are exclusive; map to an inclusive desk end. */
export function mapGoogleEvents(events: GCalEvent[], calendarId?: string): CalendarEvent[] {
  const skips = new Map<string, string[]>();
  const masters: CalendarEvent[] = [];
  const rest: CalendarEvent[] = [];
  const noteSkip = (series: string, day: string) => {
    if (!day) return;
    const list = skips.get(series) ?? [];
    if (!list.includes(day)) list.push(day);
    skips.set(series, list);
  };
  for (const g of events) {
    if (g.status === "cancelled") {
      if (g.recurringEventId) noteSkip(g.recurringEventId, googleDay(g.originalStartTime ?? g.start));
      continue;
    }
    const dateOnly = Boolean(g.start?.date && !g.start.dateTime);
    const startRaw = g.start?.dateTime || g.start?.date || "";
    if (!startRaw) continue;
    const startAt = g.start?.dateTime ? new Date(g.start.dateTime) : manilaAt(g.start!.date!, 0);
    if (Number.isNaN(startAt.getTime())) continue;
    const endAt = dateOnly
      ? inclusiveAllDayEnd(g.start!.date!, g.end?.date)
      : new Date(g.end?.dateTime || g.end?.date || startRaw);
    const ruleLine = g.recurrence?.find((r) => /FREQ=/i.test(r));
    const rule = ruleLine ? parseRrule(ruleLine) : null;
    const guests = (g.attendees ?? [])
      .filter((a) => !a.self && !a.resource)
      .map((a) => (a.displayName || a.email || "").trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(", ");
    const reminder = g.reminders?.overrides?.find((r) => Number.isFinite(r.minutes))?.minutes;
    const row: CalendarEvent = {
      id: googleId(calendarId, g.id || `${startAt.getTime()}`),
      title: g.summary || "Google event",
      start: startAt.toISOString(),
      end: Number.isNaN(endAt.getTime()) ? startAt.toISOString() : endAt.toISOString(),
      cat: "personal",
      loc: g.location || "",
      source: "google",
      allDay: dateOnly || undefined,
      calId: calendarId,
      repeat: rule?.freq,
      repeatInterval: rule && rule.interval > 1 ? rule.interval : undefined,
      repeatUntil: rule?.until,
      repeatCount: rule?.count,
      color: g.colorId ? GOOGLE_COLORS[g.colorId] : undefined,
      guests: guests || undefined,
      meet: g.hangoutLink || undefined,
      reminder: reminder && reminder > 0 ? Math.min(10080, Math.floor(reminder)) : undefined,
    };
    if (rule) masters.push(row);
    else {
      if (g.recurringEventId) noteSkip(g.recurringEventId, googleDay(g.originalStartTime));
      rest.push(row);
    }
  }
  for (const master of masters) {
    const prefix = calendarId ? `g-${calendarId}-` : "g-";
    const googleKey = master.id.startsWith(prefix) ? master.id.slice(prefix.length) : master.id;
    const extra = skips.get(googleKey);
    if (extra?.length) master.skip = extra;
  }
  return [...masters, ...rest];
}

/** Drop flattened Google copies once the series master is in the pull. */
export function preferGoogleRules(existing: CalendarEvent[], incoming: CalendarEvent[]) {
  const masters = incoming.filter((e) => e.source === "google" && e.repeat && e.calId);
  if (!masters.length) return existing;
  return existing.filter((x) => {
    if (x.source !== "google" || x.repeat || !x.calId) return true;
    return !masters.some((m) => m.calId === x.calId && m.title === x.title && m.id !== x.id);
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
      singleEvents: z.boolean().optional(),
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
      const single = data.singleEvents === true;
      const args: Record<string, unknown> = {
        timeMin: data.timeMin,
        timeMax: data.timeMax,
        maxResults: 250,
        singleEvents: single,
      };
      if (single) args.orderBy = "startTime";
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
