/**
 * Card 204: Tauri transport for realm-sync. Floats emit patches to "main"; main applies them.
 * Every realm reloads `atrium.v1` on the `storage` event (also covers two browser tabs).
 */
import { nativeWindows } from "./platform";
import { FLUSH_EVENT, PATCH_EVENT, realmRole, realmStorage, type Patch } from "./realm-sync";

export { realmRole, realmStorage };

export function sendPatchToMain(patch: Patch) {
  if (!nativeWindows()) return;
  void import("@tauri-apps/api/event").then(({ emitTo }) => emitTo("main", PATCH_EVENT, patch)).catch(() => {});
}

type PersistStore = {
  setState: (patch: Patch) => void;
  persist: { rehydrate: () => Promise<void> | void };
};

/** Main: apply float patches. All realms: reload when another realm/tab wrote the blob. */
export function startRealmSync(store: PersistStore, onFlush?: () => Promise<void> | void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === "atrium.v1") void store.persist.rehydrate();
  };
  window.addEventListener("storage", onStorage);
  const offs: (() => void)[] = [];
  if (nativeWindows() && realmRole() === "main") {
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      offs.push(await listen<Patch>(PATCH_EVENT, (e) => store.setState(e.payload)));
      if (onFlush) offs.push(await listen(FLUSH_EVENT, () => void onFlush()));
    }).catch(() => {
      /* no event bridge */
    });
  }
  return () => {
    window.removeEventListener("storage", onStorage);
    for (const off of offs) off();
  };
}
