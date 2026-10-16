"use client";

/**
 * Card 218 F4 / Card 219: note floats put Colour… (primary title-bar action) and Delete note
 * (last ⋯ row, destructive) through the shared TitleBar — no inline bypass. The popovers anchor here.
 */
import { useState } from "react";
import { NoteDelete } from "@/components/note-chrome";
import { NoteColor } from "@/components/note-color";
import type { TitleAction } from "@/components/widget-shell";
import type { MenuRow } from "@/lib/menu-groups";

export function useNoteFloatTools({ color, ink, onColor, onDelete }: { color: string; ink?: string; onColor: (c: string) => void; onDelete: () => void }) {
  const [colorOpen, setColorOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const colorAction: TitleAction = {
    id: "color",
    group: "primary",
    row: { label: "Colour…", onSelect: () => setColorOpen(true) },
    node: <NoteColor color={color} ink={ink} onChange={onColor} />,
  };
  const deleteRow: MenuRow = { label: "Delete note", destructive: true, onSelect: () => setDelOpen(true) };
  const anchors = (
    <div className="pointer-events-auto absolute right-2 top-11 z-50" data-no-drag>
      <NoteColor color={color} ink={ink} onChange={onColor} anchorOnly open={colorOpen} onOpenChange={setColorOpen} />
      <NoteDelete ink={ink} onDelete={onDelete} anchorOnly open={delOpen} onOpenChange={setDelOpen} />
    </div>
  );
  return { colorAction, deleteRow, anchors };
}
