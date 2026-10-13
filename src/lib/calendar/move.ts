/**
 * Card 174 K2 (Scout 172): moving events between calendars.
 * Google → Google uses events.move (the same event changes calendar). It is allowed only for a
 * whole default-type event you organize, into a calendar you can write to. Nothing is deleted
 * before Google confirms. Deleting an event you organize that has guests asks whether to tell them.
 */
import type { CalendarEvent } from "../types.ts";

export function moveBlock(e: CalendarEvent, to: string, writableIds: string[]): string | null {
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
