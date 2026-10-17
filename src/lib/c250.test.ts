/** Card 250 (Critic 249 P3): tauri path guarded + signed; unsigned APKs never called "-release.apk". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("C250 tauri android build path: JNI check on every ABI .so, then the same sign + deploy tail", () => {
  const s = read("scripts/pack-android.mjs");
  const tauri = s.slice(s.indexOf("if (tauriStatus === 0) {"), s.indexOf("tauri android build failed"));
  assert.match(tauri, /const sos = ANDROID_TARGETS\.map\(packagedSo\);/);
  assert.match(tauri, /assertJniExports\(sos, /);
  assert.match(tauri, /copyApksToDeploy\(sdk, env, signApkIfNeeded\(sdk, env\)\)/);
  assert.ok(tauri.indexOf("assertJniExports") < tauri.indexOf("copyApksToDeploy"), "check before reporting success");
  assert.doesNotMatch(tauri, /copyFileSync\(primary, join\(OUT, APK_NAME\)\)/, "no blind '-release.apk' copy");
});

test("C250 honest APK names: signed → -release.apk, unsigned → -release-unsigned.apk, no Vibe copy", () => {
  const s = read("scripts/pack-android.mjs");
  assert.match(s, /const APK_NAME_UNSIGNED = "atrium-universal-release-unsigned\.apk";/);
  assert.match(s, /b\.includes\("APK Sig Block 42"\)/);
  assert.match(s, /const friendly = join\(OUT, signed \? APK_NAME : APK_NAME_UNSIGNED\);/);
  assert.match(s, /`atrium-v\$\{ver\}-universal-release\$\{signed \? "" : "-unsigned"\}\.apk`/);
  assert.match(s, /\} else if \(existsSync\(friendly\)\) copyApkToVibeInstallers\(friendly\);/);
  assert.match(s, /function gradleReleaseSigning\(\)/);
  assert.match(read("deploy/android/apk.bat"), /atrium-v\*-universal-release-unsigned\.apk/);
});
