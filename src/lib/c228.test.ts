import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CalendarApiError } from "./calendar/google-source.ts";
import { isSessionReject, renewWithRetry, RENEW_BACKOFF_MS } from "./calendar/session-renew.ts";
import { placeMenu } from "./native-menu.ts";
import { NEWS_CATALOG, feedHeaders, starterFeedIds } from "./feeds.ts";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const noSleep = async () => {};

test("C228 B2: only an explicit server reject signs the device out", async () => {
  assert.ok(isSessionReject(new CalendarApiError(401, "disconnected")));
  assert.ok(isSessionReject(new CalendarApiError(400, "invalid_grant")));
  assert.ok(!isSessionReject(new CalendarApiError(0, "offline")));
  assert.ok(!isSessionReject(new CalendarApiError(503, "http_503")));
  const rejected = await renewWithRetry(() => Promise.reject(new CalendarApiError(401, "disconnected")), noSleep);
  assert.equal(rejected.outcome, "rejected");
});

test("C228 B2: network / 5xx / 409 retry with backoff, then stay 'transient' (handle kept)", async () => {
  for (const e of [new CalendarApiError(0, "offline"), new CalendarApiError(502, "http_502"), new CalendarApiError(409, "retry"), new TypeError("fetch failed")]) {
    let n = 0;
    const waits: number[] = [];
    const r = await renewWithRetry(
      () => {
        n++;
        return Promise.reject(e);
      },
      async (ms) => void waits.push(ms),
    );
    assert.equal(r.outcome, "transient");
    assert.equal(n, RENEW_BACKOFF_MS.length + 1);
    assert.deepEqual(waits, [...RENEW_BACKOFF_MS]);
  }
  let n = 0;
  const ok = await renewWithRetry(() => (++n < 3 ? Promise.reject(new CalendarApiError(0, "offline")) : Promise.resolve({ access: "a", accessExp: 1 })), noSleep);
  assert.equal(ok.outcome, "ok");
  const acc = read("src/lib/calendar/accounts.ts");
  assert.match(acc, /if \(r\.outcome === "rejected"\) await forgetDevice\(\);/);
  assert.match(acc, /c\.native && !c\.session && lastRenew === "transient" \? \{ state: "unreachable"/, "no Bearer-less /status after a transient renew failure");
});

test("C228 B3: Google web sign-in lands on a real route", () => {
  assert.match(read("src/lib/calendar/api.server.ts"), /location: `\$\{cfg\.origin\}\/\?view=calendar&accounts=1`/);
  const app = read("src/components/atrium-app.tsx");
  assert.match(app, /q\.get\("view"\)[\s\S]*setView\(toViewId\(v,/);
  assert.match(app, /window\.name === "atrium-google"[\s\S]*window\.close\(\)/);
});

test("C228 B8/B12: Add note focuses the new note's title; swatches are named by colour", () => {
  const s = read("src/components/views/notes-view.tsx");
  assert.match(s, /addNote\(\{\s*id,[\s\S]*requestAnimationFrame\([\s\S]*\[data-note-id="\$\{id\}"\] input\[aria-label="Note title"\][\s\S]*\.focus\(\)/);
  assert.match(s, /aria-label=\{`Add \$\{NOTE_COLOR_NAMES\[i\]/);
  assert.equal(new Set(read("src/lib/format.ts").match(/NOTE_COLOR_NAMES = \[([^\]]+)\]/)![1].split(",")).size, 6);
});

test("C228 P3 a11y: calendar rows, out-of-month contrast, finance name, ellipses", () => {
  const tiles = read("src/components/calendar-tiles.tsx");
  assert.match(tiles, /role="row" className="contents">\s*\{cells\.slice\(w \* 7, w \* 7 \+ 7\)/);
  assert.doesNotMatch(tiles + read("src/components/calendar/month-grid.tsx"), /text-muted-foreground\/60/);
  assert.match(read("src/components/views/finance-markets.tsx"), /"Live, refresh prices"/);
  assert.match(read("src/components/spark.tsx"), /bg-ok\/10 text-ok/);
  const tb = read("src/components/calendar/calendar-toolbar.tsx");
  // Card 235: labels now depend on features.googleCalendar; both forms keep the ellipsis.
  assert.match(tb, /\{g \? "Import ICS…" : "Import calendar…"\}\s*<\/Button>/);
  assert.match(tb, /\{g \? "Accounts…" : "Calendars…"\}\s*<\/Button>/);
});

test("C228 Android: cargo metadata JSON is read from stdout only; Desktop copy can be skipped", () => {
  const s = read("scripts/pack-android.mjs");
  assert.equal((s.match(/JSON\.parse\(meta\.stdout\)/g) ?? []).length, 2);
  assert.doesNotMatch(s, /JSON\.parse\(meta\.out\)/);
  assert.match(s, /--no-vibe-copy/);
});

test("C228 feeds: CBC plain UA, Tuoi Tre direct RSS, BusinessMirror + MindaNews flagged and off by default", () => {
  assert.doesNotMatch(feedHeaders("https://www.cbc.ca/webfeed/rss/rss-world", "x")["User-Agent"], /\(|github/);
  assert.match(feedHeaders("https://feeds.bbci.co.uk/news/world/rss.xml", "x")["User-Agent"], /\(https:\/\/github\.com\/eect13\/atrium\/issues\)/);
  assert.equal(NEWS_CATALOG.find((f) => f.id === "tuoitre")!.url, "https://tuoitrenews.vn/rss");
  // Card 233: BusinessMirror + MindaNews refused every path and were retired (replaced), so nothing is flagged now;
  // the flag mechanism itself still keeps a flagged id out of the starter set (see c233.test.ts).
  assert.deepEqual(NEWS_CATALOG.filter((f) => f.blocked).map((f) => f.id), []);
  const ph = starterFeedIds("PH");
  assert.ok(!ph.includes("businessmirror") && !ph.includes("mindanews") && ph.includes("inquirer"));
  assert.match(read("package.json"), /"health:sources": "node --experimental-strip-types scripts\/source-health\.ts"/);
});

test("C228 weather: repo contact UA, Nominatim gated (≤1/s, cached, explicit only), credits", () => {
  const w = read("src/lib/weather.ts");
  assert.match(w, /WEATHER_CONTACT = "https:\/\/github\.com\/eect13\/atrium"/);
  assert.doesNotMatch(w.match(/export const UA = [^\n]+/)![0], /@/);
  assert.equal((w.match(/nominatim\.openstreetmap\.org/g) ?? []).length, 2);
  assert.match(w, /NOMINATIM_GAP_MS = 1_100/);
  assert.equal((w.match(/await nominatimGet\(url\)/g) ?? []).length, 2, "every Nominatim call goes through the gate");
  assert.match(w, /lookupZippopotam\(postal, countries\)\) \?\? \(explicit \? await lookupNominatimPostal/);
  assert.match(read("src/components/place-field.tsx"), /explicit: true/);
  const p = read("src/components/weather-panel.tsx");
  for (const s of ["https://open-meteo.com/", "https://creativecommons.org/licenses/by/4.0/", "MET Norway", "https://www.openstreetmap.org/copyright"]) assert.ok(p.includes(s), s);
});

test("C228 B5–B7: OverflowMenu portals and places with floating-ui (bottom-end, flip/shift/size, 8px)", () => {
  const s = read("src/components/ui/overflow-menu.tsx");
  assert.match(s, /createPortal\(/);
  assert.match(s, /placement: "bottom-end"/);
  assert.match(s, /flip\(\{ padding: 8 \}\)[\s\S]*shift\(\{ padding: 8 \}\)[\s\S]*size\(\{\s*padding: 8/);
  assert.match(s, /max-h-\[calc\(100dvh-16px\)\]/);
  assert.match(read("src/lib/menu-keys.ts"), /MENU_PANEL = "[^"]*overflow-y-auto overscroll-contain"/);
  assert.match(read("src/components/menu-window.tsx"), /<MenuPanel/, "the popup window reuses the same panel");
  assert.match(read("package.json"), /"@floating-ui\/react-dom": "\^2\.1\.9"/);
  assert.match(read("package-lock.json"), /"node_modules\/@floating-ui\/react-dom": \{\s*"version": "2\.1\.9"/);
});

test("C228 B4: desktop float ⋯ popup window — placement flips, shifts and caps inside the work area", () => {
  const work = { x: 0, y: 0, w: 1920, h: 1040 };
  const below = placeMenu({ x: 1000, y: 100, w: 44, h: 44 }, { w: 240, h: 400 }, work, 1);
  assert.deepEqual([below.x, below.y, below.flipped], [1044 - 240, 148, false]);
  const up = placeMenu({ x: 1000, y: 900, w: 44, h: 44 }, { w: 240, h: 400 }, work, 1);
  assert.equal(up.flipped, true);
  assert.equal(up.y + up.h, 896);
  const edge = placeMenu({ x: 10, y: 100, w: 44, h: 44 }, { w: 240, h: 300 }, work, 1);
  assert.equal(edge.x, 8);
  const tall = placeMenu({ x: 1000, y: 500, w: 44, h: 44 }, { w: 240, h: 5000 }, work, 1.5);
  assert.ok(tall.h <= work.h - 24 && tall.y >= 12 && tall.y + tall.h <= work.h - 12);
  const rs = read("src-tauri/src/desk.rs");
  assert.match(rs, /WebviewWindowBuilder::new\(app, MENU_LABEL, tauri::WebviewUrl::App\("index\.html\?float=menu"/);
  assert.match(rs, /\.decorations\(false\)[\s\S]*\.skip_taskbar\(true\)[\s\S]*\.always_on_top\(true\)[\s\S]*\.visible\(false\)/);
  assert.match(rs, /set_ignore_cursor_events\(false\)/);
  assert.match(read("src-tauri/src/lib.rs"), /create_menu_window\(app\.handle\(\)\)[\s\S]*WindowEvent::Destroyed[\s\S]*m\.destroy\(\)/);
  const mw = read("src/components/menu-window.tsx");
  assert.match(mw, /monitorFromPoint\([\s\S]*workArea[\s\S]*placeMenu\(/);
  assert.match(mw, /setIgnoreCursorEvents\(false\)/);
  assert.match(mw, /onFocusChanged\(\(e\) => \(!e\.payload/);
  const cap = JSON.parse(read("src-tauri/capabilities/desktop.json")) as { permissions: string[] };
  for (const p of ["current-monitor", "monitor-from-point", "outer-position", "scale-factor", "is-focused"]) assert.ok(cap.permissions.includes(`core:window:allow-${p}`), p);
  const nf = read("src/lib/native-float.ts");
  assert.match(nf, /w\.label === self \|\| w\.label === "menu"/, "float boxes skip the popup");
  assert.match(nf, /closeAllNativeFloats\(\{ withMenu: true \}\)/, "exit closes the popup too");
});
