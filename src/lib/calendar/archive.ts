/**
 * Card 242: Atrium shows only its own events and iCal/ICS events. Rows from any other source
 * (the removed two-way calendar integration) are moved out of `events` into `calArchive` on
 * migration: kept on this device, never shown, never deleted. See docs/RESTORE-GOOGLE-CALENDAR.md.
 */
const SHOWN = new Set(["local", "ics"]);

/** True for a row Atrium can show: no source (older local rows), "local" or "ics". */
export function isShownSource(e: { source?: unknown }) {
  return e.source === undefined || SHOWN.has(String(e.source));
}

export function splitArchived<T extends { source?: unknown }>(events: T[], archive: unknown[] = []) {
  const keep: T[] = [];
  const moved: unknown[] = [];
  for (const e of events) (isShownSource(e) ? keep : moved).push(e);
  return { events: keep, archive: moved.length ? [...archive, ...moved] : archive };
}
