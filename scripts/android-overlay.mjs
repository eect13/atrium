#!/usr/bin/env node
// Card 199: copy tracked Android sources over the generated project (src-tauri/gen/android is
// git-ignored and recreated by `tauri android init`). Runs from tauri-before-build on android;
// safe to run by hand: `node scripts/android-overlay.mjs`. No-op when gen/android doesn't exist.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const OVERLAY = [["src-tauri/android/MainActivity.kt", "src-tauri/gen/android/app/src/main/java/app/atrium/desktop/MainActivity.kt"]];

export function applyOverlay(root = ROOT) {
  if (!existsSync(join(root, "src-tauri/gen/android"))) return [];
  const done = [];
  for (const [from, to] of OVERLAY) {
    mkdirSync(dirname(join(root, to)), { recursive: true });
    copyFileSync(join(root, from), join(root, to));
    done.push(to);
  }
  return done;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const done = applyOverlay();
  console.log(done.length ? `android overlay: ${done.join(", ")}` : "android overlay: no gen/android (run tauri android init first)");
}
