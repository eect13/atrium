/** Card 241: what Calendar shows (and Export ICS writes): Atrium events plus shown ICS sources, in source colours. */
import { catToken } from "../event-cats.ts";
import type { CalendarEvent } from "../types.ts";
import type { IcsSourceMeta } from "./ics-source.ts";

export function visibleCalendarEvents(events: CalendarEvent[], sources: IcsSourceMeta[]): CalendarEvent[] {
  const hidden = new Set(sources.filter((s) => s.shown === false).map((s) => s.id));
  const colours = new Map<string, string>();
  for (const src of sources) if (src.colour) colours.set(src.id, catToken(src.colour));
  return events
    .filter((e) => !(e.source === "ics" && hidden.has(e.srcId ?? "")))
    .map((e) => {
      const c = e.color ? undefined : colours.get(e.srcId ?? "");
      return c ? { ...e, color: c } : e;
    });
}
