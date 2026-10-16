import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DASH_REGISTRY, FLOAT_VIEW } from "./dash.ts";
import { groupItems, mergeGroups } from "./menu-groups.ts";
import { INLINE_AT, STEP_PX, splitBar, stepFor, type BarAction } from "./title-bar.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const row = (label: string) => ({ label, onSelect: () => {} });
const A: BarAction<string>[] = [
  { id: "behind", group: "flags", node: "B", row: row("Stay behind windows") },
  { id: "float", group: "float", node: "F", row: row("Float") },
  { id: "lock", group: "flags", node: "L", row: row("Lock position") },
  { id: "primary", group: "primary", node: "+", row: row("New note") },
];
const G = { view: [row("Board")], go: [row("Notes options…")] };
const labels = (items: ReturnType<typeof groupItems>) => items.map((i) => (i.separator ? "|" : String(i.label)));

test("C217/216b steps: <220 xs · 220–299 sm · 300–419 md · ≥420 lg; phone caps at sm; Compact = xs", () => {
  assert.deepEqual(STEP_PX, { sm: 220, md: 300, lg: 420 });
  assert.equal(stepFor(219), "xs");
  assert.equal(stepFor(220), "sm");
  assert.equal(stepFor(299), "sm");
  assert.equal(stepFor(300), "md");
  assert.equal(stepFor(419), "md");
  assert.equal(stepFor(420), "lg");
  assert.equal(stepFor(900, { phone: true }), "sm");
  assert.equal(stepFor(200, { phone: true }), "xs");
  assert.equal(stepFor(900, { compact: true }), "xs");
  assert.deepEqual(INLINE_AT, { primary: "sm", float: "md", flags: "lg" });
});

test("C217/216b inline per step, priority primary > Float > Lock > Stay behind; overflow in ⋯ in §5 order, never both", () => {
  const at = (s: "xs" | "sm" | "md" | "lg") => splitBar(A, G, s);
  assert.deepEqual(at("xs").inline.map((a) => a.id), []);
  assert.deepEqual(labels(at("xs").items), ["New note", "|", "Board", "|", "Float", "Lock position", "Stay behind windows", "|", "Notes options…"]);
  assert.deepEqual(at("sm").inline.map((a) => a.id), ["primary"]);
  assert.deepEqual(labels(at("sm").items), ["Board", "|", "Float", "Lock position", "Stay behind windows", "|", "Notes options…"]);
  assert.deepEqual(at("md").inline.map((a) => a.id), ["primary", "float"]);
  assert.deepEqual(labels(at("md").items), ["Board", "|", "Lock position", "Stay behind windows", "|", "Notes options…"]);
  assert.deepEqual(at("lg").inline.map((a) => a.id), ["primary", "float", "lock", "behind"]);
  assert.deepEqual(labels(at("lg").items), ["Board", "|", "Notes options…"]);
  for (const s of ["xs", "sm", "md", "lg"] as const) {
    const { inline, items } = at(s);
    const menu = new Set(labels(items));
    for (const a of inline) assert.ok(!menu.has(String(a.row.label)), `${s}: ${a.id} in two places`);
    assert.equal(inline.length + [...menu].filter((l) => A.some((a) => a.row.label === l)).length, A.length, `${s}: every action somewhere`);
  }
});

test("C217 §5 groups: order create·view·window·go·close, separators only between non-empty groups", () => {
  const items = groupItems(mergeGroups({ close: [row("Close")] }, { create: [] }, { view: [row("Seconds")] }, { go: [row("Open in Atrium")] }));
  assert.deepEqual(labels(items), ["Seconds", "|", "Open in Atrium", "|", "Close"]);
  assert.deepEqual(groupItems({}), []);
});

test("C217 registry: view, primary, floatMany, menu; float kinds land on a page", () => {
  for (const e of DASH_REGISTRY) assert.ok(e.view, e.id);
  const notes = DASH_REGISTRY.find((e) => e.id === "notes")!;
  assert.equal(notes.primary, "new-note");
  assert.equal(notes.floatMany, true);
  assert.equal(typeof notes.menu, "function");
  assert.equal(FLOAT_VIEW.quote, "quotes");
  assert.equal(FLOAT_VIEW.news, "news");
});

test("C217 one ⋯ component: no hand-rolled role=menu; one ResizeObserver in the shared TitleBar", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) files.push(p);
    }
  };
  walk(new URL("../components", import.meta.url).pathname);
  const menus = files.filter((f) => /role="menu"/.test(readFileSync(f, "utf8"))).map((f) => f.split("/components/")[1]);
  assert.deepEqual(menus, ["ui/overflow-menu.tsx"]);
  const ros = files.filter((f) => /new ResizeObserver/.test(readFileSync(f, "utf8"))).map((f) => f.split("/components/")[1]);
  assert.ok(ros.includes("widget-shell.tsx"));
  const shell = read("src/components/widget-shell.tsx");
  assert.match(shell, /data-step=\{step\}/);
  assert.match(shell, /gap-2/);
  assert.match(shell, /gap-1/);
  for (const f of ["src/components/views/dashboard-view.tsx", "src/components/float-shell.tsx", "src/components/float-window.tsx"]) assert.match(read(f), /<TitleBar/, f);
  assert.doesNotMatch(read("src/components/views/dashboard-view.tsx"), /id === "notes"|GripVertical|items-start/);
});

test("C217 floats: Open in Atrium + Close in ⋯; Ctrl+W/Esc; AppWindow pop-out on notes; Feed has Float; touch shows ⋯", () => {
  const fs = read("src/components/float-shell.tsx");
  assert.match(fs, /Open in Atrium/);
  assert.match(fs, /e\.key\.toLowerCase\(\) === "w"/);
  assert.doesNotMatch(fs, /CloseButton/);
  assert.match(read("src/components/note-chrome.tsx"), /<AppWindow/);
  assert.doesNotMatch(read("src/components/note-chrome.tsx"), /PinOff/);
  assert.match(read("src/components/views/feed-view.tsx"), /<FloatBtn kind="news" \/>/);
  assert.match(read("src/lib/widget-menu.ts"), /\[@media\(hover:none\)\]:opacity-100/);
  const oa = read("src/lib/open-in-atrium.ts");
  // Card 222: the raise moved to Rust (desk_focus_main → desk::focus_main) for the Windows foreground lock.
  assert.match(oa, /invoke\("desk_focus_main"\)[\s\S]*emitTo\("main", OPEN_VIEW_EVENT/);
});

test("C217 notes: no stickies copy; peek opens the tapped note and shows +N", () => {
  const w = read("src/components/widgets.tsx");
  assert.doesNotMatch(w, /No stickies/);
  assert.match(w, /No notes yet\./);
  assert.match(w, /onClick=\{\(\) => openNote\(n\.id\)\}/);
  assert.match(w, /\+\{more\} more/);
});

test("C217 R-b: tray Quit goes through main's capture + state-file save, then desk_quit; timed fallback", () => {
  const desk = read("src-tauri/src/desk.rs");
  assert.match(desk, /"quit" => \{[\s\S]*emit_to\("main", QUIT_EVENT[\s\S]*QUIT_GRACE[\s\S]*quit_now/);
  assert.match(desk, /pub fn quit_now[\s\S]*write_pending\(\)[\s\S]*app\.exit\(0\)/);
  assert.match(read("src-tauri/src/lib.rs"), /fn desk_quit[\s\S]*desk::quit_now/);
  const sess = read("src/lib/native-session.ts");
  assert.match(sess, /listen\(QUIT_EVENT[\s\S]*await save\(\);[\s\S]*await beforeExit\?\.\(\);[\s\S]*await flushStateFile\(\);[\s\S]*invoke\("desk_quit"\)/);
});
