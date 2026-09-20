/** Daily finance digest for the desk region. RSS only — not an AI brief, not a newsroom. */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseRss } from "./feeds.ts";
import { cleanHeadline } from "./headline.ts";
import { httpText } from "./http.ts";
import { deskMarket, digestUrl } from "./desk-market.ts";
import { isoDate } from "./format.ts";

export const DIGEST_KEEP = 10;

export type DigestStory = {
  title: string;
  link: string;
  src: string;
  date: string;
};

export type DigestDay = {
  day: string;
  region: string;
  market: string;
  asOf: string;
  items: DigestStory[];
};

const JUNK =
  /tradingview|stock price and chart|credit cards?|referral|raffle|live better with|pay mo na|yu-?gi-?oh|yugioh|snkrdunk|extended art|trading card|pokemon tcg|cardfight|one piece card|merch store|\bebay\b|stockx/i;

/** Card-game / merch hits that steal the PSE ticker, plus generic chart spam. */
export function digestNoise(title: string, src = "", link = "") {
  const blob = `${title} ${src} ${link}`;
  if (JUNK.test(blob)) return true;
  if (/\bPSE\s*:/i.test(title) && !/\b(PSEi|Philippine Stock|Manila|PSEI)\b/i.test(title)) return true;
  return false;
}

export function asDigestStories(xml: string): DigestStory[] {
  return parseRss(xml)
    .filter((s) => s.title && !/^untitled$/i.test(s.title) && !digestNoise(s.title, s.source || "", s.link))
    .map((s) => ({
      title: cleanHeadline(s.title) || s.title,
      link: s.link,
      src: s.source || "Google News",
      date: s.date,
    }))
    .filter((s) => s.title && s.link);
}

export function mergeDigest(rows: DigestStory[], keep = DIGEST_KEEP) {
  const seen = new Set<string>();
  const out: DigestStory[] = [];
  for (const row of rows) {
    const key = `${row.link}|${row.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= keep) break;
  }
  return out;
}

export function rememberDigest(history: DigestDay[], next: DigestDay, cap = DIGEST_KEEP): DigestDay[] {
  const rest = history.filter((d) => !(d.day === next.day && d.region === next.region));
  return [next, ...rest].slice(0, cap);
}

async function pull(url: string) {
  try {
    return asDigestStories(await httpText(url));
  } catch {
    return [] as DigestStory[];
  }
}

export async function harvestDigest(region: string, now = new Date()): Promise<DigestDay> {
  const m = deskMarket(region);
  const gathered = [...(await pull(digestUrl(region, "1d"))), ...(await pull(digestUrl(region, "7d")))];
  const items = mergeDigest(gathered);
  return {
    day: isoDate(now),
    region: m.id,
    market: m.name,
    asOf: now.toISOString(),
    items,
  };
}

export const fetchFinanceDigest = createServerFn({ method: "POST" })
  .validator(z.object({ region: z.string().min(1).max(8) }))
  .handler(async ({ data }) => harvestDigest(data.region));
