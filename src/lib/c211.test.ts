import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileIsNewer, fileMirror, nextRev, parseFileBlob, pickLaunchBlob, SIDE_KEYS } from "./state-file.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("C211 rev: a counter that only goes up beats wall-clock compare (clock stepped back)", () => {
  assert.equal(nextRev(5, 3), 6);
  assert.equal(nextRev(undefined, undefined), 1);
  // Card 208 would have compared Date.now(): a later save at an earlier clock lost. Revs don't care.
  assert.equal(fileIsNewer({ rev: 8 }, { rev: 7 }), true);
  assert.equal(fileIsNewer({ rev: 7 }, { rev: 7 }), false);
});

test("C211 migration from Card 208 timestamp files", () => {
  const ts = 1_760_000_000_000;
  assert.equal(fileIsNewer({ savedAt: ts + 1 }, { savedAt: ts }), true, "both old: timestamps");
  assert.equal(fileIsNewer({ savedAt: ts }, { savedAt: ts + 1 }), false);
  assert.equal(fileIsNewer({ rev: 1 }, { savedAt: ts }), true, "new-build file beats an old-build localStorage");
  assert.equal(fileIsNewer({ savedAt: ts }, { rev: 1 }), false, "old-build file loses to new-build localStorage");
  assert.deepEqual(parseFileBlob(JSON.stringify({ savedAt: ts, blob: "B" })), { savedAt: ts, blob: "B" });
  assert.equal(pickLaunchBlob({ savedAt: ts, blob: "B" }, null, {}), "B");
  assert.equal(parseFileBlob(JSON.stringify({ blob: "B" })), null, "no stamp at all: ignored");
});

test("C211 side keys: main-window box and crash mark ride in the file and come back", () => {
  assert.deepEqual([...SIDE_KEYS], ["atrium.win", "atrium.crashedView"]);
  const f = parseFileBlob(JSON.stringify({ rev: 3, blob: "B", side: { "atrium.win": '{"x":1}', "atrium.crashedView": "calendar" } }));
  assert.equal(f?.side?.["atrium.crashedView"], "calendar");
  const sf = read("src/lib/state-file.ts");
  assert.match(sf, /for \(const k of SIDE_KEYS\)[\s\S]*localStorage\.setItem\(k, v\)/);
  assert.match(read("src/lib/native-session.ts"), /writeLocal\(KEY, JSON\.stringify\(box\)\);\s*mirrorStateToFile\(\)/);
  assert.match(read("src/lib/view-crash.ts"), /setItem\(CRASHED_VIEW_KEY, view\);\s*mirrorStateToFile\(\)/);
});

test("C211 retries exhausted → one non-blocking warning per failure run, then recovery", async () => {
  const warns: string[] = [];
  let fail = true;
  const m = fileMirror(() => (fail ? Promise.reject(new Error("busy: os error 32")) : Promise.resolve()), (w) => warns.push(w));
  const orig = console.warn;
  console.warn = () => {};
  m("a");
  await new Promise((r) => setTimeout(r, 0));
  m("b");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(warns.length, 1, "warned once");
  fail = false;
  m("c");
  await new Promise((r) => setTimeout(r, 0));
  fail = true;
  m("d");
  await new Promise((r) => setTimeout(r, 0));
  console.warn = orig;
  assert.equal(warns.length, 2, "a new failure after a success warns again");
  assert.match(read("src/components/atrium-app.tsx"), /onStateFileWarning\(\(message\) => toast\(message\)\)/);
});

test("C211 Rust: rename retry on sharing/access-denied, WM_ENDSESSION flush wired on Windows", () => {
  const rs = read("src-tauri/src/state_file.rs");
  assert.match(rs, /RENAME_BACKOFF_MS: \[u64; 6\] = \[10, 20, 40, 80, 160, 320\]/);
  assert.match(rs, /Some\(5\) \| Some\(32\)/);
  const lib = read("src-tauri/src/lib.rs");
  assert.match(lib, /WM_QUERYENDSESSION[\s\S]*write_pending\(\)/);
  assert.match(lib, /SetWindowSubclass/);
  assert.match(lib, /endsession::install\(app\.handle\(\), &win\)/);
});
