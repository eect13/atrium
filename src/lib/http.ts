/** Fetch text/JSON. Inside Tauri, Rust fetch_text bypasses webview CORS (Yahoo, RSS, etc.). */

export function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const BODY_CAP = 1_500_000;

function blockedHost(host: string) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal") return true;
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/** Public http(s) only. Rewrites webcal. Rejects loopback, private, and link-local hosts. */
export function publicHttpUrl(raw: string): string | null {
  const s = raw.trim().replace(/^webcal:/i, "https:");
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (blockedHost(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function httpText(url: string, headers?: Record<string, string>) {
  const safe = publicHttpUrl(url);
  if (!safe) throw new Error("That address is not allowed");
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const text = await invoke<string>("fetch_text", { url: safe });
    if (text.length > BODY_CAP) throw new Error("Response too large");
    return text;
  }
  const res = await fetch(safe, {
    headers,
    signal: AbortSignal.timeout(12_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > BODY_CAP) throw new Error("Response too large");
  return text;
}

/** JSON GET. Same Tauri path as httpText so finance/Yahoo work from tauri.localhost. */
export async function httpJson<T = unknown>(url: string, headers?: Record<string, string>): Promise<T> {
  const text = await httpText(url, headers);
  return JSON.parse(text) as T;
}
