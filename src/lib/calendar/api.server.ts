/**
 * `/api/calendar/*` (Card 163). Tokens live here only: the refresh token sealed in Postgres,
 * access tokens in memory for their lifetime. Devices hold an opaque session secret.
 *
 * Web:     cookie `atrium_cal` (httpOnly, Secure, SameSite=Lax, path /api/calendar).
 * Desktop: system browser → /connect?handoff=<challenge> → OAuth → parked session;
 *          the app claims it with the verifier only it holds (POST /handoff) and sends
 *          `Authorization: Bearer <session>`.
 */
import { CALLBACK_PATH, EDIT_SCOPE, publicOrigin, readCalendarConfig, type CalendarConfig } from "./config.server.ts";
import { open as unseal, randomToken, seal, SealError } from "./crypto.server.ts";
import { deleteEvent, GoogleApiError, insertEvent, listCalendarList, listEventsPage, patchEvent, type GEvent } from "./google-api.server.ts";
import { authUrl, exchangeCode, OAuthError, refreshAccess, revoke, userInfo, type Fetch } from "./oauth.server.ts";
import { claimHandoff, createConnection, deleteConnection, findBySid, parkHandoff, updateConnection, type Connection, type Sql } from "./store.server.ts";
import type { CalendarMeta } from "./source.ts";

export type Deps = { env?: Record<string, string | undefined>; sql: () => Promise<Sql>; fetch?: Fetch; now?: () => number };

const SESSION_COOKIE = "atrium_cal";
const FLOW_COOKIE = "atrium_cal_flow";
const FLOW_TTL_MS = 10 * 60_000;
const TAURI_ORIGINS = new Set(["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost"]);

const accessCache = new Map<string, { token: string; exp: number; scopes?: string[] }>();
export const _resetAccessCache = () => accessCache.clear();

function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin");
  if (!o || !TAURI_ORIGINS.has(o)) return {};
  return { "access-control-allow-origin": o, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS", "access-control-max-age": "600", vary: "origin" };
}

const json = (req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors(req), ...extra } });

function page(title: string, text: string, status = 200, extra: Record<string, string> = {}) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><body style="font:16px system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;line-height:1.5"><h1 style="font-size:1.25rem">${esc(title)}</h1><p>${esc(text)}</p></body>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...extra } });
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
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAgeS}; HttpOnly; Secure; SameSite=Lax`;
}

function sessionOf(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim() || null;
  return cookie(req, SESSION_COOKIE);
}

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
  const keep = ["id", "etag", "status", "summary", "start", "end", "originalStartTime", "location", "recurrence", "recurringEventId", "hangoutLink", "attendees", "reminders", "colorId"];
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
  const redirectUri = publicOrigin(cfg, req) + CALLBACK_PATH;

  if (path === "/connect" && method === "GET") {
    const u = new URL(req.url);
    const handoff = u.searchParams.get("handoff") ?? "";
    if (handoff && !/^[A-Za-z0-9_-]{43}$/.test(handoff)) return page("Couldn't start Google sign-in", "The link from Atrium was not valid. Go back to Atrium and try again.", 400);
    const flow = { state: randomToken(16), verifier: randomToken(48), handoff: handoff || undefined, exp: now + FLOW_TTL_MS, sid: sessionOf(req) ?? undefined };
    const loginHint = u.searchParams.get("login_hint")?.slice(0, 200) || undefined;
    const location = authUrl({ clientId: cfg.clientId, redirectUri, state: flow.state, verifier: flow.verifier, loginHint });
    return new Response(null, { status: 302, headers: { location, "cache-control": "no-store", "set-cookie": setCookie(FLOW_COOKIE, seal(JSON.stringify(flow), cfg.key, "flow"), FLOW_TTL_MS / 1000) } });
  }

  if (path === "/oauth/callback" && method === "GET") {
    const u = new URL(req.url);
    const clear = { "set-cookie": setCookie(FLOW_COOKIE, "", 0) };
    let flow: { state: string; verifier: string; handoff?: string; exp: number; sid?: string } | null = null;
    try {
      const raw = cookie(req, FLOW_COOKIE);
      flow = raw ? JSON.parse(unseal(raw, cfg.key, "flow")) : null;
    } catch {
      flow = null;
    }
    if (u.searchParams.get("error")) return page("Google sign-in was cancelled", "Nothing changed. Go back to Atrium to try again.", 200, clear);
    if (!flow || flow.exp < now || flow.state !== u.searchParams.get("state")) return page("This sign-in link expired", "Go back to Atrium and choose Sign in with Google again.", 400, clear);
    try {
      const tokens = await exchangeCode(f, { clientId: cfg.clientId, clientSecret: cfg.clientSecret, code: u.searchParams.get("code") ?? "", redirectUri, verifier: flow.verifier });
      const scopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
      const me = await userInfo(f, tokens.access_token);
      const existing = await findBySid(sql, cfg.key, flow.sid).catch(() => null);
      let sid: string;
      if (existing) {
        await updateConnection(sql, cfg.key, existing.id, { refreshToken: tokens.refresh_token, scopes });
        accessCache.delete(existing.id);
        sid = flow.sid!;
      } else {
        if (!tokens.refresh_token) return page("Google didn't allow offline access", "Remove Atrium from your Google Account's third-party access, then sign in again.", 400, clear);
        sid = (await createConnection(sql, cfg.key, { email: me.email, sub: me.sub, scopes, refreshToken: tokens.refresh_token })).sid;
      }
      if (flow.handoff) {
        await parkHandoff(sql, cfg.key, flow.handoff, sid, now);
        return page("Signed in to Google", "You can close this window and go back to Atrium.", 200, clear);
      }
      const origin = publicOrigin(cfg, req);
      return new Response(null, { status: 302, headers: [["location", `${origin}/calendar?accounts=1`], ["cache-control", "no-store"], ["set-cookie", clear["set-cookie"]], ["set-cookie", setCookie(SESSION_COOKIE, sid, 400 * 86_400)]] });
    } catch {
      return page("Couldn't finish Google sign-in", "Nothing was saved. Go back to Atrium and try again.", 502, clear);
    }
  }

  if (path === "/handoff" && method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { verifier?: string };
    if (!body.verifier || body.verifier.length < 43 || body.verifier.length > 128) return json(req, { error: "bad_request" }, 400);
    const r = await claimHandoff(sql, cfg.key, body.verifier, now);
    if (r === "pending") return json(req, { state: "pending" }, 202);
    if (!r) return json(req, { error: "gone" }, 410);
    return json(req, { session: r.sid });
  }

  let conn: Connection | null;
  try {
    conn = await findBySid(sql, cfg.key, sessionOf(req));
  } catch (e) {
    if (path === "/status") return json(req, { state: "expired", email: null });
    return googleError(req, e);
  }

  if (path === "/status" && method === "GET") {
    if (!conn) return json(req, { state: "disconnected" });
    try {
      await accessFor(d, cfg, sql, conn);
    } catch (e) {
      if (e instanceof OAuthError && e.code === "invalid_grant") return json(req, { state: "expired", email: conn.email });
      return googleError(req, e);
    }
    const scopes = (await findBySid(sql, cfg.key, sessionOf(req)))?.scopes ?? conn.scopes;
    return json(req, { state: "connected", email: conn.email, canEdit: scopes.includes(EDIT_SCOPE) });
  }

  if (!conn) return json(req, { error: "disconnected" }, 401);

  if (path === "/disconnect" && method === "POST") {
    // `keepGrant`: a device replacing its own older session (re-consent) must not revoke the new grant.
    const body = (await req.json().catch(() => ({}))) as { keepGrant?: boolean };
    if (!body.keepGrant) await revoke(f, conn.refreshToken);
    await deleteConnection(sql, conn.id);
    accessCache.delete(conn.id);
    return json(req, { ok: true }, 200, { "set-cookie": setCookie(SESSION_COOKIE, "", 0) });
  }

  try {
    const token = await accessFor(d, cfg, sql, conn);
    if (path === "/calendars" && method === "GET") {
      const list = await listCalendarList(f, token);
      const calendars: CalendarMeta[] = list.map((c) => ({ id: c.id, name: (c.summaryOverride || c.summary || c.id).trim(), accessRole: (c.accessRole as CalendarMeta["accessRole"]) ?? "reader", primary: c.primary || undefined, googleColor: c.backgroundColor }));
      return json(req, { calendars, canEdit: conn.scopes.includes(EDIT_SCOPE) });
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
        if ("gone" in r) return json(req, { items: [], gone: true });
        return json(req, { items: r.items.map(trimEvent), nextSyncToken: r.nextSyncToken, truncated: r.truncated || undefined });
      }
      const body = (await req.json().catch(() => ({}))) as { cal?: string; etag?: string; body?: GEvent };
      if (!body.cal) return json(req, { error: "bad_request" }, 400);
      if (method === "POST" && !id && body.body) return json(req, { item: trimEvent(await insertEvent(f, token, body.cal, body.body)) });
      if (method === "PATCH" && id && body.body) return json(req, { item: trimEvent(await patchEvent(f, token, body.cal, id, body.body, body.etag)) });
      if (method === "DELETE" && id) {
        await deleteEvent(f, token, body.cal, id, body.etag);
        return json(req, { ok: true });
      }
    }
  } catch (e) {
    return googleError(req, e);
  }
  return json(req, { error: "not_found" }, 404);
}
