"use client";

import { useEffect, useState } from "react";
import { Layers, Lock } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useNoteFloatTools } from "@/components/note-float-tools";
import { NoteInk } from "@/components/note-ink";
import { NoteEditor, NoteFormat, NotePhotos, addNotePhotos, useInkRedo } from "@/components/note-pad";
import { WidgetBody } from "@/components/widgets";
import { TitleBar } from "@/components/widget-shell";
import { SHELL_REVEAL, useViewRows } from "@/lib/widget-menu";
import { FLOAT_VIEW } from "@/lib/dash";
import { openInAtrium } from "@/lib/open-in-atrium";
import { toggleDeskFlag } from "@/lib/desk-flags";
import { cn } from "@/lib/utils";
import { inkOnPaper, noteTitle } from "@/lib/format";
import { applyDeskFlags, closeThisWindow, setNativeAlwaysOnTop, snapThisWindow, watchNativeBounds, watchNativeClose } from "@/lib/native-float";
import { cardAlpha, deskNeighbours, snapBox } from "@/lib/desk-snap";
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

  // Card 212: this widget's own window follows its saved desk flags (also after Unlock all).
  const flags = kind === "widget" && win ? `${win.locked ? 1 : 0}${win.behind ? 1 : 0}${win.onTop ? 1 : 0}${win.frame ? 1 : 0}` : "";
  useEffect(() => {
    if (!flags) return;
    void applyDeskFlags({ locked: flags[0] === "1", behind: flags[1] === "1", onTop: flags[2] === "1", frame: flags[3] === "1" });
  }, [flags]);

  useEffect(() => {
    return watchNativeBounds((box) => {
      if (kind === "note") updateNote(id, box);
      else updateWindow(id, box);
      const snap = widgetLook(useAtrium.getState().dashPrefs).deskSnap;
      if (snap !== "off") void snapThisWindow(box, (b, area) => snapBox(b, area, snap, deskNeighbours(useAtrium.getState(), kind, id)));
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

  const viewRows = useViewRows(win?.kind ?? "");
  const noteTools = useNoteFloatTools({
    color: note?.color ?? "",
    ink: note ? inkOnPaper(note.color) : undefined,
    onColor: (color) => updateNote(id, { color }),
    onDelete: () => void dismiss(() => removeNote(id)),
  });

  // Card 216 §6: Ctrl+W / Esc close the focused float (Esc is left to open menus and typing).
  useEffect(() => {
    const ac = new AbortController();
    window.addEventListener(
      "keydown",
      (e) => {
        const ctrlW = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w";
        const esc = e.key === "Escape" && !(e.target as HTMLElement | null)?.closest?.("input,textarea,[contenteditable],[role=menu]");
        if (!ctrlW && !esc) return;
        e.preventDefault();
        if (kind === "note") void dismiss(() => unpinNote(id));
        else void dismiss(() => closeWindow(id));
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

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

  // Card 216b: window flags are title-bar actions (inline at ≥420 on hover, else first in ⋯ window group).
  const flagAction = (id: string, Icon: typeof Lock, label: string, on: boolean, onSelect: () => void) => ({
    id,
    group: "flags" as const,
    // Card 230 (Form 229 S2): ⋯ rows are text-only, like every other ⋯ menu and the desktop popup.
    row: { label, checked: on, onSelect },
    node: (
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        className={cn("inline-flex size-11 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "text-foreground" : "text-muted-foreground")}
        onClick={onSelect}
      >
        <Icon className="size-4" />
      </button>
    ),
  });
  const goHome = (v: Parameters<typeof openInAtrium>[0]) => ({ label: "Open in Atrium", onSelect: () => void openInAtrium(v, (x) => useAtrium.getState().setView(x)) });

  if (kind === "note" && note) {
    const ink = inkOnPaper(note.color);
    return (
      <div className="group/w relative flex h-dvh max-h-dvh flex-col overflow-hidden" style={{ background: note.color, color: ink }}>
        <TitleBar
          className="cursor-grab px-2 pl-3 active:cursor-grabbing"
          data-tauri-drag-region
          title={noteTitle(note)}
          titleClassName="text-current opacity-80"
          titleProps={{ "data-tauri-drag-region": true }}
          desk
          actions={[noteTools.colorAction]}
          menuLabel="Note menu"
          groups={{
            window: [{ label: "Keep on top", checked: pinnedTop, onSelect: togglePin }],
            go: [{ label: "Back to board", onSelect: () => void dismiss(() => unpinNote(note.id)) }, goHome("notes")],
            close: [{ label: "Close", onSelect: () => void dismiss(() => unpinNote(note.id)) }],
            danger: [noteTools.deleteRow],
          }}
        />
        {noteTools.anchors}
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
    const flip = (key: "locked" | "behind" | "frame" | "onTop") => {
      const patch = toggleDeskFlag(win, key);
      updateWindow(win.id, patch);
      if ("onTop" in patch) setPinnedTop(Boolean(patch.onTop));
    };
    return (
      <div
        className={cn("group/w relative flex h-dvh max-h-dvh flex-col overflow-hidden rounded-xl text-card-foreground", win.frame && "shadow-float ring-1 ring-border")}
        style={{ background: cardAlpha(deskOpacity) }}
        data-locked={win.locked ? "" : undefined}
      >
        <TitleBar
          desk
          className={cn("px-2 pl-4", !win.locked && "cursor-grab active:cursor-grabbing")}
          title={WIDGET_LABEL[win.kind]}
          titleClassName={SHELL_REVEAL}
          titleProps={win.locked ? {} : { "data-tauri-drag-region": true }}
          trail={win.locked ? <Lock aria-hidden className="pointer-events-none size-3 shrink-0 text-muted-foreground opacity-0 group-hover/w:opacity-45" /> : null}
          menuLabel={`${WIDGET_LABEL[win.kind]} menu`}
          actions={[
            flagAction("lock", Lock, "Lock position", Boolean(win.locked), () => flip("locked")),
            flagAction("behind", Layers, "Stay behind windows", Boolean(win.behind), () => flip("behind")),
          ]}
          groups={{
            view: viewRows,
            window: [
              { label: "Frame", checked: Boolean(win.frame), onSelect: () => flip("frame") },
              { label: "Keep on top", checked: pinnedTop && !win.behind, onSelect: () => flip("onTop") },
            ],
            go: [goHome(FLOAT_VIEW[win.kind])],
            close: [{ label: "Close", onSelect: () => void dismiss(() => closeWindow(win.id)) }],
          }}
        />
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
          <WidgetBody kind={win.kind} headlines={headlines} />
        </div>
      </div>
    );
  }

  return null;
}
