/**
 * Card 241: one entry list on every calendar surface. A ⋯ row anywhere (Calendar page, dashboard
 * widget, Options) asks for an action; the Calendar page or Options carries it out on arrival.
 * Deep links `?import=1`, `?addlink=1` and the old `?accounts=1` map onto the same intents.
 */
import { useAtrium } from "../store.ts";

export type CalIntent = "import" | "addlink";
export const CALENDAR_OPTIONS_ID = "opt-calendar";

let pending: CalIntent | null = null;
let optionsPending = false;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

/** Go to Calendar and run one action there (file picker or the Add iCal link dialog). */
export function requestCalendar(intent: CalIntent) {
  pending = intent;
  useAtrium.getState().setView("calendar");
  ping();
}

export function takeCalIntent(): CalIntent | null {
  const i = pending;
  pending = null;
  return i;
}

/** "Calendar options…": Options, scrolled to the Calendar card. */
export function openCalendarOptions() {
  optionsPending = true;
  useAtrium.getState().setView("options");
  ping();
}

export function takeOptionsScroll(): boolean {
  const o = optionsPending;
  optionsPending = false;
  return o;
}

export function onCalIntent(fn: () => void) {
  subs.add(fn);
  return () => void subs.delete(fn);
}

/** URL deep link → intent ("accounts" was the old sheet; it now means Options › Calendar). */
export function intentFromSearch(q: URLSearchParams): CalIntent | "options" | null {
  if (q.get("import") === "1") return "import";
  if (q.get("addlink") === "1") return "addlink";
  if (q.get("accounts") === "1") return "options";
  return null;
}
