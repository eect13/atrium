import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("C230 S1: desktop ⋯ popup uses the 1px --shadow-border ring and keeps the 8px margin", () => {
  const s = read("src/components/menu-window.tsx");
  assert.match(s, /cn\("shadow-\[var\(--shadow-border\)\]", m\.menuClassName\)/);
  assert.match(s, /const PAD = 8;/);
  assert.match(read("src/lib/menu-keys.ts"), /shadow-\[var\(--shadow-float\)\]/, "page menus keep --shadow-float");
});

test("C230 S2: float ⋯ rows are text-only (no icon row helper)", () => {
  const s = read("src/components/float-shell.tsx");
  assert.doesNotMatch(s, /const row = \(Icon/);
  assert.doesNotMatch(s, /label: row\(/);
  assert.match(s, /row: \{ label, checked: on, onSelect \}/);
});

test("C230 N1: spark up/down pills both /10", () => {
  const s = read("src/components/spark.tsx");
  assert.match(s, /"bg-ok\/10 text-ok" : "bg-destructive\/10 text-destructive"/);
});

test("C230 N3: weather credits name only the source that served (Form 229 strings)", () => {
  const s = read("src/components/weather-panel.tsx");
  assert.doesNotMatch(s, /fallback MET Norway/);
  assert.doesNotMatch(s, /US AQI\./);
  assert.match(s, /\{" · Places "\}/);
  assert.match(s, /\{" \(ODbL\) · Stays on this device"\}/);
});
