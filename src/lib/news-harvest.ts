import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { httpText } from "./http.ts";
import {
  asStories,
  fillRumorLane,
  NEWS_LANE_MIN,
  newsAsked,
  prepRelated,
  relatedNewsUrl,
  rumorFillUrls,
  rumorNewsUrls,
  wireName,
  type RelatedStory,
} from "./news.ts";
import { isPseiItem } from "./yahoo.ts";

export type RelatedDesk = {
  facts: RelatedStory[];
  rumors: RelatedStory[];
  earlier: RelatedStory[];
  missed: string[];
  asked: string[];
};

export type StoryBatch = { stories: RelatedStory[]; missed: string[] };
export type StoryPull = (urls: string[]) => Promise<StoryBatch>;

const HARVEST_TTL_MS = 10 * 60 * 1000;

type CacheRow = { at: number; desk: RelatedDesk };
const harvestCache = new Map<string, CacheRow>();

export function harvestCacheKey(item: { kind: string; symbol: string; label: string; name?: string }) {
  return [item.kind, item.symbol, item.label, item.name ?? ""].join("\n").toLowerCase();
}

export function clearHarvestCache() {
  harvestCache.clear();
}

async function pullStories(urls: string[]): Promise<StoryBatch> {
  const stories: RelatedStory[] = [];
  const missed: string[] = [];
  const size = 4;
  for (let i = 0; i < urls.length; i += size) {
    const batch = urls.slice(i, i + size);
    const got = await Promise.all(
      batch.map(async (url) => {
        try {
          return { url, rows: asStories(await httpText(url)), ok: true as const };
        } catch {
          return { url, rows: [] as RelatedStory[], ok: false as const };
        }
      }),
    );
    for (const row of got) {
      if (!row.ok) missed.push(wireName(row.url));
      else stories.push(...row.rows);
    }
    if (i + size < urls.length) await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return { stories, missed: [...new Set(missed)] };
}

async function loadHarvest(item: {
  label: string;
  symbol: string;
  name?: string;
  kind: string;
}, pull: StoryPull): Promise<RelatedDesk> {
  const urls: string[] = [];
  for (const window of ["1d", "7d", "30d"] as const) urls.push(relatedNewsUrl(item, window));
  const talk = item.kind === "stock" || item.kind === "global" || item.kind === "fx" || item.kind === "cmdty" || isPseiItem(item);
  if (talk) {
    urls.push(...rumorNewsUrls(item, "7d"));
    urls.push(...rumorNewsUrls(item, "30d"));
  }
  let pulled = await pull(urls);
  let related = prepRelated(pulled.stories, item);
  let picked = fillRumorLane(related);
  if (picked.rumors.length < NEWS_LANE_MIN && talk) {
    const more = await pull(rumorFillUrls(item, "30d"));
    pulled = {
      stories: [...pulled.stories, ...more.stories],
      missed: [...new Set([...pulled.missed, ...more.missed])],
    };
    related = prepRelated(pulled.stories, item);
    picked = fillRumorLane(related);
  }
  return { facts: picked.facts, rumors: picked.rumors, earlier: picked.earlier, missed: pulled.missed, asked: newsAsked(item) };
}

function worthCaching(desk: RelatedDesk) {
  const stories = desk.facts.length + desk.rumors.length + desk.earlier.length;
  return desk.missed.length === 0 && stories > 0;
}

/** A full harvest is reused for ten minutes. A named miss is not cached. */
export async function harvestRelatedStories(
  item: {
    label: string;
    symbol: string;
    name?: string;
    kind: string;
  },
  opts?: { pull?: StoryPull; now?: number },
): Promise<RelatedDesk> {
  const now = opts?.now ?? Date.now();
  const key = harvestCacheKey(item);
  const hit = harvestCache.get(key);
  if (hit && now >= hit.at && now - hit.at < HARVEST_TTL_MS) return hit.desk;
  const desk = await loadHarvest(item, opts?.pull ?? pullStories);
  if (worthCaching(desk)) harvestCache.set(key, { at: now, desk });
  return desk;
}

const relatedItem = z.object({
  label: z.string(),
  symbol: z.string(),
  name: z.string().optional(),
  kind: z.string(),
});

export const fetchRelatedStories = createServerFn({ method: "POST" })
  .validator(relatedItem)
  .handler(async ({ data }) => harvestRelatedStories(data));
