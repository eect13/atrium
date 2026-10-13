import assert from "node:assert/strict";
import { test } from "node:test";
import { QUOTE_TTL_MS, isFresh, loadView, quoteCacheKey, readEntry, writeEntry, type KV } from "./quote-cache.ts";
import { LOCAL_QUOTES, QUOTE_PAGE, dailyQuoteTopic, loadDeskQuotes, quoteNoteReason } from "./quotes.ts";

function memKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}
const row = (text: string, author = "A") => ({ text, author, href: "https://en.wikiquote.org/wiki/A", source: "wikiquote" });
const DAY = 24 * 60 * 60_000;

test("cache key: one entry per kind + normalized key", () => {
  assert.equal(quoteCacheKey("author", "  Séneca the Younger "), "atrium.quotes.v1:author:seneca-the-younger");
  assert.equal(quoteCacheKey("topic", "wisdom"), "atrium.quotes.v1:topic:wisdom");
  assert.equal(quoteCacheKey("daily", "2026-10-06"), "atrium.quotes.v1:daily:2026-10-06");
});

test("writeEntry refuses an empty result; readEntry survives a new session (same storage)", () => {
  const kv = memKV();
  assert.equal(writeEntry(kv, "k", { quotes: [], fetchedAt: 1 }), false);
  assert.equal(writeEntry(kv, "k", { quotes: [row("Kept line is long enough.")], fetchedAt: 1 }), true);
  assert.equal(readEntry(kv, "k")?.quotes.length, 1);
  kv.data.set("bad", "{not json");
  assert.equal(readEntry(kv, "bad"), null);
});

test("TTL is 7 days", () => {
  const e = { quotes: [row("Fresh line is long enough.")], fetchedAt: 0 };
  assert.equal(QUOTE_TTL_MS, 7 * DAY);
  assert.equal(isFresh(e, 7 * DAY - 1), true);
  assert.equal(isFresh(e, 7 * DAY), false);
});

test("fresh cache → no network; past TTL → refetch", async () => {
  const kv = memKV();
  let t = 0;
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { quotes: [row(`Fetch number ${calls} is long enough.`)] };
  };
  assert.equal((await loadView("k", fetcher, { kv, now: () => t })).from, "live");
  t = 6 * DAY;
  const cached = await loadView("k", fetcher, { kv, now: () => t });
  assert.equal(cached.from, "cache");
  assert.equal(calls, 1);
  t = 8 * DAY;
  assert.equal((await loadView("k", fetcher, { kv, now: () => t })).from, "live");
  assert.equal(calls, 2);
});

test("an empty or failed fetch never replaces good cached data", async () => {
  const kv = memKV();
  await loadView("k", async () => ({ quotes: [row("Good cached line is long enough.")] }), { kv, now: () => 0 });
  const empty = await loadView("k", async () => ({ quotes: [] as ReturnType<typeof row>[] }), { kv, now: () => 0, force: true });
  assert.equal(empty.from, "stale");
  assert.equal(empty.quotes[0]?.text, "Good cached line is long enough.");
  const failed = await loadView("k", async (): Promise<{ quotes: ReturnType<typeof row>[] }> => {
    throw new Error("offline");
  }, { kv, now: () => 0, force: true });
  assert.equal(failed.from, "stale");
  assert.equal(readEntry(kv, "k")?.quotes[0]?.text, "Good cached line is long enough.");
});

test("Refresh (force) rechecks only the current key", async () => {
  const kv = memKV();
  await loadView("a", async () => ({ quotes: [row("Line for key a is long enough.")] }), { kv, now: () => 0 });
  await loadView("b", async () => ({ quotes: [row("Line for key b is long enough.")] }), { kv, now: () => 0 });
  const seen: string[] = [];
  await loadView("a", async () => (seen.push("a"), { quotes: [row("New line for key a, long enough.")] }), { kv, now: () => 1, force: true });
  assert.deepEqual(seen, ["a"]);
  assert.equal(readEntry(kv, "b")?.quotes[0]?.text, "Line for key b is long enough.");
  assert.equal(readEntry(kv, "a")?.quotes[0]?.text, "New line for key a, long enough.");
});

/** End to end with a mocked Wikiquote fetcher (no network). */
function deskDeps(answers: Record<string, string[]>, kv = memKV()) {
  const asked: string[] = [];
  return {
    asked,
    kv,
    deps: {
      kv,
      today: "2026-10-06",
      now: () => 0,
      fetcher: async (kind: string, key: string) => {
        asked.push(`${kind}:${key}`);
        const lines = answers[`${kind}:${key}`];
        if (!lines) throw new Error("offline");
        return { quotes: lines.map((t) => ({ text: t, author: key, href: `https://en.wikiquote.org/wiki/${key}`, source: "wikiquote" as const })), title: key };
      },
    },
  };
}

test("desk: All = today's Wikiquote quote first, then the built-ins; attribution page set", async () => {
  const d = deskDeps({ "daily:2026-10-06": ["There rolls the deep where grew the tree."] });
  const r = await loadDeskQuotes({ mode: "popular", limit: 50 }, d.deps);
  // Card 147 (Eric via Form 149): All also reads today's rotating topic; here it fails → built-ins only.
  assert.deepEqual(d.asked, ["daily:2026-10-06", `topic:${dailyQuoteTopic("2026-10-06")}`]);
  assert.equal(r.quotes[0]?.source, "wikiquote");
  assert.equal(r.quotes.length, 43);
  assert.equal(r.from, "wikiquote");
  assert.equal(r.page?.title, "2026-10-06");
});

test("desk: topic chip reads its theme page; author and search read the author view", async () => {
  const d = deskDeps({
    "topic:wisdom": ["Wisdom requires the long view, always."],
    "author:Seneca": ["We suffer more in imagination than in reality, friend."],
  });
  const t = await loadDeskQuotes({ mode: "popular", topic: "wisdom" }, d.deps);
  assert.equal(t.quotes[0]?.text, "Wisdom requires the long view, always.");
  const a = await loadDeskQuotes({ mode: "author", author: "Seneca", limit: 24 }, d.deps);
  assert.equal(a.author, "Seneca");
  assert.equal(a.quotes[0]?.source, "wikiquote");
  assert.ok(a.quotes.some((q) => q.source === "local" && q.author === "Seneca"));
  const s = await loadDeskQuotes({ mode: "popular", topic: "wisdom", q: "long view" }, d.deps);
  assert.deepEqual(s.quotes.map((q) => q.text), ["Wisdom requires the long view, always."]);
  assert.deepEqual(d.asked, ["topic:wisdom", "author:Seneca"]);
});

test("desk: offline with no cache → the 42 built-ins, from=local", async () => {
  const d = deskDeps({});
  const r = await loadDeskQuotes({ mode: "popular", limit: 50 }, d.deps);
  assert.equal(r.from, "local");
  assert.equal(r.state, "none");
  assert.equal(r.quotes.length, 42);
});

test("desk: an empty Wikiquote answer after a good one keeps the cached quotes (persisted)", async () => {
  const kv = memKV();
  const good = deskDeps({ "topic:love": ["Love is patient, love is kind, they say."] }, kv);
  await loadDeskQuotes({ mode: "popular", topic: "love" }, good.deps);
  const empty = deskDeps({ "topic:love": [] }, kv);
  const r = await loadDeskQuotes({ mode: "popular", topic: "love", force: true }, empty.deps);
  assert.equal(r.state, "stale");
  assert.equal(r.quotes[0]?.text, "Love is patient, love is kind, they say.");
  assert.ok(kv.data.has("atrium.quotes.v1:topic:love"));
});

test("Card 147: All adds one rotating live topic per day (stable within the day), built-ins on failure", async () => {
  const day = "2026-10-06";
  const t = dailyQuoteTopic(day);
  assert.equal(dailyQuoteTopic(day), t);
  assert.notEqual(t, "all");
  const days = Array.from({ length: 14 }, (_, i) => dailyQuoteTopic(`2026-10-${String(i + 1).padStart(2, "0")}`));
  assert.ok(new Set(days).size > 1, "topic rotates across days");
  const lines = Array.from({ length: 30 }, (_, i) => `Topic line number ${i} is long enough to keep.`);
  const ok = deskDeps({ "daily:2026-10-06": ["There rolls the deep where grew the tree."], [`topic:${t}`]: lines });
  const r = await loadDeskQuotes({ mode: "popular" }, ok.deps);
  assert.equal(r.dailyTopic, t);
  assert.equal(r.quotes[0]?.text, "There rolls the deep where grew the tree.");
  assert.equal(r.total, 1 + 30 + LOCAL_QUOTES.length);
  assert.equal(r.liveTotal, 31);
  assert.notDeepEqual(r.quotes.slice(1, 6).map((q) => q.text), lines.slice(0, 5), "rotating rows are shuffled, not page order");
  const failed = deskDeps({ "daily:2026-10-06": ["There rolls the deep where grew the tree."] });
  const f = await loadDeskQuotes({ mode: "popular" }, failed.deps);
  assert.equal(f.total, 1 + LOCAL_QUOTES.length);
});

test("Card 147 N7: full pool + total; limit slices; topic order is seeded by day, not A–Z", async () => {
  const lines = Array.from({ length: 120 }, (_, i) => `A${String(i).padStart(3, "0")} wisdom line long enough.`);
  const d = deskDeps({ "topic:wisdom": lines });
  const all = await loadDeskQuotes({ mode: "popular", topic: "wisdom" }, d.deps);
  assert.equal(all.total, all.quotes.length);
  assert.ok(all.total >= 120);
  assert.notDeepEqual(all.quotes.slice(0, 16).map((q) => q.text), lines.slice(0, 16));
  const again = await loadDeskQuotes({ mode: "popular", topic: "wisdom" }, d.deps);
  assert.deepEqual(again.quotes.map((q) => q.text), all.quotes.map((q) => q.text), "stable within a day");
  const cut = await loadDeskQuotes({ mode: "popular", topic: "wisdom", limit: QUOTE_PAGE.list }, d.deps);
  assert.equal(cut.quotes.length, 16);
  assert.equal(cut.total, all.total);
  assert.equal(QUOTE_PAGE.author, 24);
});

test("Card 147 N3: footer reason — filtered vs failed vs offline", async () => {
  const d = deskDeps({ "daily:2026-10-06": ["There rolls the deep where grew the tree."] });
  const filtered = await loadDeskQuotes({ mode: "popular", q: "Mark Twain" }, d.deps);
  assert.equal(filtered.from, "local");
  assert.equal(quoteNoteReason(filtered), "filtered");
  const none = await loadDeskQuotes({ mode: "popular" }, deskDeps({}).deps);
  assert.equal(quoteNoteReason(none, true), "failed");
  assert.equal(quoteNoteReason(none, false), "offline");
  const live = await loadDeskQuotes({ mode: "popular" }, d.deps);
  assert.equal(quoteNoteReason(live), "live");
});
