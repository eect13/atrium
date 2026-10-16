import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { newDeskFlags, toggleDeskFlag } from "./desk-flags.ts";
import { applyRealmPatch, topLevelDiff } from "./realm-sync.ts";
import { normalizeDashPrefs, widgetLook } from "./widget-prefs.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("C212 defaults: all off (unlocked, not behind, frameless); stored defaults validated", () => {
  assert.deepEqual(widgetLook(undefined).deskNew, { lock: false, behind: false, frame: false });
  assert.deepEqual(newDeskFlags({ lock: false, behind: false, frame: false }), {});
  assert.deepEqual(newDeskFlags({ lock: true, behind: false, frame: true }), { locked: true, frame: true });
  const p = normalizeDashPrefs({ widgets: {}, look: { deskNew: { lock: true, behind: "yes", junk: 1 } } });
  assert.deepEqual(p.look, { deskNew: { lock: true } });
  assert.deepEqual(widgetLook(p).deskNew, { lock: true, behind: false, frame: false });
});

test("C212 Stay behind and Keep on top are exclusive; Lock and Frame toggle alone", () => {
  assert.deepEqual(toggleDeskFlag({ onTop: true }, "behind"), { behind: true, onTop: false });
  assert.deepEqual(toggleDeskFlag({ behind: true }, "onTop"), { onTop: true, behind: false });
  assert.deepEqual(toggleDeskFlag({ behind: true }, "behind"), { behind: false });
  assert.deepEqual(toggleDeskFlag({}, "locked"), { locked: true });
  assert.deepEqual(toggleDeskFlag({ frame: true }, "frame"), { frame: false });
});

test("C212 flags persist as window items through main (sole writer) and never resurrect a closed widget", () => {
  const before = { windows: [{ id: "w1", locked: false }] };
  const patch = topLevelDiff(before, { windows: [{ id: "w1", locked: true, behind: true }] });
  assert.deepEqual(applyRealmPatch(before, patch), { windows: [{ id: "w1", locked: true, behind: true }] });
  assert.deepEqual(applyRealmPatch({ windows: [] }, patch), { windows: [] });
  const store = read("src/lib/store.ts");
  assert.match(store, /unlockAllWindows: \(\) => set\(\(s\) => \(\{ windows: s\.windows\.map\(\(w\) => \(w\.locked \? \{ \.\.\.w, locked: false \} : w\)\) \}\)\)/);
  assert.match(store, /\.\.\.newDeskFlags\(widgetLook\(s\.dashPrefs\)\.deskNew\)/);
});

test("C212 a locked click-through widget can always be unlocked without the widget", () => {
  const rs = read("src-tauri/src/desk.rs");
  assert.match(rs, /set_ignore_cursor_events\(false\)/, "Rust clears click-through itself");
  assert.match(rs, /"unlock" => unlock_all\(app\)/, "tray route");
  assert.match(rs, /ShortcutState::Pressed && \*sc == unlock_shortcut\(\)[\s\S]*unlock_all\(app\)/, "shortcut route");
  assert.match(rs, /register\(unlock_shortcut\(\)\)\.is_ok\(\)/, "register failure is a bool, not a panic");
  const lib = read("src-tauri/src/lib.rs");
  assert.match(lib, /fn desk_unlock_all[\s\S]*desk::unlock_all\(&app\)/, "Options route");
  assert.match(lib, /let _ = desk::build_tray\(app\.handle\(\)\);/, "no tray never stops the app");
  assert.match(read("src/components/options-widgets.tsx"), /shortcut unavailable/);
  assert.match(read("src/components/atrium-app.tsx"), /is in use by another app\. Unlock widgets from the tray or Options › Widgets\./);
  const fs = read("src/components/float-shell.tsx");
  assert.match(fs, /win\.locked \? \{\} : \{ "data-tauri-drag-region": true \}/, "no drag while locked");
});

test("C212 capabilities desktop only; plugin pinned to the lock's tauri", () => {
  const desk = JSON.parse(read("src-tauri/capabilities/desktop.json"));
  for (const p of ["core:window:allow-set-ignore-cursor-events", "core:window:allow-set-always-on-bottom", "core:window:allow-set-shadow"]) assert.ok(desk.permissions.includes(p), p);
  const mob = JSON.parse(read("src-tauri/capabilities/mobile.json"));
  assert.deepEqual(mob.permissions, ["core:default"]);
  const cargo = read("src-tauri/Cargo.toml");
  assert.match(cargo, /features = \["image-png", "tray-icon"\]/);
  assert.match(cargo, /\[target\.'cfg\(any\(target_os = "macos", windows, target_os = "linux"\)\)'\.dependencies\][\s\S]*tauri-plugin-global-shortcut = ">=2\.3\.1, <2\.4"/);
  const lock = read("src-tauri/Cargo.lock");
  assert.match(lock, /name = "tauri"\nversion = "2\.11\.5"/);
});

test("C212 web/mobile: Options subsection sits inside the desktop-only gate", () => {
  const o = read("src/components/options-widgets.tsx");
  assert.match(o, /const floats = nativeWindows\(\);[\s\S]*\{floats \? \([\s\S]*<NewDesktopWidgets \/>/);
});
