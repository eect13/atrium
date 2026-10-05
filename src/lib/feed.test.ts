import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_FEED_PREFS,
  FEED_ALL,
  cleanInterest,
  curateStories,
  digestLabel,
  feedDigest,
  feedSummary,
  hubKind,
  interestStock,
  interestSuggestions,
  matchesInterest,
  normalizeFeedPrefs,
  storiesFor,
  toggleHide,
  toggleMute,
  togglePin,
  withHub,
  withInterest,
  withoutHub,
  withoutInterest,
  patchHub,
} from "./feed.ts";

const s = (title: string, src: string, link: string, extra: Record<string, string> = {}) => ({ title, src, link, desc: "", category: "", date: "", ...extra });
const items = [
  s("Alpha rises on example news", "Source A", "a1"),
  s("Beta example story", "Source B", "b1"),
  s("Gamma lead item", "Source A", "a2"),
  s("Delta update", "Source C", "c1", { category: "tech" }),
];

test("defaults carry no hardcoded interests", () => {
  const p = normalizeFeedPrefs(undefined);
  assert.deepEqual(p.interests, []);
  assert.equal(p.interest, FEED_ALL);
  assert.equal(p.digestTime, "07:00");
  assert.equal(p.digestFreq, "daily");
  assert.equal(digestLabel(p), "07:00 · daily");
  assert.equal(p.showSourcesStrip, true);
  assert.equal(p.showSummary, true);
  assert.equal(p.showHub, true);
  assert.equal(p.comfortableDensity, true);
  assert.equal(p.digestOn, true);
});

test("layout prefs default on and honor explicit false", () => {
  const off = normalizeFeedPrefs({
    showSourcesStrip: false,
    showSummary: false,
    showHub: false,
    comfortableDensity: false,
  });
  assert.equal(off.showSourcesStrip, false);
  assert.equal(off.showSummary, false);
  assert.equal(off.showHub, false);
  assert.equal(off.comfortableDensity, false);
});

test("normalize rejects junk, dedupes, and resets a stale active interest", () => {
  const p = normalizeFeedPrefs({
    interests: ["  Interest   1 ", "interest 1", "All", 4, ""],
    interest: "Gone",
    digestTime: "25:00",
    digestFreq: "hourly",
    hub: [{ url: "ftp://x" }, { url: "https://example.com/a.pdf", title: "" }, { url: "https://example.com/a.pdf" }],
    pinned: ["a1", "a1"],
  });
  assert.deepEqual(p.interests, ["Interest 1"]);
  assert.equal(p.interest, FEED_ALL);
  assert.equal(p.digestTime, "07:00");
  assert.equal(p.digestFreq, "daily");
  assert.equal(p.hub.length, 1);
  assert.equal(p.hub[0]!.kind, "doc");
  assert.equal(p.hub[0]!.title, "example.com");
  assert.deepEqual(p.pinned, ["a1"]);
});

test("cleanInterest trims and refuses All", () => {
  assert.equal(cleanInterest("  a   b "), "a b");
  assert.equal(cleanInterest("all"), "");
  assert.equal(cleanInterest(3), "");
});

test("add / remove interest moves the active chip", () => {
  let p = withInterest(DEFAULT_FEED_PREFS, "Alpha");
  assert.deepEqual(p.interests, ["Alpha"]);
  assert.equal(p.interest, "Alpha");
  assert.equal(withInterest(p, "alpha"), p);
  p = withoutInterest(p, "ALPHA");
  assert.deepEqual(p.interests, []);
  assert.equal(p.interest, FEED_ALL);
});

test("matchesInterest: phrase or comma alternatives over title, source, and tag", () => {
  assert.equal(matchesInterest(items[0]!, "alpha"), true);
  assert.equal(matchesInterest(items[1]!, "alpha, beta"), true);
  assert.equal(matchesInterest(items[2]!, "source a"), true);
  assert.equal(matchesInterest(items[3]!, "Tech"), true);
  assert.equal(matchesInterest(items[3]!, "zeta"), false);
  assert.equal(matchesInterest(items[3]!, FEED_ALL), true);
});

test("curate: hidden and muted drop out; pinned float to the top", () => {
  let p = togglePin(DEFAULT_FEED_PREFS, "c1");
  p = toggleHide(p, "b1");
  p = toggleMute(p, "source a");
  assert.deepEqual(curateStories(items, p).map((x) => x.link), ["c1"]);
  p = toggleMute(p, "Source A");
  assert.deepEqual(curateStories(items, p).map((x) => x.link), ["c1", "a1", "a2"]);
  const hidPinned = toggleHide(togglePin(DEFAULT_FEED_PREFS, "a1"), "a1");
  assert.deepEqual(hidPinned.pinned, []);
});

test("storiesFor applies interest then query", () => {
  const p = { ...withInterest(DEFAULT_FEED_PREFS, "Source A") };
  assert.deepEqual(storiesFor(items, p).map((x) => x.link), ["a1", "a2"]);
  assert.deepEqual(storiesFor(items, p, "gamma").map((x) => x.link), ["a2"]);
  assert.deepEqual(storiesFor(items, { ...p, interest: FEED_ALL }).length, 4);
});

test("feedDigest: one line per interest, then fills from the top", () => {
  let p = withInterest(DEFAULT_FEED_PREFS, "Beta");
  p = withInterest(p, "Delta");
  p = { ...p, interest: FEED_ALL };
  const d = feedDigest(items, p, 3);
  assert.deepEqual(d.map((x) => [x.label, x.story.link]), [["Beta", "b1"], ["Delta", "c1"], [d[2]!.label, "a1"]]);
  assert.equal(feedDigest([], p).length, 0);
  const scoped = feedDigest(items, { ...p, interest: "Beta" }, 3);
  assert.deepEqual(scoped.map((x) => x.story.link), ["b1"]);
});

test("feedSummary counts stories and sources without inventing copy", () => {
  const sum = feedSummary(items);
  assert.equal(sum.count, 4);
  assert.equal(sum.sources, 3);
  assert.equal(sum.top[0], "Source A");
  assert.match(sum.line, /^4 stories from 3 sources — most from Source A/);
  assert.equal(feedSummary([], "Interest 1").line, "No stories for Interest 1 yet.");
});

test("hub: kind from URL, dedupe, remove", () => {
  assert.equal(hubKind("https://www.youtube.com/watch?v=x"), "video");
  assert.equal(hubKind("https://example.com/file.pdf"), "doc");
  assert.equal(hubKind("https://example.com/page"), "link");
  let p = withHub(DEFAULT_FEED_PREFS, { id: "h1", url: "https://example.com/page", title: "", at: "" });
  assert.equal(p.hub[0]!.title, "example.com");
  assert.equal(withHub(p, { id: "h2", url: "https://example.com/page", title: "dup", at: "" }), p);
  assert.equal(withHub(p, { id: "h3", url: "not a url", title: "", at: "" }), p);
  p = withoutHub(p, "h1");
  assert.equal(p.hub.length, 0);
});

test("interest suggestions come from story tags, minus ones you have", () => {
  const sug = interestSuggestions(items, ["tech"]);
  assert.equal(sug.includes("Tech"), false);
});

const CATALOG = [
  { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" },
  { id: "ac", symbol: "AC", label: "AC", name: "Ayala Corp", kind: "stock" },
  { id: "tech", symbol: "TECH", label: "TECH", name: "Cirtek Holdings", kind: "stock" },
];
const stockOf = (i: string) => interestStock(i, CATALOG);

test("interestStock is strict: $TICKER, UPPERCASE ticker, or exact name — topics stay topics", () => {
  assert.equal(stockOf("BDO")?.symbol, "BDO");
  assert.equal(stockOf("$bdo")?.symbol, "BDO");
  assert.equal(stockOf("PSE:AC")?.symbol, "AC");
  assert.equal(stockOf("ayala corp")?.symbol, "AC");
  assert.equal(stockOf("Tech"), null);
  assert.equal(stockOf("bdo"), null);
  assert.equal(stockOf("BDO, AC"), null);
  assert.equal(stockOf("ZZZZ"), null);
});

test("stock-scoped interest keeps only stories about that stock", () => {
  const pool = [
    s("BDO Unibank net income rises", "Inquirer", "x1"),
    s("Peso slips as oil climbs", "Wire", "x2", { desc: "BDO Unibank, Ayala Corp and other Manila names in the cluster" }),
    s("BDO Luxembourg appoints partners", "Luxembourg Times", "x3"),
    s("Ayala Corp unit raises funds", "BusinessWorld", "x4"),
    s("Back to basics for retail", "Wire", "x5"),
  ];
  const p = withInterest(DEFAULT_FEED_PREFS, "BDO");
  assert.deepEqual(storiesFor(pool, p, "", stockOf).map((x) => x.link), ["x1"]);
  const ac = withInterest(DEFAULT_FEED_PREFS, "AC");
  assert.deepEqual(storiesFor(pool, ac, "", stockOf).map((x) => x.link), ["x4"]);
  // Digest for a stock interest never fills with unrelated top stories.
  assert.deepEqual(feedDigest(pool, p, 3, stockOf).map((x) => x.story.link), ["x1"]);
  // Comma list mixes a stock with a plain topic.
  const mix = withInterest(DEFAULT_FEED_PREFS, "BDO, retail");
  assert.deepEqual(storiesFor(pool, mix, "", stockOf).map((x) => x.link), ["x1", "x5"]);
});

test("short plain terms need word edges (no 'ai' inside 'said')", () => {
  assert.equal(matchesInterest(s("Officials said rates hold", "Wire", "y1"), "ai"), false);
  assert.equal(matchesInterest(s("New AI chip ships", "Wire", "y2"), "ai"), true);
  assert.equal(matchesInterest(s("Back to basics", "Wire", "y3"), "AC"), false);
});

test("hub note persists through normalize and patchHub", () => {
  let p = withHub(DEFAULT_FEED_PREFS, { id: "h1", url: "https://example.com/a", title: "A", at: "t", note: "  hello  " });
  assert.equal(p.hub[0]!.note, "hello");
  p = normalizeFeedPrefs(p);
  assert.equal(p.hub[0]!.note, "hello");
  p = patchHub(p, "h1", { note: "  " });
  assert.equal(p.hub[0]!.note, undefined);
  p = patchHub(p, "h1", { note: "kept" });
  assert.equal(p.hub[0]!.note, "kept");
});
