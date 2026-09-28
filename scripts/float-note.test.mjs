import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const layer = readFileSync(join(root, "src/components/desktop-layer.tsx"), "utf8");
const pad = readFileSync(join(root, "src/components/note-pad.tsx"), "utf8");
const board = readFileSync(join(root, "src/components/views/notes-view.tsx"), "utf8");

test("a floated note scrolls the body inside the column so it cannot cover the pencil", () => {
  const column = layer.indexOf('className="flex h-full min-h-0 flex-col"');
  const format = layer.indexOf("<NoteFormat", column);
  assert.ok(column > -1 && format > column);
  const body = layer.slice(column, format);
  assert.match(body, /min-h-0 flex-1 flex-col overflow-auto/);
  assert.match(body, /contained/);
  assert.doesNotMatch(body, /<NoteFormat/);
  assert.match(pad, /min-h-0 overflow-auto/);
});

test("board and list notes do not use the floated body scroller", () => {
  assert.doesNotMatch(board, /contained/);
});
