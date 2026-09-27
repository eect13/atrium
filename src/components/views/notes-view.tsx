"use client";

import { useRef, useState } from "react";
import { LayoutGrid, LayoutList, PinOff } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { NotesFloatBtn } from "@/components/desk-chrome";
import { AddColorWheel } from "@/components/note-color";
import { NoteInk } from "@/components/note-ink";
import { NoteTools } from "@/components/note-chrome";
import {
  NoteEditor,
  NoteFormat,
  NotePhotos,
  addNotePhotos,
  useInkRedo,
} from "@/components/note-pad";
import { inkOnPaper, NOTE_COLORS, noteTitle, uid } from "@/lib/format";
import { useAtrium } from "@/lib/store";
import type { StickyNote } from "@/lib/types";
import { Chip } from "./finance-chip";

export function NotesView() {
  const { notes, notesLayout, addNote, updateNote, removeNote, pinNote, unpinNote, raise, setNotesLayout } = useAtrium(
    useShallow((s) => ({
      notes: s.notes,
      notesLayout: s.notesLayout,
      addNote: s.addNote,
      updateNote: s.updateNote,
      removeNote: s.removeNote,
      pinNote: s.pinNote,
      unpinNote: s.unpinNote,
      raise: s.raise,
      setNotesLayout: s.setNotesLayout,
    })),
  );
  const board = useRef<HTMLDivElement>(null);
  const [inkId, setInkId] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: string; to: string } | null>(null);
  const boardNotes = notes.filter((n) => !n.pinned);
  const pinned = notes.filter((n) => n.pinned);
  const layout = notesLayout === "list" ? "list" : "board";
  const ordered = [...boardNotes].sort((a, b) => a.y - b.y || a.x - b.x);
  let shown = ordered;
  if (drag && drag.from !== drag.to) {
    const ids = ordered.map((n) => n.id);
    const from = ids.indexOf(drag.from);
    const to = ids.indexOf(drag.to);
    if (from >= 0 && to >= 0) {
      ids.splice(from, 1);
      ids.splice(to, 0, drag.from);
      const byId = new Map(ordered.map((n) => [n.id, n]));
      shown = ids.map((id) => byId.get(id)!);
    }
  }
  const previewRef = useRef(shown);
  previewRef.current = shown;

  function spawn(color: string) {
    const y = ordered.reduce((m, n) => Math.min(m, n.y), 0) - 10;
    addNote({
      id: uid(),
      text: "",
      color,
      x: 0,
      y,
      z: notes.reduce((m, n) => Math.max(m, n.z), 1) + 1,
      w: 280,
      h: 240,
      pinned: false,
    });
  }

  function finishDrag() {
    const order = previewRef.current;
    setDrag(null);
    order.forEach((n, i) => {
      if (n.y !== i * 10 || n.x !== 0) updateNote(n.id, { y: i * 10, x: 0 });
    });
  }

  return (
    <div>
      <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-2 bg-background/95 py-2 backdrop-blur">
        <h2 className="font-display text-2xl font-medium tracking-tight">Sticky notes</h2>
        <p className="text-sm text-muted-foreground">
          <span className="lg:hidden">Board or list. Pin floats on the desk.</span>
          <span className="hidden lg:inline">Scroll the board. Drag a title to reorder. Pin floats on the desk.</span>
        </p>
        <div className="grow" />
        <NotesFloatBtn />
        <Chip active={layout === "list"} onClick={() => setNotesLayout("list")}>
          <LayoutList className="size-3.5" />
          List
        </Chip>
        <Chip active={layout === "board"} onClick={() => setNotesLayout("board")}>
          <LayoutGrid className="size-3.5" />
          Board
        </Chip>
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label="Add note"
            className="size-10 rounded-md border border-border"
            style={{ background: c }}
            onClick={() => spawn(c)}
          />
        ))}
        <AddColorWheel onPick={spawn} />
      </div>
      <div
        ref={board}
        className={layout === "list" ? "flex flex-col gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"}
      >
        {shown.map((n) => (
          <BoardNote
            key={n.id}
            note={n}
            drawing={inkId === n.id}
            dragging={drag?.from === n.id}
            onDraw={() => setInkId((id) => (id === n.id ? null : n.id))}
            onRaise={() => raise("note", n.id)}
            onDragStart={() => setDrag({ from: n.id, to: n.id })}
            onDragOver={(over) => setDrag((d) => (d?.from === n.id ? { from: n.id, to: over } : d))}
            onDragEnd={finishDrag}
            onUpdate={(patch) => updateNote(n.id, patch)}
            onPin={() => pinNote(n.id)}
            onDelete={() => removeNote(n.id)}
          />
        ))}
        {!shown.length && (
          <p className="p-8 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
            {notes.length
              ? "Pinned notes are floating on the desktop. Pick a color for a new one."
              : "Pick a paper color — white and gray first, or the wheel."}
          </p>
        )}
      </div>
      {pinned.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">
            <PinOff className="size-3.5" />
            Floating on desk
          </h3>
          {pinned.map((n) => {
            const ink = inkOnPaper(n.color);
            return (
              <div key={n.id} className="flex items-center gap-2 border-b border-border py-1">
                <span className="min-w-0 grow truncate text-sm font-medium">{noteTitle(n)}</span>
                <NoteTools
                  ink={ink}
                  color={n.color}
                  pinned
                  reveal="always"
                  onColor={(color) => updateNote(n.id, { color })}
                  onFloat={() => unpinNote(n.id)}
                  onDelete={() => removeNote(n.id)}
                />
              </div>
            );
          })}
          <p className="mt-2 hidden text-xs text-muted-foreground lg:block">
            Drag the bar at the top. Corners resize. Close or unpin to send it back.
          </p>
          <p className="mt-2 text-xs text-muted-foreground lg:hidden">
            Pinned notes float on a wide screen. Unpin to edit them here.
          </p>
        </div>
      )}
    </div>
  );
}

function BoardNote({
  note,
  drawing,
  dragging,
  onDraw,
  onRaise,
  onDragStart,
  onDragOver,
  onDragEnd,
  onUpdate,
  onPin,
  onDelete,
}: {
  note: StickyNote;
  drawing: boolean;
  dragging: boolean;
  onDraw: () => void;
  onRaise: () => void;
  onDragStart: () => void;
  onDragOver: (overId: string) => void;
  onDragEnd: () => void;
  onUpdate: (patch: Partial<StickyNote>) => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const ink = inkOnPaper(note.color);
  const boardRedo = useInkRedo();

  function nudgeScroll(clientY: number) {
    const scroller = (document.querySelector("main") as HTMLElement | null) ?? undefined;
    if (!scroller) return;
    const r = scroller.getBoundingClientRect();
    if (clientY > r.bottom - 64) scroller.scrollTop += 22;
    else if (clientY < r.top + 72) scroller.scrollTop -= 22;
  }

  function drag(e: React.PointerEvent) {
    if (e.button !== 0 || drawing) return;
    if ((e.target as HTMLElement).closest("button,input,label,[data-no-drag]")) return;
    onRaise();
    onDragStart();
    const ac = new AbortController();
    const move = (ev: PointerEvent) => {
      nudgeScroll(ev.clientY);
      const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-note-id]");
      const id = hit?.getAttribute("data-note-id");
      if (id && id !== note.id) onDragOver(id);
    };
    const stop = () => {
      ac.abort();
      onDragEnd();
    };
    window.addEventListener("pointermove", move, { signal: ac.signal });
    window.addEventListener("pointerup", stop, { signal: ac.signal });
    window.addEventListener("pointercancel", stop, { signal: ac.signal });
  }

  return (
    <article
      data-note-id={note.id}
      className={`flex h-72 flex-col overflow-hidden rounded-sm shadow-[var(--shadow-border)] ${dragging ? "opacity-70" : ""}`}
      style={{ backgroundColor: note.color, color: ink }}
    >
      <header
        className="group/bar relative z-[2] flex h-9 shrink-0 cursor-grab touch-none items-center gap-1 border-b border-current/10 px-1 active:cursor-grabbing"
        onPointerDown={drag}
      >
        <span className="min-w-0 grow truncate px-1.5 text-xs font-semibold opacity-80">{noteTitle(note)}</span>
        <NoteTools
          ink={ink}
          color={note.color}
          reveal="always"
          onColor={(color) => onUpdate({ color })}
          onFloat={onPin}
          onDelete={onDelete}
        />
      </header>
      <div className="relative min-h-0 flex-1 overflow-auto">
        <NoteInk
          strokes={note.ink ?? []}
          color={ink}
          active={drawing}
          onChange={(inkStrokes) => onUpdate({ ink: inkStrokes })}
        />
        <NotePhotos
          photos={note.photos ?? []}
          onRemove={(id) => onUpdate({ photos: (note.photos ?? []).filter((p) => p.id !== id) })}
        />
        <NoteEditor note={note} ink={ink} drawing={drawing} onUpdate={onUpdate} />
      </div>
      <NoteFormat
        ink={ink}
        drawing={drawing}
        docked
        canUndo={Boolean(note.ink?.length)}
        canRedo={boardRedo.canRedoFor(note.id)}
        onDraw={onDraw}
        onUndo={() => boardRedo.pushUndo(note.id, note.ink, (ink) => onUpdate({ ink }))}
        onRedo={() => boardRedo.popRedo(note.id, note.ink, (ink) => onUpdate({ ink }))}
        onClear={() => {
          boardRedo.forget(note.id);
          onUpdate({ ink: [] });
        }}
        onPhoto={(files) => void addNotePhotos(note.photos, files).then((photos) => onUpdate({ photos }))}
      />
    </article>
  );
}
