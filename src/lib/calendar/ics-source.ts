/** ICS file / secret iCal address: read-only by design (Card 163). */
import type { CalendarEvent } from "../types.ts";
import { READ_ONLY, ReadOnlyCalendarError, type CalendarMeta, type CalendarSource, type ListEventsResult } from "./source.ts";

export type IcsSourceMeta = { id: string; kind: "ical" | "ics"; name: string; url?: string; refreshedAt?: string; importedAt?: string; colour?: string; shown?: boolean };

export class IcsSource implements CalendarSource {
  readonly kind = "ics" as const;
  readonly capabilities = READ_ONLY;
  readonly meta: IcsSourceMeta;
  private readonly load: () => Promise<CalendarEvent[]>;
  constructor(meta: IcsSourceMeta, load: () => Promise<CalendarEvent[]>) {
    this.meta = meta;
    this.load = load;
  }
  get id() {
    return this.meta.id;
  }
  async listCalendars(): Promise<CalendarMeta[]> {
    return [{ id: this.meta.id, name: this.meta.name, accessRole: "reader" }];
  }
  async listEvents(): Promise<ListEventsResult> {
    const events = (await this.load()).map((e) => ({ ...e, source: "ics" as const, srcId: this.meta.id }));
    return { events, deleted: [] };
  }
  async createEvent(): Promise<never> {
    throw new ReadOnlyCalendarError(this.meta.name);
  }
  async updateEvent(): Promise<never> {
    throw new ReadOnlyCalendarError(this.meta.name);
  }
  async deleteEvent(): Promise<never> {
    throw new ReadOnlyCalendarError(this.meta.name);
  }
}

/** Events of a removed source leave Calendar; nothing else is touched. */
export function withoutSource(events: CalendarEvent[], srcId: string) {
  return events.filter((e) => !(e.source === "ics" && (e.srcId ?? LEGACY_ICS) === srcId));
}

/** ICS events imported before Card 165 carry no source id; they are listed as one source. */
export const LEGACY_ICS = "ics-earlier";

/**
 * Card 168: a saved iCal address can be a Google "secret address" — treat it like a password.
 * Shown as `<host>/calendar/ical/••••••••/basic.ics`: host and plain words stay,
 * any id-like or private segment (and the whole query) collapses to one mask.
 */
export function maskIcsUrl(raw: string) {
  const DOTS = "••••••••";
  let u: URL;
  try {
    u = new URL(raw.replace(/^webcal:/i, "https:"));
  } catch {
    return DOTS;
  }
  const parts = u.pathname.split("/").filter(Boolean);
  const out: string[] = [];
  parts.forEach((p, i) => {
    const last = i === parts.length - 1;
    const plain = /^[a-z][a-z-]{0,11}$/i.test(p) && !/^private/i.test(p);
    const file = last && /^[a-z][\w-]{0,20}\.ics$/i.test(p);
    const seg = plain || file ? p : DOTS;
    if (seg === DOTS && out.at(-1) === DOTS) return;
    out.push(seg);
  });
  return `${u.host}/${out.join("/")}${u.search ? `?${DOTS}` : ""}`;
}
