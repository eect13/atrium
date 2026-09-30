/** One note when the desk cannot write localStorage. Reads stay quiet. */

const listeners = new Set<(message: string) => void>();
let noted = false;

export const QUOTA_NOTE =
  "This browser is full. New changes may not stick — export a backup from Options.";

export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: unknown }).name) : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  const code = "code" in err ? (err as { code?: unknown }).code : undefined;
  return code === 22 || code === 1014;
}

export function onStorageQuota(fn: (message: string) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function reportStorageQuota() {
  if (noted) return;
  noted = true;
  for (const fn of listeners) fn(QUOTA_NOTE);
}

export function resetStorageQuotaForTests() {
  noted = false;
  listeners.clear();
}

export function writeLocal(key: string, value: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (isQuotaError(err)) reportStorageQuota();
  }
}
