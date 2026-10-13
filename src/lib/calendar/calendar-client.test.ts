import assert from "node:assert/strict";
import { test } from "node:test";
import { api, CalendarApiError, fetchStatus, requestInit } from "./google-source.ts";
import { maskIcsUrl } from "./ics-source.ts";
import { bannerFor } from "./sync.ts";
import { scrubCalendarAccounts } from "../profile-desk.ts";

test("B1 T1: Tauri builds send credentials 'omit' + Bearer; web sends 'same-origin' and no Authorization; never 'include'", () => {
  const nat = requestInit({ native: true, session: "acc-1" });
  assert.equal(nat.credentials, "omit");
  assert.equal((nat.headers as Record<string, string>).authorization, "Bearer acc-1");
  const web = requestInit({ session: "ignored" });
  assert.equal(web.credentials, "same-origin");
  assert.equal((web.headers as Record<string, string>).authorization, undefined);
  assert.equal(requestInit({ native: true }).credentials, "omit");
});

test("api(): 401 session_expired renews once and retries with the new access handle", async () => {
  const seen: string[] = [];
  const f = (async (_u: string, init: RequestInit) => {
    const auth = (init.headers as Record<string, string>).authorization ?? "";
    seen.push(auth);
    if (auth === "Bearer old") return new Response(JSON.stringify({ error: "session_expired" }), { status: 401 });
    return new Response(JSON.stringify({ ok: 1 }), { status: 200 });
  }) as unknown as typeof fetch;
  let renewed = 0;
  const r = await api<{ ok: number }>({ base: "https://x", native: true, session: "old", fetch: f, renew: async () => (renewed++, "new") }, "/calendars");
  assert.deepEqual(r, { ok: 1 });
  assert.deepEqual(seen, ["Bearer old", "Bearer new"]);
  assert.equal(renewed, 1);
  const dead = (async () => new Response(JSON.stringify({ error: "session_expired" }), { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(api({ base: "", native: true, session: "a", fetch: dead, renew: async () => null }, "/x"), CalendarApiError);
});

test("fetchStatus: a 401 disconnected/session_expired reads as disconnected (B3 path), network failure as unreachable", async () => {
  const f401 = (async () => new Response(JSON.stringify({ error: "disconnected" }), { status: 401 })) as unknown as typeof fetch;
  assert.deepEqual(await fetchStatus({ base: "", fetch: f401 }), { state: "disconnected" });
  const down = (async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  assert.equal((await fetchStatus({ base: "", fetch: down })).state, "unreachable");
});

test("bannerFor: a 401 disconnected while syncing shows the disconnected banner, not 'expired'", () => {
  assert.equal(bannerFor({ code: "disconnected", status: 401 }, true), "disconnected");
  assert.equal(bannerFor({ code: "expired", status: 401 }, true), "expired");
});

test("maskIcsUrl: Google secret address masked like Card 168; queries masked; junk fully masked", () => {
  const g = "https://calendar.google.com/calendar/ical/alex%40example.com/private-0123456789abcdef0123456789abcdef/basic.ics";
  assert.equal(maskIcsUrl(g), "calendar.google.com/calendar/ical/••••••••/basic.ics");
  assert.ok(!maskIcsUrl(g).includes("private") && !maskIcsUrl(g).includes("alex"));
  assert.equal(maskIcsUrl("webcal://p01-caldav.icloud.com/published/2/MTIzNDU2Nzg5MDEyMzQ1Njc4OTA"), "p01-caldav.icloud.com/published/••••••••");
  assert.equal(maskIcsUrl("https://example.com/cal.ics?token=abc123"), "example.com/cal.ics?••••••••");
  assert.equal(maskIcsUrl("not a url"), "••••••••");
});

test("profile backup never carries a secret iCal address or the v1 session", () => {
  const raw = JSON.stringify({ state: { session: "sid-1", email: "a@x", icsSources: [{ id: "ics-1", kind: "ical", name: "calendar.google.com", url: "https://calendar.google.com/calendar/ical/x/private-y/basic.ics" }] }, version: 2 });
  const out = scrubCalendarAccounts(raw);
  assert.ok(!out.includes("private-y") && !out.includes("sid-1"));
  assert.match(out, /"name":"calendar.google.com"/);
  assert.equal(scrubCalendarAccounts("{bad"), "{}");
});

// ---------- Card 174 M-a ----------
import { unwrapReply } from "./device-secret.ts";
import { CalendarApiError as ApiErr } from "./google-source.ts";

test("M-a: device replies give JS only the access handle; errors keep status + server message", () => {
  assert.deepEqual(unwrapReply({ status: 200, body: { access: "acc", accessExp: 5 } }), { access: "acc", accessExp: 5 });
  assert.ok(!("refresh" in unwrapReply({ status: 200, body: { access: "acc", accessExp: 5, refresh: "r" } as never })), "unwrap copies only access + accessExp");
  assert.throws(() => unwrapReply({ status: 401, body: { error: "bad_code", message: "That code doesn't match." } }), (e: unknown) => e instanceof ApiErr && e.status === 401 && e.code === "bad_code" && e.message === "That code doesn't match.");
  assert.throws(() => unwrapReply({ status: 429, body: { error: "rate_limited", message: "Too many wrong codes." } }), (e: unknown) => e instanceof ApiErr && e.status === 429);
  assert.throws(() => unwrapReply({ status: 0, body: null }), (e: unknown) => e instanceof ApiErr && e.code === "offline");
});

test("M-a: device-secret exposes no way to read the refresh handle back", async () => {
  const mod = await import("./device-secret.ts");
  assert.deepEqual(Object.keys(mod).sort(), ["adoptLegacy", "claimOnDevice", "clearRefresh", "refreshOnDevice", "unwrapReply"]);
});
