"use client";

import { useEffect, useState } from "react";
import { PinOff } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { FloatWindow } from "@/components/float-window";
import { NoteColor } from "@/components/note-color";
import { NoteInk } from "@/components/note-ink";
import { MenuRow, NoteEditor, NoteFormat, NoteMore, NotePhotos, addNotePhotos } from "@/components/note-pad";
import { WidgetBody } from "@/components/widgets";
import { fitBox } from "@/lib/desk";
import { inkOnPaper, noteTitle } from "@/lib/format";
import { useAtrium } from "@/lib/store";
import { WIDGET_LABEL, type NewsItem, type WidgetKind } from "@/lib/types";

function allowed(kind: WidgetKind, modules: { finance: boolean; news: boolean; quotes: boolean }) {
  if (kind === "finance") return modules.finance;
  if (kind === "news") return modules.news;
  if (kind === "quote") return modules.quotes !== false;
  return true;
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable]"));
}

export function DesktopLayer({
  headlines,
  newsLoading = false,
  newsError = false,
}: {
  headlines: NewsItem[];
  newsLoading?: boolean;
  newsError?: boolean;
}) {
  const {
    notes,
    windows,
    modules,
    updateNote,
    updateWindow,
    closeWindow,
    unpinNote,
    raise,
  } = useAtrium(
    useShallow((s) => ({
      notes: s.notes,
      windows: s.windows,
      modules: s.modules,
      updateNote: s.updateNote,
      updateWindow: s.updateWindow,
      closeWindow: s.closeWindow,
      unpinNote: s.unpinNote,
      raise: s.raise,
    })),
  );
  const [inkId, setInkId] = useState<string | null>(null);
  const pinned = modules.notes ? notes.filter((n) => n.pinned) : [];
  const floating = windows.filter((w) => allowed(w.kind, modules));

  useEffect(() => {
    const ac = new AbortController();
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape" || isTyping(e.target)) return;
        if (document.querySelector("[data-desk-menu]")) return;
        const topNote = pinned.reduce<(typeof pinned)[number] | null>((best, n) => (!best || n.z > best.z ? n : best), null);
        const topWin = floating.reduce<(typeof floating)[number] | null>((best, w) => (!best || w.z > best.z ? w : best), null);
        if (topNote && (!topWin || topNote.z >= topWin.z)) {
          e.preventDefault();
          unpinNote(topNote.id);
        } else if (topWin) {
          e.preventDefault();
          closeWindow(topWin.id);
        }
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, [pinned, floating, unpinNote, closeWindow]);

  useEffect(() => {
    const ac = new AbortController();
    const clampAll = () => {
      for (const w of floating) {
        const next = fitBox(w.x, w.y, w.w, w.h);
        if (next.x !== w.x || next.y !== w.y || next.w !== w.w || next.h !== w.h) updateWindow(w.id, next);
      }
      for (const n of pinned) {
        const next = fitBox(n.x, n.y, n.w, n.h);
        if (next.x !== n.x || next.y !== n.y || next.w !== n.w || next.h !== n.h) updateNote(n.id, next);
      }
    };
    clampAll();
    window.addEventListener("resize", clampAll, { signal: ac.signal });
    return () => ac.abort();
  }, [floating, pinned, updateWindow, updateNote]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {floating.map((win) => (
        <div key={win.id} className="pointer-events-auto">
          <FloatWindow
            x={win.x}
            y={win.y}
            z={win.z}
            w={win.w}
            h={win.h}
            title={WIDGET_LABEL[win.kind]}
            onMove={(x, y) => updateWindow(win.id, { x, y })}
            onResize={(w, h) => updateWindow(win.id, { w, h })}
            onRaise={() => raise("win", win.id)}
            onClose={() => closeWindow(win.id)}
          >
            <WidgetBody kind={win.kind} headlines={headlines} newsLoading={newsLoading} newsError={newsError} />
          </FloatWindow>
        </div>
      ))}
      {pinned.map((n) => {
        const ink = inkOnPaper(n.color);
        const drawing = inkId === n.id;
        return (
          <div key={n.id} className="pointer-events-auto">
            <FloatWindow
              x={n.x}
              y={n.y}
              z={n.z}
              w={n.w}
              h={n.h}
              title={noteTitle(n)}
              paper={n.color}
              minW={200}
              minH={160}
              extra={
                <NoteMore ink={ink}>
                  <div className="px-1 py-1">
                    <NoteColor color={n.color} onChange={(color) => updateNote(n.id, { color })} ink={ink} />
                  </div>
                  <MenuRow onClick={() => unpinNote(n.id)}>
                    <PinOff className="size-3.5" />
                    Board
                  </MenuRow>
                </NoteMore>
              }
              onMove={(x, y) => updateNote(n.id, { x, y })}
              onResize={(w, h) => updateNote(n.id, { w, h })}
              onRaise={() => raise("note", n.id)}
              onClose={() => unpinNote(n.id)}
            >
              <div className="flex h-full min-h-0 flex-col">
                <div className="max-md:opacity-100 md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100">
                  <NoteFormat
                    ink={ink}
                    drawing={drawing}
                    canUndo={Boolean(n.ink?.length)}
                    onDraw={() => setInkId((id) => (id === n.id ? null : n.id))}
                    onUndo={() => updateNote(n.id, { ink: (n.ink ?? []).slice(0, -1) })}
                    onClear={() => updateNote(n.id, { ink: [] })}
                    onPhoto={(files) => void addNotePhotos(n.photos, files).then((photos) => updateNote(n.id, { photos }))}
                  />
                </div>
                <div className="relative min-h-0 flex-1">
                  <NoteInk
                    strokes={n.ink ?? []}
                    color={ink}
                    active={drawing}
                    onChange={(inkStrokes) => updateNote(n.id, { ink: inkStrokes })}
                  />
                  <NotePhotos
                    photos={n.photos ?? []}
                    onRemove={(id) => updateNote(n.id, { photos: (n.photos ?? []).filter((p) => p.id !== id) })}
                  />
                  <NoteEditor note={n} ink={ink} drawing={drawing} onUpdate={(patch) => updateNote(n.id, patch)} />
                </div>
              </div>
            </FloatWindow>
          </div>
        );
      })}
    </div>
  );
}
