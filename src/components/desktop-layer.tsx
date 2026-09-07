"use client";

import { useEffect } from "react";
import { PinOff } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { FloatWindow } from "@/components/float-window";
import { WidgetBody } from "@/components/widgets";
import { fitBox } from "@/lib/desk";
import { useAtrium } from "@/lib/store";
import { WIDGET_LABEL, type NewsItem, type WidgetKind } from "@/lib/types";

function allowed(kind: WidgetKind, modules: { finance: boolean; news: boolean }) {
  if (kind === "finance") return modules.finance;
  if (kind === "news") return modules.news;
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
      {pinned.map((n) => (
        <div key={n.id} className="pointer-events-auto">
          <FloatWindow
            x={n.x}
            y={n.y}
            z={n.z}
            w={n.w}
            h={n.h}
            title="Note"
            paper={n.color}
            minW={180}
            minH={120}
            extra={
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-sm text-ink/70 hover:bg-ink/10 hover:text-ink"
                aria-label="Send back to board"
                title="Send back to board"
                onClick={() => unpinNote(n.id)}
              >
                <PinOff className="size-3.5" />
              </button>
            }
            onMove={(x, y) => updateNote(n.id, { x, y })}
            onResize={(w, h) => updateNote(n.id, { w, h })}
            onRaise={() => raise("note", n.id)}
            onClose={() => unpinNote(n.id)}
          >
            <textarea
              className="h-full w-full resize-none bg-inherit text-sm leading-snug text-ink outline-none"
              value={n.text}
              placeholder="Write…"
              onChange={(e) => updateNote(n.id, { text: e.target.value })}
            />
          </FloatWindow>
        </div>
      ))}
    </div>
  );
}
