import assert from "node:assert/strict";
import { test } from "node:test";
import type { CalendarEvent } from "../types.ts";
import { toGoogleBody, fromGoogleList } from "./google-map.ts";
import { CalendarApiError, GoogleSource } from "./google-source.ts";
import { IcsSource, withoutSource, LEGACY_ICS } from "./ics-source.ts";
import { assertWritable, calendarColourOf, isWritableRole, ReadOnlyCalendarError, type CalendarSource, type ListEventsQuery } from "./source.ts";
import { applyFlush, applyPull, bannerFor, enqueue, flushPending, pullCalendar, type PendingOp } from "./sync.ts";

const ev = (id: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, title: id, start: "2026-10-13T01:00:00.000Z", end: "2026-10-13T02:00:00.000Z", cat: "work", loc: "", source: "google", calId: "c", ...over });

test("capabilities: Google writes, ICS is read-only and refuses writes", async () => {
  const g = new GoogleSource({ base: "" });
  assert.deepEqual(g.capabilities, { read: true, write: true, push: false });
  const ics = new IcsSource({ id: "s1", kind: "ical", name: "Gym" }, async () => [ev("x", { source: "local" })]);
  assert.equal(ics.capabilities.write, false);
  assert.throws(() => assertWritable(ics), ReadOnlyCalendarError);
  await assert.rejects(ics.createEvent(), ReadOnlyCalendarError);
  const r = await ics.listEvents();
  assert.equal(r.events[0]!.source, "ics");
  assert.equal(r.events[0]!.srcId, "s1");
  assert.ok(isWritableRole("owner") && isWritableRole("writer") && !isWritableRole("reader") && !isWritableRole("freeBusyReader"));
});

test("removing an ICS source drops only its events (legacy imports count as one source)", () => {
  const events = [ev("a", { source: "ics", srcId: "s1" }), ev("b", { source: "ics" }), ev("c", { source: "local" })];
  assert.deepEqual(withoutSource(events, "s1").map((e) => e.id), ["b", "c"]);
  assert.deepEqual(withoutSource(events, LEGACY_ICS).map((e) => e.id), ["a", "c"]);
});

test("GoogleSource sends Bearer on desktop and maps list results + deletions", async () => {
  const seen: { url: string; auth?: string; cred?: string }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    seen.push({ url, auth: (init?.headers as Record<string, string>).authorization, cred: init?.credentials });
    return new Response(JSON.stringify({ items: [{ id: "e1", etag: '"3"', summary: "A", start: { dateTime: "2026-10-13T01:00:00Z" }, end: { dateTime: "2026-10-13T02:00:00Z" } }, { id: "gone", status: "cancelled" }], nextSyncToken: "t2" }), { status: 200 });
  }) as typeof fetch;
  const src = new GoogleSource({ base: "https://atrium.example", native: true, session: "sess", fetch: f });
  const r = await src.listEvents("c@x", { syncToken: "t1" });
  assert.equal(seen[0]!.url, "https://atrium.example/api/calendar/events?cal=c%40x&syncToken=t1");
  assert.equal(seen[0]!.auth, "Bearer sess");
  assert.equal(seen[0]!.cred, "omit");
  assert.equal(r.events[0]!.id, "g-c@x-e1");
  assert.equal(r.events[0]!.remoteId, "e1");
  assert.equal(r.events[0]!.etag, '"3"');
  assert.deepEqual(r.deleted, ["g-c@x-gone"]);
  assert.equal(r.nextSyncToken, "t2");
});

function fakeSource(pages: Record<string, unknown>[], log: ListEventsQuery[]): CalendarSource {
  return {
    id: "g",
    kind: "google",
    capabilities: { read: true, write: true, push: false },
    listCalendars: async () => [],
    listEvents: async (_c, q) => {
      log.push(q);
      return pages.shift() as never;
    },
  };
}

test("sync token: incremental first; 410 (resync) falls back to a full window", async () => {
  const log: ListEventsQuery[] = [];
  const r = await pullCalendar(fakeSource([{ events: [], deleted: [], resync: true }, { events: [ev("n")], deleted: [], nextSyncToken: "fresh" }], log), "c", "old", new Date("2026-10-13T00:00:00Z"));
  assert.equal(log[0]!.syncToken, "old");
  assert.ok(log[1]!.timeMin && !log[1]!.syncToken);
  assert.equal(r.full, true);
  assert.equal(r.nextSyncToken, "fresh");
});

test("applyPull: full replaces the window, incremental upserts/deletes, local fields survive, pending edits win", () => {
  const base = [ev("g-c-1", { cat: "family", color: "var(--cat-mint)" }), ev("g-c-2"), ev("g-c-3"), ev("g-other-1", { calId: "other" }), ev("l", { source: "local", calId: undefined })];
  const inc = applyPull(base, "c", { full: false, events: [ev("g-c-1", { title: "Renamed", cat: "personal" })], deleted: ["g-c-2"] }, new Set(["g-c-3"]));
  const one = inc.find((e) => e.id === "g-c-1")!;
  assert.equal(one.title, "Renamed");
  assert.equal(one.cat, "family", "Atrium category stays local");
  assert.equal(one.color, "var(--cat-mint)");
  assert.ok(!inc.some((e) => e.id === "g-c-2"));
  assert.ok(inc.some((e) => e.id === "g-c-3"));
  const full = applyPull(base, "c", { full: true, window: { timeMin: "2026-01-01T00:00:00Z", timeMax: "2027-01-01T00:00:00Z" }, events: [ev("g-c-9")], deleted: [] });
  assert.deepEqual(full.map((e) => e.id).sort(), ["g-c-9", "g-other-1", "l"]);
});

const op = (kind: PendingOp["kind"], localId: string, extra: Partial<PendingOp> = {}): PendingOp => ({ id: `${kind}-${localId}`, kind, calId: "c", localId, at: "", write: kind === "delete" ? undefined : { title: kind, start: "", end: "", loc: "" }, ...extra });

test("queue: edits fold into a pending create; delete of an unsynced create cancels both", () => {
  let q = enqueue([], op("create", "t1"));
  q = enqueue(q, op("update", "t1"));
  assert.equal(q.length, 1);
  assert.equal(q[0]!.kind, "create");
  assert.equal(q[0]!.write!.title, "update");
  assert.deepEqual(enqueue(q, op("delete", "t1")), []);
  const u = enqueue([op("update", "g1", { remoteId: "r", etag: '"1"' })], op("delete", "g1"));
  assert.deepEqual([u[0]!.kind, u[0]!.remoteId, u[0]!.etag], ["delete", "r", '"1"']);
});

test("flush: stops offline and keeps the rest; conflicts are dropped, not overwritten; created ids swap in", async () => {
  const created = ev("g-c-new", { remoteId: "new", etag: '"1"' });
  const calls: string[] = [];
  const src: CalendarSource = {
    id: "g",
    kind: "google",
    capabilities: { read: true, write: true, push: false },
    listCalendars: async () => [],
    listEvents: async () => ({ events: [], deleted: [] }),
    createEvent: async () => (calls.push("create"), created),
    updateEvent: async (_c, id) => {
      calls.push(`update:${id}`);
      if (id === "stale") throw new CalendarApiError(409, "conflict");
      throw new TypeError("Failed to fetch");
    },
    deleteEvent: async () => void calls.push("delete"),
  };
  const r = await flushPending(src, [op("create", "tmp"), op("update", "x", { remoteId: "stale" }), op("update", "y", { remoteId: "r2" }), op("delete", "z", { remoteId: "r3" })]);
  assert.deepEqual(calls, ["create", "update:stale", "update:r2"]);
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual(r.left.map((o) => o.localId), ["y", "z"]);
  assert.equal(bannerFor(r.stopped, true), "offline");
  const events = applyFlush([ev("tmp", { cat: "health" })], r);
  assert.equal(events[0]!.id, "g-c-new");
  assert.equal(events[0]!.cat, "health");
  assert.equal(bannerFor({ code: "expired", status: 401 }, true), "expired");
  assert.equal(bannerFor({ code: "google", status: 502 }, true), "failed");
  assert.equal(bannerFor({ code: "google", status: 502 }, false), "offline");
});

test("toGoogleBody: all-day end is exclusive; rule + reminder carried; colour never sent", () => {
  const b = toGoogleBody({ title: "Trip", start: "2026-10-13T16:00:00.000Z", end: "2026-10-15T15:59:00.000Z", loc: "", allDay: true, repeat: "yearly", reminder: 30 });
  assert.deepEqual(b.start, { date: "2026-10-14", dateTime: null });
  assert.deepEqual(b.end, { date: "2026-10-16", dateTime: null });
  assert.deepEqual(b.recurrence, ["RRULE:FREQ=YEARLY"]);
  assert.deepEqual(b.reminders, { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] });
  assert.ok(!("colorId" in b));
  const back = fromGoogleList([{ id: "e", summary: "Trip", start: { date: "2026-10-14" }, end: { date: "2026-10-16" } }], "c").events[0]!;
  assert.equal(back.allDay, true);
  assert.equal(calendarColourOf("same-id"), calendarColourOf("same-id"));
  assert.equal(calendarColourOf("x", "mint"), "mint");
});

// ---------- Card 174 K2 ----------
import { guestsToTell, moveBlock, tellGuestsQuestion } from "./move.ts";

const gsrc = (calls: string[], over: Partial<CalendarSource> = {}): CalendarSource => ({
  id: "g",
  kind: "google",
  capabilities: { read: true, write: true, push: false },
  listCalendars: async () => [],
  listEvents: async () => ({ events: [], deleted: [] }),
  createEvent: async () => (calls.push("create"), ev("g-b-new")),
  updateEvent: async (_c, id) => (calls.push(`update:${id}`), ev("g-a-r1", { remoteId: "r1", calId: "a" })),
  deleteEvent: async (c, id, _e, notify) => void calls.push(`delete:${c}/${id}:${notify}`),
  moveEvent: async (c, id, to, notify) => (calls.push(`move:${c}/${id}->${to}:${notify}`), ev(`g-${to}-${id}`, { remoteId: id, calId: to, etag: '"5"' })),
  ...over,
});

test("K2: move uses events.move, keeps the id, swaps in Google's copy, never deletes", async () => {
  const calls: string[] = [];
  let q = enqueue([], op("update", "g-a-r1", { remoteId: "r1", calId: "a" }));
  q = enqueue(q, op("move", "g-a-r1", { remoteId: "r1", calId: "a", moveTo: "b", write: undefined }));
  assert.deepEqual(q.map((o) => o.kind), ["update", "move"], "a move is never folded into the edit");
  const r = await flushPending(gsrc(calls), q);
  assert.deepEqual(calls, ["update:r1", "move:a/r1->b:none"]);
  assert.ok(!calls.some((c) => c.startsWith("delete") || c === "create"));
  const out = applyFlush([ev("g-a-r1", { remoteId: "r1", calId: "a", cat: "work" })], r);
  assert.deepEqual([out[0]!.id, out[0]!.calId, out[0]!.remoteId, out[0]!.etag, out[0]!.cat], ["g-b-r1", "b", "r1", '"5"', "work"]);
});

test("K2: move refused by Google (403/404) → source event untouched, 0 deletes, queue goes on", async () => {
  for (const status of [403, 404]) {
    const calls: string[] = [];
    const src = gsrc(calls, { moveEvent: async () => { throw new CalendarApiError(status, status === 404 ? "not_found" : "forbidden"); } });
    const r = await flushPending(src, [op("move", "g-a-r1", { remoteId: "r1", calId: "a", moveTo: "b" }), op("delete", "x", { remoteId: "rx" })]);
    assert.equal(r.conflicts.length, 1);
    assert.equal(r.conflicts[0]!.kind, "move");
    assert.equal(r.stopped, undefined);
    assert.deepEqual(calls, ["delete:c/rx:none"], "only the unrelated delete ran");
    const out = applyFlush([ev("g-a-r1", { remoteId: "r1", calId: "a" })], r);
    assert.deepEqual([out[0]!.id, out[0]!.calId], ["g-a-r1", "a"]);
  }
});

test("K2: delete always says who is told (notify none by default, all when chosen)", async () => {
  const calls: string[] = [];
  await flushPending(gsrc(calls), [op("delete", "a", { remoteId: "r1" }), op("delete", "b", { remoteId: "r2", notify: "all" })]);
  assert.deepEqual(calls, ["delete:c/r1:none", "delete:c/r2:all"]);
});

test("K2: moveBlock — only whole default events you organize, into a writable calendar", () => {
  const g = (x: Partial<CalendarEvent> = {}) => ev("g-a-r1", { source: "google", calId: "a", remoteId: "r1", organizerSelf: true, ...x });
  assert.equal(moveBlock(g(), "b", ["a", "b"]), null);
  assert.match(moveBlock(g({ instanceOf: "r0" }), "b", ["b"])!, /whole series/);
  assert.match(moveBlock(g({ seriesId: "g-a-r0" }), "b", ["b"])!, /whole series/);
  assert.match(moveBlock(g({ eventType: "outOfOffice" }), "b", ["b"])!, /kind of Google event/);
  assert.match(moveBlock(g({ organizerSelf: false }), "b", ["b"])!, /you organize/);
  assert.match(moveBlock(g({ organizerSelf: undefined }), "b", ["b"])!, /Can't move yet: Google hasn't confirmed/, "Card 181: unknown is not not-yours");
  assert.match(moveBlock(g(), "team", ["a", "b"])!, /can't add events/);
  assert.equal(moveBlock(g({ organizerSelf: false }), "local", []), null, "to Atrium only is always allowed");
  assert.equal(guestsToTell(g({ guestCount: 3 })), 3);
  assert.equal(guestsToTell(g({ guestCount: 3, organizerSelf: false })), 0, "not your event → Google tells nobody on your behalf");
  assert.equal(guestsToTell(g()), 0);
  assert.equal(tellGuestsQuestion(1), "Delete and tell 1 guest?");
  assert.equal(tellGuestsQuestion(4), "Delete and tell 4 guests?");
});

test("K2: Google mapping keeps organizer/eventType/guest count and marks changed instances", () => {
  const [a, b] = fromGoogleList(
    [
      { id: "m", summary: "Planning", start: { dateTime: "2026-10-13T01:00:00Z" }, end: { dateTime: "2026-10-13T02:00:00Z" }, organizer: { self: true }, attendees: [{ email: "me@x", self: true }, { email: "a@x" }, { email: "room@x", resource: true }, { email: "b@x" }] },
      { id: "m_20261014T010000Z", recurringEventId: "m0", summary: "Changed", start: { dateTime: "2026-10-14T01:00:00Z" }, end: { dateTime: "2026-10-14T02:00:00Z" }, organizer: { email: "boss@x" }, eventType: "focusTime" },
    ],
    "c",
  ).events;
  assert.deepEqual([a!.organizerSelf, a!.guestCount, a!.eventType, a!.instanceOf], [true, 2, undefined, undefined]);
  assert.deepEqual([b!.organizerSelf, b!.eventType, b!.instanceOf], [false, "focusTime", "m0"]);
});

test("Card 179 N1 (+181): ownership backfill is one full pull per calendar; leftovers stay unknown (blocked), never not-yours", async () => {
  const { syncCalendar } = await import("./sync.ts");
  const { deleteBlock, moveBlock } = await import("./move.ts");
  const now = new Date("2026-10-13T00:00:00Z");
  // cached pre-174: one in the window (refilled), one far outside it (never refilled)
  const cached = [ev("g-c-in", { organizerSelf: undefined }), ev("g-c-old", { organizerSelf: undefined, start: "2020-01-01T01:00:00Z", end: "2020-01-01T02:00:00Z", guestCount: 2 } as never)];
  const log: ListEventsQuery[] = [];
  const src = fakeSource(
    [
      { events: [ev("g-c-in", { organizerSelf: true }), ev("g-c-noorg", { organizerSelf: undefined })], deleted: [], nextSyncToken: "t1" },
      { events: [], deleted: [], nextSyncToken: "t2" },
      { events: [ev("g-c-new", { organizerSelf: undefined })], deleted: [], nextSyncToken: "t3" },
    ],
    log,
  );
  const a = await syncCalendar(src, cached, "c", "t0", false, new Set(), now);
  assert.equal(a.full, true, "first sync: backfill full pull");
  assert.ok(log[0]!.timeMin && !log[0]!.syncToken);
  const b = await syncCalendar(src, a.events, "c", a.token, true, new Set(), now);
  assert.equal(b.full, false, "second sync: incremental");
  assert.equal(log[1]!.syncToken, "t1");
  const c = await syncCalendar(src, b.events, "c", b.token, true, new Set(), now);
  assert.equal(log[2]!.syncToken, "t2", "a new organiser-less event doesn't re-trigger a full pull");
  for (const id of ["g-c-old", "g-c-noorg", "g-c-new"]) {
    const e = c.events.find((x) => x.id === id)!;
    assert.equal(e.organizerSelf, undefined, `${id} stays unknown (Card 181), not "not yours"`);
    assert.equal(deleteBlock(e, "2026-10-13T00:00:00Z"), "Can't delete yet: Google hasn't confirmed who organizes this event.", `${id} delete blocked until Google is asked`);
    assert.equal(moveBlock(e, "other", ["c", "other"]), "Can't move yet: Google hasn't confirmed who organizes this event.");
    assert.equal(moveBlock(e, "local", ["c", "other"]), "Can't move yet: Google hasn't confirmed who organizes this event.", "leaving Google (delete there) blocked too");
  }
  assert.equal(c.events.find((x) => x.id === "g-c-in")!.organizerSelf, true);
});

test("Card 181: unknown organiser → events.get → normal rules; fetch fails → stays blocked; not-yours unchanged", async () => {
  const { resolveOwner, deleteBlock, guestsToTell, moveBlock, tellGuestsQuestion } = await import("./move.ts");
  const synced = "2026-10-13T00:00:00Z";
  const unknown = ev("g-c-old", { organizerSelf: undefined, remoteId: "old1", start: "2020-01-01T01:00:00Z", end: "2020-01-01T02:00:00Z" });
  const asked: string[] = [];
  // unknown → fetch says you organise it with 2 guests → prompt
  const p = await resolveOwner(unknown, async (cal, rid) => (asked.push(`${cal}/${rid}`), ev("x", { organizerSelf: true, guestCount: 2, etag: '"5"' })));
  assert.deepEqual(asked, ["c/old1"], "asks Google for that one event by its Google id");
  assert.deepEqual(p, { organizerSelf: true, guestCount: 2, etag: '"5"' });
  const known = { ...unknown, ...p! };
  assert.equal(deleteBlock(known, synced), null);
  assert.equal(guestsToTell(known), 2);
  assert.equal(tellGuestsQuestion(guestsToTell(known)), "Delete and tell 2 guests?");
  assert.equal(moveBlock(known, "other", ["c", "other"]), null, "organiser → move allowed");
  // fetch says someone else organises it → normal not-yours rules
  const theirs = { ...unknown, ...(await resolveOwner(unknown, async () => ev("x", { organizerSelf: false, guestCount: 3 })))! };
  assert.equal(deleteBlock(theirs, synced), null);
  assert.equal(guestsToTell(theirs), 0);
  // fetch fails / no organiser in the answer → null → stays unknown and blocked
  assert.equal(await resolveOwner(unknown, async () => { throw new Error("offline"); }), null);
  assert.equal(await resolveOwner(unknown, async () => ev("x", { organizerSelf: undefined })), null);
  assert.equal(deleteBlock(unknown, synced), "Can't delete yet: Google hasn't confirmed who organizes this event.");
  assert.equal(moveBlock(unknown, "local", ["c"]), "Can't move yet: Google hasn't confirmed who organizes this event.");
  // not-yours (false) unchanged: no fetch, no block, no prompt, move blocked with the not-yours reason
  const notYours = ev("n", { organizerSelf: false, guestCount: 2 });
  let fetched = false;
  assert.equal(await resolveOwner(notYours, async () => ((fetched = true), notYours)), null);
  assert.equal(fetched, false);
  assert.equal(deleteBlock(notYours, synced), null);
  assert.equal(guestsToTell(notYours), 0);
  assert.equal(moveBlock(notYours, "other", ["c", "other"]), "Only events you organize can move to another calendar.");
  assert.equal(moveBlock(notYours, "local", ["c"]), null, "not-yours can still be copied to Atrium (existing rule)");
});
