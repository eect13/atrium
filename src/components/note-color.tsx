"use client";

import { useEffect, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { hexColor, NOTE_COLORS } from "@/lib/format";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function NoteColor({
  color,
  onChange,
  ink,
}: {
  color: string;
  onChange: (color: string) => void;
  ink?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = hexColor(color);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    const close = (e: Event) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close, { signal: ac.signal });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    }, { signal: ac.signal });
    return () => ac.abort();
  }, [open]);

  return (
    <div ref={root} className="relative" onPointerDown={(e) => e.stopPropagation()}>
      <Tip label="Color">
        <button
          type="button"
          aria-label="Note color"
          aria-expanded={open}
          className="flex size-9 shrink-0 items-center justify-center rounded-sm hover:bg-black/10"
          onClick={() => setOpen((v) => !v)}
        >
          <Palette className="size-3.5" />
        </button>
      </Tip>
      {open ? (
        <div className="absolute left-0 top-10 z-30 flex items-center gap-1 rounded-md bg-card p-1.5 shadow-[var(--shadow-float)]">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label="Set note color"
              aria-pressed={hexColor(c) === current}
              className={cn(
                "size-8 shrink-0 rounded-full ring-1 ring-black/15",
                hexColor(c) === current && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: c }}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
          <AddColorWheel
            ink={ink}
            onPick={(c) => {
              onChange(c);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function AddColorWheel({
  onPick,
  ink,
  title = "Custom color",
}: {
  onPick: (color: string) => void;
  ink?: string;
  title?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const add = useRef(onPick);
  add.current = onPick;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fn = () => add.current(el.value);
    el.addEventListener("change", fn);
    return () => el.removeEventListener("change", fn);
  }, []);
  return (
    <label
      className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full ring-1 ring-black/20"
      style={{ color: ink }}
      title={title}
    >
      <Palette className="pointer-events-none size-3.5" />
      <input
        ref={ref}
        type="color"
        defaultValue={NOTE_COLORS[0]}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={title}
      />
    </label>
  );
}
