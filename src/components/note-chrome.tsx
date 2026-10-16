"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppWindow, Trash2 } from "lucide-react";
import { NoteColor } from "@/components/note-color";
import { Tip } from "@/components/ui/tooltip";
import { placePopover } from "@/lib/desk";
import { cn } from "@/lib/utils";

export function NoteIconBtn({
  label,
  ink,
  onClick,
  children,
}: {
  label: string;
  ink?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        className="flex size-11 shrink-0 items-center justify-center rounded-sm hover:bg-black/10"
        style={ink ? { color: ink } : undefined}
        onClick={onClick}
      >
        {children}
      </button>
    </Tip>
  );
}

export function NoteDelete({
  ink,
  onDelete,
  onBusy,
  open: openProp,
  onOpenChange,
  anchorOnly = false,
}: {
  ink?: string;
  onDelete: () => void;
  onBusy?: (busy: boolean) => void;
  /** Card 219: driven by the ⋯ "Delete note" row; `anchorOnly` keeps only the confirm. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  anchorOnly?: boolean;
}) {
  const [own, setOwn] = useState(false);
  const ask = openProp ?? own;
  const setAsk = useCallback(
    (v: boolean) => {
      if (openProp === undefined) setOwn(v);
      onOpenChange?.(v);
    },
    [openProp, onOpenChange],
  );
  const [box, setBox] = useState({ left: 0, top: 0 });
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onBusy?.(ask);
  }, [ask, onBusy]);

  useEffect(() => {
    if (!ask) return;
    const place = () => {
      if (!root.current) return;
      setBox(placePopover(root.current.getBoundingClientRect(), 176, 128));
    };
    place();
    const ac = new AbortController();
    window.addEventListener("resize", place, { signal: ac.signal });
    window.addEventListener("scroll", place, { signal: ac.signal, capture: true });
    window.addEventListener(
      "pointerdown",
      (e) => {
        const t = e.target as Node;
        if (root.current?.contains(t) || pop.current?.contains(t)) return;
        setAsk(false);
      },
      { signal: ac.signal },
    );
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") setAsk(false);
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, [ask, setAsk]);

  return (
    <div
      ref={root}
      className="relative"
      data-no-drag
      data-desk-menu={ask ? "" : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {anchorOnly ? (
        <span aria-hidden className="block size-0" />
      ) : (
        <NoteIconBtn label="Delete" ink={ink} onClick={() => setAsk(true)}>
          <Trash2 className="size-3.5" />
        </NoteIconBtn>
      )}
      {ask && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={pop}
              data-desk-menu=""
              className="fixed z-50 w-44 rounded-md bg-card p-2 text-card-foreground shadow-[var(--shadow-float)]"
              style={{ left: box.left, top: box.top }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <p className="px-1 py-1 text-xs text-muted-foreground">Delete this note?</p>
              <button
                type="button"
                className="flex min-h-9 w-full items-center rounded-sm px-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onDelete();
                  setAsk(false);
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="flex min-h-9 w-full items-center rounded-sm px-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setAsk(false)}
              >
                Cancel
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function NoteTools({
  ink,
  color,
  pinned = false,
  reveal = "near",
  onColor,
  onFloat,
  onDelete,
  className,
}: {
  ink?: string;
  color: string;
  pinned?: boolean;
  reveal?: "near" | "always";
  onColor: (color: string) => void;
  onFloat?: () => void;
  onDelete?: () => void;
  className?: string;
}) {
  const [colorBusy, setColorBusy] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const busy = colorBusy || delBusy;
  // Card 216 §6/N3: one pop-out icon and verb everywhere; Pin means Keep on top only.
  const floatLabel = pinned ? "Back to board" : "Float";
  return (
    <div
      className={cn("flex shrink-0 items-center", reveal === "near" && "note-autohide", className)}
      data-no-drag
      data-open={busy ? "" : undefined}
      style={ink ? { color: ink } : undefined}
    >
      {onFloat ? (
        <NoteIconBtn label={floatLabel} ink={ink} onClick={onFloat}>
          <AppWindow className="size-3.5" />
        </NoteIconBtn>
      ) : null}
      <NoteColor color={color} onChange={onColor} ink={ink} onBusy={setColorBusy} />
      {onDelete ? <NoteDelete ink={ink} onDelete={onDelete} onBusy={setDelBusy} /> : null}
    </div>
  );
}
