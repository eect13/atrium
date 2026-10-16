import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DASH_REGISTRY } from "./dash.ts";
import { MENU_SLOTS, groupItems } from "./menu-groups.ts";
import { splitBar } from "./title-bar.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const row = (label: string, destructive = false) => ({ label, onSelect: () => {}, destructive });
const labels = (items: ReturnType<typeof groupItems>) => items.map((i) => (i.separator ? "|" : String(i.label)));

test("C219 F2: the in-page float ⋯ merges the widget view rows (same as native)", () => {
  const fw = read("src/components/float-window.tsx");
  assert.match(fw, /const viewRows = useViewRows\(viewKind \?\? ""\);/);
  assert.match(fw, /mergeGroups\(\{ view: viewRows \}, menu, \{ close: /);
  assert.match(read("src/components/desktop-layer.tsx"), /viewKind=\{win\.kind\}/);
});

test("C219 F3: notes float one at a time; Float all / Back to board only in the Notes ⋯", () => {
  const notes = DASH_REGISTRY.find((e) => e.id === "notes")!;
  const act = (a: string) => () => void a;
  assert.deepEqual(notes.menu!({ floats: true, manyOn: false, act }).window!.map((r) => r.label), ["Float all"]);
  assert.deepEqual(notes.menu!({ floats: true, manyOn: true, act }).window!.map((r) => r.label), ["Back to board"]);
  assert.deepEqual(notes.menu!({ floats: false, manyOn: false, act }).window, []);
  assert.match(read("src/lib/widget-menu.ts"), /e\.float && !e\.floatMany \?/);
  for (const f of ["src/components/desk-chrome.tsx", "src/components/views/dashboard-view.tsx", "src/components/views/notes-view.tsx"]) assert.doesNotMatch(read(f), /NotesFloatBtn/, f);
  assert.match(read("src/components/views/notes-view.tsx"), /onPin=\{floats \? \(\) => pinNote\(n\.id\) : undefined\}/, "each note keeps its own Float");
});

test("C219 F4: Colour… is the note float primary; Delete note last, destructive, own group; no TitleBar extra", () => {
  assert.equal(MENU_SLOTS.at(-1), "danger");
  const items = groupItems({ go: [row("Open in Atrium")], close: [row("Close")], danger: [row("Delete note", true)] });
  assert.deepEqual(labels(items), ["Open in Atrium", "|", "Close", "|", "Delete note"]);
  const color = { id: "color", group: "primary" as const, node: "C", row: row("Colour…") };
  assert.deepEqual(labels(splitBar([color], { close: [row("Close")] }, "xs").items), ["Colour…", "|", "Close"]);
  assert.deepEqual(splitBar([color], {}, "sm").inline.map((a) => a.id), ["color"]);
  const tools = read("src/components/note-float-tools.tsx");
  assert.match(tools, /id: "color",\s*group: "primary",\s*row: \{ label: "Colour…"/);
  assert.match(tools, /label: "Delete note", destructive: true/);
  assert.match(tools, /<NoteDelete [^>]*anchorOnly/, "the confirm still guards Delete");
  const shell = read("src/components/widget-shell.tsx");
  assert.doesNotMatch(shell, /\bextra\b/);
  for (const f of ["src/components/float-shell.tsx", "src/components/desktop-layer.tsx", "src/components/float-window.tsx"]) {
    const s = read(f);
    assert.doesNotMatch(s, /extra=\{/, f);
    assert.doesNotMatch(s, /<NoteTools/, f);
  }
  assert.match(read("src/components/float-shell.tsx"), /danger: \[noteTools\.deleteRow\]/);
  assert.match(read("src/components/desktop-layer.tsx"), /danger: \[tools\.deleteRow\]/);
});
