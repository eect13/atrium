import { useEffect, useState } from "react";

/** Flip true after first paint (+ optional delay). `force` wins immediately. */
export function useAfterPaint(delayMs = 0, force = false) {
  const [ready, setReady] = useState(force);
  useEffect(() => {
    if (force) {
      setReady(true);
      return;
    }
    let timeout = 0;
    const start = () => {
      timeout = window.setTimeout(() => setReady(true), delayMs);
    };
    const ric = window.requestIdleCallback?.(start, { timeout: Math.max(200, delayMs) });
    if (ric == null) start();
    return () => {
      window.clearTimeout(timeout);
      if (ric != null) window.cancelIdleCallback?.(ric);
    };
  }, [delayMs, force]);
  return force || ready;
}
