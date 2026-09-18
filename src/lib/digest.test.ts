import assert from "node:assert/strict";
import { test } from "node:test";
import { asDigestStories, DIGEST_KEEP, mergeDigest, rememberDigest, type DigestDay } from "./digest.ts";

test("digest keeps ten unique headlines", () => {
  assert.equal(DIGEST_KEEP, 10);
  const rows = Array.from({ length: 16 }, (_, i) => ({
    title: `US stocks fact ${i}`,
    link: `https://example.com/${i}`,
    src: "Reuters",
    date: "2026-09-18T00:00:00Z",
  }));
  rows.push(rows[0]!);
  assert.equal(mergeDigest(rows).length, 10);
  assert.equal(mergeDigest(rows)[0]?.title, "US stocks fact 0");
});

test("rememberDigest replaces the same day and region, keeps last 10 days", () => {
  const days = Array.from({ length: 12 }, (_, i) => ({
    day: `2026-09-${String(i + 1).padStart(2, "0")}`,
    region: "US",
    market: "United States",
    asOf: "2026-09-18T00:00:00Z",
    items: [],
  }));
  const first = rememberDigest([], days[0]!);
  assert.equal(first.length, 1);
  const dup = rememberDigest(first, { ...days[0]!, items: [{ title: "A", link: "https://a", src: "R", date: "" }] });
  assert.equal(dup.length, 1);
  assert.equal(dup[0]?.items[0]?.title, "A");
  let hist: DigestDay[] = [];
  for (const d of days) hist = rememberDigest(hist, d);
  assert.equal(hist.length, 10);
  assert.equal(hist[0]?.day, "2026-09-12");
});

test("digest parser drops chart junk", () => {
  const xml = `<?xml version="1.0"?><rss><channel>
    <item><title>S&P 500 closes higher</title><link>https://reuters.com/1</link><source>Reuters</source><pubDate>Thu, 17 Sep 2026 12:00:00 GMT</pubDate></item>
    <item><title>AAPL Stock Price and Chart</title><link>https://tradingview.com/1</link><source>TradingView</source></item>
  </channel></rss>`;
  const rows = asDigestStories(xml);
  assert.equal(rows.length, 1);
  assert.match(rows[0]!.title, /S&P 500/);
});
