"use client";

import { useRef } from "react";
import { Pin, PinOff } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { NOTE_COLORS, uid } from "@/lib/format";
import { useAtrium } from "@/lib/store";

export function NotesView() {
  const { notes, addNote, updateNote, removeNote, pinNote, unpinNote, raise } = useAtrium(
    useShallow((s) => ({
      notes: s.notes,
      addNote: s.addNote,
      updateNote: s.updateNote,
      removeNote: s.removeNote,
      pinNote: s.pinNote,
      unpinNote: s.unpinNote,
      raise: s.raise,
    })),
  );
  const board = useRef<HTMLDivElement>(null);
  const boardNotes = notes.filter((n) => !n.pinned);
  const pinned = notes.filter((n) => n.pinned);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-medium tracking-tight">Sticky notes</h2>
        <p className="text-sm text-muted-foreground">Pin a note to float it over every screen.</p>
        <div className="grow" />
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label="Add note"
            className="size-10 rounded-md border border-border"
            style={{ background: c }}
            onClick={() =>
              addNote({
                id: uid(),
                text: "",
                color: c,
                x: 32 + Math.random() * 80,
                y: 32 + Math.random() * 60,
                z: notes.reduce((m, n) => Math.max(m, n.z), 1) + 1,
                w: 208,
                h: 176,
                pinned: false,
              })
            }
          />
        ))}
      </div>
      <div
        ref={board}
        className="relative min-h-[32rem] overflow-hidden rounded-xl border border-dashed border-border bg-card"
      >
        {boardNotes.map((n) => (
          <article
            key={n.id}
            className="absolute cursor-grab touch-none overflow-hidden rounded-sm p-3 text-ink shadow-[var(--shadow-border)] active:cursor-grabbing"
            style={{
              left: n.x,
              top: n.y,
              width: n.w,
              height: n.h,
              backgroundColor: n.color,
              zIndex: n.z,
            }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("textarea,button")) return;
              raise("note", n.id);
              const el = e.currentTarget;
              const ox = e.clientX - el.getBoundingClientRect().left;
              const oy = e.clientY - el.getBoundingClientRect().top;
              el.setPointerCapture(e.pointerId);
              let nx = n.x;
              let ny = n.y;
              const ac = new AbortController();
              const { signal } = ac;
              const move = (ev: PointerEvent) => {
                const r = board.current?.getBoundingClientRect();
                if (!r) return;
                nx = Math.min(Math.max(0, r.width - n.w), Math.max(0, ev.clientX - r.left - ox));
                ny = Math.min(Math.max(0, r.height - n.h), Math.max(0, ev.clientY - r.top - oy));
                el.style.left = `${nx}px`;
                el.style.top = `${ny}px`;
              };
              const stop = () => {
                ac.abort();
                updateNote(n.id, { x: nx, y: ny });
              };
              window.addEventListener("pointermove", move, { signal });
              window.addEventListener("pointerup", stop, { signal });
              window.addEventListener("pointercancel", stop, { signal });
            }}
          >
            <textarea
              className="h-[calc(100%-2.25rem)] w-full resize-none bg-inherit text-sm leading-snug text-ink outline-none"
              value={n.text}
              placeholder="Write…"
              onChange={(e) => updateNote(n.id, { text: e.target.value })}
            />
            <div className="flex items-center justify-between text-xs text-ink/70">
              <span>Drag</span>
              <div className="flex">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-ink"
                  onClick={() => pinNote(n.id)}
                >
                  <Pin className="size-3.5" />
                  Float
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-ink"
                  onClick={() => removeNote(n.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          </article>
        ))}
        {!boardNotes.length && (
          <p className="p-8 text-sm text-muted-foreground">
            {notes.length
              ? "Pinned notes are floating on the desktop. Pick a color for a new one."
              : "Pick a color to add a note."}
          </p>
        )}
      </div>
      {pinned.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.06em] text-muted-foreground">
            <PinOff className="size-3.5" />
            Floating on desk
          </h3>
          {pinned.map((n) => (
            <div key={n.id} className="flex items-center gap-2 border-b border-border py-2">
              <span className="size-2 rounded-full" style={{ background: n.color }} />
              <span className="min-w-0 grow truncate text-sm">{n.text.split("\n")[0] || "Untitled"}</span>
              <Button variant="ghost" size="sm" onClick={() => unpinNote(n.id)}>
                Unpin
              </Button>
            </div>
          ))}
          <p className="mt-2 text-xs text-muted-foreground">
            Drag a pinned note anywhere over the app. Close or unpin to send it back.
          </p>
        </div>
      )}
    </div>
  );
}
