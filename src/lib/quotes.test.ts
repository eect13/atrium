import assert from "node:assert/strict";
import { test } from "node:test";
import { WQ_TOPIC_PAGES } from "./wikiquote.ts";
import { LOCAL_QUOTES, authorChipsFromQuotes, authorMatches, authorSlug, exactAuthor, matchQuoteQuery, mergeQuotePool, normalizeQuoteTopic, quoteTopicChips, topicLocals } from "./quotes.ts";

const wq = (text: string, author = "Someone") => ({ text, author, href: "https://en.wikiquote.org/wiki/X", source: "wikiquote" as const });
const loc = (text: string, author = "Local") => ({ text, author, href: "https://en.wikiquote.org/wiki/Y", source: "local" as const });

test("authorSlug folds names", () => {
  assert.equal(authorSlug("Albert Einstein"), "albert-einstein");
  assert.equal(authorSlug("Marcus Aurelius"), "marcus-aurelius");
  assert.equal(authorSlug("Dr. Maya Angelou"), "maya-angelou");
});

test("mergeQuotePool: live first, then built-ins, deduped by normalized text", () => {
  const pool = mergeQuotePool(
    [wq("Live line number one is long enough."), wq("Shared line that both sets carry.")],
    [loc("Shared line, that both sets carry!"), loc("Built-in line that fills in after.")],
  );
  assert.deepEqual(pool.map((q) => q.source), ["wikiquote", "wikiquote", "local"]);
  assert.equal(pool.length, 3);
});

test("mergeQuotePool: offline (no live rows) keeps every built-in visible", () => {
  assert.equal(mergeQuotePool([], LOCAL_QUOTES).length, 42);
  assert.ok(LOCAL_QUOTES.every((q) => q.source === "local" && q.href.startsWith("https://en.wikiquote.org/wiki/")));
});

test("normalizeQuoteTopic keeps known topics", () => {
  assert.equal(normalizeQuoteTopic("funny"), "funny");
  assert.equal(normalizeQuoteTopic("motivational"), "motivational");
  assert.equal(normalizeQuoteTopic("nope"), "all");
});

test("topicLocals pads a quiet topic from desk copies", () => {
  const funny = topicLocals("funny");
  assert.ok(funny.length > 0);
  assert.ok(funny.some((q) => /gutter|stars|taken/i.test(`${q.text} ${q.author}`)));
  const empty = topicLocals("life", []);
  assert.deepEqual(empty, []);
});

test("exactAuthor matches the full name slug, not a substring", () => {
  const q = { text: "Imagination is more important than knowledge.", author: "Albert Einstein", href: "https://example.com", source: "local" as const };
  assert.equal(exactAuthor(q, "Albert Einstein"), true);
  assert.equal(exactAuthor(q, "Einstein"), false);
  assert.equal(exactAuthor(q, "albert-einstein"), true);
});

test("authorMatches accepts a surname", () => {
  assert.equal(authorMatches("Albert Einstein", "Einstein"), true);
  assert.equal(authorMatches("Marcus Aurelius", "Aurelius"), true);
  assert.equal(authorMatches("Albert Einstein", "stein"), false);
});

test("matchQuoteQuery looks in line and person", () => {
  const q = { text: "Stay hungry. Stay foolish.", author: "Steve Jobs", href: "https://example.com", source: "local" as const };
  assert.equal(matchQuoteQuery(q, "hungry"), true);
  assert.equal(matchQuoteQuery(q, "jobs"), true);
  assert.equal(matchQuoteQuery(q, "aurelius"), false);
  assert.equal(matchQuoteQuery(q, "  "), true);
});

test("quoteTopicChips: All plus every topic that maps to a Wikiquote page", () => {
  const chips = quoteTopicChips();
  assert.equal(chips[0]?.id, "all");
  assert.deepEqual(chips.slice(1).map((c) => c.id), Object.keys(WQ_TOPIC_PAGES));
  assert.ok(chips.every((c) => c.label));
});

test("authorChipsFromQuotes dedupes from results", () => {
  const names = authorChipsFromQuotes([
    { text: "One line long enough here.", author: "Ada", href: "https://example.com", source: "local" },
    { text: "Two line long enough here.", author: "Ada", href: "https://example.com", source: "local" },
    { text: "Three line long enough here.", author: "Bob", href: "https://example.com", source: "local" },
  ]);
  assert.deepEqual(names, ["Ada", "Bob"]);
});
