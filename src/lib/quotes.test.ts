import assert from "node:assert/strict";
import { test } from "node:test";
import { authorSlug, liveQuotePool, normalizeQuoteTopic, parseBrainyHtml, parseBrainyRss } from "./quotes.ts";

const SNIP = `
<a href="/quotes/albert_einstein_121993" class="b-qt qt_121993 oncl_q" title="view quote">We cannot solve our problems with the same thinking we used when we created them.</a><a href="/authors/albert-einstein-quotes" class="bq-aut qa_121993 oncl_a" title="view author">Albert Einstein</a>
<a href="/quotes/albert_einstein_148817" class="b-qt qt_148817 oncl_q" title="view quote">Peace cannot be kept by force; it can only be achieved by understanding.</a><a href="/authors/albert-einstein-quotes" class="bq-aut qa_148817 oncl_a" title="view author">Albert Einstein</a>
`;

test("authorSlug folds names the way BrainyQuote does", () => {
  assert.equal(authorSlug("Albert Einstein"), "albert-einstein");
  assert.equal(authorSlug("Marcus Aurelius"), "marcus-aurelius");
  assert.equal(authorSlug("Dr. Maya Angelou"), "maya-angelou");
});

test("parseBrainyHtml reads b-qt / bq-aut pairs", () => {
  const quotes = parseBrainyHtml(SNIP);
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0]?.author, "Albert Einstein");
  assert.match(quotes[0]?.text ?? "", /same thinking/);
  assert.match(quotes[0]?.href ?? "", /albert_einstein_121993/);
  assert.equal(quotes[0]?.source, "brainyquote");
});

test("parseBrainyRss reads current title=author description=quote items", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Benjamin Disraeli</title><description>"I am prepared for the worst, but hope for the best."</description><link>https://www.brainyquote.com/authors/benjamin-disraeli-quotes</link></item>
  </channel></rss>`;
  const quotes = parseBrainyRss(xml);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0]?.author, "Benjamin Disraeli");
  assert.match(quotes[0]?.text ?? "", /prepared for the worst/);
});

test("parseBrainyRss still reads title — author items", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>Stay hungry. Stay foolish. - Steve Jobs</title><link>https://www.brainyquote.com/quotes/steve_jobs_1</link><description>Stay hungry. Stay foolish. - Steve Jobs</description></item>
  </channel></rss>`;
  const quotes = parseBrainyRss(xml);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0]?.author, "Steve Jobs");
  assert.match(quotes[0]?.text ?? "", /Stay hungry/);
});

test("liveQuotePool skips desk copies when the public feed is full", () => {
  const daily = Array.from({ length: 5 }, (_, i) => ({
    text: `Public line number ${i} is long enough.`,
    author: "Someone",
    href: "https://example.com",
    source: "brainyquote" as const,
  }));
  const local = [
    {
      text: "Desk copy that should stay out of Random.",
      author: "Local",
      href: "https://example.com",
      source: "local" as const,
    },
  ];
  const pool = liveQuotePool(daily, local);
  assert.equal(pool.length, 5);
  assert.ok(pool.every((q) => q.source === "brainyquote"));
});

test("liveQuotePool skips desk copies when any public line is live", () => {
  const daily = [
    {
      text: "Only one public line here is long enough.",
      author: "Someone",
      href: "https://example.com",
      source: "brainyquote" as const,
    },
  ];
  const local = [
    {
      text: "Desk copy that should stay out of Random.",
      author: "Local",
      href: "https://example.com",
      source: "local" as const,
    },
  ];
  const pool = liveQuotePool(daily, local);
  assert.equal(pool.length, 1);
  assert.equal(pool[0]?.source, "brainyquote");
});

test("liveQuotePool uses desk copies only when the public feed is empty", () => {
  const local = [
    {
      text: "Desk copy fills the quiet session.",
      author: "Local",
      href: "https://example.com",
      source: "local" as const,
    },
  ];
  const pool = liveQuotePool([], local);
  assert.equal(pool.length, 1);
  assert.equal(pool[0]?.source, "local");
});

test("normalizeQuoteTopic keeps known topics", () => {
  assert.equal(normalizeQuoteTopic("funny"), "funny");
  assert.equal(normalizeQuoteTopic("motivational"), "motivational");
  assert.equal(normalizeQuoteTopic("nope"), "all");
});
