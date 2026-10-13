import { isTauri } from "./http.ts";

/**
 * Card 192 (Critic 187 fix 1): one runtime "is this the phone/tablet app?" flag.
 * package.json / Cargo.toml have no @tauri-apps/plugin-os (only @tauri-apps/api ^2.11.1), so:
 * 1. build time: Tauri's TAURI_ENV_PLATFORM ("android" | "ios" for mobile; scripts/tauri-before-build.mjs,
 *    pack-android) is baked in by vite.config.ts as __ATRIUM_TAURI_PLATFORM__;
 * 2. runtime fallback: inside Tauri with an Android / iOS WebView user agent.
 * The website is never the "mobile app" (it is gated by width: floats are lg-only there).
 */
declare const __ATRIUM_TAURI_PLATFORM__: string | undefined;

const BUILD_PLATFORM = typeof __ATRIUM_TAURI_PLATFORM__ === "string" ? __ATRIUM_TAURI_PLATFORM__ : "";

export type PlatformEnv = { build?: string; tauri?: boolean; ua?: string };

export function isMobileApp(env: PlatformEnv = {}): boolean {
  const build = (env.build ?? BUILD_PLATFORM).toLowerCase();
  if (build === "android" || build === "ios") return true;
  const tauri = env.tauri ?? isTauri();
  if (!tauri) return false;
  const ua = env.ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /\bAndroid\b|\biPhone\b|\biPad\b|\biPod\b/.test(ua);
}

/** Desktop Tauri only: native multi-window (floats, always-on-top, main-window bounds). */
export function nativeWindows(env: PlatformEnv = {}): boolean {
  return (env.tauri ?? isTauri()) && !isMobileApp(env);
}

/** Any float feature (in-page or native). Off in the mobile app; the website still gates by width (lg). */
export function floatsAllowed(env: PlatformEnv = {}): boolean {
  return !isMobileApp(env);
}
