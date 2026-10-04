import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { copyToVibeInstallers, vibeInstallersDir } from "./vibe-installers.mjs";

test("default folder is %USERPROFILE%\\Desktop\\Vibe Installers", () => {
  assert.equal(vibeInstallersDir({ USERPROFILE: "/u/eric" }), join("/u/eric", "Desktop", "Vibe Installers"));
});

test("creates the folder and copies under the same name", () => {
  const src = join(mkdtempSync(join(tmpdir(), "vi-src-")), "app_1.0_x64-setup.exe");
  writeFileSync(src, "new");
  const out = join(mkdtempSync(join(tmpdir(), "vi-out-")), "Vibe Installers");
  const r = copyToVibeInstallers(src, out);
  assert.equal(r.kept, null);
  assert.equal(readFileSync(join(out, "app_1.0_x64-setup.exe"), "utf8"), "new");
});

test("renames an older same-name file with -prev-YYYYMMDD-HHMM and never deletes it", () => {
  const srcDir = mkdtempSync(join(tmpdir(), "vi-src-"));
  const out = mkdtempSync(join(tmpdir(), "vi-out-"));
  const old = join(out, "app.msi");
  writeFileSync(old, "old");
  const when = new Date(2026, 9, 4, 9, 5);
  utimesSync(old, when, when);
  const src = join(srcDir, "app.msi");
  writeFileSync(src, "new");
  const r = copyToVibeInstallers(src, out);
  assert.equal(r.kept, join(out, "app-prev-20261004-0905.msi"));
  assert.equal(readFileSync(join(out, "app.msi"), "utf8"), "new");
  assert.equal(readFileSync(r.kept, "utf8"), "old");

  // A second differing pack in the same minute takes -2, still deleting nothing.
  utimesSync(join(out, "app.msi"), when, when);
  writeFileSync(src, "newer");
  const r2 = copyToVibeInstallers(src, out);
  assert.equal(r2.kept, join(out, "app-prev-20261004-0905-2.msi"));
  assert.deepEqual(readdirSync(out).sort(), ["app-prev-20261004-0905-2.msi", "app-prev-20261004-0905.msi", "app.msi"]);
});

test("an identical file is left alone (no -prev copy)", () => {
  const src = join(mkdtempSync(join(tmpdir(), "vi-src-")), "a.apk");
  writeFileSync(src, "same");
  const out = mkdtempSync(join(tmpdir(), "vi-out-"));
  copyToVibeInstallers(src, out);
  const r = copyToVibeInstallers(src, out);
  assert.equal(r.same, true);
  assert.deepEqual(readdirSync(out), ["a.apk"]);
});
