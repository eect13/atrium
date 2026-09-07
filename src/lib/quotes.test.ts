import assert from "node:assert/strict";
import { test } from "node:test";
import { authorSlug, parseBrainyHtml, parseBrainyRss } from "./quotes.ts";

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
