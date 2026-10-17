/**
 * Card 235 (Form 234): build-time feature flags. Same pattern as `VITE_AUTH_ENABLED`
 * (`src/lib/auth/client.ts`): a `VITE_` variable read through `import.meta.env`, so it is baked
 * into the bundle at build time.
 *
 * `googleCalendar`: Google Calendar sign-in, sync and every Google surface in Calendar, the widgets
 * and Options. **Off unless `VITE_GOOGLE_CALENDAR=true`.** Off = Calendar is iCal-address + ICS-file
 * only; no Google status/sync request is made and cached Google events are hidden (not deleted).
 * All Google code stays; turning the flag on restores Cards 164/168/176/182 exactly.
 *
 * Node (unit tests / scripts) has no `import.meta.env`; it falls back to `process.env` there so a
 * test run can opt in with `VITE_GOOGLE_CALENDAR=true`.
 */
const env: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? (typeof process !== "undefined" ? process.env : {});

export const features = {
  googleCalendar: env.VITE_GOOGLE_CALENDAR === "true",
} as const;
