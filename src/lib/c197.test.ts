import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { groupBy } from "./group-by.ts";
import { CRASHED_VIEW_KEY, markCrashedView, safeLaunchView } from "./view-crash.ts";

const root = new URL("../../", import.meta.url).pathname;
const src = (p: string) => readFileSync(join(root, "src", p), "utf8");

test("C197 groupBy matches Object.groupBy's shape and order", () => {
  const g = groupBy([3, 1, 4, 1, 5, 9, 2, 6], (n) => (n % 2 ? "odd" : "even"));
  assert.deepEqual(Object.keys(g), ["odd", "even"]);
  assert.deepEqual(g.odd, [3, 1, 1, 5, 9]);
  assert.deepEqual(g.even, [4, 2, 6]);
  assert.equal(Object.getPrototypeOf(g), null);
  assert.deepEqual(groupBy([], () => "x"), Object.create(null));
});

// Baseline: Chrome / Android System WebView 110 (toSorted/toReversed/with/findLast/at are fine).
const BANNED: [RegExp, string][] = [
  [/\b(Object|Map)\.groupBy\(/, "Object/Map.groupBy (Chrome 117) → src/lib/group-by.ts"],
  [/\bPromise\.withResolvers\(/, "Promise.withResolvers (119)"],
  [/\bArray\.fromAsync\(/, "Array.fromAsync (121)"],
  [/\.(isWellFormed|toWellFormed)\(/, "String well-formed (111)"],
  [/\.(intersection|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/, "Set methods (122)"],
  [/\bnew Set\([^)]*\)\.(union|difference)\(/, "Set methods (122)"],
  [/\bIterator\.from\(/, "Iterator helpers (122)"],
];
function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(n) && !/\.test\./.test(n)) out.push(p);
  }
  return out;
}

test("C197 guard: no post-baseline built-ins in client source", () => {
  const hits: string[] = [];
  for (const f of walk(join(root, "src"))) {
    const t = readFileSync(f, "utf8");
    for (const [re, why] of BANNED) if (re.test(t)) hits.push(`${f.slice(root.length)}: ${why}`);
  }
  assert.deepEqual(hits, []);
  assert.match(readFileSync(join(root, "tsconfig.json"), "utf8"), /"lib":\s*\[\s*"ES2023"/, "typecheck rejects ES2024+ built-ins");
});

test("C197 crashed tab: next launch opens Dashboard once, other views untouched", () => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  assert.equal(safeLaunchView("calendar", "dashboard"), "calendar", "no mark");
  markCrashedView("calendar");
  assert.equal(mem.get(CRASHED_VIEW_KEY), "calendar");
  assert.equal(safeLaunchView("calendar", "dashboard"), "dashboard");
  assert.equal(mem.has(CRASHED_VIEW_KEY), false, "mark cleared");
  assert.equal(safeLaunchView("calendar", "dashboard"), "calendar", "one-shot");
  markCrashedView("feed");
  assert.equal(safeLaunchView("calendar", "dashboard"), "calendar", "a different crashed view doesn't redirect");
  delete (globalThis as { localStorage?: unknown }).localStorage;
  const app = src("components/atrium-app.tsx");
  assert.match(app, /<ViewCrash key=\{view\} view=\{view\}>/, "boundary resets per tab");
  assert.match(app, /markCrashedView\(this\.props\.view\)/);
  assert.match(src("lib/store.ts"), /safeLaunchView\(toViewId\(/);
});

test("C197 lows: toast 44px, one announcement, Back closes drawer, tablet hint + safe area, seal warning", () => {
  assert.match(src("styles.css"), /\[data-sonner-toast\] \[data-button\] \{\s*min-height: 44px;\s*min-width: 44px;/);
  const u = src("components/views/unfollow-undo.ts");
  assert.doesNotMatch(u, /announce\??[(:]|announce,/);
  assert.doesNotMatch(src("components/views/feed-topics.tsx"), /announce: setSaid/);
  const app = src("components/atrium-app.tsx");
  // Card 199 supersedes the history-marker approach with native Back → window.__atriumBack.
  assert.match(app, /w\.__atriumBack = \(\) => androidBack\(/);
  assert.match(app, /md:pointer-fine:inline/);
  assert.doesNotMatch(app, / md:inline">\s*\{modHint\}/);
  assert.match(app, /pt-\[max\(env\(safe-area-inset-top\),1\.5rem\)\]/);
  assert.match(app, /pr-\[env\(safe-area-inset-right\)\] pl-\[env\(safe-area-inset-left\)\]/);
  // Card 242: lib/calendar/device-secret.ts (Google session seal warning toast) was removed with the
  // Google client; the Rust commands stay (archive/google-calendar restores the client).
  const rs = readFileSync(join(root, "src-tauri/src/lib.rs"), "utf8");
  assert.match(rs, /spawn_blocking\(f\)/);
  assert.match(rs, /"sealWarning"/);
  assert.match(readFileSync(join(root, "docs/SETUP.md"), "utf8"), /Developer Mode/);
});
