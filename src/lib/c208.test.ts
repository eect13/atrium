import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyRealmPatch, topLevelDiff } from "./realm-sync.ts";
import { fileMirror, parseFileBlob, pickLaunchBlob } from "./state-file.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("C208 floats returning: a move patch for a float main already closed does not bring it back", () => {
  const main = { windows: [{ id: "a", x: 0 }, { id: "b", x: 0 }] };
  // float b computed its move against the old list, then main closed b before the patch arrived
  const patch = topLevelDiff({ windows: main.windows }, { windows: [{ id: "a", x: 0 }, { id: "b", x: 40 }] });
  const afterClose = { windows: [{ id: "a", x: 0 }] };
  assert.deepEqual(applyRealmPatch(afterClose, patch), { windows: [{ id: "a", x: 0 }] });
  // the same patch still updates b while main has it
  assert.deepEqual(applyRealmPatch(main, patch), { windows: [{ id: "a", x: 0 }, { id: "b", x: 40 }] });
  // notes too
  assert.deepEqual(applyRealmPatch({ notes: [] }, { __items: { notes: { put: [{ id: "n1" }], del: [] } } }), { notes: [] });
});

test("C208 K1 launch pick: the file wins only when newer, or when localStorage lost the blob", () => {
  const f = { savedAt: 200, blob: "FILE" };
  assert.equal(pickLaunchBlob(f, null, 0), "FILE", "WebView2 lost atrium.v1 on a hard kill");
  assert.equal(pickLaunchBlob(f, "LS", 100), "FILE", "file newer");
  assert.equal(pickLaunchBlob(f, "LS", 200), null, "same save: keep localStorage");
  assert.equal(pickLaunchBlob(f, "LS", 300), null, "localStorage newer");
  assert.equal(pickLaunchBlob(null, "LS", 0), null);
  assert.equal(parseFileBlob("{torn"), null);
  assert.deepEqual(parseFileBlob(JSON.stringify(f)), f);
});

test("C208 K1 mirror: one write in flight, later saves coalesce, latest wins", async () => {
  const wrote: string[] = [];
  let release!: () => void;
  const m = fileMirror((t) => {
    wrote.push(t);
    return wrote.length === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve();
  });
  m("v1", 1);
  m("v2", 2);
  m("v3", 3);
  assert.equal(wrote.length, 1);
  release();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(wrote.map((t) => parseFileBlob(t)!.blob), ["v1", "v3"]);
});

test("C208 wiring: main-only mirror, restore before the store loads, Rust atomic write + commands", () => {
  const wire = read("src/lib/realm-wire.ts");
  assert.match(wire, /realmRole\(\) === "main"\s*\?\s*\{[\s\S]*mirrorStateToFile\(v\)/);
  const main = read("src/main.tsx");
  assert.ok(main.indexOf("await restoreStateFromFile()") < main.indexOf('import("./components/atrium-app")'));
  assert.doesNotMatch(main, /^import .*atrium-app/m, "store module loads only after the restore");
  const rs = read("src-tauri/src/state_file.rs");
  assert.match(rs, /sync_all\(\)[\s\S]*fs::rename\(/);
  assert.match(read("src-tauri/src/lib.rs"), /state_save, state_load\]/);
});
