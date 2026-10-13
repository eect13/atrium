/**
 * Widget "+ quick add" (Card 161): open the existing New event dialog on the Calendar page
 * with a start filled in. The page may still be loading, so the request waits to be taken.
 */
let pending: string | null = null;
const EVENT = "atrium:quick-add";

export function requestQuickAdd(startIso: string) {
  pending = startIso;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

/** The Calendar page takes the pending request once (on mount and on each new request). */
export function takeQuickAdd(): string | null {
  const v = pending;
  pending = null;
  return v;
}

export function onQuickAdd(fn: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
