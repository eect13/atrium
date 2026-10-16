/** Card 216 §5: registry-driven ⋯ groups shared by dashboard cards and floats. */
import { mergeGroups, type MenuGroups, type MenuRow } from "./menu-groups";
import { dashEntry, dashLabel, type DashCard, type MenuAction } from "./dash";
import { NOTE_COLORS, uid } from "./format";
import { useAtrium } from "./store";
import type { WidgetKind } from "./types";
import { useFloatsAllowed } from "./use-platform";
import { WIDGET_OPTION_ROWS, hasWidgetOptions, widgetOpts } from "./widget-prefs";

export const SHELL_TITLE = "min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground";
/** Desk floats reveal chrome on hover/focus; touch (no hover) always shows it (§5.3, step 7). */
export const SHELL_REVEAL = "opacity-0 transition-opacity focus-within:opacity-100 group-hover/w:opacity-100 [@media(hover:none)]:opacity-100";

function newDeskNote() {
  const st = useAtrium.getState();
  st.addNote({
    id: uid(),
    text: "",
    color: NOTE_COLORS[0]!,
    x: 0,
    y: st.notes.reduce((m, n) => Math.min(m, n.y), 0) - 10,
    z: st.notes.reduce((m, n) => Math.max(m, n.z), 1) + 1,
    w: 280,
    h: 240,
    pinned: false,
  });
  st.setView("notes");
}

export const SHELL_ACTIONS: Record<MenuAction, () => void> = {
  "new-note": newDeskNote,
  "new-event": () => useAtrium.getState().setView("calendar"),
  board: () => {
    const st = useAtrium.getState();
    st.setNotesLayout("board");
    st.setView("notes");
  },
  "float-all": () => useAtrium.getState().pinAllNotes(),
  "unfloat-all": () => useAtrium.getState().unpinAllNotes(),
};

/** Group 2: the widget's own view switches (Seconds, Show cities…), shared by cards and floats. */
export function useViewRows(id: string): MenuRow[] {
  const prefs = useAtrium((s) => s.dashPrefs);
  const setOpt = useAtrium((s) => s.setWidgetOpt);
  if (!hasWidgetOptions(id)) return [];
  const opts = widgetOpts(prefs, id) as Record<string, boolean>;
  const rows = WIDGET_OPTION_ROWS[id] as { key: string; label: string }[];
  return rows.map((r) => ({ label: r.label, checked: opts[r.key] === true, onSelect: () => setOpt(id, r.key as never, !opts[r.key]) }));
}

/** The dashboard card ⋯, built from the registry (§5 order). */
export function useCardMenu(id: DashCard, extra?: MenuGroups) {
  const e = dashEntry(id);
  const label = dashLabel(id);
  const floats = useFloatsAllowed();
  const manyOn = useAtrium((s) => s.notes.some((n) => n.pinned));
  const floatOn = useAtrium((s) => (e.float ? s.windows.some((w) => w.kind === e.float) : false));
  const openWindow = useAtrium((s) => s.openWindow);
  const setView = useAtrium((s) => s.setView);
  const view = useViewRows(id);
  const groups = mergeGroups(
    e.menu?.({ floats, manyOn, act: (a) => SHELL_ACTIONS[a] }),
    { view, go: [{ label: `Open ${label}`, onSelect: () => setView(e.view) }, { label: `${label} options…`, onSelect: () => setView("options") }] },
    extra,
  );
  // Float row for the title bar (inline at md+, else ⋯ window group). Card 218 F3: floatMany (Notes)
  // floats one note at a time — Float all / Back to board live only in the registry Notes ⋯.
  const floatRow: MenuRow | null = floats && e.float && !e.floatMany ? { label: floatOn ? "On desk" : "Float", onSelect: () => openWindow(e.float as WidgetKind) } : null;
  const primaryRow: MenuRow | null = e.primary ? { label: e.primary === "new-note" ? "New note" : "New event", onSelect: SHELL_ACTIONS[e.primary] } : null;
  return { label, groups, floatRow, primaryRow, menuLabel: `${label} menu` };
}

