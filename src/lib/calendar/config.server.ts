/**
 * What the Google calendar connection needs from the environment. Names only ever leave
 * this module; values never do. Anything missing → the app shows "not connected" honestly.
 */
import { parseSealKey } from "./crypto.server.ts";

export const CALENDAR_ENV = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "CALENDAR_TOKEN_ENC_KEY", "DATABASE_URL", "CALENDAR_PUBLIC_ORIGIN"] as const;

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
  | { ready: true; missing: []; clientId: string; clientSecret: string; key: Buffer; origin: string };

type Env = Record<string, string | undefined>;

export function readCalendarConfig(env: Env = process.env): CalendarConfig {
  const val = (k: string) => env[k]?.trim() || undefined;
  const missing: string[] = CALENDAR_ENV.filter((k) => !val(k));
  const key = parseSealKey(val("CALENDAR_TOKEN_ENC_KEY"));
  if (val("CALENDAR_TOKEN_ENC_KEY") && !key) missing.push("CALENDAR_TOKEN_ENC_KEY (must decode to 32 bytes)");
  const origin = checkOrigin(val("CALENDAR_PUBLIC_ORIGIN"), env.NODE_ENV === "production");
  if (val("CALENDAR_PUBLIC_ORIGIN") && !origin) missing.push("CALENDAR_PUBLIC_ORIGIN (must be an https origin with no path)");
  if (missing.length || !key || !origin) return { ready: false, missing: [...new Set(missing)] };
  return { ready: true, missing: [], clientId: val("GOOGLE_CLIENT_ID")!, clientSecret: val("GOOGLE_CLIENT_SECRET")!, key, origin };
}

/**
 * Card 167 M1: the redirect URI and post-login redirect come only from CALENDAR_PUBLIC_ORIGIN.
 * No BETTER_AUTH_URL fallback, no X-Forwarded-Host. https origin only (scheme + host [+ port]);
 * http://localhost:* is allowed outside production.
 */
export function checkOrigin(raw: string | undefined, production: boolean): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const bare = raw.replace(/\/+$/, "").toLowerCase() === u.origin.toLowerCase();
  if (!bare || u.username || u.password) return null;
  if (u.protocol === "https:") return u.origin;
  if (!production && u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return u.origin;
  return null;
}
