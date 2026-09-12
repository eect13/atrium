"use client";

import { useRef, useState } from "react";
import { Eraser, GripHorizontal, LayoutGrid, LayoutList, Pencil, Pin, PinOff } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { AddColorWheel, NoteColor } from "@/components/note-color";
import { NoteInk } from "@/components/note-ink";
import { ResizeHandles } from "@/components/float-window";
import { Button } from "@/components/ui/button";
import { resizeFrom, type ResizeCorner } from "@/lib/desk";
import { inkOnPaper, NOTE_COLORS, uid } from "@/lib/format";
import { useAtrium } from "@/lib/store";
import type { StickyNote } from "@/lib/types";
import { cn } from "@/lib/utils";
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
  const boardNotes = notes.filter((n) => !n.pinned);
  const pinned = notes.filter((n) => n.pinned);
  const layout = notesLayout === "list" ? "list" : "board";

  function spawn(color: string) {
    addNote({
      id: uid(),
      text: "",
      color,
      x: 32 + Math.random() * 80,
      y: 32 + Math.random() * 60,
      z: notes.reduce((m, n) => Math.max(m, n.z), 1) + 1,
      w: 220,
      h: 200,
      pinned: false,
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-medium tracking-tight">Sticky notes</h2>
        <p className="text-sm text-muted-foreground">
          <span className="lg:hidden">Board or list. Pin is for the desktop desk.</span>
          <span className="hidden lg:inline">Drag the bar at the top. Corners resize. Pencil for freehand.</span>
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
                className="overflow-hidden rounded-lg p-3 shadow-[var(--shadow-border)]"
                style={{ backgroundColor: n.color, color: ink }}
              >
                <textarea
                  className="min-h-24 w-full resize-none bg-inherit text-sm leading-snug outline-none"
                  style={{ color: ink }}
                  value={n.text}
                  placeholder="Write…"
                  onChange={(e) => updateNote(n.id, { text: e.target.value })}
                />
                <div className="flex items-center justify-between text-xs" style={{ color: ink, opacity: 0.7 }}>
                  <NoteColor color={n.color} onChange={(color) => updateNote(n.id, { color })} ink={ink} />
                  <div className="flex">
                    <Button variant="ghost" size="sm" className="h-8 px-2" style={{ color: ink }} onClick={() => pinNote(n.id)}>
                      <Pin className="size-3.5" />
                      Float
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2" style={{ color: ink }} onClick={() => removeNote(n.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
          {!boardNotes.length && (
            <p className="p-8 text-sm text-muted-foreground">
              {notes.length
                ? "Pinned notes are floating on the desktop. Pick a color for a new one."
                : "Pick a color to add a note — swatches or the color wheel."}
            </p>
          )}
        </div>
      ) : (
        <div
          ref={board}
          className="scroll-auto relative min-h-[24rem] rounded-xl border border-dashed border-border bg-card sm:min-h-[32rem]"
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
              onPin={() => pinNote(n.id)}
              onDelete={() => removeNote(n.id)}
            />
          ))}
          {!boardNotes.length && (
            <p className="p-8 text-sm text-muted-foreground">
              {notes.length
                ? "Pinned notes are floating on the desktop. Pick a color for a new one."
                : "Pick a color to add a note — swatches or the color wheel."}
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
          {pinned.map((n) => (
            <div key={n.id} className="flex items-center gap-2 border-b border-border py-2">
              <NoteColor color={n.color} onChange={(color) => updateNote(n.id, { color })} />
              <span className="min-w-0 grow truncate text-sm">{n.text.split("\n")[0] || "Untitled"}</span>
              <Button variant="ghost" size="sm" onClick={() => unpinNote(n.id)}>
                Unpin
              </Button>
            </div>
          ))}
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

  function drag(e: React.PointerEvent, kind: "move" | ResizeCorner) {
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
        const next = resizeFrom(kind, start, ev.clientX - ox, ev.clientY - oy, 160, 140);
        nw = Math.min(Math.max(160, next.w), r.width);
        nh = Math.min(Math.max(140, next.h), r.height);
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
      className="group absolute overflow-hidden rounded-sm shadow-[var(--shadow-border)]"
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
        className="relative z-[2] flex h-9 shrink-0 cursor-grab touch-none items-center justify-center border-b border-current/15 active:cursor-grabbing"
        onPointerDown={(e) => {
          if (drawing) return;
          if ((e.target as HTMLElement).closest("button,input,label")) return;
          drag(e, "move");
        }}
      >
        <GripHorizontal className="size-4 opacity-45" aria-hidden />
        <span className="sr-only">Drag note</span>
      </header>
      <div className="absolute inset-x-0 bottom-11 top-9">
        <NoteInk
          strokes={note.ink ?? []}
          color={ink}
          active={drawing}
          onChange={(inkStrokes) => onUpdate({ ink: inkStrokes })}
        />
      </div>
      <textarea
        className={cn(
          "relative z-[1] h-[calc(100%-4.75rem)] w-full resize-none bg-transparent px-3 pt-2 text-sm leading-snug outline-none",
          drawing && "pointer-events-none",
        )}
        style={{ color: ink }}
        value={note.text}
        placeholder="Write…"
        onChange={(e) => onUpdate({ text: e.target.value })}
      />
      <div
        className="relative z-[4] flex items-center justify-between gap-1 px-1 pb-1 text-xs"
        style={{ color: ink, opacity: 0.8 }}
      >
        <div className="flex items-center">
          <NoteColor color={note.color} onChange={(color) => onUpdate({ color })} ink={ink} />
          <button
            type="button"
            aria-label={drawing ? "Stop drawing" : "Draw"}
            aria-pressed={drawing}
            className={cn("flex size-9 items-center justify-center rounded-sm hover:bg-black/10", drawing && "bg-black/10")}
            onClick={onDraw}
          >
            <Pencil className="size-3.5" />
          </button>
          {(note.ink?.length ?? 0) > 0 ? (
            <button
              type="button"
              aria-label="Clear drawing"
              className="flex size-9 items-center justify-center rounded-sm hover:bg-black/10"
              onClick={() => onUpdate({ ink: [] })}
            >
              <Eraser className="size-3.5" />
            </button>
          ) : null}
        </div>
        <div className="flex">
          <Button variant="ghost" size="sm" className="h-8 px-2" style={{ color: ink }} onClick={onPin}>
            <Pin className="size-3.5" />
            Float
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-2" style={{ color: ink }} onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
      <ResizeHandles onCorner={(e, corner) => drag(e, corner)} />
    </article>
  );
}
