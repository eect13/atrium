import { useSyncExternalStore } from "react";
import { floatsAllowed } from "./platform.ts";

const noop = () => () => {};

/**
 * Card 192: floatsAllowed() for components. The server snapshot is "allowed" (the website), so
 * SSR + hydration match and the mobile app (static, no SSR) switches floats off on first client render.
 */
export function useFloatsAllowed(): boolean {
  return useSyncExternalStore(noop, () => floatsAllowed(), () => true);
}
