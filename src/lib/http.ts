/** Fetch text/JSON. Inside Tauri, Rust fetch_text bypasses webview CORS (Yahoo, RSS, etc.). */

export function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function httpText(url: string, headers?: Record<string, string>) {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("fetch_text", { url });
  }
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(12_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** JSON GET. Same Tauri path as httpText so finance/Yahoo work from tauri.localhost. */
export async function httpJson<T = unknown>(url: string, headers?: Record<string, string>): Promise<T> {
  const text = await httpText(url, headers);
  return JSON.parse(text) as T;
}
