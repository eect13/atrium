import { useSyncExternalStore } from "react";
import { floatsAllowed, isMobileApp } from "./platform.ts";

const noop = () => () => {};

/**
 * Card 192: floatsAllowed() for components. The server snapshot is "allowed" (the website), so
 * SSR + hydration match and the mobile app (static, no SSR) switches floats off on first client render.
 */
export function useFloatsAllowed(): boolean {
  return useSyncExternalStore(noop, () => floatsAllowed(), () => true);
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
