import { APP_VERSION } from "./version.ts";

/**
 * Honest client id for outbound fetches, any source (feeds, Wikiquote, …):
 * `AtriumDesk/<version> (<contact>) <library>/<version>`. Contact is the public issue tracker.
 * Tauri sends it through Rust reqwest (only the User-Agent crosses IPC, see http.ts); web goes via
 * the server fn's Node fetch.
 */
export const CLIENT_CONTACT = "https://github.com/eect13/atrium/issues";
export const CLIENT_LIB = { tauri: "reqwest/0.12", web: "Node.js/22 undici" } as const;

export function clientUserAgent(lib: string = CLIENT_LIB.tauri) {
  return `AtriumDesk/${APP_VERSION} (${CLIENT_CONTACT}) ${lib}`;
}

/** Which transport this call runs on: Tauri webview (IPC → reqwest) or the server (Node fetch). */
export function clientLib(): string {
  const tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  return tauri ? CLIENT_LIB.tauri : CLIENT_LIB.web;
}

/** `User-Agent` for the current transport. */
export function clientHeaders(lib = clientLib()): Record<string, string> {
  return { "User-Agent": clientUserAgent(lib) };
}
