import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  backfillHubTopics,
  DEFAULT_FEED_PREFS,
  HUB_TOPIC_OTHER,
  HUB_TOPIC_V,
  hubTopics,
  moveInterest,
  normalizeFeedPrefs,
  renameInterest,
  topicFor,
  withHub,
  type FeedPrefs,
} from "./feed.ts";
import { picksFor, withDismissed, clusterStories } from "./topic-finder.ts";

const NOW = Date.parse("2026-10-13T06:00:00Z");
const prefs = (p: Partial<FeedPrefs> = {}): FeedPrefs => ({ ...DEFAULT_FEED_PREFS, ...p });
const at = new Date(NOW).toISOString();

test("settings: Form 185 defaults (why on, hide dismissed on, helper off) and persistence round-trip", () => {
  const d = normalizeFeedPrefs({});
  assert.equal(d.showWhy, true);
  assert.equal(d.hideDismissed, true);
  assert.equal(d.showHelper, false);
  assert.equal(d.hubTopicV, 0);
  const flipped = normalizeFeedPrefs(JSON.parse(JSON.stringify({ ...d, showWhy: false, hideDismissed: false, showHelper: true })));
  assert.deepEqual([flipped.showWhy, flipped.hideDismissed, flipped.showHelper], [false, false, true]);
  // Junk values fall back to the defaults.
  const junk = normalizeFeedPrefs({ showWhy: "no", hideDismissed: 0, showHelper: "yes", hubTopicV: "x" });
  assert.deepEqual([junk.showWhy, junk.hideDismissed, junk.showHelper, junk.hubTopicV], [true, true, false, 0]);
});

test("settings: Hide stories I dismissed off brings dismissed picks back", () => {
  const items = [{ title: "Mars rover finds water", link: "https://x.example/a", src: "A", date: new Date(NOW - 3_600_000).toISOString() }];
  const [c] = clusterStories(items);
  const p = withDismissed(prefs({ interests: ["Mars"] }), c!, NOW);
  assert.equal(picksFor("Mars", items, p, { now: NOW }).picks.length, 0);
  assert.equal(picksFor("Mars", items, p, { now: NOW, hideDismissed: true }).picks.length, 0);
  assert.equal(picksFor("Mars", items, p, { now: NOW, hideDismissed: false }).picks.length, 1);
});

test("reorder: moveInterest moves by delta, clamps at the ends, persists through normalize", () => {
  const p = prefs({ interests: ["A1", "B2", "C3", "D4"] });
  assert.deepEqual(moveInterest(p, "C3", -1).interests, ["A1", "C3", "B2", "D4"]);
  assert.deepEqual(moveInterest(p, "a1", 1).interests, ["B2", "A1", "C3", "D4"]);
  assert.deepEqual(moveInterest(p, "B2", -9).interests, ["B2", "A1", "C3", "D4"]);
  assert.deepEqual(moveInterest(p, "B2", 9).interests, ["A1", "C3", "D4", "B2"]);
  assert.equal(moveInterest(p, "A1", -1), p, "already first: unchanged");
  assert.equal(moveInterest(p, "nope", 1), p);
  assert.deepEqual(normalizeFeedPrefs(JSON.parse(JSON.stringify(moveInterest(p, "D4", -3)))).interests, ["D4", "A1", "B2", "C3"]);
});

test("rename (Edit): keeps position, carries saved items, refuses blanks and duplicates", () => {
  const p = prefs({ interests: ["Mars", "Coffee"], interest: "Mars", hub: [{ id: "1", url: "https://x.example/1", title: "t", kind: "link", at, topic: "Mars" }] });
  const r = renameInterest(p, "Mars", "Mars rover");
  assert.deepEqual(r.interests, ["Mars rover", "Coffee"]);
  assert.equal(r.interest, "Mars rover");
  assert.equal(r.hub[0]!.topic, "Mars rover");
  assert.equal(renameInterest(p, "Mars", "  "), p);
  assert.equal(renameInterest(p, "Mars", "coffee"), p);
});

test("save-topic: withHub records the topic going forward (explicit, active chip, first match, else Other)", () => {
  const p = prefs({ interests: ["Coffee", "Mars"] });
  const save = (q: FeedPrefs, title: string, extra: object = {}) => withHub(q, { id: title, url: `https://x.example/${title.length}`, title, at, ...extra }).hub[0]!.topic;
  assert.equal(save(p, "Anything at all", { topic: "Mars" }), "Mars", "Topics page passes its topic");
  assert.equal(save(p, "Mars coffee shop opens"), "Coffee", "first followed topic in order");
  assert.equal(save({ ...p, interest: "Mars" }, "Mars coffee shop opens"), "Mars", "active chip wins when it matches");
  assert.equal(save(p, "Rover update", { match: { desc: "New images from Mars" } }), "Mars", "summary fields count");
  assert.equal(save(p, "Football scores"), HUB_TOPIC_OTHER);
  assert.equal(save(prefs({ interests: ["Bean"] }), "Bean news", { src: "Mars Daily" }), "Bean", "source name never matches");
  assert.equal(topicFor({ title: "x", link: "https://x", src: "Coffee Times" }, p), HUB_TOPIC_OTHER);
  // Persisted.
  const saved = withHub(p, { id: "z", url: "https://x.example/z", title: "Mars", at });
  assert.equal(normalizeFeedPrefs(JSON.parse(JSON.stringify(saved))).hub[0]!.topic, "Mars");
});

test("migration v1: backfill saves with no topic by re-matching current topics, else Other; idempotent", () => {
  const old = normalizeFeedPrefs({
    interests: ["Coffee", "Mars"],
    hub: [
      { id: "1", url: "https://x.example/1", title: "Mars landing date set", at },
      { id: "2", url: "https://x.example/2", title: "Untitled", at, note: "about coffee prices" },
      { id: "3", url: "https://x.example/3", title: "Football", at },
      { id: "4", url: "https://x.example/4", title: "Mars again", at, topic: "Space" },
    ],
  });
  assert.equal(old.hub[0]!.topic, undefined);
  const m = backfillHubTopics(old);
  assert.equal(m.hubTopicV, HUB_TOPIC_V);
  assert.deepEqual(m.hub.map((h) => h.topic), ["Mars", "Coffee", HUB_TOPIC_OTHER, "Space"]);
  assert.equal(backfillHubTopics(m), m, "already at v1: no-op");
  assert.deepEqual(hubTopics(m), ["Coffee", "Mars", "Space", HUB_TOPIC_OTHER]);
});

test("migration wiring: store version 35 runs the backfill", () => {
  const src = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  assert.match(src, /version: 35,/);
  assert.match(src, /if \(version < 35\) \{[\s\S]*?backfillHubTopics\(normalizeFeedPrefs\(fp\), undefined, keep\)/);
});
