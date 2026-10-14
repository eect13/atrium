import { captureFloatBoxes, labelFor } from "./native-float";
import { useAtrium } from "./store";

/** Card 204: main writes every float's live box into the store before an exit. */
export async function captureDeskBoxes() {
  const boxes = await captureFloatBoxes();
  if (!boxes.length) return;
  const st = useAtrium.getState();
  const by = new Map(boxes.map((b) => [b.label, b.box]));
  for (const w of st.windows) {
    const box = by.get(labelFor("widget", w.id));
    if (box) st.updateWindow(w.id, box);
  }
  for (const n of st.notes) {
    const box = n.pinned ? by.get(labelFor("note", n.id)) : undefined;
    if (box) st.updateNote(n.id, box);
  }
}
