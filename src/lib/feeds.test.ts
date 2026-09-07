import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanHeadline, keepStory, mixStories } from "./headline.ts";

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

