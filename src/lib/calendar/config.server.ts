/**
 * What the Google calendar connection needs from the environment. Names only ever leave
 * this module; values never do. Anything missing → the app shows "not connected" honestly.
 */
import { parseSealKey } from "./crypto.server.ts";

export const CALENDAR_ENV = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "CALENDAR_TOKEN_ENC_KEY", "DATABASE_URL"] as const;

/** Least scopes for two-way sync + the picker (Card 163 §4). */
export const CALENDAR_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;
export const EDIT_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const CALLBACK_PATH = "/api/calendar/oauth/callback";

export type CalendarConfig =
  | { ready: false; missing: string[] }
  | { ready: true; missing: []; clientId: string; clientSecret: string; key: Buffer; origin?: string };

type Env = Record<string, string | undefined>;

export function readCalendarConfig(env: Env = process.env): CalendarConfig {
  const val = (k: string) => env[k]?.trim() || undefined;
  const missing: string[] = CALENDAR_ENV.filter((k) => !val(k));
  const key = parseSealKey(val("CALENDAR_TOKEN_ENC_KEY"));
  if (val("CALENDAR_TOKEN_ENC_KEY") && !key) missing.push("CALENDAR_TOKEN_ENC_KEY (must decode to 32 bytes)");
  if (missing.length || !key) return { ready: false, missing: [...new Set(missing)] };
  const origin = (val("CALENDAR_PUBLIC_ORIGIN") ?? val("BETTER_AUTH_URL"))?.replace(/\/+$/, "");
  return { ready: true, missing: [], clientId: val("GOOGLE_CLIENT_ID")!, clientSecret: val("GOOGLE_CLIENT_SECRET")!, key, origin };
}

/** Public origin for the redirect URI: configured origin first, else the request's own origin. */
export function publicOrigin(cfg: { origin?: string }, req: Request) {
  if (cfg.origin) return cfg.origin;
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || u.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || u.protocol.replace(":", "");
  return `${proto}://${host}`;
}
