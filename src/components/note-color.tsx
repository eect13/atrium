"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Palette } from "lucide-react";
import { hexColor, NOTE_COLORS } from "@/lib/format";
import { placePopover } from "@/lib/desk";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function NoteColor({
  color,
  onChange,
  ink,
  onBusy,
}: {
  color: string;
  onChange: (color: string) => void;
  ink?: string;
  onBusy?: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ left: 0, top: 0 });
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const current = hexColor(color);

  useEffect(() => {
    onBusy?.(open);
  }, [open, onBusy]);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      if (!btn.current) return;
      setBox(placePopover(btn.current.getBoundingClientRect(), 148, 136));
    };
    place();
    const ac = new AbortController();
    window.addEventListener("resize", place, { signal: ac.signal });
    window.addEventListener("scroll", place, { signal: ac.signal, capture: true });
    return () => ac.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    const close = (e: Event) => {
      const t = e.target as Node;
      if (root.current?.contains(t) || pop.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", close, { signal: ac.signal });
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") setOpen(false);
      },
      { signal: ac.signal },
    );
    return () => ac.abort();
  }, [open]);

  return (
    <div ref={root} className="relative" onPointerDown={(e) => e.stopPropagation()}>
      <Tip label="Color">
        <button
          ref={btn}
          type="button"
          aria-label="Note color"
          aria-expanded={open}
          className="flex size-9 shrink-0 items-center justify-center rounded-sm hover:bg-black/10"
          onClick={() => setOpen((v) => !v)}
        >
          <Palette className="size-3.5" />
        </button>
      </Tip>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={pop}
              data-desk-menu=""
              className="fixed z-50 grid w-36 grid-cols-3 gap-1.5 rounded-md bg-card p-2 text-card-foreground shadow-[var(--shadow-float)]"
              style={{ left: box.left, top: box.top }}
              onPointerDown={(e) => e.stopPropagation()}
            >
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
              <div className="col-span-3 flex justify-center pt-0.5">
                <AddColorWheel
                  ink={ink}
                  onPick={(c) => {
                    onChange(c);
                    setOpen(false);
                  }}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
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
