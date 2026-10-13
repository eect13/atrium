import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { _resetAccessCache, handleCalendar } from "./api.server.ts";
import { CALENDAR_ENV, readCalendarConfig } from "./config.server.ts";
import { open, parseSealKey, pkceChallenge, randomToken, seal, SealError, sha256 } from "./crypto.server.ts";
import { claimHandoff, createConnection, findBySid, parkHandoff, type Sql } from "./store.server.ts";

const KEY = Buffer.alloc(32, 7);
const KEY_B64 = KEY.toString("base64");

async function db(): Promise<Sql> {
  const pg = new PGlite();
  await pg.exec(readFileSync(new URL("../../../migrations/0002_calendar_connections.sql", import.meta.url), "utf8"));
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
  const bad = readCalendarConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s3cret-value", CALENDAR_TOKEN_ENC_KEY: "tooshort", DATABASE_URL: "postgres://x" });
  assert.equal(bad.ready, false);
  assert.ok(!JSON.stringify(bad).includes("s3cret-value"));
  assert.ok(!JSON.stringify(bad).includes("tooshort"));
  assert.match(bad.missing.join(), /CALENDAR_TOKEN_ENC_KEY/);
  const ok = readCalendarConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s", CALENDAR_TOKEN_ENC_KEY: KEY_B64, DATABASE_URL: "postgres://x" });
  assert.equal(ok.ready, true);
});

test("store: session secret and refresh token never stored in plain text", async () => {
  const sql = await db();
  const { id, sid } = await createConnection(sql, KEY, { email: "a@example.com", sub: "1", scopes: ["openid"], refreshToken: "1//rt-plain" });
  const raw = JSON.stringify(await sql.query("select * from calendar_connection"));
  assert.ok(!raw.includes(sid));
  assert.ok(!raw.includes("1//rt-plain"));
  assert.ok(raw.includes(sha256(sid)));
  const found = await findBySid(sql, KEY, sid);
  assert.equal(found?.id, id);
  assert.equal(found?.refreshToken, "1//rt-plain");
  assert.equal(await findBySid(sql, KEY, "wrong"), null);
  await assert.rejects(findBySid(sql, Buffer.alloc(32, 1), sid), SealError);
});

test("hand-off: claimed once with the verifier, pending before, gone after expiry", async () => {
  const sql = await db();
  const verifier = randomToken(32);
  const challenge = pkceChallenge(verifier);
  assert.equal(await claimHandoff(sql, KEY, verifier), "pending");
  await parkHandoff(sql, KEY, challenge, "sid-123", 1_000);
  assert.equal(await claimHandoff(sql, KEY, randomToken(32), 2_000), "pending", "another verifier learns nothing");
  assert.deepEqual(await claimHandoff(sql, KEY, verifier, 2_000), { sid: "sid-123" });
  assert.equal(await claimHandoff(sql, KEY, verifier, 3_000), null, "second claim fails");
  const v2 = randomToken(32);
  await parkHandoff(sql, KEY, pkceChallenge(v2), "sid-9", 0);
  assert.equal(await claimHandoff(sql, KEY, v2, 11 * 60_000), null, "expired");
});

const ENV = { GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "csecret", CALENDAR_TOKEN_ENC_KEY: KEY_B64, DATABASE_URL: "postgres://unused" };

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

async function connectedSession(sql: Sql, calls: Call[], handoff?: string) {
  const d = { env: ENV, sql: async () => sql, fetch: google(calls) };
  const start = await handleCalendar(new Request(`https://a.test/api/calendar/connect${handoff ? `?handoff=${handoff}` : ""}`), "connect", d);
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
  const sessionCookie = cb.headers.getSetCookie().find((c) => c.startsWith("atrium_cal="))!;
  assert.match(sessionCookie, /HttpOnly/);
  const cookie = sessionCookie.split(";")[0]!;
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

test("desktop hand-off flow + CORS, 410 → gone, 412 → conflict, disconnect revokes", async () => {
  _resetAccessCache();
  const sql = await db();
  const calls: Call[] = [];
  const verifier = randomToken(32);
  const { d, cb } = await connectedSession(sql, calls, pkceChallenge(verifier));
  assert.equal(cb.status, 200);
  assert.match(await cb.text(), /close this window/);
  assert.ok(!cb.headers.getSetCookie().some((c) => c.startsWith("atrium_cal=")), "browser gets no session in hand-off mode");
  const claim = await handleCalendar(new Request("https://a.test/api/calendar/handoff", { method: "POST", body: JSON.stringify({ verifier }), headers: { origin: "http://tauri.localhost" } }), "handoff", d);
  assert.equal(claim.headers.get("access-control-allow-origin"), "http://tauri.localhost");
  const { session } = (await claim.json()) as { session: string };
  assert.ok(session.length >= 40);
  const auth = { authorization: `Bearer ${session}` };
  const gone = await handleCalendar(new Request("https://a.test/api/calendar/events?cal=x&syncToken=old", { headers: auth }), "events", { ...d, fetch: google(calls, { eventsStatus: 410 }) });
  assert.deepEqual(await gone.json(), { items: [], gone: true });
  const patch = (status?: number) =>
    handleCalendar(new Request("https://a.test/api/calendar/events/e1", { method: "PATCH", headers: auth, body: JSON.stringify({ cal: "x", etag: '"1"', body: { summary: "Standup moved" } }) }), "events/e1", { ...d, fetch: google(calls, { patchStatus: status }) });
  assert.equal((await patch(412)).status, 409);
  const ok = await patch();
  assert.equal(ok.status, 200);
  const sent = calls.filter((c) => c.init?.method === "PATCH").at(-1)!;
  assert.equal((sent.init!.headers as Record<string, string>)["if-match"], '"1"');
  const evil = await handleCalendar(new Request("https://a.test/api/calendar/status", { headers: { origin: "https://evil.example" } }), "status", d);
  assert.equal(evil.headers.get("access-control-allow-origin"), null);
  const off = await handleCalendar(new Request("https://a.test/api/calendar/disconnect", { method: "POST", headers: auth }), "disconnect", d);
  assert.equal(off.status, 200);
  assert.ok(calls.some((c) => c.url.startsWith("https://oauth2.googleapis.com/revoke")));
  assert.equal((await sql.query("select * from calendar_connection")).length, 0);
});
