/**
 * Card 228 (Scout 226 §3.7): live source health. One GET per Feed catalog source (sequential,
 * paced), with the same UA the app sends (feedHeaders). Prints a table and writes JSON.
 *   node --experimental-strip-types scripts/source-health.ts [--out file.json] [--only id,id] [--lib reqwest/0.12] [--path pc]
 * Card 233: `--lib` picks the UA library the app sends on that path (web = "Node.js/22 undici", desktop =
 * "reqwest/0.12"); `--path` labels where this run left from (box, pc, …) in the JSON summary.
 * Status: ok · flagged (catalog `blocked`, still answering 403) · unblocked (flagged but now OK:
 * clear the flag) · stale (latest item > 30 days) · empty · error. Exit 1 only with --strict when
 * an unflagged source is not ok.
 */
import { writeFileSync } from "node:fs";
import { NEWS_CATALOG, feedHeaders, parseRss } from "../src/lib/feeds.ts";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const only = arg("--only")?.split(",");
const out = arg("--out");
const STALE_DAYS = 30;
const LIB = arg("--lib") ?? "Node.js/22 undici";
const PATH_LABEL = arg("--path") ?? "box";
const rows: { id: string; name: string; url: string; http: number; items: number; latest: string; status: string; flagged: boolean; note: string }[] = [];

for (const f of NEWS_CATALOG) {
  if (only && !only.includes(f.id)) continue;
  const google = f.url.includes("news.google.com");
  let http = 0;
  let items = 0;
  let latest = "";
  let note = "";
  try {
    const res = await fetch(f.url, { headers: feedHeaders(f.url, LIB), redirect: "follow", signal: AbortSignal.timeout(15_000) });
    http = res.status;
    if (res.ok) {
      const parsed = parseRss(await res.text());
      items = parsed.length;
      const times = parsed.map((p) => Date.parse(p.date)).filter(Number.isFinite);
      if (times.length) latest = new Date(Math.max(...times)).toISOString();
    }
  } catch (e) {
    note = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e);
  }
  const ok = http >= 200 && http < 300;
  const stale = latest && Date.now() - Date.parse(latest) > STALE_DAYS * 86_400_000;
  let status = !ok ? "error" : !items ? "empty" : stale ? "stale" : "ok";
  if (f.blocked) status = status === "ok" ? "unblocked" : "flagged";
  rows.push({ id: f.id, name: f.name, url: f.url, http, items, latest, status, flagged: Boolean(f.blocked), note });
  console.log(`${status.padEnd(9)} ${String(http).padStart(3)} ${String(items).padStart(3)}  ${latest.slice(0, 16).padEnd(16)}  ${f.id}${note ? `  (${note})` : ""}`);
  await new Promise((r) => setTimeout(r, google ? 1000 : 400));
}

const count = (s: string) => rows.filter((r) => r.status === s).length;
const summary = { at: new Date().toISOString(), path: PATH_LABEL, lib: LIB, total: rows.length, ok: count("ok"), flagged: count("flagged"), unblocked: count("unblocked"), stale: count("stale"), empty: count("empty"), error: count("error") };
console.log(JSON.stringify(summary));
if (out) writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
if (process.argv.includes("--strict") && rows.some((r) => !r.flagged && r.status !== "ok")) process.exit(1);
