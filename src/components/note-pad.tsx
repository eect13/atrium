"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  Eraser,
  ImagePlus,
  Italic,
  List,
  MoreHorizontal,
  Pencil,
  Pin,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { Tip } from "@/components/ui/tooltip";
import { inkOnPaper, notePlain, uid } from "@/lib/format";
import type { NotePhoto, StickyNote } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 3;

export async function readNotePhoto(file: File): Promise<NotePhoto | null> {
  if (!file.type.startsWith("image/")) return null;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { id: uid(), src: canvas.toDataURL("image/jpeg", 0.58) };
}

function runCmd(cmd: string) {
  document.execCommand(cmd, false);
}

export function NoteEditor({
  note,
  ink,
  drawing,
  onUpdate,
}: {
  note: StickyNote;
  ink: string;
  drawing: boolean;
  onUpdate: (patch: Partial<StickyNote>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const next = note.html?.trim()
      ? note.html
      : (note.text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [note.id, note.html, note.text]);

  function emitBody() {
    const el = ref.current;
    if (!el) return;
    onUpdate({ html: el.innerHTML, text: notePlain(el.innerHTML, el.innerText) });
  }

  return (
    <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
      <input
        ref={titleRef}
        type="text"
        aria-label="Note title"
        placeholder="Title"
        disabled={drawing}
        value={note.title ?? ""}
        className={cn(
          "w-full shrink-0 bg-transparent px-3 pb-0.5 pt-1 text-sm font-semibold leading-snug outline-none placeholder:opacity-40",
          drawing && "pointer-events-none",
        )}
        style={{ color: ink }}
        onChange={(e) => onUpdate({ title: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <div
        ref={ref}
        contentEditable={!drawing}
        role="textbox"
        aria-label="Note body"
        suppressContentEditableWarning
        className={cn(
          "min-h-12 w-full flex-1 bg-transparent px-3 py-1 text-sm leading-snug outline-none [&_ul]:list-disc [&_ul]:pl-4",
          drawing && "pointer-events-none",
        )}
        style={{ color: ink }}
        onInput={emitBody}
        onBlur={emitBody}
      />
    </div>
  );
}

export function NoteFormat({
  ink,
  drawing,
  canUndo,
  onDraw,
  onUndo,
  onClear,
  onPhoto,
}: {
  ink: string;
  drawing: boolean;
  canUndo: boolean;
  onDraw: () => void;
  onUndo: () => void;
  onClear: () => void;
  onPhoto: (files: FileList | null) => void;
}) {
  return (
    <div
      className="relative z-[4] flex flex-wrap items-center gap-0.5 border-b border-current/10 px-1 pb-0.5"
      style={{ color: ink }}
      onPointerDown={(e) => e.stopPropagation()}
      data-no-drag
    >
      {(
        [
          ["bold", Bold, "Bold"],
          ["italic", Italic, "Italic"],
          ["underline", Underline, "Underline"],
          ["strikeThrough", Strikethrough, "Strikethrough"],
          ["insertUnorderedList", List, "Bullets"],
        ] as const
      ).map(([cmd, Icon, label]) => (
        <Tip key={cmd} label={label}>
          <button
            type="button"
            aria-label={label}
            className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCmd(cmd)}
          >
            <Icon className="size-3.5" />
          </button>
        </Tip>
      ))}
      <Tip label="Add picture">
        <label className="flex size-8 cursor-pointer items-center justify-center rounded-sm hover:bg-black/10">
          <ImagePlus className="size-3.5" />
          <span className="sr-only">Add picture</span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              onPhoto(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </Tip>
      <Tip label={drawing ? "Stop drawing" : "Draw"}>
        <button
          type="button"
          aria-label={drawing ? "Stop drawing" : "Draw"}
          aria-pressed={drawing}
          className={cn("flex size-8 items-center justify-center rounded-sm hover:bg-black/10", drawing && "bg-black/10")}
          onClick={onDraw}
        >
          <Pencil className="size-3.5" />
        </button>
      </Tip>
      {canUndo ? (
        <Tip label="Undo stroke">
          <button type="button" aria-label="Undo stroke" className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10" onClick={onUndo}>
            <Undo2 className="size-3.5" />
          </button>
        </Tip>
      ) : null}
      {canUndo ? (
        <Tip label="Clear drawing">
          <button type="button" aria-label="Clear drawing" className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10" onClick={onClear}>
            <Eraser className="size-3.5" />
          </button>
        </Tip>
      ) : null}
    </div>
  );
}

export function NoteMore({
  ink,
  children,
}: {
  ink: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    window.addEventListener("pointerdown", (e) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }, { signal: ac.signal });
    return () => ac.abort();
  }, [open]);
  return (
    <div ref={root} className="relative z-[4]" onPointerDown={(e) => e.stopPropagation()} data-no-drag>
      <Tip label="More">
        <button
          type="button"
          aria-label="Note menu"
          aria-expanded={open}
          className="flex size-8 items-center justify-center rounded-sm opacity-0 hover:bg-black/10 group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-70"
          style={{ color: ink }}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </Tip>
      {open ? (
        <div data-desk-menu className="absolute right-0 top-9 z-30 min-w-36 rounded-md bg-card p-1 text-card-foreground shadow-[var(--shadow-float)]">
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function NotePhotos({
  photos,
  onRemove,
}: {
  photos: NotePhoto[];
  onRemove: (id: string) => void;
}) {
  if (!photos.length) return null;
  return (
    <div className="relative z-[1] flex gap-1 overflow-x-auto px-3 pb-1">
      {photos.map((p) => (
        <button
          key={p.id}
          type="button"
          className="relative shrink-0"
          aria-label="Remove picture"
          onClick={() => onRemove(p.id)}
        >
          <img src={p.src} alt="" className="h-16 w-16 rounded-sm object-cover" />
        </button>
      ))}
    </div>
  );
}

export async function addNotePhotos(current: NotePhoto[] | undefined, files: FileList | null) {
  if (!files?.length) return current ?? [];
  const extra: NotePhoto[] = [];
  for (const file of [...files]) {
    if (extra.length + (current?.length ?? 0) >= MAX_PHOTOS) break;
    const photo = await readNotePhoto(file);
    if (photo) extra.push(photo);
  }
  return [...(current ?? []), ...extra].slice(0, MAX_PHOTOS);
}

export function noteInkColor(note: StickyNote) {
  return inkOnPaper(note.color);
}

export function MenuRow({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="flex min-h-9 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-muted" onClick={onClick}>
      {children}
    </button>
  );
}

export { Pin };
