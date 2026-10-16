import { useSyncExternalStore } from "react";
import { floatsAllowed, isMobileApp, nativeWindows } from "./platform.ts";

const noop = () => () => {};

/**
 * Card 192: floatsAllowed() for components. The server snapshot is "allowed" (the website), so
 * SSR + hydration match and the mobile app (static, no SSR) switches floats off on first client render.
 */
export function useFloatsAllowed(): boolean {
  return useSyncExternalStore(subFloatWidth, floatsNow, () => true);
}

/** Card 222 (Critic 221 R1): the website's float layer is lg-only (`hidden lg:block`), so below lg
 * a Float item would do nothing. Native desktop floats are separate windows and need no width. */
export const FLOAT_WEB_Q = "(min-width: 1024px)";
function floatsNow(): boolean {
  if (!floatsAllowed()) return false;
  if (nativeWindows() || typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia(FLOAT_WEB_Q).matches;
}
function subFloatWidth(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia || nativeWindows()) return noop();
  const m = window.matchMedia(FLOAT_WEB_Q);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

const PHONE_Q = "(max-width: 767px)";
function subPhone(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const m = window.matchMedia(PHONE_Q);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/** Card 216b: phone caps every title bar at the sm step (mobile app, or a phone-width viewport). */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subPhone, () => isMobileApp() || window.matchMedia(PHONE_Q).matches, () => false);
}
