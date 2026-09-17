"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pin, PinOff, Trash2 } from "lucide-react";
import { NoteColor } from "@/components/note-color";
import { Tip } from "@/components/ui/tooltip";
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
        className="flex size-9 shrink-0 items-center justify-center rounded-sm hover:bg-black/10"
        style={ink ? { color: ink } : undefined}
        onClick={onClick}
      >
        {children}
      </button>
    </Tip>
  );
}

export function NoteDelete({ ink, onDelete }: { ink?: string; onDelete: () => void }) {
  const [ask, setAsk] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ask) return;
    const ac = new AbortController();
    window.addEventListener(
      "pointerdown",
      (e) => {
        if (root.current && !root.current.contains(e.target as Node)) setAsk(false);
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
  }, [ask]);

  return (
    <div
      ref={root}
      className="relative"
      data-no-drag
      data-desk-menu={ask ? "" : undefined}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <NoteIconBtn label="Delete" ink={ink} onClick={() => setAsk(true)}>
        <Trash2 className="size-3.5" />
      </NoteIconBtn>
      {ask ? (
        <div className="absolute right-0 top-10 z-30 w-44 rounded-md bg-card p-2 text-card-foreground shadow-[var(--shadow-float)]">
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
        </div>
      ) : null}
    </div>
  );
}

export function NoteTools({
  ink,
  color,
  pinned = false,
  onColor,
  onFloat,
  onDelete,
  className,
}: {
  ink?: string;
  color: string;
  pinned?: boolean;
  onColor: (color: string) => void;
  onFloat?: () => void;
  onDelete?: () => void;
  className?: string;
}) {
  const floatLabel = pinned ? "Board" : "Float";
  return (
    <div className={cn("flex shrink-0 items-center", className)} data-no-drag style={ink ? { color: ink } : undefined}>
      {onFloat ? (
        <NoteIconBtn label={floatLabel} ink={ink} onClick={onFloat}>
          {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </NoteIconBtn>
      ) : null}
      <NoteColor color={color} onChange={onColor} ink={ink} />
      {onDelete ? <NoteDelete ink={ink} onDelete={onDelete} /> : null}
    </div>
  );
}
