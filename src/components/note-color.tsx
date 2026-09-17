"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Palette, Plus } from "lucide-react";
import { hexColor, hexToHsv, hsvToHex, NOTE_COLORS } from "@/lib/format";
import { placePopover } from "@/lib/desk";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const PANEL_W = 220;
const PANEL_H = 268;

function ColorPanel({
  color,
  onLive,
  onCommit,
}: {
  color: string;
  onLive?: (color: string) => void;
  onCommit: (color: string) => void;
}) {
  const current = hexColor(color);
  const [hsv, setHsv] = useState(() => hexToHsv(current));
  const [hex, setHex] = useState(current);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  useEffect(() => {
    const next = hexColor(color);
    setHsv(hexToHsv(next));
    setHex(next);
  }, [color]);

  function emit(h: number, s: number, v: number, commit: boolean) {
    const next = hsvToHex(h, s, v);
    setHsv({ h, s, v });
    setHex(next);
    if (commit) onCommit(next);
    else onLive?.(next);
  }

  function dragPad(el: HTMLElement, e: React.PointerEvent, kind: "sv" | "hue") {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      if (kind === "hue") {
        const h = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * 360;
        emit(h, hsvRef.current.s, hsvRef.current.v, false);
      } else {
        const s = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        const v = 1 - Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
        emit(hsvRef.current.h, s, v, false);
      }
    };
    const stop = (ev: PointerEvent) => {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", stop);
      el.removeEventListener("pointercancel", stop);
      const cur = hsvRef.current;
      emit(cur.h, cur.s, cur.v, false);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);
    move(e.nativeEvent);
  }

  return (
    <div className="w-52 space-y-2">
      <div className="grid grid-cols-6 gap-1">
        {NOTE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label="Set note color"
            aria-pressed={hexColor(c) === current}
            className={cn(
              "size-7 shrink-0 rounded-full ring-1 ring-black/15",
              hexColor(c) === current && "ring-2 ring-foreground",
            )}
            style={{ backgroundColor: c }}
            onClick={() => onCommit(c)}
          />
        ))}
      </div>
      <div
        className="relative h-24 w-full touch-none overflow-hidden rounded-sm"
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        style={{ backgroundColor: hsvToHex(hsv.h, 1, 1) }}
        onPointerDown={(e) => dragPad(e.currentTarget, e, "sv")}
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to right, #fff, transparent)" }} />
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(to top, #000, transparent)" }} />
        <span
          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v) }}
        />
      </div>
      <div
        className="relative h-3 w-full touch-none overflow-hidden rounded-full"
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
        onPointerDown={(e) => dragPad(e.currentTarget, e, "hue")}
      >
        <span
          className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-1 ring-black/30"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="size-7 shrink-0 rounded-sm ring-1 ring-black/15" style={{ backgroundColor: hex }} />
        <input
          type="text"
          spellCheck={false}
          aria-label="Hex color"
          value={hex}
          className="h-9 min-w-0 flex-1 rounded-sm bg-muted px-2 font-mono text-xs uppercase"
          onChange={(e) => {
            const v = e.target.value;
            setHex(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) {
              const next = hexToHsv(v);
              setHsv(next);
              onLive?.(v.toLowerCase());
            }
          }}
          onBlur={() => {
            const next = hexColor(hex);
            setHex(next);
            onLive?.(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <button
          type="button"
          className="h-9 shrink-0 rounded-sm px-2 text-xs hover:bg-muted"
          onClick={() => onCommit(hexColor(hex))}
        >
          Use
        </button>
      </div>
    </div>
  );
}

function ColorPopover({
  open,
  box,
  pop,
  color,
  onLive,
  onCommit,
}: {
  open: boolean;
  box: { left: number; top: number };
  pop: React.RefObject<HTMLDivElement | null>;
  color: string;
  onLive?: (color: string) => void;
  onCommit: (color: string) => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={pop}
      data-desk-menu=""
      className="fixed z-50 rounded-md bg-card p-2 text-card-foreground shadow-[var(--shadow-float)]"
      style={{ left: box.left, top: box.top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ColorPanel color={color} onLive={onLive} onCommit={onCommit} />
    </div>,
    document.body,
  );
}

export function NoteColor({
  color,
  onChange,
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

  useEffect(() => {
    onBusy?.(open);
  }, [open, onBusy]);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      if (!btn.current) return;
      setBox(placePopover(btn.current.getBoundingClientRect(), PANEL_W, PANEL_H));
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
      <ColorPopover
        open={open}
        box={box}
        pop={pop}
        color={color}
        onLive={onChange}
        onCommit={(c) => {
          onChange(c);
          if (NOTE_COLORS.includes(c)) setOpen(false);
        }}
      />
    </div>
  );
}

export function AddColorWheel({
  onPick,
  title = "Custom color",
}: {
  onPick: (color: string) => void;
  ink?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState({ left: 0, top: 0 });
  const [draft, setDraft] = useState(NOTE_COLORS[0]!);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      if (!btn.current) return;
      setBox(placePopover(btn.current.getBoundingClientRect(), PANEL_W, PANEL_H));
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
      <Tip label={title}>
        <button
          ref={btn}
          type="button"
          aria-label={title}
          aria-expanded={open}
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="size-4" />
        </button>
      </Tip>
      <ColorPopover
        open={open}
        box={box}
        pop={pop}
        color={draft}
        onLive={setDraft}
        onCommit={(c) => {
          setDraft(c);
          onPick(c);
          setOpen(false);
        }}
      />
    </div>
  );
}
