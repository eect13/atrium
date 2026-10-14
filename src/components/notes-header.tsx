"use client";

/**
 * Card 204 Notes widget header. ≥300px card: + New, Board, Float inline and ⋯ (Options).
 * <300px (or Compact widgets): one ⋯ with New note · Board · Float · Options. No Float on phone.
 * The parent Card carries `@container`.
 */
import { LayoutGrid, Plus } from "lucide-react";
import { NotesFloatBtn } from "@/components/desk-chrome";
import { OverflowMenu, type OverflowItem } from "@/components/ui/overflow-menu";
import { NOTE_COLORS, uid } from "@/lib/format";
import { useAtrium } from "@/lib/store";
import { useFloatsAllowed } from "@/lib/use-platform";
import { widgetLook } from "@/lib/widget-prefs";
import { cn } from "@/lib/utils";

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

function openBoard() {
  const st = useAtrium.getState();
  st.setNotesLayout("board");
  st.setView("notes");
}

const ICON = "inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function NotesHeaderActions() {
  const compact = useAtrium((s) => widgetLook(s.dashPrefs).compact);
  const floats = useFloatsAllowed();
  const anyPinned = useAtrium((s) => s.notes.some((n) => n.pinned));
  const inline = compact ? "hidden" : "hidden @[300px]:flex";
  const items: OverflowItem[] = [
    { label: "New note", onSelect: newDeskNote },
    { label: "Board", onSelect: openBoard },
    ...(floats ? [{ label: anyPinned ? "Back to page" : "Float", onSelect: () => (anyPinned ? useAtrium.getState().unpinAllNotes() : useAtrium.getState().pinAllNotes()) }] : []),
    { label: "Options", onSelect: () => useAtrium.getState().setView("options") },
  ];
  return (
    <div className="flex items-center">
      <div className={cn("items-center", inline)}>
        <button type="button" className={ICON} aria-label="New note" onClick={newDeskNote}>
          <Plus className="size-4" />
        </button>
        <button type="button" className={ICON} aria-label="Board" onClick={openBoard}>
          <LayoutGrid className="size-4" />
        </button>
        <NotesFloatBtn />
      </div>
      <div className={compact ? "contents" : "contents @[300px]:hidden"}>
        <OverflowMenu label="Notes actions" items={items} menuClassName="w-44" />
      </div>
      <div className={cn(compact ? "hidden" : "hidden @[300px]:block")}>
        <OverflowMenu label="Notes options" items={[{ label: "Options", onSelect: () => useAtrium.getState().setView("options") }]} menuClassName="w-40" />
      </div>
    </div>
  );
}
