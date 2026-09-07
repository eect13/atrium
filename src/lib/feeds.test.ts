import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanHeadline, keepStory, mixStories, tagStory } from "./headline.ts";
import { discoverFeedHref, normalizeFeedUrl, candidateFeedUrls, parseRss } from "./feeds.ts";

test("drops emoji-only X titles", () => {
  assert.equal(keepStory({ title: "🤍🔥 - x.com", src: "X", category: "X" }), false);
  assert.equal(keepStory({ title: "Pushing for another 😤 - x.com", category: "X" }), false);
});

test("drops short meme X titles", () => {
  assert.equal(keepStory({ title: "Lion tamers. 👋 META Oakley - x.com", category: "X" }), false);
  assert.equal(keepStory({ title: "Goal for Everton. 2-2. - x.com", category: "X" }), false);
  assert.equal(keepStory({ title: "Your Chelsea XI. #CFC | #ARSCHE - x.com", category: "X" }), false);
});

test("drops X chrome pages", () => {
  assert.equal(
    keepStory({ title: "The White House (@WhiteHouse) on X - x.com", category: "X" }),
    false,
  );
  assert.equal(
    keepStory({
      title: "The X Rules: Safety, privacy, authenticity, and more - help.x.com",
      link: "https://help.x.com/en/rules",
      category: "X",
    }),
    false,
  );
});

test("keeps a real X briefing", () => {
  assert.equal(
    keepStory({
      title:
        "Thanks to the precision of American service members, the tanker sank in the Gulf of Oman today - x.com",
      category: "X",
    }),
    true,
  );
});

test("keeps ordinary news titles", () => {
  assert.equal(
    keepStory({
      title: "Zelensky says he expects war to continue into winter after talks with US envoys",
      src: "BBC World",
      category: "World",
    }),
    true,
  );
  assert.equal(
    keepStory({
      title: "PSE index closes higher",
      src: "Rappler",
      category: "PH",
    }),
    true,
  );
});

test("cleanHeadline strips the Google News x.com suffix", () => {
  assert.equal(cleanHeadline("Lion tamers. 👋 META Oakley - x.com"), "Lion tamers. 👋 META Oakley");
  assert.equal(
    cleanHeadline("The White House (@WhiteHouse) on X - x.com"),
    "The White House",
  );
});

test("mixStories round-robins sources", () => {
  const mixed = mixStories(
    [
      { title: "x1", src: "X", date: "2026-09-07T03:00:00Z" },
      { title: "x2", src: "X", date: "2026-09-07T02:00:00Z" },
      { title: "b1", src: "BBC World", date: "2026-09-07T01:00:00Z" },
      { title: "r1", src: "Rappler", date: "2026-09-06T20:00:00Z" },
    ],
    4,
  );
  assert.deepEqual(
    mixed.map((s) => s.title),
    ["x1", "b1", "r1", "x2"],
  );
});

test("tagStory labels sports business entertainment and PH", () => {
  assert.equal(tagStory({ title: "Gilas beats Japan in FIBA window", category: "Top" }), "Sports");
  assert.equal(tagStory({ title: "Netflix film opens to record box office", category: "Top" }), "Entertainment");
  assert.equal(tagStory({ title: "PSE index climbs as banks post earnings", category: "Top" }), "Markets");
  assert.equal(tagStory({ title: "Senate hears Malacañang budget", category: "World" }), "Philippines");
  assert.equal(tagStory({ title: "A quiet diplomatic note", category: "World" }), "World");
  assert.equal(tagStory({ title: "Chip foundry expands in Taiwan", category: "Tech" }), "Tech");
  assert.equal(tagStory({ title: "A quiet diplomatic note", category: "Philippines" }), "Philippines");
});

test("normalizeFeedUrl adds https and rejects junk", () => {
  assert.equal(normalizeFeedUrl("inquirer.net/feed/"), "https://inquirer.net/feed/");
  assert.equal(normalizeFeedUrl("https://techcrunch.com/feed/"), "https://techcrunch.com/feed/");
  assert.equal(normalizeFeedUrl("not a url"), undefined);
});

test("discoverFeedHref finds alternate RSS", () => {
  const html = `<html><head><link rel="alternate" type="application/rss+xml" title="News" href="/rss.xml"></head></html>`;
  assert.equal(discoverFeedHref(html, "https://example.com/"), "https://example.com/rss.xml");
});

test("candidateFeedUrls expands a bare site name", () => {
  const urls = candidateFeedUrls("inquirer");
  assert.ok(urls.some((u) => u.includes("inquirer.com")));
  assert.ok(urls.some((u) => u.includes("inquirer.net")));
});

test("parseRss reads channel items", () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>Desk</title>
    <item><title>Hello</title><link>https://ex.com/1</link><description>Body</description></item>
  </channel></rss>`;
  const items = parseRss(xml);
  assert.equal(items[0]?.title, "Hello");
  assert.equal(items[0]?.link, "https://ex.com/1");
});

