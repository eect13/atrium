import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { normalizeEvents, REMAP_CAT_ID } from "./event-cats.ts";
import { CRASHED_VIEW_KEY, markCrashedView, safeLaunchView } from "./view-crash.ts";
import { androidBack } from "./android-back.ts";

const root = new URL("../../", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("C199 Back: drawer first, then an open sheet/dialog (Escape), else not handled", () => {
  let closed = 0;
  const events: string[] = [];
  const doc = (open: string[]) => ({
    querySelectorAll: (sel: string) => open.filter((k) => sel.includes(`"${k}"`)),
    dispatchEvent: (e: { key: string }) => (events.push(e.key), true),
  }) as unknown as Document;
  (globalThis as { KeyboardEvent?: unknown }).KeyboardEvent ??= class { key: string; constructor(_t: string, i: { key: string }) { this.key = i.key; } };
  assert.equal(androidBack(true, () => closed++, doc(["sheet", "dialog"])), true);
  assert.equal(closed, 1, "drawer closes first");
  assert.deepEqual(events, [], "no Escape while the drawer was open");
  assert.equal(androidBack(false, () => closed++, doc(["sheet"])), true);
  assert.equal(androidBack(false, () => closed++, doc(["dialog"])), true);
  assert.deepEqual(events, ["Escape", "Escape"]);
  assert.equal(androidBack(false, () => closed++, doc([])), false, "nothing open → native default (exit)");
});

test("C199 native Back: tracked MainActivity, overlay into gen/, wired into the android build", async () => {
  const kt = read("src-tauri/android/MainActivity.kt");
  assert.match(kt, /override val handleBackNavigation: Boolean = false/);
  assert.match(kt, /OnBackPressedCallback\(true\)/);
  assert.match(kt, /evaluateJavascript\(.*window\.__atriumBack/);
  assert.match(kt, /if \(handled != "true"\) \{[\s\S]*isEnabled = false[\s\S]*onBackPressedDispatcher\.onBackPressed\(\)/);
  assert.match(read("scripts/tauri-before-build.mjs"), /android-overlay\.mjs/);
  assert.match(read("src/components/ui/sheet.tsx"), /data-atrium-layer="sheet"/);
  assert.match(read("src/components/ui/dialog.tsx"), /data-atrium-layer="dialog"/);
  const { applyOverlay } = (await import(join(root, "scripts/android-overlay.mjs"))) as { applyOverlay: (r: string) => string[] };
  const t = mkdtempSync(join(tmpdir(), "c199-"));
  mkdirSync(join(t, "src-tauri/android"), { recursive: true });
  writeFileSync(join(t, "src-tauri/android/MainActivity.kt"), "// tracked");
  assert.deepEqual(applyOverlay(t), [], "no gen/android → no-op");
  mkdirSync(join(t, "src-tauri/gen/android"), { recursive: true });
  const [dest] = applyOverlay(t);
  assert.ok(dest && existsSync(join(t, dest)));
  assert.equal(readFileSync(join(t, dest), "utf8"), "// tracked", "regenerated gen/ gets the tracked file");
  assert.match(read("docs/SETUP.md"), /src-tauri\/android/);
});

test("C199 reopen guard: a crashed Dashboard opens Options, not Dashboard", () => {
  const mem = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  markCrashedView("dashboard");
  assert.equal(safeLaunchView("dashboard", "dashboard", "options"), "options");
  assert.equal(mem.has(CRASHED_VIEW_KEY), false);
  markCrashedView("calendar");
  assert.equal(safeLaunchView("calendar", "dashboard", "options"), "dashboard");
  delete (globalThis as { localStorage?: unknown }).localStorage;
  assert.match(read("src/lib/store.ts"), /safeLaunchView\(toViewId\([^;]*"dashboard", "options"\)/);
});

test("C199 events: missing cat defaults to other on load; junk dropped; good events untouched", () => {
  const good = { id: "a", title: "Lunch", start: "2026-10-14T12:00", end: "2026-10-14T13:00", cat: "work", loc: "", source: "local" };
  const raw = [good, { id: "b", title: "No cat", start: "2026-10-15T09:00", end: "", loc: "", source: "local" }, { id: "c", start: "2026-10-16" }, null, { title: "no id" }];
  const out = normalizeEvents<typeof good>(raw);
  assert.equal(out.length, 3);
  assert.equal(out[0], good, "identity kept");
  assert.equal(out[1]!.cat, REMAP_CAT_ID);
  assert.deepEqual([out[2]!.cat, out[2]!.title, out[2]!.loc], [REMAP_CAT_ID, "", ""]);
  assert.deepEqual(normalizeEvents("nope", [good]), [good]);
  assert.match(read("src/lib/store.ts"), /events: normalizeEvents\(p\.events, current\.events\)/);
});

test("C199 tablet rail brand clears the status bar in the app", () => {
  assert.match(read("src/components/atrium-app.tsx"), /!floats && "pt-\[max\(env\(safe-area-inset-top\),1\.5rem\)\]/);
});
