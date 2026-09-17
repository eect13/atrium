"use client";

import { useRef, useState } from "react";
import { LayoutGrid, LayoutList, PinOff } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
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
import { ResizeHandles } from "@/components/float-window";
import { MAX_PINNED_NOTES, resizeFrom, type ResizeHandle } from "@/lib/desk";
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
  const inkRedo = useInkRedo();
  const boardNotes = notes.filter((n) => !n.pinned);
  const pinned = notes.filter((n) => n.pinned);
  const layout = notesLayout === "list" ? "list" : "board";

  function tryPin(id: string) {
    if (pinned.length >= MAX_PINNED_NOTES) {
      toast("Six notes on the desk — unpin one first.");
      return;
    }
    pinNote(id);
  }

  function spawn(color: string) {
    addNote({
      id: uid(),
      text: "",
      color,
      x: 32 + Math.random() * 80,
      y: 32 + Math.random() * 60,
      z: notes.reduce((m, n) => Math.max(m, n.z), 1) + 1,
      w: 240,
      h: 220,
      pinned: false,
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-medium tracking-tight">Sticky notes</h2>
        <p className="text-sm text-muted-foreground">
          <span className="lg:hidden">Board or list. Pin floats on the desk.</span>
          <span className="hidden lg:inline">Title + body, colors, format tools. Drag the title bar; edges resize.</span>
        </p>
        <div className="grow" />
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
      {layout === "list" ? (
        <div className="space-y-2">
          {boardNotes.map((n) => {
            const ink = inkOnPaper(n.color);
            return (
              <article
                key={n.id}
                className="overflow-hidden rounded-lg shadow-[var(--shadow-border)]"
                style={{ backgroundColor: n.color, color: ink }}
              >
                <NoteFormat
                  ink={ink}
                  drawing={false}
                  canUndo={Boolean(n.ink?.length)}
                  canRedo={inkRedo.canRedoFor(n.id)}
                  onDraw={() => undefined}
                  onUndo={() => inkRedo.pushUndo(n.id, n.ink, (ink) => updateNote(n.id, { ink }))}
                  onRedo={() => inkRedo.popRedo(n.id, n.ink, (ink) => updateNote(n.id, { ink }))}
                  onClear={() => {
                    inkRedo.forget(n.id);
                    updateNote(n.id, { ink: [] });
                  }}
                  onPhoto={(files) => void addNotePhotos(n.photos, files).then((photos) => updateNote(n.id, { photos }))}
                />
                <NotePhotos photos={n.photos ?? []} onRemove={(id) => updateNote(n.id, { photos: (n.photos ?? []).filter((p) => p.id !== id) })} />
                <NoteEditor note={n} ink={ink} drawing={false} onUpdate={(patch) => updateNote(n.id, patch)} />
                <div className="flex items-center justify-end px-1 pb-1" style={{ color: ink }}>
                  <NoteTools
                    ink={ink}
                    color={n.color}
                    onColor={(color) => updateNote(n.id, { color })}
                    onFloat={() => tryPin(n.id)}
                    onDelete={() => removeNote(n.id)}
                  />
                </div>
              </article>
            );
          })}
          {!boardNotes.length && (
            <p className="p-8 text-sm text-muted-foreground">
              {notes.length
                ? "Pinned notes are floating on the desktop. Pick a color for a new one."
                : "Pick a paper color — white and gray first, or the wheel."}
            </p>
          )}
        </div>
      ) : (
        <div
          ref={board}
          className="scroll-auto relative min-h-[24rem] rounded-xl border border-dashed border-border bg-muted/40 sm:min-h-[32rem]"
        >
          {boardNotes.map((n) => (
            <BoardNote
              key={n.id}
              note={n}
              drawing={inkId === n.id}
              board={board}
              onDraw={() => setInkId((id) => (id === n.id ? null : n.id))}
              onRaise={() => raise("note", n.id)}
              onMove={(x, y) => updateNote(n.id, { x, y })}
              onResize={(w, h) => updateNote(n.id, { w, h })}
              onUpdate={(patch) => updateNote(n.id, patch)}
              onPin={() => tryPin(n.id)}
              onDelete={() => removeNote(n.id)}
            />
          ))}
          {!boardNotes.length && (
            <p className="p-8 text-sm text-muted-foreground">
              {notes.length
                ? "Pinned notes are floating on the desktop. Pick a color for a new one."
                : "Pick a paper color — white and gray first, or the wheel."}
            </p>
          )}
        </div>
      )}
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
  board,
  onDraw,
  onRaise,
  onMove,
  onResize,
  onUpdate,
  onPin,
  onDelete,
}: {
  note: StickyNote;
  drawing: boolean;
  board: React.RefObject<HTMLDivElement | null>;
  onDraw: () => void;
  onRaise: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onUpdate: (patch: Partial<StickyNote>) => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const ink = inkOnPaper(note.color);
  const article = useRef<HTMLElement>(null);
  const boardRedo = useInkRedo();

  function drag(e: React.PointerEvent, kind: "move" | ResizeHandle) {
    if (e.button !== 0) return;
    onRaise();
    const el = article.current;
    if (!el) return;
    const start = { x: note.x, y: note.y, w: note.w, h: note.h };
    const ox = e.clientX;
    const oy = e.clientY;
    let nx = start.x;
    let ny = start.y;
    let nw = start.w;
    let nh = start.h;
    const ac = new AbortController();
    const { signal } = ac;
    const move = (ev: PointerEvent) => {
      const r = board.current?.getBoundingClientRect();
      if (!r) return;
      if (kind === "move") {
        nx = Math.min(Math.max(0, r.width - nw), Math.max(0, start.x + (ev.clientX - ox)));
        ny = Math.min(Math.max(0, r.height - nh), Math.max(0, start.y + (ev.clientY - oy)));
        el.style.left = `${nx}px`;
        el.style.top = `${ny}px`;
      } else {
        const next = resizeFrom(kind, start, ev.clientX - ox, ev.clientY - oy, 180, 160);
        nw = Math.min(Math.max(180, next.w), r.width);
        nh = Math.min(Math.max(160, next.h), r.height);
        nx = Math.min(Math.max(0, next.x), Math.max(0, r.width - nw));
        ny = Math.min(Math.max(0, next.y), Math.max(0, r.height - nh));
        el.style.left = `${nx}px`;
        el.style.top = `${ny}px`;
        el.style.width = `${nw}px`;
        el.style.height = `${nh}px`;
      }
    };
    const stop = () => {
      ac.abort();
      if (kind === "move") onMove(nx, ny);
      else {
        onMove(nx, ny);
        onResize(nw, nh);
      }
    };
    window.addEventListener("pointermove", move, { signal });
    window.addEventListener("pointerup", stop, { signal });
    window.addEventListener("pointercancel", stop, { signal });
  }

  return (
    <article
      ref={article}
      className="group absolute flex flex-col overflow-hidden rounded-sm shadow-[var(--shadow-border)]"
      style={{
        left: note.x,
        top: note.y,
        width: note.w,
        height: note.h,
        backgroundColor: note.color,
        color: ink,
        zIndex: note.z,
      }}
    >
      <header
        className="relative z-[2] flex h-9 shrink-0 cursor-grab touch-none items-center gap-1 border-b border-current/10 px-1 active:cursor-grabbing"
        onPointerDown={(e) => {
          if (drawing) return;
          if ((e.target as HTMLElement).closest("button,input,label,[data-no-drag]")) return;
          drag(e, "move");
        }}
      >
        <span className="min-w-0 grow truncate px-1.5 text-xs font-semibold opacity-80">{noteTitle(note)}</span>
        <NoteTools
          ink={ink}
          color={note.color}
          onColor={(color) => onUpdate({ color })}
          onFloat={onPin}
          onDelete={onDelete}
        />
      </header>
      <div className="relative min-h-0 flex-1">
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
      <ResizeHandles onCorner={(e, corner) => drag(e, corner)} />
    </article>
  );
}
