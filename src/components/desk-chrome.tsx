"use client";

import { useEffect, useRef, useState } from "react";
import { AppWindow, House, LayoutGrid, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_PINNED_NOTES } from "@/lib/desk";
import { noteTitle } from "@/lib/format";
import { useAtrium } from "@/lib/store";
import type { WidgetKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FloatBtn({ kind }: { kind: WidgetKind }) {
  const openWindow = useAtrium((s) => s.openWindow);
  const on = useAtrium((s) => s.windows.some((w) => w.kind === kind));
  const label = on ? "On desk" : "Float";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "hidden size-10 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground lg:flex",
            on && "text-foreground",
          )}
          aria-label={label}
          onClick={() => openWindow(kind)}
        >
          <AppWindow className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function DeskMenu() {
  const [open, setOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { openWindow, windows, closeWindow, closeAllWindows, homeWindows, modules, notes, pinNote, unpinNote, arrangeNotes } =
    useAtrium(
      useShallow((s) => ({
        openWindow: s.openWindow,
        windows: s.windows,
        closeWindow: s.closeWindow,
        closeAllWindows: s.closeAllWindows,
        homeWindows: s.homeWindows,
        modules: s.modules,
        notes: s.notes,
        pinNote: s.pinNote,
        unpinNote: s.unpinNote,
        arrangeNotes: s.arrangeNotes,
      })),
    );
  const items: { kind: WidgetKind; label: string }[] = [
    ...(modules.weather !== false ? [{ kind: "weather" as const, label: "Weather" }] : []),
    { kind: "calendar", label: "Calendar" },
  ];
  const afterNotes: { kind: WidgetKind; label: string }[] = [
    ...(modules.quotes !== false ? [{ kind: "quote" as const, label: "Quote" }] : []),
    ...(modules.finance ? [{ kind: "finance" as const, label: "Finance" }] : []),
    ...(modules.news ? [{ kind: "news" as const, label: "News" }] : []),
  ];
  const pinnedN = notes.filter((n) => n.pinned).length;
  const showNotes = modules.notes !== false;

  useEffect(() => {
    if (!open) {
      setNotesOpen(false);
      return;
    }
    const ac = new AbortController();
    window.addEventListener(
      "pointerdown",
      (e) => {
        if (!root.current?.contains(e.target as Node)) setOpen(false);
      },
      { signal: ac.signal },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
      },
      { signal: ac.signal, capture: true },
    );
    return () => ac.abort();
  }, [open]);

  function slot(item: { kind: WidgetKind; label: string }) {
    const win = windows.find((w) => w.kind === item.kind);
    return (
      <button
        key={item.kind}
        type="button"
        role="menuitem"
        className="flex h-11 w-full items-center justify-between rounded-md px-2 text-sm hover:bg-muted"
        onClick={() => {
          if (win) closeWindow(win.id);
          else openWindow(item.kind);
        }}
      >
        <span>{item.label}</span>
        <span className="text-xs text-muted-foreground">{win ? "Close" : "Open"}</span>
      </button>
    );
  }

  function toggleNote(id: string, pinned: boolean) {
    if (pinned) {
      unpinNote(id);
      return;
    }
    if (pinnedN >= MAX_PINNED_NOTES) {
      toast("Six notes on the desk — unpin one first.");
      return;
    }
    pinNote(id);
  }

  return (
    <div ref={root} className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted"
            aria-label="Windows"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen((o) => !o)}
          >
            <AppWindow className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Windows</TooltipContent>
      </Tooltip>
      {open ? (
        <div
          role="menu"
          data-desk-menu=""
          className="absolute right-0 top-11 z-50 w-56 rounded-lg bg-card p-2 text-card-foreground shadow-[var(--shadow-float)]"
        >
          {items.map(slot)}
          {showNotes ? (
            <div>
              <button
                type="button"
                role="menuitem"
                className="flex h-11 w-full items-center justify-between rounded-md px-2 text-sm hover:bg-muted"
                aria-expanded={notesOpen}
                onClick={() => setNotesOpen((v) => !v)}
              >
                <span className="inline-flex items-center gap-2">
                  <NotebookPen className="size-3.5" />
                  Notes
                </span>
                <span className="text-xs text-muted-foreground">
                  {pinnedN}/{MAX_PINNED_NOTES}
                </span>
              </button>
              {notesOpen ? (
                <div className="mb-1 max-h-64 overflow-y-auto rounded-md bg-muted/60 p-1">
                  {notes.length ? (
                    notes.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={n.pinned}
                        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-sm px-2 text-left text-sm hover:bg-background"
                        onClick={() => toggleNote(n.id, Boolean(n.pinned))}
                      >
                        <span className="min-w-0 truncate">{noteTitle(n)}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{n.pinned ? "On desk" : "Float"}</span>
                      </button>
                    ))
                  ) : (
                    <p className="px-2 py-2 text-xs text-muted-foreground">No notes yet.</p>
                  )}
                  {pinnedN > 0 ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="mt-1 flex h-11 w-full items-center gap-2 rounded-sm px-2 text-sm text-muted-foreground hover:bg-background hover:text-foreground"
                      onClick={() => {
                        arrangeNotes();
                        toast("Notes arranged");
                      }}
                    >
                      <LayoutGrid className="size-3.5" />
                      Arrange
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {afterNotes.map(slot)}
          {windows.length > 0 || pinnedN > 0 ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="mt-1 flex h-11 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  homeWindows();
                  arrangeNotes();
                  setOpen(false);
                }}
              >
                <House className="size-3.5" />
                Bring windows home
              </button>
              {windows.length > 0 ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex h-11 w-full items-center rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    closeAllWindows();
                    setOpen(false);
                  }}
                >
                  Close all windows
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
