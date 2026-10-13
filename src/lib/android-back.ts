/**
 * Card 199: what Android Back closes, in order: the nav drawer, then an open sheet, then a dialog.
 * Returns true when something was closed (MainActivity then keeps the app open).
 * Sheets/dialogs are Radix layers; Escape on the document closes the topmost one.
 */
export function androidBack(drawerOpen: boolean, closeDrawer: () => void, doc: Document = document): boolean {
  if (drawerOpen) {
    closeDrawer();
    return true;
  }
  const open = (kind: string) => doc.querySelectorAll(`[data-atrium-layer="${kind}"][data-state="open"]`).length > 0;
  if (open("sheet") || open("dialog")) {
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
    return true;
  }
  return false;
}
