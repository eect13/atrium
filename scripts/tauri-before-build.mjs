#!/usr/bin/env node
/**
 * Tauri hooks (cwd-safe).
 *   node scripts/tauri-before-build.mjs          # Vite SPA for desktop
 *   node scripts/tauri-before-build.mjs bundle   # after cargo
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATIC = join(ROOT, ".vercel", "output", "static");
const INDEX = join(STATIC, "index.html");
const phase = process.argv[2] === "bundle" ? "bundle" : "frontend";

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function banner(title, body) {
  console.log(`
========================================
 ${title}
========================================
${body}`);
}

if (phase === "bundle") {
  banner(
    "Atrium — phase 3/3: write installers",
    "  Rust finished. Packing NSIS next.\n  Leave this window open until Explorer opens the bundle folder.\n",
  );
  process.exit(0);
}

banner("Atrium — phase 1/3: pack the UI", "  Vite desktop bundle (not the website SSR build).\n");

const tauriEnv = {
  ...process.env,
  TAURI_ENV_PLATFORM:
    process.env.TAURI_ENV_PLATFORM || process.env.TAURI_PLATFORM || process.env.TAURI_ENV_FAMILY || "desktop",
};

const vite = spawnSync(
  process.execPath,
  [join(ROOT, "scripts", "with-app-env.mjs"), "vite", "build"],
  { cwd: ROOT, stdio: "inherit", env: tauriEnv, windowsHide: true },
);
if ((vite.status ?? 1) !== 0) fail("Vite desktop build failed.");

const indexScript = spawnSync(process.execPath, [join(ROOT, "scripts", "ensure-tauri-index.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
  env: tauriEnv,
  windowsHide: true,
});
if ((indexScript.status ?? 1) !== 0) fail("Could not write index.html for Tauri.");

if (!existsSync(INDEX)) fail("index.html missing after the UI pack — Tauri would open a blank window.");
const html = readFileSync(INDEX, "utf8");
if (!html.includes("atrium-root") || !/assets\/[^"' ]+\.js/.test(html)) {
  fail("index.html does not look like the Atrium desktop shell.");
}

banner("Atrium — phase 2/3: compile Rust", "  cargo / tauri continues after this script exits.\n");
