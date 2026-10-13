import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { backfillHubTopics, DEFAULT_FEED_PREFS, hubTopicSnapshot, matchTopic, readHubTopicKeep, withInterestAt, type FeedPrefs } from "./feed.ts";
import { picksFor, suggestFor, whyLine } from "./topic-finder.ts";
import { looseHit, stem } from "./topic-words.ts";
import { TOPIC_ALIASES } from "./topic-aliases.ts";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-13T06:00:00Z");
const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString();
const prefs = (p: Partial<FeedPrefs> = {}): FeedPrefs => ({ ...DEFAULT_FEED_PREFS, ...p });
const story = (title: string, s: string, i: number, desc = "") => ({ title, link: `https://x.example/${s.replace(/\W/g, "")}/${i}`, src: s, date: h(1 + i), desc, category: "local" });

test("C195 G1 stem: economy family collapses; Philippines ≈ Philippine; police ≠ policy", () => {
  for (const w of ["economy", "economic", "economies", "economics"]) assert.equal(stem(w), "econom", w);
  assert.equal(stem("Philippines"), stem("Philippine"));
  assert.notEqual(stem("police"), stem("policy"));
  assert.equal(stem("bus"), "bus", "short words untouched");
});

test("C195 G1 looseHit: PH economy hits via alias + stem; returns the actual words", () => {
  assert.equal(looseHit("Philippine economic growth slows in Q3", "PH economy"), "philippine economic");
  assert.ok(looseHit("PH economy beats forecasts", "PH economy"));
  assert.equal(looseHit("Let us talk about the economy", "US economy"), null, "lower-case pronoun 'us' is not a code");
  assert.ok(looseHit("US economy adds jobs", "US economy"));
  assert.equal(looseHit("Cebu traffic", "PH economy"), null);
});

test("C195 G1 alias table is data: a custom table changes matching", () => {
  assert.ok(TOPIC_ALIASES.some((g) => g.codes.includes("PH")));
  assert.equal(looseHit("Zedland economy grows", "ZZ economy", []), null);
  assert.ok(looseHit("Zedland economy grows", "ZZ economy", [{ codes: ["ZZ"], names: ["Zedland"] }]));
});

test("C195 G1 matchTopic + Why name the matched term, not the topic", () => {
  const s = story("Philippine economic growth slows", "Inquirer", 1);
  const hit = matchTopic(s, "PH economy");
  assert.ok(hit);
  assert.equal(hit!.term.toLowerCase(), "philippine economic");
  const r = picksFor("PH economy", [s], prefs(), { now: NOW });
  assert.equal(r.picks.length, 1);
  assert.match(whyLine(r.picks[0]!), /matches “philippine economic” in the title/);
});

test("Form 194 suggestFor: ≥1 pick, picks desc → longer → A–Z, max 2, empty when none", () => {
  const items = [
    story("Cebu port expands", "A", 1),
    story("Cebu flights resume", "B", 2),
    story("Davao port upgrade", "C", 3),
  ];
  const r = suggestFor("Cebu Davao port zzzq", items, prefs(), { now: NOW });
  assert.ok(r.length <= 2);
  assert.ok(r.every((x) => x.n >= 1));
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1]!, b = r[i]!;
    assert.ok(a.n > b.n || (a.n === b.n && (a.term.length > b.term.length || (a.term.length === b.term.length && a.term.localeCompare(b.term) <= 0))));
  }
  assert.ok(!r.some((x) => x.term === "zzzq"), "zero-pick words are dropped");
  assert.deepEqual(suggestFor("qqqx wwwy", items, prefs(), { now: NOW }), []);
});

test("Form 194 G6 withInterestAt restores the original position", () => {
  const p = prefs({ interests: ["A", "C"] });
  assert.deepEqual(withInterestAt(p, "B", 1).interests, ["A", "B", "C"]);
  assert.deepEqual(withInterestAt(p, "Z", 99).interests, ["A", "C", "Z"]);
  assert.equal(withInterestAt(p, "a", 0), p, "duplicate is a no-op");
});

test("C195 G5: side copy survives a downgrade and wins over re-matching", () => {
  const hub = [{ url: "https://x/1", title: "Cebu port", note: "", topic: "Ports" }] as FeedPrefs["hub"];
  const keep = readHubTopicKeep(JSON.stringify(hubTopicSnapshot(prefs({ hub }))));
  const stripped = prefs({ hub: hub.map(({ topic: _t, ...r }) => r) as FeedPrefs["hub"], interests: ["Cebu"], hubTopicV: 0 });
  assert.equal(backfillHubTopics(stripped, undefined, keep).hub[0]!.topic, "Ports");
  assert.equal(backfillHubTopics(stripped).hub[0]!.topic, "Cebu", "without the copy it re-matches");
  assert.equal(readHubTopicKeep("not json"), undefined);
  assert.match(src("lib/store.ts"), /useAtrium\.subscribe\(write\)/);
});

test("C195 G3/G4/G7 + Form 194 copy: source checks", () => {
  assert.match(src("components/note-color.tsx"), /size-11/);
  assert.doesNotMatch(src("lib/feeds.ts"), /FETCH_UA/);
  const o = src("components/views/options-view.tsx");
  assert.ok(o.includes("World clocks tab and Clock card."));
  assert.ok(o.includes("Notes board. Pencil for freehand."));
  assert.ok(src("components/views/finance-options.tsx").includes("Turn Markets or Books off to hide that tab and the matching section on the dashboard Finance card. Keep at least one on. Options stays."));
  const t = src("components/views/feed-topics.tsx");
  assert.ok(t.includes("Follow ${w} instead, ${k} ${k === 1 ? \"pick\" : \"picks\"}"));
  assert.match(t, /unfollowWithUndo\(\{ update: updateFeed, label: i, index: n/);
  const u = src("components/views/unfollow-undo.ts");
  assert.match(u, /label: "Undo"/);
  assert.match(u, /left\[index\] \?\? left\[index - 1\] \?\? fallback\(\)/);
  const p = src("components/views/feed-panels.tsx");
  assert.match(p, /unfollowWithUndo\(\{/);
  assert.match(p, /id="curate-follow-input"/);
});

test("C195 smoke fix: Undo toast is clickable over a modal and doesn't close it; focus survives Sonner's restore", () => {
  assert.match(src("components/providers.tsx"), /<Toaster[^>]*style=\{\{ pointerEvents: "auto" \}\}/);
  const p = src("components/views/feed-panels.tsx");
  assert.match(p, /onPointerDownOutside=\{keepForToast\} onInteractOutside=\{keepForToast\}/);
  assert.match(p, /closest\("\[data-sonner-toaster\]"\)/);
  assert.match(src("components/views/unfollow-undo.ts"), /setTimeout\(back, 320\)/);
});

