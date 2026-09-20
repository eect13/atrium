import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  if (/^(owner)$/i.test(c.accessRole || "") && !/holiday|birthday/i.test(label)) {
    return { id, label, lane: "mine" };
  }
  return { id, label, lane: "other" };
}

export function defaultGcalOff(cals: GCalDesk[]): string[] {
  return cals.filter((c) => c.lane !== "mine").map((c) => c.id);
}

export function visibleCalEvents<T extends { source: string; calId?: string }>(events: T[], off: string[]): T[] {
  if (!off.length) return events;
  const hide = new Set(off);
  return events.filter((e) => e.source !== "google" || !e.calId || !hide.has(e.calId));
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
        maxResults: 40,
        singleEvents: true,
        orderBy: "startTime",
      };
      if (data.calendarId) args.calendarId = data.calendarId;
      const result = await callTool(tool, args, { connectorType: ConnectorType.GoogleCalendar });
      last = result;
      if (result.loginRequired) return { loginRequired: true, loginUrl: result.loginUrl, events: [] as GCalEvent[] };
      if (result.ok) {
        return { loginRequired: false, events: normalize(result.data) };
      }
    }
    return {
      loginRequired: false,
      error: last?.errorMessage || "Could not read Google Calendar",
      events: [] as GCalEvent[],
    };
  });
