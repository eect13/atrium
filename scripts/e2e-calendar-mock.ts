/**
 * Card 177 (1): mock-origin end-to-end run of the Google Calendar connection. No network, no real
 * Google, no real secrets: a stateful fake Google (OAuth token/userinfo/authorize + Calendar incl.
 * events.move), the real server (`handleCalendar` on in-memory PGlite with migrations 0002–0004)
 * and the real client (`GoogleSource`). The Rust `cal_session_claim` step is mirrored: the reply goes
 * through `unwrapReply` and the refresh handle into a mock sealed store (the real DPAPI `.bin` path
 * is proven by `cargo test` in src-tauri on Windows — see docs/SETUP.md).
 *
 *   npm run e2e:calendar
 *
 * Prints each step and the claim reply with handles redacted. Exits 1 on the first failed check.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { _resetAccessCache, handleCalendar } from "../src/lib/calendar/api.server.ts";
import { pkceChallenge, randomToken } from "../src/lib/calendar/crypto.server.ts";
import type { Sql } from "../src/lib/calendar/store.server.ts";
import { GoogleSource, type ApiClient } from "../src/lib/calendar/google-source.ts";
import { unwrapReply } from "../src/lib/calendar/device-secret.ts";
import { CLAIM_COPY, claimFailKind } from "../src/lib/calendar/claim-errors.ts";
import { deleteBlock, resolveOwner, guestsToTell, moveBlock, seriesGuestQuestion, tellGuestsQuestion } from "../src/lib/calendar/move.ts";

const ORIGIN = "https://atrium.mock";
// Throwaway values for the in-process run only; nothing real.
const ENV = { GOOGLE_CLIENT_ID: "mock-client.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "mock-secret", CALENDAR_TOKEN_ENC_KEY: Buffer.alloc(32, 9).toString("base64"), DATABASE_URL: "postgres://mock", CALENDAR_PUBLIC_ORIGIN: ORIGIN };
const ME = "alex@example.com";
const TEAM = "team@group.calendar.google.com";

const step = (n: number, s: string) => console.log(`\n[${n}] ${s}`);
const ok = (s: string) => console.log(`    ok  ${s}`);
const redact = (v: unknown): unknown => {
  if (typeof v === "string" && v.length > 12) return `${v.slice(0, 4)}…[redacted ${v.length} chars]`;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x)]));
  return v;
};

// ---------- fake Google ----------
type GEv = Record<string, unknown> & { id: string; etag: string };
const store: Record<string, GEv[]> = {
  [ME]: [
    { id: "e1", etag: '"1"', summary: "Planning", start: { dateTime: "2026-10-14T01:00:00Z" }, end: { dateTime: "2026-10-14T02:00:00Z" }, organizer: { email: ME, self: true }, attendees: [{ email: ME, self: true }, { email: "sam@x.test" }, { email: "kim@x.test" }], hangoutLink: "https://meet.google.com/mock-abc" },
    { id: "s1", etag: '"1"', summary: "Standup", start: { dateTime: "2026-10-13T00:30:00Z" }, end: { dateTime: "2026-10-13T00:45:00Z" }, recurrence: ["RRULE:FREQ=DAILY"], organizer: { email: ME, self: true }, attendees: [{ email: ME, self: true }, { email: "sam@x.test" }] },
  ],
  [TEAM]: [],
};
const log: { method: string; url: string }[] = [];
let lastAuthorize: URL | null = null;
const googleFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  log.push({ method, url: url.toString() });
  const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url.href.startsWith("https://oauth2.googleapis.com/token")) {
    const p = new URLSearchParams(String(init?.body));
    if (p.get("grant_type") === "authorization_code") {
      assert.equal(p.get("code"), "mock-google-code", "server exchanges the code Google gave the callback");
      assert.ok(p.get("code_verifier"), "PKCE verifier sent to Google");
      return j({ access_token: "ya29.mock-access", expires_in: 3600, refresh_token: "1//mock-refresh", scope: "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly" });
    }
    return j({ access_token: "ya29.mock-access-2", expires_in: 3600 });
  }
  if (url.href.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("", { status: 200 });
  if (url.href.startsWith("https://openidconnect.googleapis.com/v1/userinfo")) return j({ sub: "42", email: ME });
  if (url.pathname.endsWith("/users/me/calendarList")) return j({ items: [{ id: ME, summary: "Alex", accessRole: "owner", primary: true }, { id: TEAM, summary: "Team", accessRole: "writer" }] });
  const m = /\/calendars\/([^/]+)\/events(?:\/([^/]+))?(\/move)?$/.exec(url.pathname);
  if (m) {
    const cal = decodeURIComponent(m[1]!);
    const id = m[2] ? decodeURIComponent(m[2]) : undefined;
    const list = (store[cal] ??= []);
    if (!id && method === "GET") return j({ items: list, nextSyncToken: `tok-${cal}` });
    const i = list.findIndex((e) => e.id === id);
    if (id && !m[3] && method === "GET") return i >= 0 ? j(list[i]) : j({ error: { message: "Not Found" } }, 404);
    if (m[3] && method === "POST") {
      const to = url.searchParams.get("destination")!;
      assert.equal(init?.body ?? null, null, "events.move has no body");
      const [ev] = list.splice(i, 1);
      const moved = { ...ev!, etag: '"9"', organizer: { email: to, self: true } };
      (store[to] ??= []).push(moved);
      return j(moved);
    }
    if (method === "PATCH") {
      const ev = { ...list[i]!, ...JSON.parse(String(init?.body)), etag: '"3"' };
      list[i] = ev;
      return j(ev);
    }
    if (method === "DELETE") {
      list.splice(i, 1);
      return new Response(null, { status: 204 });
    }
  }
  return j({ error: { message: "not mocked" } }, 404);
}) as typeof fetch;

// ---------- server ----------
const pg = new PGlite();
for (const f of ["0002_calendar_connections.sql", "0003_calendar_sessions.sql", "0004_calendar_claim_limit.sql"]) await pg.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8"));
const sql: Sql = { query: async (text, params) => (await pg.query(text, params as unknown[])).rows as never };
_resetAccessCache();
const deps = { env: ENV, sql: async () => sql, fetch: googleFetch };
const call = (req: Request) => handleCalendar(req, new URL(req.url).pathname.replace(/^\/api\/calendar\//, ""), deps);
const appHeaders = { origin: "http://tauri.localhost", "x-forwarded-for": "203.0.113.7", "content-type": "application/json" };

// ---------- Rust session store, mirrored (lib.rs keep_pair → cal_write) ----------
const sealedBin = new Map<string, Buffer>(); // path → "sealed" bytes; real one is DPAPI on Windows
const mockSeal = (s: string) => Buffer.from(s, "utf8").map((b) => b ^ 0x5a);

step(1, "App: handoff/start (PKCE challenge)");
const verifier = randomToken(32);
const st = await call(new Request(`${ORIGIN}/api/calendar/handoff/start`, { method: "POST", headers: appHeaders, body: JSON.stringify({ challenge: pkceChallenge(verifier) }) }));
assert.equal(st.status, 200);
const { hid } = (await st.json()) as { hid: string };
ok(`hid issued (${hid.length} chars)`);

step(2, "Browser: /connect?hid → Google consent (fake authorize)");
const con = await call(new Request(`${ORIGIN}/api/calendar/connect?hid=${hid}`));
assert.equal(con.status, 302);
lastAuthorize = new URL(con.headers.get("location")!);
assert.equal(lastAuthorize.origin + lastAuthorize.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
assert.equal(lastAuthorize.searchParams.get("redirect_uri"), `${ORIGIN}/api/calendar/oauth/callback`);
assert.equal(lastAuthorize.searchParams.get("code_challenge_method"), "S256");
ok(`authorize URL ok (scope: ${lastAuthorize.searchParams.get("scope")})`);
const flowCookie = con.headers.get("set-cookie")!.split(";")[0]!;

step(3, "Fake Google redirects back → callback page shows the sign-in code");
const cb = await call(new Request(`${ORIGIN}/api/calendar/oauth/callback?code=mock-google-code&state=${lastAuthorize.searchParams.get("state")}`, { headers: { cookie: flowCookie } }));
assert.equal(cb.status, 200);
const html = await cb.text();
const code = /(\w{3}-\w{3})/.exec(html.match(/letter-spacing[^>]*>([^<]+)</)?.[1] ?? "")?.[1];
assert.ok(code, "code shown");
assert.ok(!html.includes("1//mock-refresh") && !html.includes("ya29."), "no Google tokens on the page");
ok(`page shows a 6-character code (${code!.slice(0, 1)}**-***), no Google tokens`);

step(4, "App: wrong code first (L7 inline message), then the right one");
const claimReq = (c: string) => call(new Request(`${ORIGIN}/api/calendar/handoff/claim`, { method: "POST", headers: appHeaders, body: JSON.stringify({ hid, verifier, code: c }) }));
const wrong = code!.startsWith("Z") ? "Y" + code!.slice(1) : "Z" + code!.slice(1);
const bad = await claimReq(wrong);
const badReply = { status: bad.status, body: await bad.json() };
let kind = "none";
try { unwrapReply(badReply); } catch (e) { kind = claimFailKind(e); }
assert.equal(kind, "bad_code");
ok(`401 → "${CLAIM_COPY.bad_code}"`);
const res = await claimReq(code!.toLowerCase());
const reply = { status: res.status, body: (await res.json()) as { access: string; refresh: string; accessExp: number; refreshExp: number } };
console.log("    claim reply (as Rust receives it, handles redacted):");
console.log("    " + JSON.stringify(redact(reply)));
assert.equal(reply.status, 200);
// keep_pair: refresh → sealed .bin; JS only gets { access, accessExp }
sealedBin.set("calendar-session.bin", mockSeal(reply.body.refresh));
const access = unwrapReply({ status: reply.status, body: { access: reply.body.access, accessExp: reply.body.accessExp } });
assert.ok(!sealedBin.get("calendar-session.bin")!.toString("utf8").includes(reply.body.refresh), "bin is not plaintext");
ok(`refresh handle → calendar-session.bin (${sealedBin.get("calendar-session.bin")!.length} sealed bytes, mock seal); WebView gets access only`);
const again = await claimReq(code!);
let k2 = "none";
try { unwrapReply({ status: again.status, body: await again.json() }); } catch (e) { k2 = claimFailKind(e); }
assert.equal(k2, "used");
ok(`second claim 410 used → "${CLAIM_COPY.used}"`);

step(5, "Connected: status + calendars + events via the real client");
const client: ApiClient = { base: ORIGIN, native: true, session: access.access, fetch: ((u: string, init?: RequestInit) => call(new Request(u, { ...init, headers: { ...(init?.headers as Record<string, string>), origin: "http://tauri.localhost" } }))) as typeof fetch };
const status = await (await client.fetch!(`${ORIGIN}/api/calendar/status`, { headers: { authorization: `Bearer ${access.access}` } })).json();
assert.deepEqual(status, { state: "connected", email: ME, canEdit: true });
ok(`status ${JSON.stringify(status)}`);
const src = new GoogleSource(client);
const cals = await src.listCalendars();
ok(`calendars: ${cals.map((c) => `${c.id} (${c.accessRole})`).join(", ")}`);
const pulled = await src.listEvents(ME, { timeMin: "2026-10-01T00:00:00Z", timeMax: "2026-11-01T00:00:00Z" });
const e1 = pulled.events.find((e) => e.remoteId === "e1")!;
const s1 = pulled.events.find((e) => e.remoteId === "s1")!;
assert.equal(e1.organizerSelf, true);
ok(`pulled ${pulled.events.length} events; Planning: organiserSelf=${e1.organizerSelf}, guests=${e1.guestCount}`);

step(6, "Guest prompt + pre-sync block (client rules)");
assert.equal(deleteBlock(e1, null), "Finish syncing before deleting events that have guests.");
assert.equal(deleteBlock({ ...e1, organizerSelf: undefined }, "2026-10-13T00:00:00Z"), "Can't delete yet: Google hasn't confirmed who organizes this event.");
assert.equal(deleteBlock(e1, "2026-10-13T00:00:00Z"), null);
ok(`before first sync: Delete blocked; after: allowed`);
assert.equal(guestsToTell(e1), 2);
ok(`one-off: "${tellGuestsQuestion(guestsToTell(e1))}" → Send cancellation / Don't send`);
ok(`repeating (all): "${seriesGuestQuestion("all", guestsToTell(s1))}"`);

step(6.5, "Card 181: unknown organiser (old cache) → events.get → normal rules; missing event → stays blocked");
const unknownE1 = { ...e1, organizerSelf: undefined, guestCount: undefined };
assert.equal(deleteBlock(unknownE1, "2026-10-13T00:00:00Z"), "Can't delete yet: Google hasn't confirmed who organizes this event.");
const own = await resolveOwner(unknownE1, (cal, rid) => src.getEvent(cal, rid));
assert.deepEqual({ o: own?.organizerSelf, g: own?.guestCount }, { o: true, g: 2 });
assert.ok(log.some((l) => l.method === "GET" && /\/events\/e1$/.test(new URL(l.url).pathname)), "Google events.get called");
ok(`events.get → organiser you, 2 guests → "${tellGuestsQuestion(guestsToTell({ ...unknownE1, ...own! }))}"`);
assert.equal(await resolveOwner({ ...unknownE1, remoteId: "gone" }, (cal, rid) => src.getEvent(cal, rid)), null);
ok(`events.get fails (404) → stays unknown: "${deleteBlock(unknownE1, "2026-10-13T00:00:00Z")}"`);

step(7, "K2: move Planning to Team with events.move (id, guests, Meet kept; nobody emailed)");
assert.equal(moveBlock(e1, TEAM, [ME, TEAM]), null);
const moved = await src.moveEvent(ME, "e1", TEAM);
const mv = log.findLast((l) => l.url.includes("/move"))!;
assert.match(mv.url, /\/events\/e1\/move\?destination=team%40group\.calendar\.google\.com&sendUpdates=none$/);
assert.equal(moved.remoteId, "e1");
assert.equal(moved.guestCount, e1.guestCount);
assert.ok(store[TEAM]!.some((e) => e.id === "e1" && e.hangoutLink === "https://meet.google.com/mock-abc"));
ok(`${mv.method} ${new URL(mv.url).pathname}${new URL(mv.url).search} → same id e1, guests ${moved.guestCount}, Meet kept`);

step(8, "Repeating delete, 'this and following' with Send cancellation → PATCH sendUpdates=all");
await src.updateEvent(ME, "s1", { title: "Standup", start: s1.start, end: s1.end, repeat: "daily", repeatUntil: "2026-10-20" }, "all");
assert.match(log.findLast((l) => l.method === "PATCH")!.url, /sendUpdates=all$/);
ok(`PATCH …/events/s1?sendUpdates=all`);
await src.deleteEvent(TEAM, "e1", undefined, "all");
assert.match(log.findLast((l) => l.method === "DELETE")!.url, /\/events\/e1\?sendUpdates=all$/);
ok(`DELETE …/events/e1?sendUpdates=all`);

const leaked = JSON.stringify(log).includes("1//mock-refresh");
assert.ok(!leaked, "refresh token never in a request URL");
console.log("\nE2E calendar mock: all steps passed.");
