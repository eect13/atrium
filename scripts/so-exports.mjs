/**
 * Card 248 (Critic 247 A1): JNI exports of an Android .so. Tauri's `#[tauri::mobile_entry_point]`
 * emits the `Java_…` entry points the WryActivity calls (and `JNI_OnLoad`); a lib without them
 * installs but crashes at launch. Primary: NDK `llvm-nm -D --defined-only`; fallback: the ELF
 * .dynsym reader below (no tools, works on Windows).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** @param {string} name */
export const isJniExport = (name) => name.startsWith("Java_") || name === "JNI_OnLoad";

/** Defined dynamic symbols from an ELF32/ELF64 little-endian file, or null if not an ELF. */
/**
 * @param {Buffer} buf
 * @returns {string[] | null}
 */
export function elfDynamicSymbols(buf) {
  if (buf.length < 52 || buf.readUInt32BE(0) !== 0x7f454c46 || buf[5] !== 1) return null;
  const is64 = buf[4] === 2;
  /** @param {number} o @param {number} n */
  const u = (o, n) => (n === 8 ? Number(buf.readBigUInt64LE(o)) : n === 4 ? buf.readUInt32LE(o) : buf.readUInt16LE(o));
  const shoff = is64 ? u(0x28, 8) : u(0x20, 4);
  const shentsize = u(is64 ? 0x3a : 0x2e, 2);
  const shnum = u(is64 ? 0x3c : 0x30, 2);
  if (!shoff || !shnum || shoff + shnum * shentsize > buf.length) return null;
  /** @param {number} i */
  const sec = (i) => {
    const b = shoff + i * shentsize;
    return is64
      ? { type: u(b + 4, 4), offset: u(b + 0x18, 8), size: u(b + 0x20, 8), link: u(b + 0x28, 4), entsize: u(b + 0x38, 8) }
      : { type: u(b + 4, 4), offset: u(b + 0x10, 4), size: u(b + 0x14, 4), link: u(b + 0x18, 4), entsize: u(b + 0x24, 4) };
  };
  const names = [];
  for (let i = 0; i < shnum; i++) {
    const s = sec(i);
    if (s.type !== 11) continue; // SHT_DYNSYM
    const str = sec(s.link);
    const ent = s.entsize || (is64 ? 24 : 16);
    for (let o = s.offset + ent; o + ent <= s.offset + s.size; o += ent) {
      const nameOff = u(o, 4);
      const shndx = u(o + (is64 ? 6 : 14), 2);
      if (shndx === 0) continue; // undefined (imported)
      const start = str.offset + nameOff;
      const end = buf.indexOf(0, start);
      if (end > start) names.push(buf.toString("latin1", start, end));
    }
  }
  return names;
}

/** { count, sample, via } for one .so. `nm` is the NDK llvm-nm path or null. */
/**
 * @param {string} soPath
 * @param {string | null} [nm]
 * @returns {{ count: number, sample: string[], via: string }}
 */
export function jniExports(soPath, nm = null) {
  if (nm && existsSync(nm)) {
    const r = spawnSync(nm, ["-D", "--defined-only", "--format=just-symbols", soPath], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true });
    if (r.status === 0) {
      const names = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(isJniExport);
      return { count: names.length, sample: names.slice(0, 4), via: "llvm-nm" };
    }
  }
  const names = (elfDynamicSymbols(readFileSync(soPath)) || []).filter(isJniExport);
  return { count: names.length, sample: names.slice(0, 4), via: "elf-dynsym" };
}
