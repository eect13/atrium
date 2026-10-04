import assert from "node:assert/strict";
import { test } from "node:test";
import { clearHarvestCache, harvestRelatedStories, type StoryPull } from "./news-harvest.ts";
import type { RelatedStory } from "./news.ts";

function story(title: string, src = "Reuters"): RelatedStory {
  return {
    title,
    link: `https://example.com/${encodeURIComponent(title)}`,
    desc: "",
    date: new Date().toISOString(),
    src,
    lane: "fact",
  };
}

test("a full harvest is reused for ten minutes and a miss is not", async () => {
  clearHarvestCache();
  const t0 = 1_700_000_000_000;
  let calls = 0;
  const pull: StoryPull = async () => {
    calls += 1;
    return { stories: [story("BDO Unibank profit rises")], missed: [] };
  };
  const first = await harvestRelatedStories(
    { label: "BDO", symbol: "BDO", name: "BDO Unibank", kind: "stock" },
    { pull, now: t0 },
  );
  const once = calls;
  assert.ok(once >= 1);
  assert.ok(first.facts.length + first.rumors.length + first.earlier.length > 0);
  await harvestRelatedStories(
    { label: "BDO", symbol: "BDO", name: "BDO Unibank", kind: "stock" },
    { pull, now: t0 + 9 * 60_000 },
  );
  assert.equal(calls, once);

  const jpm: StoryPull = async () => {
    calls += 1;
    return { stories: [story("JPMorgan profit rises")], missed: [] };
  };
  await harvestRelatedStories(
    { label: "JPM", symbol: "JPM", name: "JPMorgan", kind: "stock" },
    { pull: jpm, now: t0 },
  );
  assert.ok(calls > once);

  clearHarvestCache();
  let missedCalls = 0;
  const miss: StoryPull = async () => {
    missedCalls += 1;
    return { stories: [], missed: ["Reuters"] };
  };
  const cost = { label: "COST", symbol: "COST", name: "Costco", kind: "stock" };
  const empty = await harvestRelatedStories(cost, { pull: miss, now: t0 });
  const afterMiss = missedCalls;
  assert.deepEqual(empty.missed, ["Reuters"]);
  const again = await harvestRelatedStories(cost, { pull: miss, now: t0 + 1_000 });
  assert.ok(missedCalls > afterMiss);
  assert.equal(again.missed.includes("Reuters"), true);

  clearHarvestCache();
  let partialCalls = 0;
  const partial: StoryPull = async () => {
    partialCalls += 1;
    return { stories: [story("Costco sales rise", "CNBC")], missed: ["Reuters"] };
  };
  await harvestRelatedStories(cost, { pull: partial, now: t0 });
  const afterPartial = partialCalls;
  await harvestRelatedStories(cost, { pull: partial, now: t0 + 1_000 });
  assert.ok(partialCalls > afterPartial);

  clearHarvestCache();
  let aged = 0;
  const aging: StoryPull = async () => {
    aged += 1;
    return { stories: [story("BDO Unibank profit rises")], missed: [] };
  };
  const bdo = { label: "BDO", symbol: "BDO", name: "BDO Unibank", kind: "stock" };
  await harvestRelatedStories(bdo, { pull: aging, now: t0 });
  const afterFresh = aged;
  await harvestRelatedStories(bdo, { pull: aging, now: t0 + 10 * 60_000 });
  assert.ok(aged > afterFresh);

  clearHarvestCache();
  let capped = 0;
  const capPull: StoryPull = async () => {
    capped += 1;
    return { stories: [story("Costco sales rise")], missed: [] };
  };
  for (let i = 0; i < 65; i++) {
    await harvestRelatedStories(
      { label: `N${i}`, symbol: `N${i}`, name: "Costco", kind: "stock" },
      { pull: capPull, now: t0 },
    );
  }
  const afterCap = capped;
  await harvestRelatedStories({ label: "N0", symbol: "N0", name: "Costco", kind: "stock" }, { pull: capPull, now: t0 });
  assert.ok(capped > afterCap);
  const newest = capped;
  await harvestRelatedStories({ label: "N64", symbol: "N64", name: "Costco", kind: "stock" }, { pull: capPull, now: t0 });
  assert.equal(capped, newest);
  clearHarvestCache();
});
