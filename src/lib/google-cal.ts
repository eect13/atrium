import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ConnectorType } from "@/lib/app-data";

type GCalEvent = {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
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

export const listGoogleEvents = createServerFn({ method: "POST" })
  .validator(
    z.object({
      timeMin: z.string(),
      timeMax: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { callTool } = await import("@/lib/app-data/client.server");
    const names = [
      "google_calendar_list_events",
      "list_events",
      "calendar_list_events",
    ];
    let last: Awaited<ReturnType<typeof callTool>> | null = null;
    for (const tool of names) {
      const result = await callTool(
        tool,
        {
          timeMin: data.timeMin,
          timeMax: data.timeMax,
          maxResults: 40,
          singleEvents: true,
          orderBy: "startTime",
        },
        { connectorType: ConnectorType.GoogleCalendar },
      );
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
