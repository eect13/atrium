/**
 * Card 174 K2 (Scout 172): moving events between calendars.
 * Google → Google uses events.move (the same event changes calendar). It is allowed only for a
 * whole default-type event you organize, into a calendar you can write to. Nothing is deleted
 * before Google confirms. Deleting an event you organize that has guests asks whether to tell them.
 */
import type { CalendarEvent } from "../types.ts";

export function moveBlock(e: CalendarEvent, to: string, writableIds: string[]): string | null {
  // Card 181: leaving Google (to Atrium) deletes it there, so an unknown organiser blocks that too.
  if (e.source === "google" && e.calId && to !== e.calId && e.organizerSelf === undefined) return "Can't move yet: Google hasn't confirmed who organizes this event.";
  if (to === "local" || e.source !== "google" || !e.calId || to === e.calId) return null;
  if (e.instanceOf || e.seriesId) return "Only the whole series can move to another calendar.";
  if (e.eventType) return "This kind of Google event can't move to another calendar.";
  if (e.organizerSelf !== true) return "Only events you organize can move to another calendar.";
  if (!writableIds.includes(to)) return "You can't add events to that calendar.";
  if (!e.remoteId) return "This event hasn't reached Google yet. Try again after it syncs.";
  return null;
}

/** Guests Google would email about a delete; 0 unless you organize it. */
export function guestsToTell(e: CalendarEvent): number {
  return e.source === "google" && e.organizerSelf === true && e.guestCount ? e.guestCount : 0;
}

export const tellGuestsQuestion = (n: number) => `Delete and tell ${n} guest${n === 1 ? "" : "s"}?`;

/** Card 176 (a): guest step after the scope step of a repeating delete. */
export function seriesGuestQuestion(scope: "this" | "following" | "all", n: number) {
  const who = `${n} guest${n === 1 ? "" : "s"}`;
  if (scope === "this") return `Tell ${who} this date is cancelled?`;
  if (scope === "following") return `Tell ${who} these dates are cancelled?`;
  return `Tell ${who} the event is cancelled?`;
}

export const GUEST_HELPER = "Google emails them a cancellation. If you don't send one, it still leaves their calendars.";

/**
 * Card 176 / Critic 175 (b): don't delete a Google event while we can't know who would be told.
 * Unknown ownership (cached before Card 174) → wait for a sync; before the first sync, events with
 * guests wait too. Events without guests and Atrium-only events are never blocked.
 */
export function deleteBlock(e: CalendarEvent, lastSync: string | null): string | null {
  if (e.source !== "google") return null;
  // Card 181: unknown stays blocked until resolveOwner learns the organiser from Google.
  if (ownerUnknown(e)) return "Can't delete yet: Google hasn't confirmed who organizes this event.";
  if (lastSync === null && (e.guestCount ?? 0) > 0) return "Finish syncing before deleting events that have guests.";
  return null;
}

/** Card 181: a Google event whose organiser we don't know (not the same as not yours = false). */
export const ownerUnknown = (e: CalendarEvent) => e.source === "google" && e.organizerSelf === undefined;

export type OwnerPatch = Pick<CalendarEvent, "organizerSelf" | "guestCount" | "etag">;

/**
 * Card 181 (Critic 180 R-N1b): ask Google for one unknown-organiser event (events.get). If Google
 * says who organises it, return the ownership fields so the normal rules apply (guest prompt when you
 * organise and there are guests). If the fetch fails or Google still names no organiser, return null:
 * the event stays unknown and blocked. Never guess "not yours", so guests are never cancelled silently.
 */
export async function resolveOwner(e: CalendarEvent, get: (calId: string, remoteId: string) => Promise<CalendarEvent>): Promise<OwnerPatch | null> {
  if (!ownerUnknown(e) || !e.calId) return null;
  try {
    const g = await get(e.calId, e.remoteId ?? e.id);
    if (g.organizerSelf === undefined) return null;
    return { organizerSelf: g.organizerSelf, guestCount: g.guestCount, ...(g.etag ? { etag: g.etag } : {}) };
  } catch {
    return null;
  }
}
