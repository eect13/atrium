/** Card 246 (Critic 245): B1 Rust calendar server client gone; A deploy:android packs 4 ABIs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("C246 B1: no cal_post / cal_api_base / claim / refresh / adopt in Rust; clear kept and registered", () => {
  const rs = read("src-tauri/src/lib.rs");
  for (const s of ["cal_post", "cal_api_base", "cal_session_claim", "cal_session_refresh", "cal_session_adopt", "/api/calendar", "VITE_CALENDAR_API_ORIGIN"]) {
    assert.ok(!rs.includes(s), `lib.rs still has ${s}`);
  }
  assert.match(rs, /fn cal_session_clear\(app: tauri::AppHandle\)/);
  assert.match(rs, /fn cal_clear_files\(/);
  assert.match(rs, /generate_handler!\[fetch_text, open_url, cal_session_clear, /);
  const toml = read("src-tauri/Cargo.toml");
  assert.doesNotMatch(toml, /Win32_Security_Cryptography|^jni\s*=/m);
  assert.match(toml, /^reqwest = /m, "fetch_text still uses reqwest");
});

test("C246 B1: client invokes only cal_session_clear", () => {
  const root = new URL("../", import.meta.url).pathname;
  const hits: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) {
        for (const m of readFileSync(p, "utf8").matchAll(/invoke\(\s*["'](cal_[a-z_]+)["']/g)) hits.push(m[1]);
      }
    }
  };
  walk(root);
  assert.deepEqual([...new Set(hits)], ["cal_session_clear"]);
});

test("C246 A: deploy:android = one universal RELEASE APK with aarch64, armv7, i686, x86_64", () => {
  assert.equal(JSON.parse(read("package.json")).scripts["deploy:android"], "node scripts/pack-android.mjs");
  const s = read("scripts/pack-android.mjs");
  for (const [t, tr, abi] of [["aarch64", "aarch64-linux-android", "arm64-v8a"], ["armv7", "armv7-linux-androideabi", "armeabi-v7a"], ["i686", "i686-linux-android", "x86"], ["x86_64", "x86_64-linux-android", "x86_64"]]) {
    assert.ok(s.includes(`{ tauri: "${t}", triple: "${tr}", abi: "${abi}"`), t);
  }
  assert.match(s, /\["assembleUniversalRelease", \.\.\.skip, "--no-daemon"\]/);
  assert.match(s, /\["tauri", "android", "build", "--apk", \.\.\.targetArgs, "--ci"\]/);
  assert.doesNotMatch(s, /"--debug"|assembleArm64Release|atrium-arm64-release/);
  assert.match(s, /"--release",\s*"--target",\s*t\.triple/);
  assert.match(read("deploy/android/apk.bat"), /atrium-v\*-universal-release\.apk/);
});
