/** Card 241: the iCal-link subscribe, lifted unchanged from the old Calendars sheet (Card 168). */
import { toast } from "sonner";
import { fetchIcsUrl } from "../feeds.ts";
import { parseICSAsync } from "../parse-ics-async.ts";
import { addIcsSource } from "./accounts.ts";

/** Fetch, parse and add a secret iCal address. True when it was added (the caller clears its field). */
export async function subscribeIcal(raw: string): Promise<boolean> {
  const u = raw.trim();
  if (!u) return false;
  try {
    const evs = await parseICSAsync(await fetchIcsUrl({ data: { url: u } }));
    let name = u;
    try {
      name = new URL(u).hostname.replace(/^www\./, "");
    } catch {
      /* keep raw */
    }
    const n = addIcsSource({ kind: "ical", name, url: u, refreshedAt: new Date().toISOString(), shown: true }, evs);
    toast(n ? `Imported ${n} event${n === 1 ? "" : "s"}` : "Already up to date");
    return true;
  } catch (e) {
    toast(e instanceof Error ? e.message : "Could not fetch calendar");
    return false;
  }
}
