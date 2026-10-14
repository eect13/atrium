/**
 * Card 204/206: Tauri transport for realm-sync. Floats emit patches to "main"; main merges them
 * (id lists by id), holding any that arrive while it is hydrating. Every realm reloads `atrium.v1`
 * on the `storage` event (also covers two browser tabs).
 */
import { nativeWindows } from "./platform";
import { applyRealmPatch, FLUSH_EVENT, PATCH_EVENT, patchGate, READY_EVENT, realmRole, realmStorage, type Patch, type RealmStorage } from "./realm-sync";

export { realmRole };

let floatStorage: RealmStorage | null = null;

/** The store's storage: wraps the float side so a reloaded main can ask for unseen patches. */
export function realmStorageWired(base: Parameters<typeof realmStorage>[0]) {
  const s = realmStorage(base, realmRole(), sendPatchToMain);
  if (realmRole() === "float") floatStorage = s;
  return s;
}

export function sendPatchToMain(patch: Patch) {
  if (!nativeWindows()) return;
  void import("@tauri-apps/api/event").then(({ emitTo }) => emitTo("main", PATCH_EVENT, patch)).catch(() => {});
}

type PersistStore = {
  getState: () => object;
  setState: (patch: object) => void;
  persist: { rehydrate: () => Promise<void> | void; hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void };
};

/** Main: apply float patches. All realms: reload when another realm/tab wrote the blob. */
export function startRealmSync(store: PersistStore, onFlush?: () => Promise<void> | void) {
  const gate = patchGate((p) => store.setState(applyRealmPatch(store.getState() as Record<string, unknown>, p)));
  const onStorage = (e: StorageEvent) => {
    if (e.key === "atrium.v1") void gate.during(() => store.persist.rehydrate());
  };
  window.addEventListener("storage", onStorage);
  const offs: (() => void)[] = [];
  if (nativeWindows()) {
    const main = realmRole() === "main";
    void import("@tauri-apps/api/event")
      .then(async ({ emit, listen }) => {
        if (main) {
          // R6: hold patches until the first hydrate has finished.
          if (!store.persist.hasHydrated()) void gate.during(() => new Promise<void>((r) => { const off = store.persist.onFinishHydration(() => { off(); r(); }); }));
          offs.push(await listen<Patch>(PATCH_EVENT, (e) => gate.push(e.payload)));
          if (onFlush) offs.push(await listen(FLUSH_EVENT, () => void onFlush()));
          await emit(READY_EVENT);
        } else {
          offs.push(await listen(READY_EVENT, () => floatStorage?.resend?.()));
        }
      })
      .catch(() => {
        /* no event bridge */
      });
  }
  return () => {
    window.removeEventListener("storage", onStorage);
    for (const off of offs) off();
  };
}
