"use client";

import { useEffect, useState } from "react";
import { GripHorizontal, Pin, PinOff } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { NoteTools } from "@/components/note-chrome";
import { CloseButton } from "@/components/ui/close-button";
import { NoteInk } from "@/components/note-ink";
import { NoteEditor, NoteFormat, NotePhotos, addNotePhotos, useInkRedo } from "@/components/note-pad";
import { WidgetBody } from "@/components/widgets";
import { inkOnPaper, noteTitle } from "@/lib/format";
import { closeThisWindow, setNativeAlwaysOnTop, snapThisWindow, watchNativeBounds, watchNativeClose } from "@/lib/native-float";
import { cardAlpha, snapBox } from "@/lib/desk-snap";
import { widgetLook } from "@/lib/widget-prefs";
import { useAtrium } from "@/lib/store";
import { startRealmSync } from "@/lib/realm-wire";
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
    <header className="group/bar flex h-12 shrink-0 cursor-grab items-center gap-1 border-b border-current/15 px-2 active:cursor-grabbing">
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
        className="flex size-hit shrink-0 items-center justify-center rounded-md hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        aria-label={pinnedTop ? "Unpin from top" : "Keep on top"}
        aria-pressed={pinnedTop}
        onClick={onPin}
      >
        {pinnedTop ? <Pin className="size-3.5" /> : <PinOff className="size-3.5 opacity-60" />}
      </button>
      <CloseButton
        data-no-drag
        className="text-current hover:bg-black/10 hover:text-current focus-visible:ring-current focus-visible:ring-offset-0"
        onClick={onClose}
      />
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
  const savedTop = useAtrium((s) => (kind === "note" ? s.notes.find((n) => n.id === id)?.onTop : s.windows.find((w) => w.id === id)?.onTop) === true);
  const [pinnedTop, setPinnedTop] = useState(savedTop);
  const [headlines] = useState(readHeadlines);
  const inkRedo = useInkRedo();
  const deskOpacity = useAtrium((s) => widgetLook(s.dashPrefs).deskOpacity);
  useEffect(() => {
    // Card 204: the widget window is transparent; only the card paints (with its opacity).
    if (kind !== "widget") return;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
  }, [kind]);
  const note = notes.find((n) => n.id === id);
  const win = windows.find((w) => w.id === id);
  const gone = (kind === "note" && !note) || (kind === "widget" && !win);

  useEffect(() => startRealmSync(useAtrium), []);

  useEffect(() => {
    return watchNativeBounds((box) => {
      if (kind === "note") updateNote(id, box);
      else updateWindow(id, box);
      const snap = widgetLook(useAtrium.getState().dashPrefs).deskSnap;
      if (snap !== "off") void snapThisWindow(box, (b, area) => snapBox(b, area, snap));
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
    if (kind === "note") updateNote(id, { onTop: next });
    else updateWindow(id, { onTop: next });
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
              reveal="always"
              onColor={(color) => updateNote(note.id, { color })}
              onFloat={() => void dismiss(() => unpinNote(note.id))}
              onDelete={() => void dismiss(() => removeNote(note.id))}
            />
          }
        />
        <div className="relative flex min-h-0 flex-1 flex-col overflow-auto">
          <NoteInk strokes={note.ink ?? []} color={ink} active={drawing} onChange={(inkStrokes) => updateNote(note.id, { ink: inkStrokes })} />
          <NotePhotos photos={note.photos ?? []} onRemove={(pid) => updateNote(note.id, { photos: (note.photos ?? []).filter((p) => p.id !== pid) })} />
          <NoteEditor note={note} ink={ink} drawing={drawing} contained onUpdate={(patch) => updateNote(note.id, patch)} />
        </div>
        <NoteFormat
          ink={ink}
          drawing={drawing}
          docked
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
      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden rounded-lg text-card-foreground" style={{ background: cardAlpha(deskOpacity) }}>
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
