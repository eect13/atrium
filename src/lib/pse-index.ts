import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BLUECHIPS, PSEI_NAMES } from "./market-board.ts";
import { httpJson, isTauri } from "./http.ts";
import { APP_VERSION } from "./version.ts";

export type PseIndexSnap = {
  tickers: string[];
  names: Record<string, string>;
  asOf?: string;
  source: "live" | "seed";
};

const FETCH_MS = 5_000;

export function parsePseWikitext(wikitext: string): { ticker: string; name: string }[] {
  const chunk = wikitext.split(/==\s*Current components\s*==/i)[1] ?? wikitext;
  const table = chunk.split(/==\s*/)[0] ?? chunk;
  const rows: { ticker: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const block of table.split("|-")) {
    const tick = block.match(/\{\{\s*Pse\s*\|\s*([A-Z][A-Z0-9]{1,5})\s*\}\}/i);
    if (!tick) continue;
    const ticker = tick[1]!.toUpperCase();
    if (seen.has(ticker)) continue;
    const nameHit = block.match(/\[\[([^\|\]]+)(?:\|([^\]]+))?\]\]/);
    const name = (nameHit?.[2] || nameHit?.[1] || PSEI_NAMES[ticker] || ticker).replace(/\[\[|\]\]/g, "").trim();
    seen.add(ticker);
    rows.push({ ticker, name });
  }
  return rows;
}

const g = globalThis as typeof globalThis & {
  __atriumPseIndex?: { exp: number; data: PseIndexSnap };
};

function seedIndex(): PseIndexSnap {
  return {
    tickers: [...BLUECHIPS].toSorted(),
    names: { ...PSEI_NAMES },
    source: "seed",
  };
}

async function loadWikipedia(page: string): Promise<PseIndexSnap | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2`;
  const headers = {
    accept: "application/json",
    "user-agent": `Atrium/${APP_VERSION} (personal command center; PSEi constituents)`,
  };
  let json: { parse?: { wikitext?: string } };
  try {
    json = isTauri()
      ? await httpJson<{ parse?: { wikitext?: string } }>(url, headers)
      : await (async () => {
          const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_MS) });
          if (!res.ok) throw new Error(String(res.status));
          return res.json() as Promise<{ parse?: { wikitext?: string } }>;
        })();
  } catch {
    return null;
  }
  const text = json.parse?.wikitext ?? "";
  const rows = parsePseWikitext(text);
  if (rows.length < 20 || rows.length > 40) return null;
  const names: Record<string, string> = { ...PSEI_NAMES };
  for (const r of rows) names[r.ticker] = r.name;
  return {
    tickers: rows.map((r) => r.ticker),
    names,
    asOf: new Date().toISOString().slice(0, 10),
    source: "live",
  };
}

export const fetchPseIndex = createServerFn({ method: "POST" })
  .validator(z.object({ fresh: z.boolean().optional() }).optional())
  .handler(async ({ data }): Promise<PseIndexSnap> => {
    if (data?.fresh) g.__atriumPseIndex = undefined;
    const hit = g.__atriumPseIndex;
    if (hit && hit.exp > Date.now()) return hit.data;
    try {
      const live =
        (await loadWikipedia("PSE_Composite_Index")) ?? (await loadWikipedia("PSEi"));
      if (live) {
        g.__atriumPseIndex = { data: live, exp: Date.now() + 60 * 60_000 };
        return live;
      }
    } catch {
      /* seed */
    }
    const seed = seedIndex();
    g.__atriumPseIndex = { data: seed, exp: Date.now() + 15 * 60_000 };
    return seed;
  });
