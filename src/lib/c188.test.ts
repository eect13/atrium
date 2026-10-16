import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cleanInterest, DEFAULT_FEED_PREFS, matchTopic, withInterest, type FeedPrefs } from "./feed.ts";
import { mixStories } from "./headline.ts";
import { picksFor, scorePick, clusterStories, shorterWords, whyLine } from "./topic-finder.ts";
import { clientHeaders, clientUserAgent, CLIENT_LIB } from "./client-ua.ts";
import { wqHeaders, WQ_LIB } from "./wikiquote.ts";
import { landingFeedPane, toViewId, VIEW_IDS } from "./types.ts";

const NOW = Date.parse("2026-10-13T06:00:00Z");
const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString();
const prefs = (p: Partial<FeedPrefs> = {}): FeedPrefs => ({ ...DEFAULT_FEED_PREFS, ...p });
const story = (title: string, src: string, i: number, desc = "") => ({ title, link: `https://x.example/${src.replace(/\W/g, "")}/${i}`, src, date: h(1 + (i % 20)), desc, category: "local" });

test("Scout 186 fix 1: Topics ranks every fetched story, not the 40 mixed headlines", () => {
  // Fillers share no words (mixStories collapses look-alike titles), all fresher than the NBA story.
  const word = (n: number) => String.fromCharCode(97 + (n % 26)) + String.fromCharCode(97 + (Math.floor(n / 26) % 26)) + "x" + String.fromCharCode(97 + (Math.floor(n / 676) % 26));
  const filler = Array.from({ length: 60 }, (_, i) => story(`${word(i * 4)} ${word(i * 4 + 1)} ${word(i * 4 + 2)} ${word(i * 4 + 3)}`, `Wire${i % 6}`, i));
  const nba = { ...story("Michael Jordan jersey sells at NBA auction", "Wire0", 99), date: h(100) };
  const all = [...filler, nba];
  const shown = mixStories(all, 40, NOW);
  assert.ok(!shown.some((s) => s.link === nba.link), "the 40-cap drops it (the old Topic Finder input)");
  assert.equal(picksFor("NBA", shown, prefs(), { now: NOW }).picks.length, 0);
  const r = picksFor("NBA", all, prefs(), { now: NOW });
  assert.equal(r.picks.length, 1, "the uncapped pool finds it");
  assert.equal(r.pool, all.length, "M = every story this week");
});

test("Scout 186 fix 2: no source-name matches; the reason names the term that matched", () => {
  const cebuSrc = story("Alex Eala reaches Wuhan Open quarterfinal", "Cebu Daily News", 1);
  const cebu = story("Metro Cebu air quality dips", "Cebu Daily News", 2);
  assert.equal(matchTopic(cebuSrc, "Cebu"), null, "source name alone is not a hit");
  assert.deepEqual(matchTopic(cebu, "Cebu"), { term: "Cebu", field: "title" });
  const marcos = story("Palace: Marcos' buy-buckets advice", "Philstar", 3);
  const hit = matchTopic(marcos, "Marcos, tariff");
  assert.deepEqual(hit, { term: "Marcos", field: "title" }, "the term that hit, not the whole list");
  const [c] = clusterStories([marcos]);
  const s = scorePick(c!, { topic: "Marcos, tariff", saved: [], now: NOW });
  assert.equal(s.reasons[0], "Matches “marcos” in the title");
  assert.equal(whyLine({ ...s, sources: ["Philstar"] }), "Why: matches “marcos” in the title");
  assert.equal(whyLine({ ...s, sources: ["Philstar", "GMA"] }), "Why: matches “marcos” in the title · 2 sources");
  const inSummary = story("Senate hearing today", "Rappler", 4, "Talks on the tariff schedule continue.");
  assert.deepEqual(matchTopic(inSummary, "Marcos, tariff"), { term: "tariff", field: "summary" });
});

test("Scout 186 fix 3: phrase topics fall back to all words when the exact phrase isn't there", () => {
  const s = story("Philippine peso slips as economy data disappoints", "BusinessWorld", 5);
  assert.deepEqual(matchTopic(s, "Philippine economy"), { term: "Philippine economy", field: "title" });
  const exact = story("Philippine economy grows 5.5%", "GMA", 6);
  assert.deepEqual(matchTopic(exact, "Philippine economy"), { term: "Philippine economy", field: "title" });
  assert.equal(matchTopic(story("Philippine team wins", "GMA", 7), "Philippine economy"), null, "one word is not enough");
  assert.equal(matchTopic(story("Officials said rates hold", "Wire", 8), "AI regulation"), null, "short words keep word edges");
  const wordsInSummary = story("New rules", "Verge", 9, "Regulation of AI models tightens");
  assert.deepEqual(matchTopic(wordsInSummary, "AI regulation"), { term: "AI regulation", field: "summary" });
});

test("Scout 186 fix 4: blank topics are rejected and never mean everything", () => {
  for (const blank of ["   ", "", " , ", ",,", "—"]) {
    assert.equal(cleanInterest(blank), "", JSON.stringify(blank));
    assert.equal(withInterest(DEFAULT_FEED_PREFS, blank), DEFAULT_FEED_PREFS);
    const r = picksFor(blank, [story("Anything at all", "Wire", 1)], prefs(), { now: NOW });
    assert.equal(r.picks.length, 0, `picksFor(${JSON.stringify(blank)}) = []`);
  }
  assert.equal(matchTopic(story("Anything", "Wire", 1), "   "), null);
});

test("Scout 186 fix 7 (UA): feed fetches send the same honest, context-neutral client id as Wikiquote", () => {
  assert.match(clientUserAgent(CLIENT_LIB.web), /^AtriumDesk\/\S+ \(https:\/\/github\.com\/eect13\/atrium\/issues\) Node\.js\/22 undici$/);
  assert.deepEqual(clientHeaders(CLIENT_LIB.tauri), { "User-Agent": clientUserAgent("reqwest/0.12") });
  assert.equal(wqHeaders(WQ_LIB.web)["User-Agent"], clientUserAgent(CLIENT_LIB.web), "Wikiquote reuses it unchanged");
  const src = readFileSync(new URL("./feeds.ts", import.meta.url), "utf8");
  assert.equal((src.match(/httpText\(url, clientHeaders\(\)\)/g) ?? []).length, 2, "fetchFeed and probe pull both send it");
});

test("Card 188 nav: Topic Finder folded into Feed; saved 'topics' view lands on Feed › Topics", () => {
  assert.ok(!(VIEW_IDS as readonly string[]).includes("topics"));
  assert.equal(toViewId("topics", "dashboard"), "news");
  assert.equal(landingFeedPane("topics"), "topics");
  assert.equal(landingFeedPane("news"), undefined);
  const app = readFileSync(new URL("../components/atrium-app.tsx", import.meta.url), "utf8");
  assert.ok(!/label: "Topic Finder"/.test(app), "no separate nav item");
  assert.ok(!/Topic Finder/.test(readFileSync(new URL("../components/views/feed-topics.tsx", import.meta.url), "utf8")), "the name is retired in the UI");
});

test("Form 185 Rev 1: min read gone, 'In the last 24 h' only without a match, shorter-word suggestions", () => {
  const long = Array.from({ length: 900 }, () => "word").join(" ");
  const [c] = clusterStories([story("Storm update", "GMA", 1, long)]);
  const none = scorePick(c!, { topic: "", saved: [], now: NOW });
  assert.deepEqual(none.reasons, ["In the last 24 h"]);
  assert.ok(!none.reasons.some((r) => /min read/.test(r)));
  const lenOnly = scorePick(clusterStories([story("Storm update", "GMA", 1, "x")])[0]!, { topic: "", saved: [], now: NOW });
  assert.equal(none.score, lenOnly.score, "length no longer boosts the score");
  assert.deepEqual(scorePick(c!, { topic: "storm", saved: [], now: NOW }).reasons, ["Matches “storm” in the title"]);
  assert.deepEqual(shorterWords("Philippine economy"), ["Philippine", "economy"]);
  assert.deepEqual(shorterWords("NBA"), [], "no row when there's nothing shorter");
  assert.deepEqual(shorterWords("AI regulation, chips"), ["regulation"], "a term that is already its own alternative is not suggested");
});
