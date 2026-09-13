/** Fetch text, using a Rust command inside Tauri so RSS/news is not blocked by CORS. */

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
