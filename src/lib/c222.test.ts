import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("C222 (1): useFloatsAllowed gates the website by the lg float layer width; native skips it", () => {
  const s = read("src/lib/use-platform.ts");
  assert.match(s, /FLOAT_WEB_Q = "\(min-width: 1024px\)"/);
  assert.match(s, /nativeWindows\(\)[\s\S]*return true;[\s\S]*matchMedia\(FLOAT_WEB_Q\)\.matches/);
  assert.match(read("src/components/atrium-app.tsx"), /fixed inset-0 hidden lg:block/, "float layer still lg (1024px)");
});

test("C222 (3): Open in Atrium raises main via Rust: unminimize, show, AllowSetForegroundWindow, on-top toggle, set_focus", () => {
  const d = read("src-tauri/src/desk.rs");
  assert.match(d, /pub fn focus_main[\s\S]*unminimize\(\)[\s\S]*show\(\)[\s\S]*AllowSetForegroundWindow\(ASFW_ANY\)[\s\S]*set_always_on_top\(true\)[\s\S]*set_focus\(\)[\s\S]*set_always_on_top\(false\)/);
  assert.match(d, /"open" => focus_main\(app\)/, "tray Open uses the same path");
  assert.match(read("src-tauri/src/lib.rs"), /generate_handler!\[[^\]]*desk_focus_main/);
});

test("C222 (4): calendar ⋯ label, ellipsis, create | go separator", () => {
  const s = read("src/components/calendar/calendar-toolbar.tsx");
  assert.match(s, /label="Calendar menu"/);
  // Card 242 (Form 241): Import ICS… · Add iCal link… · Export ICS │ Calendar options….
  assert.match(s, /groupItems\(\{\s*create: \[\s*\{ label: "Import ICS…"[\s\S]*\{ label: "Add iCal link…"[\s\S]*\{ label: "Export ICS"[\s\S]*go: \[\{ label: "Calendar options…"/);
  assert.doesNotMatch(s, /Calendar actions/);
});

test("C222 (5): TitleBar measures the card (parent border box), not the header", () => {
  const s = read("src/components/widget-shell.tsx");
  assert.match(s, /ref\.current\?\.parentElement \?\? ref\.current/);
  assert.match(s, /borderBoxSize/);
});
