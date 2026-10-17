/** Card 235 (Form 234 §3): iCal/ICS as the primary calendar path — shared by the Calendars sheet and Options. */
import { toast } from "sonner";
import { parseICSAsync } from "../parse-ics-async.ts";
import { addIcsSource } from "./accounts.ts";

/** One ICS-file import (same copy as the Calendar toolbar and the sheet). */
export async function importCalendarFile(f: File) {
  try {
    const evs = await parseICSAsync(await f.text());
    const n = addIcsSource({ kind: "ics", name: f.name, importedAt: new Date().toISOString(), shown: true }, evs);
    toast(n ? `Imported ${n} event${n === 1 ? "" : "s"}` : "Already up to date");
  } catch {
    toast("Could not read that calendar file");
  }
}
