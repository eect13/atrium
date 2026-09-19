"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Eraser,
  ImagePlus,
  Italic,
  List,
  ListTodo,
  Pencil,
  Strikethrough,
  Underline,
  Undo2,
  Redo2,
} from "lucide-react";
import { Tip } from "@/components/ui/tooltip";
import { foldNoteChecks, inkOnPaper, notePlain, uid } from "@/lib/format";
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

function bodyFrom(el: Element | null) {
  return el?.closest("article")?.querySelector<HTMLElement>(".note-body") ?? null;
}

function placeCaret(body: HTMLElement, node: Node = body) {
  body.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function persistBody(body: HTMLElement | null) {
  body?.dispatchEvent(new Event("input", { bubbles: true }));
}

function ensureBody(from: Element) {
  const body = bodyFrom(from);
  if (!body) return null;
  if (document.activeElement !== body) placeCaret(body);
  return body;
}

function closestList() {
  const node = document.getSelection()?.anchorNode ?? null;
  const el = node instanceof Element ? node : node?.parentElement;
  const ul = el?.closest("ul");
  if (!ul?.closest("[contenteditable]")) return null;
  return ul;
}

function closestItem() {
  const node = document.getSelection()?.anchorNode ?? null;
  const el = node instanceof Element ? node : node?.parentElement;
  const li = el?.closest("li");
  if (!li?.closest("[contenteditable]")) return null;
  return li;
}

function lastList(body: HTMLElement | null) {
  if (!body) return null;
  return [...body.querySelectorAll("ul")].at(-1) ?? null;
}

/** insertUnorderedList toggles — convert in place instead of wiping the list. */
function runBullets(from: Element) {
  const body = ensureBody(from);
  const ul = closestList();
  if (ul?.classList.contains("note-checks")) {
    ul.classList.remove("note-checks");
    persistBody(body);
    return;
  }
  runCmd("insertUnorderedList");
  (closestList() ?? lastList(body))?.classList.remove("note-checks");
  persistBody(body);
}

function runChecklist(from: Element) {
  const body = ensureBody(from);
  const ul = closestList();
  if (ul && !ul.classList.contains("note-checks")) {
    ul.classList.add("note-checks");
    persistBody(body);
    return;
  }
  if (ul) {
    runCmd("insertUnorderedList");
    persistBody(body);
    return;
  }
  const blank = !body?.textContent?.trim();
  if (blank && body) {
    body.innerHTML = '<ul class="note-checks"><li><br></li></ul>';
    const li = body.querySelector("li");
    placeCaret(body, li ?? body);
    persistBody(body);
    return;
  }
  runCmd("insertUnorderedList");
  const next = closestList() ?? lastList(body);
  if (next) next.classList.add("note-checks");
  persistBody(body);
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
    const folded = foldNoteChecks(note);
    if (folded) onUpdate({ html: folded.html, text: folded.text, checks: [] });
  }, [note.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const folded = foldNoteChecks(note);
    const next = folded?.html
      ? folded.html
      : note.html?.trim()
        ? note.html
        : (note.text || "").replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/\n/g, "<br>");
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [note.id, note.html, note.text, note.checks]);

  function emitBody() {
    const el = ref.current;
    if (!el) return;
    onUpdate({ html: el.innerHTML, text: notePlain(el.innerHTML, el.innerText) });
  }

  function toggleCheck(e: React.PointerEvent) {
    if (drawing) return;
    const t = e.target as HTMLElement;
    const li = t.closest("ul.note-checks > li");
    if (!li || !ref.current?.contains(li)) return;
    const box = li.getBoundingClientRect();
    if (e.clientX - box.left > 22) return;
    e.preventDefault();
    li.setAttribute("data-done", li.getAttribute("data-done") === "true" ? "false" : "true");
    emitBody();
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
          "note-body min-h-12 w-full flex-1 bg-transparent px-3 py-1 text-sm leading-snug outline-none",
          drawing && "pointer-events-none",
        )}
        style={{ color: ink }}
        onInput={emitBody}
        onBlur={emitBody}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          requestAnimationFrame(() => {
            const li = closestItem();
            if (li && !li.textContent?.trim()) li.removeAttribute("data-done");
            emitBody();
          });
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          toggleCheck(e);
        }}
      />
    </div>
  );
}

export function NoteFormat({
  ink,
  drawing,
  canDraw = true,
  canUndo,
  canRedo = false,
  onDraw,
  onUndo,
  onRedo,
  onClear,
  onPhoto,
}: {
  ink: string;
  drawing: boolean;
  canDraw?: boolean;
  canUndo: boolean;
  canRedo?: boolean;
  onDraw?: () => void;
  onUndo: () => void;
  onRedo?: () => void;
  onClear: () => void;
  onPhoto: (files: FileList | null) => void;
}) {
  return (
    <div
      className="note-format-autohide relative z-[4] flex flex-wrap items-center gap-0.5 border-t border-current/10 px-1 pt-0.5"
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
        ] as const
      ).map(([cmd, Icon, label]) => (
        <Tip key={cmd} label={label}>
          <button
            type="button"
            aria-label={label}
            className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              ensureBody(e.currentTarget);
              runCmd(cmd);
            }}
          >
            <Icon className="size-3.5" />
          </button>
        </Tip>
      ))}
      <Tip label="Bullets">
        <button
          type="button"
          aria-label="Bullets"
          className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            ensureBody(e.currentTarget);
            runBullets(e.currentTarget);
          }}
        >
          <List className="size-3.5" />
        </button>
      </Tip>
      <Tip label="Checklist">
        <button
          type="button"
          aria-label="Checklist"
          className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            ensureBody(e.currentTarget);
            runChecklist(e.currentTarget);
          }}
        >
          <ListTodo className="size-3.5" />
        </button>
      </Tip>
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
      {canDraw ? (
        <Tip label={drawing ? "Stop drawing" : "Draw"}>
          <button
            type="button"
            aria-label={drawing ? "Stop drawing" : "Draw"}
            aria-pressed={drawing}
            className={cn("flex size-8 items-center justify-center rounded-sm hover:bg-black/10", drawing && "bg-black/10")}
            onClick={() => onDraw?.()}
          >
            <Pencil className="size-3.5" />
          </button>
        </Tip>
      ) : null}
      {canDraw && canUndo ? (
        <Tip label="Undo stroke">
          <button type="button" aria-label="Undo stroke" className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10" onClick={onUndo}>
            <Undo2 className="size-3.5" />
          </button>
        </Tip>
      ) : null}
      {canDraw && canRedo ? (
        <Tip label="Redo stroke">
          <button type="button" aria-label="Redo stroke" className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10" onClick={() => onRedo?.()}>
            <Redo2 className="size-3.5" />
          </button>
        </Tip>
      ) : null}
      {canDraw && canUndo ? (
        <Tip label="Clear drawing">
          <button type="button" aria-label="Clear drawing" className="flex size-8 items-center justify-center rounded-sm hover:bg-black/10" onClick={onClear}>
            <Eraser className="size-3.5" />
          </button>
        </Tip>
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

export function useInkRedo() {
  const [redo, setRedo] = useState<Record<string, NonNullable<StickyNote["ink"]>>>({});
  function pushUndo(id: string, ink: StickyNote["ink"], apply: (next: StickyNote["ink"]) => void) {
    const strokes = ink ?? [];
    const last = strokes.at(-1);
    if (!last) return;
    setRedo((r) => ({ ...r, [id]: [...(r[id] ?? []), last] }));
    apply(strokes.slice(0, -1));
  }
  function popRedo(id: string, ink: StickyNote["ink"], apply: (next: StickyNote["ink"]) => void) {
    const stack = redo[id] ?? [];
    const stroke = stack.at(-1);
    if (!stroke) return;
    setRedo((r) => ({ ...r, [id]: stack.slice(0, -1) }));
    apply([...(ink ?? []), stroke]);
  }
  function forget(id: string) {
    setRedo((r) => {
      if (!r[id]?.length) return r;
      const next = { ...r };
      delete next[id];
      return next;
    });
  }
  function canRedoFor(id: string) {
    return Boolean(redo[id]?.length);
  }
  return { pushUndo, popRedo, forget, canRedoFor };
}
