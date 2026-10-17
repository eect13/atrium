/**
 * Card 228 B2 (Critic 225): a failed refresh must not sign the device out. Only an explicit
 * server reject (401, invalid_grant) forgets the session; network errors, 409 (just rotated),
 * 429 and 5xx retry with backoff and keep the refresh handle.
 */
import { CalendarApiError } from "./google-source.ts";

export type RenewOutcome = "ok" | "rejected" | "transient";
export const RENEW_BACKOFF_MS = [400, 1200, 3000] as const;

/** The server said this session is over: forget it. */
export function isSessionReject(e: unknown): boolean {
  return e instanceof CalendarApiError && (e.status === 401 || e.code === "invalid_grant");
}

/** Worth another try: offline/network (status 0), 409 rotate race, 408/429, any 5xx. */
export function isRetryable(e: unknown): boolean {
  if (!(e instanceof CalendarApiError)) return true;
  return e.status === 0 || e.status === 408 || e.status === 409 || e.status === 429 || e.status >= 500;
}

export async function renewWithRetry<T>(
  refresh: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ outcome: "ok"; value: T } | { outcome: "rejected" | "transient"; value: null }> {
  for (let i = 0; ; i++) {
    try {
      return { outcome: "ok", value: await refresh() };
    } catch (e) {
      if (isSessionReject(e)) return { outcome: "rejected", value: null };
      if (!isRetryable(e) || i >= RENEW_BACKOFF_MS.length) return { outcome: "transient", value: null };
      await sleep(RENEW_BACKOFF_MS[i]);
    }
  }
}
