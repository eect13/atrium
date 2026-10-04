/**
 * Final pack outputs land in %USERPROFILE%\Desktop\Vibe Installers (created if
 * missing). An existing file with the same name is never overwritten or
 * deleted: it is renamed `<name>-prev-YYYYMMDD-HHMM<ext>` (old file's mtime,
 * -2, -3… if that is taken). An identical file (same SHA-256) is left alone.
 */
import { createHash } from "node:crypto";
import { constants as fsConstants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";

export function vibeInstallersDir(env = process.env) {
  const home = env.USERPROFILE || homedir();
  return join(home, "Desktop", "Vibe Installers");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** `<name>-prev-YYYYMMDD-HHMM<ext>` from the old file's mtime; adds -2, -3… if taken. */
export function freePrevName(dest) {
  const ext = extname(dest);
  const stem = dest.slice(0, dest.length - ext.length);
  const t = statSync(dest).mtime;
  const p2 = (n) => String(n).padStart(2, "0");
  const stamp = `${t.getFullYear()}${p2(t.getMonth() + 1)}${p2(t.getDate())}-${p2(t.getHours())}${p2(t.getMinutes())}`;
  let candidate = `${stem}-prev-${stamp}${ext}`;
  for (let i = 2; existsSync(candidate); i++) candidate = `${stem}-prev-${stamp}-${i}${ext}`;
  return candidate;
}

/**
 * Copy `src` into `outDir` under its own name. Returns
 * `{ dest, kept }` where `kept` is the renamed older file (or null).
 */
export function copyToVibeInstallers(src, outDir = vibeInstallersDir()) {
  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, basename(src));
  let kept = null;
  if (existsSync(dest)) {
    if (sha256(dest) === sha256(src)) return { dest, kept, same: true };
    kept = freePrevName(dest);
    renameSync(dest, kept);
  }
  copyFileSync(src, dest, fsConstants.COPYFILE_EXCL);
  return { dest, kept, same: false };
}
