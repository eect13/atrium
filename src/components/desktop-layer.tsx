"use client";

import { useEffect, useRef, useState } from "react";
import { PinOff } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { FloatWindow } from "@/components/float-window";
import { NoteColor } from "@/components/note-color";
import { NoteInk } from "@/components/note-ink";
import { MenuRow, NoteEditor, NoteFormat, NoteMore, NotePhotos, addNotePhotos, useInkRedo } from "@/components/note-pad";
import { WidgetBody } from "@/components/widgets";
import { boxOffscreen, fitBox } from "@/lib/desk";
import { inkOnPaper, noteTitle } from "@/lib/format";
import { useAtrium } from "@/lib/store";
import { WIDGET_LABEL, type NewsItem, type WidgetKind } from "@/lib/types";
import { closeNativeFloat, isTauri, openNativeFloat } from "@/lib/native-float";

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
  const inkRedo = useInkRedo();
  const liveNative = useRef({ notes: new Set<string>(), wins: new Set<string>() });
  const pinned = modules.notes ? notes.filter((n) => n.pinned) : [];
  const floating = windows.filter((w) => allowed(w.kind, modules));
  const pinnedKey = pinned.map((n) => n.id).join("\0");
  const floatingKey = floating.map((w) => w.id).join("\0");
  const boxesRef = useRef({ pinned, floating });
  boxesRef.current = { pinned, floating };

  useEffect(() => {
    if (!isTauri()) return;
    const { pinned: liveNotes, floating: liveWins } = boxesRef.current;
    const noteIds = new Set(liveNotes.map((n) => n.id));
    const winIds = new Set(liveWins.map((w) => w.id));
    for (const id of liveNative.current.notes) if (!noteIds.has(id)) void closeNativeFloat("note", id);
    for (const id of liveNative.current.wins) if (!winIds.has(id)) void closeNativeFloat("widget", id);
    for (const n of liveNotes) {
      if (liveNative.current.notes.has(n.id)) continue;
      void openNativeFloat("note", n.id, { x: n.x, y: n.y, w: n.w, h: n.h, title: n.title || "Note", pinned: true }, () => unpinNote(n.id));
    }
    for (const w of liveWins) {
      if (liveNative.current.wins.has(w.id)) continue;
      void openNativeFloat("widget", w.id, { x: w.x, y: w.y, w: w.w, h: w.h, title: WIDGET_LABEL[w.kind] }, () => closeWindow(w.id));
    }
    liveNative.current = { notes: noteIds, wins: winIds };
  }, [pinnedKey, floatingKey]);

  useEffect(() => {
    const ac = new AbortController();
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape" || isTyping(e.target)) return;
        if (document.querySelector("[data-desk-menu]")) return;
        const { pinned: liveNotes, floating: liveWins } = boxesRef.current;
        const topNote = liveNotes.reduce<(typeof liveNotes)[number] | null>((best, n) => (!best || n.z > best.z ? n : best), null);
        const topWin = liveWins.reduce<(typeof liveWins)[number] | null>((best, w) => (!best || w.z > best.z ? w : best), null);
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
  }, [unpinNote, closeWindow]);

  useEffect(() => {
    if (isTauri()) return;
    const clampAll = () => {
      const { pinned: liveNotes, floating: liveWins } = boxesRef.current;
      for (const w of liveWins) {
        if (!boxOffscreen(w.x, w.y, w.w, w.h)) continue;
        const next = fitBox(w.x, w.y, w.w, w.h);
        if (next.x !== w.x || next.y !== w.y || next.w !== w.w || next.h !== w.h) updateWindow(w.id, next);
      }
      for (const n of liveNotes) {
        if (!boxOffscreen(n.x, n.y, n.w, n.h)) continue;
        const next = fitBox(n.x, n.y, n.w, n.h);
        if (next.x !== n.x || next.y !== n.y || next.w !== n.w || next.h !== n.h) updateNote(n.id, next);
      }
    };
    clampAll();
    window.addEventListener("resize", clampAll);
    return () => window.removeEventListener("resize", clampAll);
  }, [updateWindow, updateNote]);

  if (isTauri()) return null;
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
                <NoteFormat
                  ink={ink}
                  drawing={drawing}
                  canUndo={Boolean(n.ink?.length)}
                  canRedo={inkRedo.canRedoFor(n.id)}
                  onDraw={() => setInkId((id) => (id === n.id ? null : n.id))}
                  onUndo={() => inkRedo.pushUndo(n.id, n.ink, (ink) => updateNote(n.id, { ink }))}
                  onRedo={() => inkRedo.popRedo(n.id, n.ink, (ink) => updateNote(n.id, { ink }))}
                  onClear={() => {
                    inkRedo.forget(n.id);
                    updateNote(n.id, { ink: [] });
                  }}
                  onPhoto={(files) => void addNotePhotos(n.photos, files).then((photos) => updateNote(n.id, { photos }))}
                />
              </div>
            </FloatWindow>
          </div>
        );
      })}
    </div>
  );
}
