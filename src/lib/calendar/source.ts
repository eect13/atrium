/**
 * Calendar sources (Card 163 §1). One small interface for every place events come from:
 *   - "google": read + write through the Atrium server (tokens never reach the device)
 *   - "ics":    read-only (an imported .ics file or a public iCal URL)
 *   - "local":  read + write in the desk store
 * Client-safe: no secrets, no server imports.
 */
import type { CalendarEvent } from "../types.ts";

export type CalendarKind = "google" | "ics" | "local";

export type CalendarCapabilities = { read: boolean; write: boolean; push: boolean };

/** Google `accessRole`. Owner/writer can edit; the rest are view-only. */
export type AccessRole = "owner" | "writer" | "reader" | "freeBusyReader";

export type CalendarMeta = {
  id: string;
  name: string;
  accessRole: AccessRole;
  primary?: boolean;
  /** Google's own colour (hex). Atrium's chosen colour lives in desk prefs, never written back. */
  googleColor?: string;
};

export type EventWindow = { timeMin: string; timeMax: string };

export type ListEventsQuery = (EventWindow & { syncToken?: undefined }) | { syncToken: string; timeMin?: undefined; timeMax?: undefined };

export type ListEventsResult = {
  events: CalendarEvent[];
  /** Desk ids of events removed since the last sync token. */
  deleted: string[];
  nextSyncToken?: string;
  /** The stored sync token was rejected (HTTP 410); the caller must drop it and do a full sync. */
  resync?: boolean;
  truncated?: boolean;
};

export type EventWrite = Pick<CalendarEvent, "title" | "start" | "end" | "loc" | "allDay" | "repeat" | "repeatInterval" | "repeatUntil" | "repeatCount" | "reminder"> & {
  /** Google etag for If-Match; a newer copy in Google makes the write fail instead of overwriting. */
  etag?: string;
};

export interface CalendarSource {
  readonly id: string;
  readonly kind: CalendarKind;
  readonly capabilities: CalendarCapabilities;
  listCalendars(): Promise<CalendarMeta[]>;
  listEvents(calendarId: string, query: ListEventsQuery): Promise<ListEventsResult>;
  createEvent?(calendarId: string, ev: EventWrite): Promise<CalendarEvent>;
  updateEvent?(calendarId: string, remoteId: string, ev: EventWrite): Promise<CalendarEvent>;
  deleteEvent?(calendarId: string, remoteId: string, etag?: string, notify?: "all" | "none"): Promise<void>;
  /** Card 174 K2: Google events.move; resolves with the event as Google now has it (in `to`). */
  moveEvent?(calendarId: string, remoteId: string, to: string, notify?: "all" | "none"): Promise<CalendarEvent>;
}

export class ReadOnlyCalendarError extends Error {
  constructor(what = "This calendar") {
    super(`${what} is read-only. Edit it where it comes from.`);
    this.name = "ReadOnlyCalendarError";
  }
}

export const READ_ONLY: CalendarCapabilities = { read: true, write: false, push: false };
export const READ_WRITE: CalendarCapabilities = { read: true, write: true, push: false };

export function isWritableRole(role: AccessRole | string | undefined) {
  return role === "owner" || role === "writer";
}

/** Fails loudly when a write is attempted on a source that cannot write. */
export function assertWritable(source: Pick<CalendarSource, "capabilities" | "kind">, what?: string) {
  if (!source.capabilities.write) throw new ReadOnlyCalendarError(what ?? (source.kind === "ics" ? "An iCal / ICS calendar" : "This calendar"));
}

const PALETTE_KEYS = ["work", "personal", "family", "health", "other", "pink", "sky", "amber", "mint"] as const;

/** Atrium-only colour for a calendar: the user's pick, else a stable palette key from its id. */
export function calendarColourOf(id: string, chosen?: string) {
  if (chosen) return chosen;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE_KEYS[Math.abs(h) % PALETTE_KEYS.length]!;
}
