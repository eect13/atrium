#!/usr/bin/env node
/**
 * Windows NSIS packer for Atrium (Tauri 2).
 *   node scripts/deploy.mjs
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, platform } from "node:os";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WIN = platform() === "win32";
const OUT = join(ROOT, "deploy", "windows");
const NSIS = join(ROOT, "src-tauri", "target", "release", "bundle", "nsis");

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env, shell: WIN, windowsHide: true });
  return r.status ?? 1;
}

const cargoBin = join(homedir(), ".cargo", "bin");
const env = {
  ...process.env,
  PATH: `${cargoBin}${WIN ? ";" : ":"}${process.env.PATH || ""}`,
  TAURI_ENV_PLATFORM: process.env.TAURI_ENV_PLATFORM || "windows",
};

if (!existsSync(join(ROOT, "node_modules"))) {
  console.log("npm install…");
  if (run(WIN ? "npm.cmd" : "npm", ["install"], env) !== 0) fail("npm install failed");
}

const npx = WIN ? "npx.cmd" : "npx";
console.log("\nAtrium — Windows NSIS via Tauri 2\n");
if (run(npx, ["tauri", "build", "--bundles", "nsis"], env) !== 0) fail("tauri build failed");

mkdirSync(OUT, { recursive: true });
if (!existsSync(NSIS)) fail(`No NSIS output at ${NSIS}`);
const exes = readdirSync(NSIS).filter((f) => f.endsWith("-setup.exe") || f.endsWith("_x64-setup.exe"));
if (!exes.length) fail("No setup exe in NSIS folder");
for (const f of exes) {
  const dest = join(OUT, f.replace(/ /g, "-"));
  copyFileSync(join(NSIS, f), dest);
  console.log(`  ${dest}`);
}
console.log("\nDone. Installers also under src-tauri/target/release/bundle/nsis/");
