import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { _resetAccessCache, clientIp, handleCalendar } from "./api.server.ts";
import { CALENDAR_ENV, checkOrigin, readCalendarConfig } from "./config.server.ts";
import { open, parseSealKey, pkceChallenge, randomToken, seal, SealError, sha256 } from "./crypto.server.ts";
import { findConnection, newSession, normCode, sessionFor, upsertConnection, type Sql } from "./store.server.ts";

const KEY = Buffer.alloc(32, 7);
const KEY_B64 = KEY.toString("base64");

async function db(): Promise<Sql> {
  const pg = new PGlite();
  for (const m of ["0002_calendar_connections.sql", "0003_calendar_sessions.sql", "0004_calendar_claim_limit.sql"]) await pg.exec(readFileSync(new URL(`../../../migrations/${m}`, import.meta.url), "utf8"));
  return { query: async (text, params) => (await pg.query(text, params as unknown[])).rows as never };
}

test("seal/open: AES-256-GCM round trip; wrong key, tamper or other aad fail", () => {
  const s = seal("1//refresh-token", KEY, "conn:a");
  assert.match(s, /^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.ok(!s.includes("refresh"));
  assert.equal(open(s, KEY, "conn:a"), "1//refresh-token");
  assert.throws(() => open(s, Buffer.alloc(32, 8), "conn:a"), SealError);
  assert.throws(() => open(s, KEY, "conn:b"), SealError);
  const parts = s.split(".");
  parts[3] = (parts[3]![0] === "A" ? "B" : "A") + parts[3]!.slice(1);
  assert.throws(() => open(parts.join("."), KEY, "conn:a"), SealError);
  assert.notEqual(seal("x", KEY), seal("x", KEY), "fresh IV each time");
});

test("parseSealKey accepts 32 bytes as base64 / base64url / hex only", () => {
  assert.equal(parseSealKey(KEY_B64)?.length, 32);
  assert.equal(parseSealKey(KEY.toString("base64url"))?.length, 32);
  assert.equal(parseSealKey(KEY.toString("hex"))?.length, 32);
  assert.equal(parseSealKey("short"), null);
  assert.equal(parseSealKey(""), null);
  assert.equal(parseSealKey(undefined), null);
});

test("config: reports missing names, never values", () => {
  const none = readCalendarConfig({});
  assert.equal(none.ready, false);
  assert.deepEqual(none.missing, [...CALENDAR_ENV]);
  const bad = readCalendarConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s3cret-value", CALENDAR_TOKEN_ENC_KEY: "tooshort", DATABASE_URL: "postgres://x", CALENDAR_PUBLIC_ORIGIN: "https://a.test" });
  assert.equal(bad.ready, false);
  assert.ok(!JSON.stringify(bad).includes("s3cret-value"));
  assert.ok(!JSON.stringify(bad).includes("tooshort"));
  assert.match(bad.missing.join(), /CALENDAR_TOKEN_ENC_KEY/);
  const ok = readCalendarConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", CALENDAR_TOKEN_ENC_KEY: KEY_B64, DATABASE_URL: "postgres://x", CALENDAR_PUBLIC_ORIGIN: "https://a.test" });
  assert.equal(ok.ready, true);
});

test("store: handles and refresh token never stored in plain text", async () => {
  const sql = await db();
  const c = (await upsertConnection(sql, KEY, { email: "a@example.com", sub: "1", scopes: ["openid"], refreshToken: "1//rt-plain" }))!;
  const pair = await newSession(sql, c.id, 1_000);
  const raw = JSON.stringify([await sql.query("select * from calendar_connection"), await sql.query("select * from calendar_session")]);
  assert.ok(!raw.includes(pair.access) && !raw.includes(pair.refresh));
  assert.ok(!raw.includes("1//rt-plain"));
  assert.ok(raw.includes(sha256(pair.access)));
  assert.deepEqual(await sessionFor(sql, pair.access, 2_000), { connectionId: c.id, familyId: (await sql.query<{ family_id: string }>("select family_id from calendar_session"))[0]!.family_id });
  assert.equal((await findConnection(sql, KEY, c.id))?.refreshToken, "1//rt-plain");
  assert.equal(await sessionFor(sql, "wrong", 2_000), null);
  await assert.rejects(findConnection(sql, Buffer.alloc(32, 1), c.id), SealError);
  assert.equal((await upsertConnection(sql, KEY, { sub: "1", scopes: ["openid", "email"] }))?.id, c.id, "same Google account → same row");
});

test("normCode: case, dashes, O/I/L lookalikes", () => {
  assert.equal(normCode("k7q-4m2"), "K7Q4M2");
  assert.equal(normCode(" o1 l-i "), "0111");
});

const ENV = { GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "csecret", CALENDAR_TOKEN_ENC_KEY: KEY_B64, DATABASE_URL: "postgres://unused", CALENDAR_PUBLIC_ORIGIN: "https://a.test" };

test("not connected: unconfigured server says which settings are missing, nothing else", async () => {
  const res = await handleCalendar(new Request("https://a.test/api/calendar/status"), "status", { env: {}, sql: async () => assert.fail("no db without config") });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { state: "unconfigured", missing: [...CALENDAR_ENV] });
  const page = await handleCalendar(new Request("https://a.test/api/calendar/connect"), "connect", { env: {}, sql: async () => assert.fail() });
  assert.equal(page.status, 503);
  assert.match(await page.text(), /isn't set up/);
  const cal = await handleCalendar(new Request("https://a.test/api/calendar/calendars"), "calendars", { env: {}, sql: async () => assert.fail() });
  assert.equal(cal.status, 503);
});

test("configured, no session: status is disconnected; API calls are 401", async () => {
  const sql = await db();
  const d = { env: ENV, sql: async () => sql };
  assert.deepEqual(await (await handleCalendar(new Request("https://a.test/api/calendar/status"), "status", d)).json(), { state: "disconnected" });
  assert.equal((await handleCalendar(new Request("https://a.test/api/calendar/calendars"), "calendars", d)).status, 401);
});

type Call = { url: string; init?: RequestInit };
function google(calls: Call[], opts: { eventsStatus?: number; patchStatus?: number } = {}): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const j = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const p = new URLSearchParams(String(init?.body));
      if (p.get("grant_type") === "authorization_code") return j({ access_token: "at-1", expires_in: 3600, refresh_token: "1//rt", scope: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly" });
      return j({ access_token: "at-2", expires_in: 3600 });
    }
    if (url.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("", { status: 200 });
    if (url.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) return j({ sub: "42", email: "alex@example.com" });
    if (url.includes("/users/me/calendarList")) return j({ items: [{ id: "alex@example.com", summary: "Alex", accessRole: "owner", primary: true }, { id: "team@group.calendar.google.com", summary: "Team", accessRole: "reader" }] });
    if (url.includes("/events") && (init?.method ?? "GET") === "GET") {
      if (opts.eventsStatus) return j({ error: { errors: [{ reason: "fullSyncRequired" }] } }, opts.eventsStatus);
      return j({ items: [{ id: "e1", etag: '"1"', summary: "Standup", start: { dateTime: "2026-10-13T01:00:00Z" }, end: { dateTime: "2026-10-13T01:30:00Z" }, secretField: "dropped" }], nextSyncToken: "tok-2" });
    }
    if (url.includes("/events/e1") && init?.method === "PATCH") {
      if (opts.patchStatus) return j({ error: { errors: [{ reason: "conditionNotMet" }] } }, opts.patchStatus);
      return j({ id: "e1", etag: '"2"', summary: "Standup moved", start: { dateTime: "2026-10-13T02:00:00Z" }, end: { dateTime: "2026-10-13T02:30:00Z" } });
    }
    return j({ error: {} }, 404);
  }) as typeof fetch;
}

async function connectedSession(sql: Sql, calls: Call[], hid?: string, now?: () => number) {
  const d = { env: ENV, sql: async () => sql, fetch: google(calls), ...(now ? { now } : {}) };
  const start = await handleCalendar(new Request(`https://a.test/api/calendar/connect${hid ? `?hid=${hid}` : ""}`), "connect", d);
  assert.equal(start.status, 302);
  const loc = new URL(start.headers.get("location")!);
  assert.equal(loc.origin + loc.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(loc.searchParams.get("access_type"), "offline");
  assert.equal(loc.searchParams.get("prompt"), "consent");
  assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
  assert.equal(loc.searchParams.get("redirect_uri"), "https://a.test/api/calendar/oauth/callback");
  assert.match(loc.searchParams.get("scope")!, /calendar\.events/);
  const flowCookie = start.headers.get("set-cookie")!.split(";")[0]!;
  assert.match(start.headers.get("set-cookie")!, /HttpOnly; Secure; SameSite=Lax/);
  const state = loc.searchParams.get("state")!;
  const bad = await handleCalendar(new Request(`https://a.test/api/calendar/oauth/callback?code=c&state=forged`, { headers: { cookie: flowCookie } }), "oauth/callback", d);
  assert.equal(bad.status, 400, "state must match the sealed flow cookie");
  const cb = await handleCalendar(new Request(`https://a.test/api/calendar/oauth/callback?code=c&state=${state}`, { headers: { cookie: flowCookie } }), "oauth/callback", d);
  return { d, cb };
}

test("web flow: callback sets an httpOnly session cookie; calendars + events work; tokens never sent to the client", async () => {
  _resetAccessCache();
  const sql = await db();
  const calls: Call[] = [];
  const { d, cb } = await connectedSession(sql, calls);
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get("location"), "https://a.test/calendar?accounts=1");
  const set = cb.headers.getSetCookie();
  const sessionCookie = set.find((c) => c.startsWith("atrium_cal="))!;
  assert.match(sessionCookie, /HttpOnly; Secure/);
  const cookie = set.filter((c) => /^atrium_cal(_r)?=/.test(c)).map((c) => c.split(";")[0]).join("; ");
  const status = await (await handleCalendar(new Request("https://a.test/api/calendar/status", { headers: { cookie } }), "status", d)).json();
  assert.deepEqual(status, { state: "connected", email: "alex@example.com", canEdit: true });
  const cals = await (await handleCalendar(new Request("https://a.test/api/calendar/calendars", { headers: { cookie } }), "calendars", d)).text();
  assert.match(cals, /"accessRole":"reader"/);
  const ev = await handleCalendar(new Request("https://a.test/api/calendar/events?cal=alex%40example.com&timeMin=2026-01-01T00:00:00Z&timeMax=2027-01-01T00:00:00Z", { headers: { cookie } }), "events", d);
  const body = await ev.text();
  assert.match(body, /"nextSyncToken":"tok-2"/);
  assert.ok(!body.includes("secretField"), "only mapped fields leave the server");
  assert.ok(!(await cb.text()).includes("1//rt"));
  assert.ok(!cb.headers.getSetCookie().join().includes("1//rt"));
  assert.ok(!body.includes("1//rt") && !body.includes("at-1") && !body.includes("at-2"));
});

// ---------- Card 170: Card 167 acceptance tests ----------

type Clock = { t: number };
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://a.test/api/calendar/${path}`, { method: "POST", body: JSON.stringify(body), headers: { origin: "http://tauri.localhost", "x-forwarded-for": "203.0.113.7", ...headers } });

async function startDesktop(sql: Sql, calls: Call[], clock: Clock, ip = "203.0.113.7") {
  const d = { env: ENV, sql: async () => sql, fetch: google(calls), now: () => clock.t };
  const verifier = randomToken(32);
  const res = await handleCalendar(post("handoff/start", { challenge: pkceChallenge(verifier) }, { "x-forwarded-for": ip }), "handoff/start", d);
  return { d, verifier, res };
}

/** start → connect → Google → callback; returns the code the browser page shows. */
async function desktopConsent(sql: Sql, calls: Call[], clock: Clock) {
  const { d, verifier, res } = await startDesktop(sql, calls, clock);
  assert.equal(res.status, 200);
  const { hid } = (await res.json()) as { hid: string };
  const { cb } = await connectedSession(sql, calls, hid, () => clock.t);
  assert.equal(cb.status, 200);
  const html = await cb.text();
  const code = /(\w{3}-\w{3})/.exec(html.match(/letter-spacing[^>]*>([^<]+)</)?.[1] ?? "")?.[1];
  assert.ok(code, "callback page shows a 6-character code");
  return { d, hid, verifier, code: code!, html, cb };
}

const claim = (d: Parameters<typeof handleCalendar>[2], hid: string, verifier: string, code: string) => handleCalendar(post("handoff/claim", { hid, verifier, code }), "handoff/claim", d);

test("B2 T1: old ?handoff=, unknown hid and expired hid are refused at /connect", async () => {
  const sql = await db();
  const clock = { t: 1_000_000 };
  const d = { env: ENV, sql: async () => sql, now: () => clock.t };
  const old = await handleCalendar(new Request(`https://a.test/api/calendar/connect?handoff=${pkceChallenge(randomToken(32))}`), "connect", d);
  assert.equal(old.status, 400);
  assert.equal((await handleCalendar(new Request("https://a.test/api/calendar/connect?hid=unknownunknownunknown"), "connect", d)).status, 400);
  const { res } = await startDesktop(sql, [], clock);
  const { hid } = (await res.json()) as { hid: string };
  clock.t += 6 * 60_000;
  assert.equal((await handleCalendar(new Request(`https://a.test/api/calendar/connect?hid=${hid}`), "connect", d)).status, 400);
});

test("B2 T2 (Critic C2): attacker-started hand-off, victim consents → attacker's claim without the code fails; 5 tries burn the row", async () => {
  _resetAccessCache();
  const sql = await db();
  const clock = { t: 2_000_000 };
  const { d, hid, verifier } = await desktopConsent(sql, [], clock);
  for (let i = 0; i < 4; i++) assert.equal((await claim(d, hid, verifier, "000000")).status, 401);
  assert.equal((await claim(d, hid, verifier, "")).status, 401);
  const after = await sql.query<{ state: string; session_enc: string | null }>("select state, session_enc from calendar_handoff where hid = $1", [hid]);
  assert.equal(after[0]!.state, "burned");
  assert.equal(after[0]!.session_enc, null);
  assert.equal((await sql.query("select * from calendar_session")).length, 0, "no session ever issued");
});

test("B2 T3: happy path start → connect → callback code → claim 200 + session; second claim 410", async () => {
  _resetAccessCache();
  const sql = await db();
  const clock = { t: 3_000_000 };
  const { d, hid, verifier, code } = await desktopConsent(sql, [], clock);
  const ok = await claim(d, hid, verifier, code.toLowerCase());
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "http://tauri.localhost");
  const pair = (await ok.json()) as { access: string; refresh: string };
  assert.ok(pair.access.length >= 40 && pair.refresh.length >= 40);
  const st = await handleCalendar(new Request("https://a.test/api/calendar/status", { headers: { authorization: `Bearer ${pair.access}` } }), "status", d);
  assert.deepEqual(await st.json(), { state: "connected", email: "alex@example.com", canEdit: true });
  assert.equal((await claim(d, hid, verifier, code)).status, 410);
});

test("B2 T4: right code + wrong verifier → 401 and attempts+1; right verifier + wrong code → 401", async () => {
  const sql = await db();
  const clock = { t: 4_000_000 };
  const { d, hid, verifier, code } = await desktopConsent(sql, [], clock);
  assert.equal((await claim(d, hid, randomToken(32), code)).status, 401);
  assert.equal((await sql.query<{ attempts: number }>("select attempts from calendar_handoff where hid = $1", [hid]))[0]!.attempts, 1);
  const wrong = code.startsWith("Z") ? "Y" + code.slice(1) : "Z" + code.slice(1);
  assert.equal((await claim(d, hid, verifier, wrong)).status, 401);
  assert.equal((await claim(d, hid, verifier, code)).status, 200, "still claimable before the 5th failure");
});

test("B2 T5: claim 2 min 1 s after consent → 410", async () => {
  const sql = await db();
  const clock = { t: 5_000_000 };
  const { d, hid, verifier, code } = await desktopConsent(sql, [], clock);
  clock.t += 2 * 60_000 + 1_000;
  assert.equal((await claim(d, hid, verifier, code)).status, 410);
});

test("B2 T6: callback page holds only the code; DB stores only the code hash", async () => {
  const sql = await db();
  const clock = { t: 6_000_000 };
  const calls: Call[] = [];
  const { html, cb, verifier, code } = await desktopConsent(sql, calls, clock);
  assert.match(html, /Type this code into Atrium on the device you're connecting/);
  assert.match(html, /nothing is shared until the code is entered/);
  for (const secret of [verifier, "1//rt", "at-1"]) assert.ok(!html.includes(secret));
  assert.ok(!cb.headers.getSetCookie().some((c) => /^atrium_cal(_r)?=/.test(c)), "browser gets no session in hand-off mode");
  const rows = JSON.stringify(await sql.query("select * from calendar_handoff"));
  assert.ok(!rows.includes(code) && !rows.includes(code.replace("-", "")));
});

test("B2 T7: 11th start from one IP within 10 min → 429; another IP still works", async () => {
  const sql = await db();
  const clock = { t: 7_000_000 };
  for (let i = 0; i < 10; i++) assert.equal((await startDesktop(sql, [], clock)).res.status, 200);
  assert.equal((await startDesktop(sql, [], clock)).res.status, 429);
  assert.equal((await startDesktop(sql, [], clock, "198.51.100.2")).res.status, 200);
  clock.t += 10 * 60_000 + 1;
  assert.equal((await startDesktop(sql, [], clock)).res.status, 200);
});

test("B1 T2: preflight from each Tauri origin → 204 exact ACAO, no Allow-Credentials; evil origin → none", async () => {
  for (const origin of ["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost"]) {
    const r = await handleCalendar(new Request("https://a.test/api/calendar/status", { method: "OPTIONS", headers: { origin, "access-control-request-headers": "authorization" } }), "status", { env: ENV, sql: async () => assert.fail() });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get("access-control-allow-origin"), origin);
    assert.equal(r.headers.get("access-control-allow-credentials"), null);
    assert.match(r.headers.get("access-control-allow-headers")!, /authorization/);
  }
  const evil = await handleCalendar(new Request("https://a.test/api/calendar/status", { method: "OPTIONS", headers: { origin: "https://evil.example" } }), "status", { env: ENV, sql: async () => assert.fail() });
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
});

test("M1 T1: CALENDAR_PUBLIC_ORIGIN unset → not ready, listed missing, /connect 503 (no BETTER_AUTH_URL fallback)", async () => {
  const { CALENDAR_PUBLIC_ORIGIN: _o, ...rest } = ENV;
  const cfg = readCalendarConfig({ ...rest, BETTER_AUTH_URL: "https://a.test" });
  assert.equal(cfg.ready, false);
  assert.ok(cfg.missing.includes("CALENDAR_PUBLIC_ORIGIN"));
  const r = await handleCalendar(new Request("https://a.test/api/calendar/connect"), "connect", { env: { ...rest, BETTER_AUTH_URL: "https://a.test" }, sql: async () => assert.fail() });
  assert.equal(r.status, 503);
});

test("M1 T2 (Critic C1): X-Forwarded-Host can't move the redirect_uri", async () => {
  const sql = await db();
  const env = { ...ENV, CALENDAR_PUBLIC_ORIGIN: "https://atrium-swart-seven.vercel.app" };
  const r = await handleCalendar(new Request("https://a.test/api/calendar/connect", { headers: { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" } }), "connect", { env, sql: async () => sql });
  assert.equal(new URL(r.headers.get("location")!).searchParams.get("redirect_uri"), "https://atrium-swart-seven.vercel.app/api/calendar/oauth/callback");
});

test("M1 T3: http in production, a path, or not a URL → not ready with the reason", () => {
  for (const [v, prod] of [["http://x", true], ["https://x/path", false], ["notaurl", false], ["https://x?q=1", false]] as const) {
    const cfg = readCalendarConfig({ ...ENV, CALENDAR_PUBLIC_ORIGIN: v, NODE_ENV: prod ? "production" : "development" });
    assert.equal(cfg.ready, false, v);
    assert.match(cfg.missing.join(), /CALENDAR_PUBLIC_ORIGIN \(must be an https origin/);
    assert.ok(!cfg.missing.join().includes(v), "value never echoed");
  }
  assert.equal(checkOrigin("http://localhost:8080", false), "http://localhost:8080");
  assert.equal(checkOrigin("http://localhost:8080", true), null);
  assert.equal(checkOrigin("https://atrium-swart-seven.vercel.app/", true), "https://atrium-swart-seven.vercel.app");
});

async function desktopPair(sql: Sql, clock: Clock, calls: Call[] = []) {
  const { d, hid, verifier, code } = await desktopConsent(sql, calls, clock);
  const r = await claim(d, hid, verifier, code);
  return { d, pair: (await r.json()) as { access: string; refresh: string; accessExp: number; refreshExp: number } };
}
const bearerReq = (path: string, access: string, init: RequestInit = {}) => new Request(`https://a.test/api/calendar/${path}`, { ...init, headers: { authorization: `Bearer ${access}`, origin: "http://tauri.localhost" } });
const refresh = (d: Parameters<typeof handleCalendar>[2], token: string) => handleCalendar(post("session/refresh", { refresh: token }), "session/refresh", d);

test("M2 T1: access handle 61 min old → 401 session_expired; refresh → new pair; old access rejected", async () => {
  _resetAccessCache();
  const sql = await db();
  const clock = { t: 10_000_000 };
  const { d, pair } = await desktopPair(sql, clock);
  clock.t += 61 * 60_000;
  const exp = await handleCalendar(bearerReq("calendars", pair.access), "calendars", d);
  assert.equal(exp.status, 401);
  assert.deepEqual(await exp.json(), { error: "session_expired" });
  const r = await refresh(d, pair.refresh);
  assert.equal(r.status, 200);
  const next = (await r.json()) as { access: string };
  assert.notEqual(next.access, pair.access);
  assert.equal((await handleCalendar(bearerReq("calendars", next.access), "calendars", d)).status, 200);
  assert.equal((await handleCalendar(bearerReq("calendars", pair.access), "calendars", d)).status, 401);
});

test("M2 T2: reusing a rotated refresh handle (after 10 s grace) kills the whole family; other families live", async () => {
  _resetAccessCache();
  const sql = await db();
  const clock = { t: 20_000_000 };
  const a = await desktopPair(sql, clock);
  const b = await desktopPair(sql, clock);
  const r1 = (await (await refresh(a.d, a.pair.refresh)).json()) as { access: string; refresh: string };
  assert.equal((await refresh(a.d, a.pair.refresh)).status, 409, "within grace: retry, no revoke");
  clock.t += 11_000;
  assert.equal((await refresh(a.d, a.pair.refresh)).status, 401);
  assert.equal((await handleCalendar(bearerReq("calendars", r1.access), "calendars", a.d)).status, 401, "new access dead too");
  assert.equal((await refresh(a.d, r1.refresh)).status, 401, "new refresh dead too");
  assert.equal((await handleCalendar(bearerReq("calendars", b.pair.access), "calendars", b.d)).status, 200, "other device unaffected");
});

test("M2 T3: idle 14 d + 1 s → refresh fails; 90 d absolute → fails even when active", async () => {
  const sql = await db();
  const clock = { t: 30_000_000 };
  const { d, pair } = await desktopPair(sql, clock);
  clock.t += 14 * 86_400_000 + 1_000;
  assert.equal((await refresh(d, pair.refresh)).status, 401);
  const clock2 = { t: 40_000_000 };
  const s2 = await desktopPair(await db(), clock2);
  let cur = s2.pair.refresh;
  for (let day = 13; day < 90; day += 13) {
    clock2.t = 40_000_000 + day * 86_400_000;
    const r = await refresh(s2.d, cur);
    assert.equal(r.status, 200, `day ${day}`);
    cur = ((await r.json()) as { refresh: string }).refresh;
  }
  clock2.t = 40_000_000 + 90 * 86_400_000 + 1;
  assert.equal((await refresh(s2.d, cur)).status, 401);
});

test("M2 T4: sign out on this device kills only that family; Disconnect kills all and revokes Google once", async () => {
  _resetAccessCache();
  const sql = await db();
  const clock = { t: 50_000_000 };
  const calls: Call[] = [];
  const a = await desktopPair(sql, clock, calls);
  const b = await desktopPair(sql, clock, calls);
  assert.equal((await handleCalendar(bearerReq("signout", a.pair.access, { method: "POST" }), "signout", a.d)).status, 200);
  assert.deepEqual(await (await handleCalendar(bearerReq("status", a.pair.access), "status", a.d)).json(), { state: "disconnected" });
  assert.equal((await handleCalendar(bearerReq("calendars", b.pair.access), "calendars", b.d)).status, 200);
  assert.equal((await handleCalendar(bearerReq("disconnect", b.pair.access, { method: "POST" }), "disconnect", b.d)).status, 200);
  assert.equal(calls.filter((c) => c.url.startsWith("https://oauth2.googleapis.com/revoke")).length, 1);
  assert.equal((await sql.query("select * from calendar_session")).length, 0);
  assert.equal((await refresh(b.d, b.pair.refresh)).status, 401);
});

test("M2 T5: schema has no plaintext token columns; nothing token-shaped is logged", async () => {
  const sql = await db();
  const cols = await sql.query<{ table_name: string; column_name: string }>("select table_name, column_name from information_schema.columns where table_name like 'calendar_%'");
  for (const c of cols) assert.ok(/(_hash|_enc|^id$|_id$|_exp|_at$|^state$|^attempts$|^scopes$|^provider$|account_|^challenge$|^hid$)/.test(c.column_name), `${c.table_name}.${c.column_name}`);
  const logs: string[] = [];
  const orig = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = (...a: unknown[]) => void logs.push(a.join(" "));
  try {
    const clock = { t: 60_000_000 };
    const { d, pair } = await desktopPair(sql, clock);
    clock.t += 3_600_000 + 20_000;
    await refresh(d, pair.refresh);
    clock.t += 20_000;
    await refresh(d, pair.refresh);
  } finally {
    [console.log, console.warn, console.error] = orig;
  }
  assert.ok(logs.length >= 1, "reuse is logged");
  for (const l of logs) assert.ok(!/[A-Za-z0-9_-]{32,}/.test(l), l);
});

test("M2 T6 + web rotation: cookies Max-Age ≤ 14 d, HttpOnly + Secure; an expired access cookie rotates transparently", async () => {
  _resetAccessCache();
  const sql = await db();
  const calls: Call[] = [];
  const clock = { t: 70_000_000 };
  const { cb } = await connectedSession(sql, calls, undefined, () => clock.t);
  const set = cb.headers.getSetCookie().filter((c) => /^atrium_cal(_r)?=/.test(c));
  assert.equal(set.length, 2);
  for (const c of set) {
    assert.ok(Number(/Max-Age=(\d+)/.exec(c)![1]) <= 1_209_600, c);
    assert.match(c, /HttpOnly; Secure/);
  }
  const cookie = set.map((c) => c.split(";")[0]).join("; ");
  const d = { env: ENV, sql: async () => sql, fetch: google(calls), now: () => clock.t };
  clock.t += 2 * 3_600_000;
  const r = await handleCalendar(new Request("https://a.test/api/calendar/status", { headers: { cookie } }), "status", d);
  assert.equal(((await r.json()) as { state: string }).state, "connected");
  assert.equal(r.headers.getSetCookie().filter((c) => /^atrium_cal(_r)?=/.test(c)).length, 2, "rotated pair set");
});

test("desktop session: 410 → gone, 412 → conflict, If-Match sent", async () => {
  _resetAccessCache();
  const sql = await db();
  const calls: Call[] = [];
  const clock = { t: 80_000_000 };
  const { d, pair } = await desktopPair(sql, clock, calls);
  const auth = { authorization: `Bearer ${pair.access}` };
  const gone = await handleCalendar(new Request("https://a.test/api/calendar/events?cal=x&syncToken=old", { headers: auth }), "events", { ...d, fetch: google(calls, { eventsStatus: 410 }) });
  assert.deepEqual(await gone.json(), { items: [], gone: true });
  const patch = (status?: number) =>
    handleCalendar(new Request("https://a.test/api/calendar/events/e1", { method: "PATCH", headers: auth, body: JSON.stringify({ cal: "x", etag: '"1"', body: { summary: "Standup moved" } }) }), "events/e1", { ...d, fetch: google(calls, { patchStatus: status }) });
  assert.equal((await patch(412)).status, 409);
  assert.equal((await patch()).status, 200);
  const sent = calls.filter((c) => c.init?.method === "PATCH").at(-1)!;
  assert.equal((sent.init!.headers as Record<string, string>)["if-match"], '"1"');
});

// ---------- Card 174 ----------

test("K1 (Critic X3): 40 parallel wrong claims → at most 5 × 401, the rest 410; row burned; even the right code then 410", async () => {
  _resetAccessCache();
  const sql = await db();
  const clock = { t: 8_000_000 };
  const { d, hid, verifier, code } = await desktopConsent(sql, [], clock);
  const wrong = code.startsWith("Z") ? "Y" + code.slice(1) : "Z" + code.slice(1);
  const st = await Promise.all(Array.from({ length: 40 }, () => claim(d, hid, verifier, wrong).then((r) => r.status)));
  assert.ok(st.filter((s) => s === 401).length <= 5, `401s: ${st.filter((s) => s === 401).length}`);
  assert.equal(st.filter((s) => s !== 401 && s !== 410).length, 0);
  assert.equal((await sql.query<{ state: string }>("select state from calendar_handoff where hid = $1", [hid]))[0]!.state, "burned");
  assert.equal((await claim(d, hid, verifier, code)).status, 410);
  assert.equal((await sql.query("select * from calendar_session")).length, 0);
});

test("K1: claim endpoint rate-limits wrong codes per client IP (21st in 10 min → 429), other IPs unaffected", async () => {
  const sql = await db();
  const clock = { t: 9_000_000 };
  const d = { env: ENV, sql: async () => sql, now: () => clock.t };
  const v = randomToken(32);
  const bad = (ip: string) => handleCalendar(post("handoff/claim", { hid: "nohidnohidnohid", verifier: v, code: "AAAAAA" }, { "x-forwarded-for": ip }), "handoff/claim", d);
  // unknown hid is "gone", not a wrong code; use a real consented row per batch of 5.
  for (let i = 0; i < 4; i++) {
    const c = await desktopConsent(sql, [], clock);
    for (let j = 0; j < 5; j++) assert.equal((await claim(c.d, c.hid, c.verifier, "000000")).status, 401);
  }
  const c = await desktopConsent(sql, [], clock);
  assert.equal((await claim(c.d, c.hid, c.verifier, c.code)).status, 429, "limit applies even to the right code once tripped");
  assert.equal((await bad("198.51.100.9")).status, 410, "another IP is not limited");
  clock.t += 10 * 60_000 + 1;
  assert.equal((await claim(c.d, c.hid, c.verifier, c.code)).status, 410, "window over; that hand-off has expired by now");
});

test("L1 (Scout 172): client IP order — x-vercel-forwarded-for → x-real-ip → XFF only off Vercel", () => {
  const r = (h: Record<string, string>) => new Request("https://a.test/", { headers: h });
  assert.equal(clientIp(r({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }), true), "1.1.1.1");
  assert.equal(clientIp(r({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }), true), "2.2.2.2");
  assert.equal(clientIp(r({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" }), true), "unknown", "spoofable XFF ignored on Vercel");
  assert.equal(clientIp(r({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" }), false), "6.6.6.6");
});

test("L1: on Vercel, rotating client X-Forwarded-For doesn't change the start bucket", async () => {
  const sql = await db();
  const clock = { t: 10_000_000 };
  const old = process.env.VERCEL;
  process.env.VERCEL = "1";
  try {
    const d = { env: ENV, sql: async () => sql, now: () => clock.t };
    const st: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await handleCalendar(post("handoff/start", { challenge: pkceChallenge(randomToken(32)) }, { "x-forwarded-for": `10.0.0.${i}`, "x-vercel-forwarded-for": "203.0.113.50" }), "handoff/start", d);
      st.push(res.status);
    }
    assert.deepEqual(st.slice(0, 10), Array(10).fill(200));
    assert.equal(st[10], 429);
  } finally {
    if (old === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = old;
  }
});

test("K2 (Scout 172): POST /events/{id}/move → Google events.move with destination + explicit sendUpdates, no body; DELETE always sends sendUpdates", async () => {
  _resetAccessCache();
  const sql = await db();
  const clock = { t: 11_000_000 };
  const calls: Call[] = [];
  const { d, pair } = await desktopPair(sql, clock, calls);
  const base = d.fetch!;
  const d2 = {
    ...d,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/events/e1/move")) {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: "e1", etag: '"7"', summary: "Standup", start: { dateTime: "2026-10-13T01:00:00Z" }, end: { dateTime: "2026-10-13T01:30:00Z" }, organizer: { email: "team@x", self: true }, attendees: [{ email: "a@x" }], hangoutLink: "https://meet.google.com/abc" }), { status: 200 });
      }
      if (url.includes("/events/e1") && init?.method === "DELETE") {
        calls.push({ url, init });
        return new Response(null, { status: 204 });
      }
      return base(input, init);
    }) as typeof fetch,
  };
  const mv = await handleCalendar(bearerReq("events/e1/move", pair.access, { method: "POST", body: JSON.stringify({ cal: "alex@example.com", to: "team@x", notify: "bogus" }) }), "events/e1/move", d2);
  assert.equal(mv.status, 200);
  const item = ((await mv.json()) as { item: Record<string, unknown> }).item;
  assert.equal(item.id, "e1");
  assert.deepEqual(item.organizer, { email: "team@x", self: true }, "organizer kept for the move rules");
  assert.equal(item.hangoutLink, "https://meet.google.com/abc");
  const m = calls.find((c) => c.url.includes("/move"))!;
  assert.match(m.url, /\/calendars\/alex%40example\.com\/events\/e1\/move\?destination=team%40x&sendUpdates=none$/);
  assert.equal(m.init?.method, "POST");
  assert.equal(m.init?.body ?? null, null, "events.move takes no request body");
  assert.equal((await handleCalendar(bearerReq("events/e1/move", pair.access, { method: "POST", body: JSON.stringify({ cal: "a", to: "a" }) }), "events/e1/move", d2)).status, 400);
  for (const [notify, want] of [[undefined, "none"], ["all", "all"]] as const) {
    const del = await handleCalendar(bearerReq("events/e1", pair.access, { method: "DELETE", body: JSON.stringify({ cal: "alex@example.com", notify }) }), "events/e1", d2);
    assert.equal(del.status, 200);
    assert.match(calls.filter((c) => c.init?.method === "DELETE").at(-1)!.url, new RegExp(`/events/e1\\?sendUpdates=${want}$`));
  }
});

test("Card 177 L7: second claim → 410 {error:'used'}; late claim → 410 {error:'expired'}; bodies are fixed copy", async () => {
  _resetAccessCache();
  const sql = await db();
  const clock = { t: 12_000_000 };
  const a = await desktopConsent(sql, [], clock);
  assert.equal((await claim(a.d, a.hid, a.verifier, a.code)).status, 200);
  const used = await claim(a.d, a.hid, a.verifier, a.code);
  assert.equal(used.status, 410);
  assert.deepEqual(await used.json(), { error: "used", message: "This code has already been used. Start again to get a new one." });
  const b = await desktopConsent(sql, [], clock);
  clock.t += 2 * 60_000 + 1_000;
  const late = await claim(b.d, b.hid, b.verifier, b.code);
  assert.equal(late.status, 410);
  assert.deepEqual(await late.json(), { error: "expired", message: "This code has expired. Codes last 2 minutes." });
});

test("Card 177 (a): PATCH sends explicit sendUpdates (default none; 'all' when asked) for 'these dates are cancelled'", async () => {
  _resetAccessCache();
  const sql = await db();
  const clock = { t: 13_000_000 };
  const calls: Call[] = [];
  const { d, pair } = await desktopPair(sql, clock, calls);
  const base = d.fetch!;
  const d2 = {
    ...d,
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/events/e1") && init?.method === "PATCH") {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: "e1", etag: '"8"', summary: "S", start: { dateTime: "2026-10-13T01:00:00Z" }, end: { dateTime: "2026-10-13T01:30:00Z" } }), { status: 200 });
      }
      return base(input, init);
    }) as typeof fetch,
  };
  for (const [notify, want] of [[undefined, "none"], ["bogus", "none"], ["all", "all"]] as const) {
    const r = await handleCalendar(bearerReq("events/e1", pair.access, { method: "PATCH", body: JSON.stringify({ cal: "alex@example.com", body: { recurrence: ["RRULE:FREQ=DAILY;UNTIL=20261020"] }, notify }) }), "events/e1", d2);
    assert.equal(r.status, 200);
    assert.match(calls.filter((c) => c.init?.method === "PATCH").at(-1)!.url, new RegExp(`/events/e1\\?sendUpdates=${want}$`));
  }
});
