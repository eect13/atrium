/** Client helpers for the Atrium service worker in public/sw.js. */

export const SW_REV = "2";

export function registerAtriumSW() {
  if (!("serviceWorker" in navigator)) return () => {};
  const t = window.setTimeout(() => {
    void navigator.serviceWorker
      .register(`/sw.js?v=${SW_REV}`, { scope: "/" })
      .then((reg) => {
        const wake = (worker: ServiceWorker | null) => {
          worker?.postMessage({ type: "SKIP_WAITING" });
        };
        wake(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              wake(installing);
            }
          });
        });
      })
      .catch(() => undefined);
  }, 50);
  return () => window.clearTimeout(t);
}

export function invalidateSwCache(urls?: string[]) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: "INVALIDATE", urls });
}

/** Drop the cached PSE tape and fetch a fresh copy (Live button). */
export function bustPseCache() {
  invalidateSwCache(["/api/pse"]);
  if (typeof fetch === "undefined") return;
  void fetch("/api/pse", { cache: "reload" }).catch(() => undefined);
}
