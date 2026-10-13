import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_FEED_PREFS, DISMISS_DAYS, normalizeFeedPrefs, pruneDismissed, type FeedPrefs } from "./feed.ts";
import { clusterStories, picksFor, scorePick, withDismissed, withLessLike, withoutDismissed } from "./topic-finder.ts";

const NOW = Date.parse("2026-10-13T06:00:00Z");
const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString();
const long = Array.from({ length: 600 }, () => "word").join(" ");

const items = [
  { title: "City approves new bus lanes on EDSA corridor", link: "https://a.example/1", src: "Reuters", date: h(2), desc: long },
  { title: "EDSA bus lanes approved by city council", link: "https://b.example/2", src: "Rappler", date: h(3), desc: "short" },
  { title: "Council approves EDSA bus lanes plan", link: "https://c.example/3", src: "Inquirer", date: h(5) },
  { title: "Bus fares rise next month", link: "https://d.example/4", src: "GMA", date: h(30) },
  { title: "Old bus lane story", link: "https://e.example/5", src: "GMA", date: h(24 * 9) },
  { title: "Basketball finals tonight", link: "https://f.example/6", src: "ESPN", date: h(1) },
];

const prefs = (p: Partial<FeedPrefs> = {}): FeedPrefs => ({ ...DEFAULT_FEED_PREFS, interests: ["bus lanes", "bus"], ...p });

test("clusterStories groups one story covered by several sources", () => {
  const cs = clusterStories(items);
  const lanes = cs.find((c) => c.items.length === 3)!;
  assert.deepEqual(lanes.sources, ["Reuters", "Rappler", "Inquirer"]);
  assert.equal(lanes.lead.link, "https://a.example/1", "the longest write-up leads");
  assert.equal(cs.length, 4);
});

test("scorePick explains itself", () => {
  const c = clusterStories(items).find((x) => x.items.length === 3)!;
  const saved = [{ url: "https://a.example/x", src: "Reuters" }, { url: "https://a.example/y", src: "Reuters" }];
  const r = scorePick(c, { topic: "bus lanes", saved, now: NOW });
  // Form 185 Rev 1: the matched term + field; no "min read" (B10); "In the last 24 h" only without a match (B11).
  assert.deepEqual(r.reasons, ["Matches “bus lanes” in the title", "3 sources covered it", "You save Reuters often"]);
  const single = clusterStories(items).find((x) => x.lead.title.startsWith("Bus fares"))!;
  assert.ok(scorePick(single, { topic: "bus", saved: [], now: NOW }).score < r.score);
});

test("picksFor: this week only, best first, dismissed and hidden left out", () => {
  const all = picksFor("bus", items, prefs(), { now: NOW });
  assert.equal(all.stories, 4, "the 9-day-old story is outside the week; basketball is off-topic");
  assert.equal(all.picks[0]!.sources.length, 3);
  const after = withDismissed(prefs(), all.picks[0]!, NOW);
  const less = picksFor("bus", items, after, { now: NOW });
  assert.ok(!less.picks.some((p) => p.id === all.picks[0]!.id));
  const undone = withoutDismissed(after, all.picks[0]!.id);
  assert.equal(picksFor("bus", items, undone, { now: NOW }).picks[0]!.id, all.picks[0]!.id, "Undo brings it back");
  const hidden = picksFor("bus", items, prefs({ hidden: ["https://d.example/4"] }), { now: NOW });
  assert.ok(!hidden.picks.some((p) => p.lead.link === "https://d.example/4"));
});

test("Less like this ranks similar stories lower", () => {
  const base = picksFor("bus", items, prefs(), { now: NOW }).picks;
  const fares = base.find((p) => p.lead.title.startsWith("Bus fares"))!;
  const p = withLessLike(prefs(), "Bus fares rise again");
  const after = picksFor("bus", items, p, { now: NOW }).picks.find((x) => x.id === fares.id)!;
  assert.ok(after.score < fares.score);
});

test("Dismissed is kept 30 days, then forgotten (on load too)", () => {
  assert.equal(DISMISS_DAYS, 30);
  const list = [
    { id: "fresh", at: new Date(NOW - 29 * 86_400_000).toISOString() },
    { id: "edge", at: new Date(NOW - 30 * 86_400_000).toISOString() },
    { id: "old", at: new Date(NOW - 31 * 86_400_000).toISOString() },
    { id: "junk", at: "not a date" },
  ];
  assert.deepEqual(pruneDismissed(list, NOW).map((d) => d.id), ["fresh", "edge"]);
  const loaded = normalizeFeedPrefs({ dismissed: [{ id: "x", at: new Date().toISOString() }, { id: "y", at: "2020-01-01T00:00:00Z" }, { nope: 1 }] });
  assert.deepEqual(loaded.dismissed.map((d) => d.id), ["x"]);
  assert.deepEqual(normalizeFeedPrefs({}).dismissed, []);
  assert.deepEqual(normalizeFeedPrefs({}).hub, [], "saved items (Hub) are unchanged");
});
