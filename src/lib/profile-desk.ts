import { downloadText } from "./books.ts";
import { isoDate } from "./format.ts";
import { APP_VERSION } from "./version.ts";

export const PROFILE_KIND = "atrium.profile" as const;
export const PERSIST_KEY = "atrium.v1";

export type ProfileBackup = {
  kind: typeof PROFILE_KIND;
  app: "Atrium";
  version: string;
  savedAt: string;
  storage: Record<string, string>;
};

function atriumKeys(store: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith("atrium.")) keys.push(k);
  }
  return keys;
}

export const CALENDAR_ACCOUNTS_KEY = "atrium.calendar.v1";

/**
 * Card 170 (Card 166 E3c / Card 168): secret iCal addresses are credentials and never leave
 * the device in a backup; the old v1 Bearer `session` is dropped too. Subscriptions come back
 * by name and can be re-added by address.
 */
export function scrubCalendarAccounts(raw: string): string {
  try {
    const data = JSON.parse(raw) as { state?: { session?: unknown; icsSources?: { url?: string }[] } };
    if (!data?.state) return raw;
    delete data.state.session;
    if (Array.isArray(data.state.icsSources)) data.state.icsSources = data.state.icsSources.map(({ url: _u, ...rest }) => rest);
    return JSON.stringify(data);
  } catch {
    return "{}";
  }
}

export function collectProfileBackup(): ProfileBackup {
  const storage: Record<string, string> = {};
  if (typeof localStorage !== "undefined") {
    for (const k of atriumKeys(localStorage)) {
      const v = localStorage.getItem(k);
      if (v != null) storage[k] = k === CALENDAR_ACCOUNTS_KEY ? scrubCalendarAccounts(v) : v;
    }
  }
  if (typeof sessionStorage !== "undefined") {
    for (const k of atriumKeys(sessionStorage)) {
      const v = sessionStorage.getItem(k);
      if (v != null) storage[`session:${k}`] = v;
    }
  }
  return {
    kind: PROFILE_KIND,
    app: "Atrium",
    version: APP_VERSION,
    savedAt: new Date().toISOString(),
    storage,
  };
}

export function downloadProfileBackup() {
  const file = collectProfileBackup();
  downloadText(`atrium-profile-${isoDate()}.json`, JSON.stringify(file, null, 2), "application/json");
}

export function parseProfileBackup(raw: string): ProfileBackup {
  const data = JSON.parse(raw) as Partial<ProfileBackup>;
  if (data.kind !== PROFILE_KIND || !data.storage || typeof data.storage !== "object") {
    throw new Error("Not an Atrium profile file");
  }
  return data as ProfileBackup;
}

export function wipeAtriumStorage() {
  if (typeof localStorage !== "undefined") {
    for (const k of atriumKeys(localStorage)) localStorage.removeItem(k);
  }
  if (typeof sessionStorage !== "undefined") {
    for (const k of atriumKeys(sessionStorage)) sessionStorage.removeItem(k);
  }
}

export function restoreProfileBackup(file: ProfileBackup) {
  wipeAtriumStorage();
  for (const [k, v] of Object.entries(file.storage)) {
    if (k.startsWith("session:")) {
      sessionStorage.setItem(k.slice("session:".length), v);
    } else {
      localStorage.setItem(k, v);
    }
  }
}
