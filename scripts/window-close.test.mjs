import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// A JS `onCloseRequested` listener makes Tauri prevent the native close
// (tauri manager/window.rs: has_js_listener -> api.prevent_close()); the API
// then finishes the close with `destroy()`. Without `core:window:allow-destroy`
// that call is refused, so the X / Alt+F4 never closes the window.
test("windows that listen for close-requested may destroy themselves", () => {
  const listens = sources(join(root, "src")).filter((p) => readFileSync(p, "utf8").includes("onCloseRequested("));
  assert.ok(listens.length > 0, "expected a close-requested listener in src/");
  const cap = JSON.parse(readFileSync(join(root, "src-tauri/capabilities/default.json"), "utf8"));
  assert.ok(cap.windows.includes("*") || cap.windows.includes("main"), "capability must cover the main window");
  assert.ok(
    cap.permissions.includes("core:window:allow-destroy"),
    `onCloseRequested is used in ${listens.map((p) => p.slice(root.length + 1)).join(", ")} but core:window:allow-destroy is not granted`,
  );
});
