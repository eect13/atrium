/**
 * `/api/calendar/*` (Card 163, hardened in Card 170 per Card 167). Google tokens live here only:
 * the refresh token sealed in Postgres, access tokens in memory. Devices hold opaque handles:
 * a 1 h access handle and a rotating refresh handle (14 d idle, 90 d absolute), hashed in the DB.
 *
 * Web:     same-origin HttpOnly cookies `atrium_cal` (access) + `atrium_cal_r` (refresh);
 *          the server rotates transparently when the access handle has expired.
 * Desktop/Android: POST /handoff/start {challenge} → {hid}; system browser → /connect?hid= →
 *          OAuth → the page shows a 6-character code; the app sends POST /handoff/claim
 *          {hid, verifier, code} and then `Authorization: Bearer <access>` with
 *          `credentials: "omit"`. CORS: exact Tauri origins, never `*`, never Allow-Credentials.
 */
import { CALLBACK_PATH, EDIT_SCOPE, readCalendarConfig, type CalendarConfig } from "./config.server.ts";
import { open as unseal, randomToken, seal, SealError, sha256 } from "./crypto.server.ts";
import { deleteEvent, GoogleApiError, insertEvent, listCalendarList, listEventsPage, moveEvent, patchEvent, sendUpdatesOf, type GEvent, getEvent } from "./google-api.server.ts";
import { authUrl, exchangeCode, OAuthError, refreshAccess, revoke, userInfo, type Fetch } from "./oauth.server.ts";
import {
  bindHandoff,
  claimHandoff,
  claimLimited,
  noteClaimFail,
  consentHandoff,
  deleteConnection,
  findConnection,
  handoffBound,
  newSession,
  REFRESH_IDLE_MS,
  revokeFamily,
  rotateSession,
  sessionFor,
  showCode,
  startHandoff,
  updateConnection,
  upsertConnection,
  type Connection,
  type SessionPair,
  type Sql,
} from "./store.server.ts";
import type { CalendarMeta } from "./source.ts";

export type Deps = { env?: Record<string, string | undefined>; sql: () => Promise<Sql>; fetch?: Fetch; now?: () => number };

const ACCESS_COOKIE = "atrium_cal";
const REFRESH_COOKIE = "atrium_cal_r";
const FLOW_COOKIE = "atrium_cal_flow";
const FLOW_TTL_MS = 5 * 60_000;
const COOKIE_MAX_AGE_S = REFRESH_IDLE_MS / 1000;
export const TAURI_ORIGINS = new Set(["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]);

const accessCache = new Map<string, { token: string; exp: number; scopes?: string[] }>();
export const _resetAccessCache = () => accessCache.clear();

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin");
  if (!o || !TAURI_ORIGINS.has(o)) return {};
  // No Access-Control-Allow-Credentials: Tauri sends `credentials: "omit"` + Bearer (Card 167 B1).
  return { "access-control-allow-origin": o, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS", "access-control-max-age": "600", vary: "origin" };
}

type Extra = Record<string, string> | [string, string][];
function headersOf(req: Request, base: Record<string, string>, extra: Extra = {}) {
  const h = new Headers({ ...base, ...cors(req) });
  for (const [k, v] of Array.isArray(extra) ? extra : Object.entries(extra)) h.append(k, v);
  return h;
}

const json = (req: Request, body: unknown, status = 200, extra: Extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: headersOf(req, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, extra) });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function page(title: string, text: string, status = 200, extra: Extra = {}, extraHtml = "") {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><body style="font:16px system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;line-height:1.5"><h1 style="font-size:1.25rem">${esc(title)}</h1>${extraHtml}<p>${esc(text)}</p></body>`;
  const h = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" });
  for (const [k, v] of Array.isArray(extra) ? extra : Object.entries(extra)) h.append(k, v);
  return new Response(html, { status, headers: h });
}

function cookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

function setCookie(name: string, value: string, maxAgeS: number, path = "/api/calendar") {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${Math.floor(maxAgeS)}; HttpOnly; Secure; SameSite=Lax`;
}

const sessionCookies = (p: SessionPair): [string, string][] => [
  ["set-cookie", setCookie(ACCESS_COOKIE, p.access, COOKIE_MAX_AGE_S)],
  ["set-cookie", setCookie(REFRESH_COOKIE, p.refresh, COOKIE_MAX_AGE_S)],
];
const clearSession: [string, string][] = [
  ["set-cookie", setCookie(ACCESS_COOKIE, "", 0)],
  ["set-cookie", setCookie(REFRESH_COOKIE, "", 0)],
];

function bearer(req: Request) {
  const auth = req.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7).trim() || null : null;
}

/**
 * Card 174 L1 (Scout 172): Vercel sets x-vercel-forwarded-for / x-real-ip at its edge and overwrites
 * client X-Forwarded-For (https://vercel.com/docs/headers/request-headers). Off Vercel (dev, other
 * hosts) fall back to the leftmost XFF; on Vercel never trust it.
 */
export function clientIp(req: Request, onVercel = Boolean(process.env.VERCEL)) {
  const h = (n: string) => req.headers.get(n)?.split(",")[0]?.trim() || "";
  return h("x-vercel-forwarded-for") || h("x-real-ip") || (onVercel ? "" : h("x-forwarded-for")) || "unknown";
}

const pairBody = (p: SessionPair) => ({ access: p.access, refresh: p.refresh, accessExp: p.accessExp, refreshExp: p.refreshExp });

type Ready = Extract<CalendarConfig, { ready: true }>;

async function accessFor(d: Deps, cfg: Ready, sql: Sql, conn: Connection) {
  const now = (d.now ?? Date.now)();
  const hit = accessCache.get(conn.id);
  if (hit && hit.exp > now + 60_000) return hit.token;
  const t = await refreshAccess(d.fetch ?? fetch, { clientId: cfg.clientId, clientSecret: cfg.clientSecret, refreshToken: conn.refreshToken });
  accessCache.set(conn.id, { token: t.access_token, exp: now + t.expires_in * 1000 });
  if (t.refresh_token && t.refresh_token !== conn.refreshToken) await updateConnection(sql, cfg.key, conn.id, { refreshToken: t.refresh_token });
  if (t.scope) {
    const scopes = t.scope.split(/\s+/).filter(Boolean);
    if (scopes.join(" ") !== conn.scopes.join(" ")) await updateConnection(sql, cfg.key, conn.id, { scopes });
  }
  return t.access_token;
}

function trimEvent(g: GEvent) {
  const keep = ["id", "etag", "status", "summary", "start", "end", "originalStartTime", "location", "recurrence", "recurringEventId", "hangoutLink", "attendees", "reminders", "colorId", "organizer", "eventType"];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (g[k] !== undefined) out[k] = g[k];
  return out;
}

function googleError(req: Request, e: unknown) {
  if (e instanceof OAuthError) return json(req, { error: e.code === "invalid_grant" ? "expired" : "oauth", message: e.message }, 401);
  if (e instanceof GoogleApiError) {
    if (e.status === 412) return json(req, { error: "conflict", message: "This event changed in Google. Sync and try again." }, 409);
    if (e.status === 403 && /insufficient|forbidden/i.test(e.reason)) return json(req, { error: "needs_edit", message: "Atrium can see this calendar but not change it." }, 403);
    if (e.status === 404 || e.status === 410) return json(req, { error: "not_found" }, 404);
    if (e.status === 401) return json(req, { error: "expired" }, 401);
    return json(req, { error: "google", message: e.message }, 502);
  }
  if (e instanceof SealError) return json(req, { error: "expired", message: "Stored sign-in could not be read. Sign in again." }, 401);
  return json(req, { error: "server", message: "Calendar request failed" }, 500);
}

type Auth = { conn: Connection; familyId: string; cookies: [string, string][] } | { error: "expired" | "disconnected"; cookies: [string, string][] };

/**
 * Who is calling. Bearer (desktop): an expired access handle → `session_expired` (the app
 * refreshes). Cookies (web): an expired access handle rotates here using the refresh cookie.
 */
async function authOf(req: Request, sql: Sql, cfg: Ready, now: number): Promise<Auth> {
  const b = bearer(req);
  const access = b ?? cookie(req, ACCESS_COOKIE);
  let s = await sessionFor(sql, access, now);
  let cookies: [string, string][] = [];
  if (!b && s !== null && typeof s === "object") {
    /* live cookie session */
  } else if (!b) {
    const refresh = cookie(req, REFRESH_COOKIE);
    if (!refresh) return { error: "disconnected", cookies: access ? clearSession : [] };
    const r = await rotateSession(sql, refresh, now);
    if (r === "retry") return { error: "expired", cookies: [] };
    if (typeof r === "string") return { error: "disconnected", cookies: clearSession };
    s = { connectionId: r.connectionId, familyId: r.familyId };
    cookies = sessionCookies(r.pair);
  }
  if (s === "expired") return { error: "expired", cookies };
  if (!s) return { error: "disconnected", cookies };
  const conn = await findConnection(sql, cfg.key, s.connectionId);
  if (!conn) return { error: "disconnected", cookies: b ? [] : clearSession };
  return { conn, familyId: s.familyId, cookies };
}

export async function handleCalendar(req: Request, subpath: string, d: Deps): Promise<Response> {
  const method = req.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const path = "/" + subpath.replace(/^\/+|\/+$/g, "");
  const cfg = readCalendarConfig(d.env ?? process.env);
  const f = d.fetch ?? fetch;
  const now = (d.now ?? Date.now)();

  if (!cfg.ready) {
    if (path === "/status") return json(req, { state: "unconfigured", missing: cfg.missing });
    if (path === "/connect" || path === "/oauth/callback") return page("Google Calendar isn't set up on this server", `Atrium can't connect to Google yet. Missing settings: ${cfg.missing.join(", ")}.`, 503);
    return json(req, { error: "unconfigured", missing: cfg.missing }, 503);
  }

  let sql: Sql;
  try {
    sql = await d.sql();
  } catch {
    return json(req, { error: "db", message: "Calendar storage is unavailable" }, 503);
  }
  // M1: only the configured origin, never request headers.
  const redirectUri = cfg.origin + CALLBACK_PATH;

  if (path === "/handoff/start" && method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { challenge?: string };
    if (!body.challenge || !/^[A-Za-z0-9_-]{43}$/.test(body.challenge)) return json(req, { error: "bad_request" }, 400);
    const r = await startHandoff(sql, body.challenge, sha256(`ip:${clientIp(req)}`), now);
    if (r === "limited") return json(req, { error: "rate_limited", message: "Too many sign-in attempts. Wait a few minutes and try again." }, 429, { "retry-after": "600" });
    return json(req, { hid: r.hid });
  }

  if (path === "/connect" && method === "GET") {
    const u = new URL(req.url);
    const hid = u.searchParams.get("hid") ?? "";
    const bad = () => page("Couldn't start Google sign-in", "This link didn't come from Atrium, or it expired. Go back to Atrium and choose Sign in with Google again.", 400);
    if (u.searchParams.has("handoff")) return bad();
    if (hid && (!/^[A-Za-z0-9_-]{16,64}$/.test(hid) || !(await bindHandoff(sql, hid, now)))) return bad();
    const flow = { state: randomToken(16), verifier: randomToken(48), hid: hid || undefined, exp: now + FLOW_TTL_MS };
    const loginHint = u.searchParams.get("login_hint")?.slice(0, 200) || undefined;
    const location = authUrl({ clientId: cfg.clientId, redirectUri, state: flow.state, verifier: flow.verifier, loginHint });
    return new Response(null, { status: 302, headers: { location, "cache-control": "no-store", "set-cookie": setCookie(FLOW_COOKIE, seal(JSON.stringify(flow), cfg.key, "flow"), FLOW_TTL_MS / 1000) } });
  }

  if (path === "/oauth/callback" && method === "GET") {
    const u = new URL(req.url);
    const clear: [string, string][] = [["set-cookie", setCookie(FLOW_COOKIE, "", 0)]];
    let flow: { state: string; verifier: string; hid?: string; exp: number } | null = null;
    try {
      const raw = cookie(req, FLOW_COOKIE);
      flow = raw ? JSON.parse(unseal(raw, cfg.key, "flow")) : null;
    } catch {
      flow = null;
    }
    if (u.searchParams.get("error")) return page("Google sign-in was cancelled", "Nothing changed. Go back to Atrium to try again.", 200, clear);
    if (!flow || flow.exp < now || flow.state !== u.searchParams.get("state")) return page("This sign-in link expired", "Go back to Atrium and choose Sign in with Google again.", 400, clear);
    if (flow.hid && !(await handoffBound(sql, flow.hid, now))) return page("This sign-in link expired", "Go back to Atrium and choose Sign in with Google again.", 400, clear);
    try {
      const tokens = await exchangeCode(f, { clientId: cfg.clientId, clientSecret: cfg.clientSecret, code: u.searchParams.get("code") ?? "", redirectUri, verifier: flow.verifier });
      const scopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
      const me = await userInfo(f, tokens.access_token);
      const conn = await upsertConnection(sql, cfg.key, { email: me.email, sub: me.sub, scopes, refreshToken: tokens.refresh_token });
      if (!conn) return page("Google didn't allow offline access", "Remove Atrium from your Google Account's third-party access, then sign in again.", 400, clear);
      accessCache.delete(conn.id);
      if (flow.hid) {
        const code = await consentHandoff(sql, cfg.key, flow.hid, conn.id, now);
        if (!code) return page("This sign-in link expired", "Go back to Atrium and choose Sign in with Google again.", 400, clear);
        const shown = showCode(code);
        const codeHtml = `<p style="font:600 2.25rem/1.2 ui-monospace,monospace;letter-spacing:.2em;margin:1.5rem 0">${esc(shown)}</p>${me.email ? `<p>Google account: ${esc(me.email)}</p>` : ""}`;
        return page(
          "Type this code into Atrium",
          `Type this code into Atrium on the device you're connecting: ${shown}. If you didn't just click Connect in Atrium, close this page — nothing is shared until the code is entered. The code works for 2 minutes.`,
          200,
          clear,
          codeHtml,
        );
      }
      const pair = await newSession(sql, conn.id, now);
      return new Response(null, { status: 302, headers: headersOf(req, { location: `${cfg.origin}/calendar?accounts=1`, "cache-control": "no-store" }, [...clear, ...sessionCookies(pair)]) });
    } catch {
      return page("Couldn't finish Google sign-in", "Nothing was saved. Go back to Atrium and try again.", 502, clear);
    }
  }

  if (path === "/handoff/claim" && method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { hid?: string; verifier?: string; code?: string };
    if (!body.hid || !body.verifier || body.verifier.length < 43 || body.verifier.length > 128 || typeof body.code !== "string" || body.code.length > 16) return json(req, { error: "bad_request" }, 400);
    const ipHash = sha256(`ip:${clientIp(req)}`);
    if (await claimLimited(sql, ipHash, now)) return json(req, { error: "rate_limited", message: "Too many wrong codes. Wait a few minutes and try again." }, 429, { "retry-after": "600" });
    const r = await claimHandoff(sql, cfg.key, body.hid, body.verifier, body.code, now);
    if (r === "bad") await noteClaimFail(sql, ipHash, now);
    if (r === "pending") return json(req, { error: "pending", message: "Finish signing in to Google in your browser first." }, 409);
    if (r === "bad") return json(req, { error: "bad_code", message: "That code doesn't match. Check the code in your browser." }, 401);
    if (r === "used") return json(req, { error: "used", message: "This code has already been used. Start again to get a new one." }, 410);
    if (r === "gone") return json(req, { error: "expired", message: "This code has expired. Codes last 2 minutes." }, 410);
    return json(req, pairBody(r.pair));
  }

  if (path === "/session/refresh" && method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { refresh?: string };
    if (!body.refresh) return json(req, { error: "bad_request" }, 400);
    const r = await rotateSession(sql, body.refresh, now);
    if (r === "retry") return json(req, { error: "retry" }, 409);
    if (r === "reuse") {
      console.warn("[calendar] refresh handle reused after rotation; session family revoked");
      return json(req, { error: "disconnected" }, 401);
    }
    if (r === "ended") return json(req, { error: "disconnected" }, 401);
    return json(req, pairBody(r.pair));
  }

  let auth: Auth;
  try {
    auth = await authOf(req, sql, cfg, now);
  } catch (e) {
    if (path === "/status") return json(req, { state: "expired", email: null });
    return googleError(req, e);
  }
  if ("error" in auth) {
    if (auth.error === "expired") return json(req, { error: "session_expired" }, 401, auth.cookies);
    if (path === "/status") return json(req, { state: "disconnected" }, 200, auth.cookies);
    return json(req, { error: "disconnected" }, 401, auth.cookies);
  }
  const { conn, familyId, cookies } = auth;

  if (path === "/status" && method === "GET") {
    try {
      await accessFor(d, cfg, sql, conn);
    } catch (e) {
      if (e instanceof OAuthError && e.code === "invalid_grant") return json(req, { state: "expired", email: conn.email }, 200, cookies);
      return googleError(req, e);
    }
    const scopes = (await findConnection(sql, cfg.key, conn.id))?.scopes ?? conn.scopes;
    return json(req, { state: "connected", email: conn.email, canEdit: scopes.includes(EDIT_SCOPE) }, 200, cookies);
  }

  if (path === "/signout" && method === "POST") {
    await revokeFamily(sql, familyId, now);
    return json(req, { ok: true }, 200, clearSession);
  }

  if (path === "/disconnect" && method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { keepGrant?: boolean };
    if (!body.keepGrant) await revoke(f, conn.refreshToken);
    await deleteConnection(sql, conn.id);
    accessCache.delete(conn.id);
    return json(req, { ok: true }, 200, clearSession);
  }

  try {
    const token = await accessFor(d, cfg, sql, conn);
    if (path === "/calendars" && method === "GET") {
      const list = await listCalendarList(f, token);
      const calendars: CalendarMeta[] = list.map((c) => ({ id: c.id, name: (c.summaryOverride || c.summary || c.id).trim(), accessRole: (c.accessRole as CalendarMeta["accessRole"]) ?? "reader", primary: c.primary || undefined, googleColor: c.backgroundColor }));
      return json(req, { calendars, canEdit: conn.scopes.includes(EDIT_SCOPE) }, 200, cookies);
    }
    const mvMatch = /^\/events\/([^/]+)\/move$/.exec(path);
    if (mvMatch && method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { cal?: string; to?: string; notify?: string };
      if (!body.cal || !body.to || body.to === body.cal) return json(req, { error: "bad_request" }, 400);
      return json(req, { item: trimEvent(await moveEvent(f, token, body.cal, decodeURIComponent(mvMatch[1]!), body.to, sendUpdatesOf(body.notify))) }, 200, cookies);
    }
    const evMatch = /^\/events(?:\/([^/]+))?$/.exec(path);
    if (evMatch) {
      const id = evMatch[1] ? decodeURIComponent(evMatch[1]) : undefined;
      if (method === "GET" && !id) {
        const u = new URL(req.url);
        const cal = u.searchParams.get("cal");
        if (!cal) return json(req, { error: "bad_request" }, 400);
        const syncToken = u.searchParams.get("syncToken") || undefined;
        const r = await listEventsPage(f, token, cal, syncToken ? { syncToken } : { timeMin: u.searchParams.get("timeMin") ?? undefined, timeMax: u.searchParams.get("timeMax") ?? undefined });
        if ("gone" in r) return json(req, { items: [], gone: true }, 200, cookies);
        return json(req, { items: r.items.map(trimEvent), nextSyncToken: r.nextSyncToken, truncated: r.truncated || undefined }, 200, cookies);
      }
      if (method === "GET" && id) {
        const cal = new URL(req.url).searchParams.get("cal");
        if (!cal) return json(req, { error: "bad_request" }, 400);
        return json(req, { item: trimEvent(await getEvent(f, token, cal, id)) }, 200, cookies);
      }
      const body = (await req.json().catch(() => ({}))) as { cal?: string; etag?: string; body?: GEvent; notify?: string };
      if (!body.cal) return json(req, { error: "bad_request" }, 400);
      if (method === "POST" && !id && body.body) return json(req, { item: trimEvent(await insertEvent(f, token, body.cal, body.body)) }, 200, cookies);
      if (method === "PATCH" && id && body.body) return json(req, { item: trimEvent(await patchEvent(f, token, body.cal, id, body.body, body.etag, sendUpdatesOf(body.notify))) }, 200, cookies);
      if (method === "DELETE" && id) {
        await deleteEvent(f, token, body.cal, id, body.etag, sendUpdatesOf(body.notify));
        return json(req, { ok: true }, 200, cookies);
      }
    }
  } catch (e) {
    return googleError(req, e);
  }
  return json(req, { error: "not_found" }, 404);
}
