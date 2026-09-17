"use client";

import { useEffect, useState } from "react";
import { GripHorizontal, Pin, PinOff, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { NoteTools } from "@/components/note-chrome";
import { NoteInk } from "@/components/note-ink";
import { NoteEditor, NoteFormat, NotePhotos, addNotePhotos, useInkRedo } from "@/components/note-pad";
import { WidgetBody } from "@/components/widgets";
import { inkOnPaper, noteTitle } from "@/lib/format";
import { closeThisWindow, setNativeAlwaysOnTop, watchNativeBounds, watchNativeClose } from "@/lib/native-float";
import { useAtrium } from "@/lib/store";
import type { NewsItem } from "@/lib/types";
import { WIDGET_LABEL } from "@/lib/types";

const NEWS_SNAP = "atrium.news.snap";

function readHeadlines(): NewsItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(NEWS_SNAP) ?? "null") as { items?: NewsItem[] };
    return Array.isArray(raw?.items) ? raw.items : [];
  } catch {
    return [];
  }
}

function Chrome({
  title,
  pinnedTop,
  onPin,
  onClose,
  extra,
}: {
  title: string;
  pinnedTop: boolean;
  onPin: () => void;
  onClose: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <header className="flex h-11 shrink-0 cursor-grab items-center gap-1 border-b border-current/15 px-2 active:cursor-grabbing">
      <div className="flex min-w-0 grow items-center gap-1.5" data-tauri-drag-region>
        <GripHorizontal className="size-3.5 shrink-0 opacity-45" data-tauri-drag-region />
        <span className="min-w-0 truncate text-xs font-medium opacity-80" data-tauri-drag-region>
          {title}
        </span>
      </div>
      {extra}
      <button
        type="button"
        data-no-drag
        className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10"
        aria-label={pinnedTop ? "Unpin from top" : "Keep on top"}
        aria-pressed={pinnedTop}
        onClick={onPin}
      >
        {pinnedTop ? <Pin className="size-3.5" /> : <PinOff className="size-3.5 opacity-60" />}
      </button>
      <button
        type="button"
        data-no-drag
        className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
    </header>
  );
}

export function FloatShell({ kind, id }: { kind: "note" | "widget"; id: string }) {
  const { notes, windows, updateNote, updateWindow, unpinNote, removeNote, closeWindow } = useAtrium(
    useShallow((s) => ({
      notes: s.notes,
      windows: s.windows,
      updateNote: s.updateNote,
      updateWindow: s.updateWindow,
      unpinNote: s.unpinNote,
      removeNote: s.removeNote,
      closeWindow: s.closeWindow,
    })),
  );
  const [drawing, setDrawing] = useState(false);
  const [pinnedTop, setPinnedTop] = useState(false);
  const [headlines] = useState(readHeadlines);
  const inkRedo = useInkRedo();
  const note = notes.find((n) => n.id === id);
  const win = windows.find((w) => w.id === id);
  const gone = (kind === "note" && !note) || (kind === "widget" && !win);

  useEffect(() => {
    return watchNativeBounds((box) => {
      if (kind === "note") updateNote(id, box);
      else updateWindow(id, box);
    });
  }, [kind, id, updateNote, updateWindow]);

  useEffect(() => {
    return watchNativeClose(() => {
      if (kind === "note") unpinNote(id);
      else closeWindow(id);
    });
  }, [kind, id, unpinNote, closeWindow]);

  useEffect(() => {
    if (gone) void closeThisWindow();
  }, [gone]);

  async function dismiss(after: () => void) {
    after();
    await closeThisWindow();
  }

  function togglePin() {
    const next = !pinnedTop;
    setPinnedTop(next);
    void setNativeAlwaysOnTop(next);
  }

  if (kind === "note" && note) {
    const ink = inkOnPaper(note.color);
    return (
      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden" style={{ background: note.color, color: ink }}>
        <Chrome
          title={noteTitle(note)}
          pinnedTop={pinnedTop}
          onPin={togglePin}
          onClose={() => void dismiss(() => unpinNote(note.id))}
          extra={
            <NoteTools
              ink={ink}
              color={note.color}
              pinned
              onColor={(color) => updateNote(note.id, { color })}
              onFloat={() => void dismiss(() => unpinNote(note.id))}
              onDelete={() => void dismiss(() => removeNote(note.id))}
            />
          }
        />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <NoteInk strokes={note.ink ?? []} color={ink} active={drawing} onChange={(inkStrokes) => updateNote(note.id, { ink: inkStrokes })} />
          <NotePhotos photos={note.photos ?? []} onRemove={(pid) => updateNote(note.id, { photos: (note.photos ?? []).filter((p) => p.id !== pid) })} />
          <NoteEditor note={note} ink={ink} drawing={drawing} onUpdate={(patch) => updateNote(note.id, patch)} />
        </div>
        <NoteFormat
          ink={ink}
          drawing={drawing}
          canUndo={Boolean(note.ink?.length)}
          canRedo={inkRedo.canRedoFor(note.id)}
          onDraw={() => setDrawing((v) => !v)}
          onUndo={() => inkRedo.pushUndo(note.id, note.ink, (inkStrokes) => updateNote(note.id, { ink: inkStrokes }))}
          onRedo={() => inkRedo.popRedo(note.id, note.ink, (inkStrokes) => updateNote(note.id, { ink: inkStrokes }))}
          onClear={() => {
            inkRedo.forget(note.id);
            updateNote(note.id, { ink: [] });
          }}
          onPhoto={(files) => void addNotePhotos(note.photos, files).then((photos) => updateNote(note.id, { photos }))}
        />
      </div>
    );
  }

  if (kind === "widget" && win) {
    return (
      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-card text-card-foreground">
        <Chrome
          title={WIDGET_LABEL[win.kind]}
          pinnedTop={pinnedTop}
          onPin={togglePin}
          onClose={() => void dismiss(() => closeWindow(win.id))}
        />
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <WidgetBody kind={win.kind} headlines={headlines} />
        </div>
      </div>
    );
  }

  return null;
}
