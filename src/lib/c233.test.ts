import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FEED_PACKS, NEWS_CATALOG, RETIRED_FEEDS, replaceRetiredFeeds, starterFeedIds } from "./feeds.ts";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const byId = (id: string) => NEWS_CATALOG.find((f) => f.id === id);

test("C233: BusinessMirror + MindaNews retired, official replacements in the catalog and PH pack", () => {
  assert.equal(byId("businessmirror"), undefined);
  assert.equal(byId("mindanews"), undefined);
  assert.equal(byId("malaya-biz")?.url, "https://malaya.com.ph/category/business/feed/");
  assert.equal(byId("malaya-biz")?.category, "Business");
  assert.equal(byId("mindanaotimes")?.url, "https://www.mindanaotimes.com.ph/feed/");
  assert.equal(RETIRED_FEEDS.businessmirror!.replacedBy, "malaya-biz");
  assert.equal(RETIRED_FEEDS.mindanews!.replacedBy, "mindanaotimes");
  const ph = FEED_PACKS.find((p) => p.id === "philippines")!.ids;
  assert.ok(ph.includes("malaya-biz") && ph.includes("mindanaotimes"));
  assert.ok(!ph.includes("businessmirror") && !ph.includes("mindanews"));
  const starter = starterFeedIds("PH");
  assert.ok(starter.includes("malaya-biz") && starter.includes("mindanaotimes"));
  assert.equal(NEWS_CATALOG.length, 83, "catalog size unchanged (health:sources total)");
  for (const id of ["malaya-biz", "mindanaotimes"]) {
    const p = byId(id)!.paths!;
    assert.equal(p.desktop, "ok");
    assert.equal(p.web, "unverified", "Vercel itself was not probed (no deploy)");
  }
  // No third-party relay / aggregator stands in for a refused publisher.
  for (const id of ["malaya-biz", "mindanaotimes"]) assert.doesNotMatch(byId(id)!.url, /feedburner|news\.google|rssing|freenewsapi/);
});

test("C233: saved retired rows move to the replacement (enabled kept); custom URLs untouched; no duplicates", () => {
  const saved = [
    { id: "inquirer", url: "https://www.inquirer.net/fullfeed/", name: "Inquirer", enabled: true },
    { id: "businessmirror", url: "https://businessmirror.com.ph/feed/", name: "BusinessMirror", enabled: true },
    { id: "mindanews", url: "https://example.org/my-own-mindanews.xml", name: "Mine", enabled: true },
  ];
  const out = replaceRetiredFeeds(saved);
  assert.deepEqual(out.map((f) => f.id), ["inquirer", "malaya-biz", "mindanews"]);
  assert.equal(out[1]!.enabled, true);
  assert.equal(out[1]!.url, "https://malaya.com.ph/category/business/feed/");
  assert.equal(out[2]!.url, "https://example.org/my-own-mindanews.xml", "a user's own feed with that id is left alone");
  const dup = replaceRetiredFeeds([
    { id: "mindanaotimes", url: "https://www.mindanaotimes.com.ph/feed/", enabled: false },
    { id: "mindanews", url: "https://www.mindanews.com/feed/", enabled: true },
  ]);
  assert.deepEqual(dup.map((f) => f.id), ["mindanaotimes"]);
  assert.match(read("src/lib/store.ts"), /feeds = replaceRetiredFeeds\(feeds\);/);
});

test("C233: fetch-path note + source-health path/lib labels", () => {
  const s = read("src/lib/feeds.ts");
  assert.match(s, /\*\*desktop\*\* \(Tauri\): Rust reqwest on the user's own machine/);
  assert.match(s, /\*\*web\*\*: the `fetchFeed` server fn on Vercel/);
  const h = read("scripts/source-health.ts");
  assert.match(h, /const LIB = arg\("--lib"\) \?\? "Node\.js\/22 undici";/);
  assert.match(h, /path: PATH_LABEL, lib: LIB/);
});
