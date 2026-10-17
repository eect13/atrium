/** Card 248 (Critic 247 A1): Tauri mobile entry point restored; deploy:android refuses 0-export libs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { elfDynamicSymbols, isJniExport } from "../../scripts/so-exports.mjs";

const read = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

test("C248 A1: #[cfg_attr(mobile, tauri::mobile_entry_point)] sits directly above pub fn run()", () => {
  const lines = read("src-tauri/src/lib.rs").split(/\r?\n/);
  const i = lines.findIndex((l) => l.startsWith("pub fn run()"));
  assert.ok(i > 0, "pub fn run() exists");
  assert.equal(lines[i - 1], "#[cfg_attr(mobile, tauri::mobile_entry_point)]");
});

test("C248 A1: Windows fallback checks JNI exports of every ABI before copying", () => {
  const s = read("scripts/pack-android.mjs");
  assert.match(s, /import \{ jniExports \} from "\.\/so-exports\.mjs";/);
  assert.match(s, /function copySoToJniLibs\(ndk\) \{\n  assertJniExports\(ANDROID_TARGETS\.map\(soRelease\)/);
  assert.match(s, /if \(count === 0\) bad\.push\(so\);/);
  assert.match(s, /if \(bad\.length\) \{\n    fail\(/, "fail() exits 1");
  assert.match(s, /copySoToJniLibs\(env\.NDK_HOME \|\| env\.ANDROID_NDK_HOME\);/);
  assert.match(s, /process\.argv\.indexOf\("--check-so"\)/);
});

/** Minimal ELF64 LE: [null, .dynstr, .dynsym] with the given (name, defined) symbols. */
function elf64(syms: [string, boolean][]) {
  const strs = Buffer.from("\0" + syms.map(([n]) => n + "\0").join(""), "latin1");
  const symtab = Buffer.alloc(24 * (syms.length + 1));
  let off = 1;
  syms.forEach(([n, def], i) => {
    symtab.writeUInt32LE(off, 24 * (i + 1));
    symtab.writeUInt16LE(def ? 9 : 0, 24 * (i + 1) + 6);
    off += n.length + 1;
  });
  const shoff = 64 + strs.length + symtab.length;
  const sh = Buffer.alloc(64 * 3);
  sh.writeUInt32LE(3, 64 + 4); sh.writeBigUInt64LE(64n, 64 + 0x18); sh.writeBigUInt64LE(BigInt(strs.length), 64 + 0x20);
  sh.writeUInt32LE(11, 128 + 4); sh.writeBigUInt64LE(BigInt(64 + strs.length), 128 + 0x18);
  sh.writeBigUInt64LE(BigInt(symtab.length), 128 + 0x20); sh.writeUInt32LE(1, 128 + 0x28); sh.writeBigUInt64LE(24n, 128 + 0x38);
  const h = Buffer.alloc(64);
  h.writeUInt32BE(0x7f454c46, 0); h[4] = 2; h[5] = 1; h[6] = 1;
  h.writeBigUInt64LE(BigInt(shoff), 0x28); h.writeUInt16LE(64, 0x3a); h.writeUInt16LE(3, 0x3c);
  return Buffer.concat([h, strs, symtab, sh]);
}

test("C248 A1: ELF fallback counts defined Java_*/JNI_OnLoad only; 0 for a lib without the entry point", () => {
  const good = elf64([["Java_app_atrium_desktop_WryActivity_create", true], ["JNI_OnLoad", true], ["Java_imported", false], ["memcpy", true]]);
  assert.deepEqual(elfDynamicSymbols(good)!.filter(isJniExport), ["Java_app_atrium_desktop_WryActivity_create", "JNI_OnLoad"]);
  const empty = elf64([["memcpy", true], ["Java_imported", false]]);
  assert.equal(elfDynamicSymbols(empty)!.filter(isJniExport).length, 0);
  assert.equal(elfDynamicSymbols(Buffer.from("not an elf, just text padding to 64 bytes ........................")), null);
});
