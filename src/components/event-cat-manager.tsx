"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { ConfirmRow } from "@/components/ui/confirm-row";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CAT_SWATCHES,
  catTagStyle,
  eventCatColor,
  eventCatLabel,
  nextCatColor,
  normalizeCatColor,
  remapCatId,
  slugCatId,
  type EventCategory,
} from "@/lib/event-cats";
import { useAtrium } from "@/lib/store";

const ICON_BTN =
  "flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

/** 44px palette swatches drawn from the `--cat-*` tokens (one per hue). */
function CatSwatches({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
}) {
  const current = normalizeCatColor(value);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {CAT_SWATCHES.map((sw) => {
        const on = current === sw.color;
        return (
          <button
            key={sw.key}
            type="button"
            className={`size-11 shrink-0 rounded-full border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${on ? "outline-2 outline-offset-2 outline-foreground" : ""}`}
            style={{ background: sw.color }}
            aria-label={sw.name}
            aria-pressed={on}
            onClick={() => onChange(sw.color)}
          />
        );
      })}
    </div>
  );
}

/** Modular category manager for Calendar (create / edit / remove / assign via select elsewhere). */
export function EventCatManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { eventCats, events, addEventCat, updateEventCat, removeEventCat } = useAtrium(
    useShallow((s) => ({
      eventCats: s.eventCats,
      events: s.events,
      addEventCat: s.addEventCat,
      updateEventCat: s.updateEventCat,
      removeEventCat: s.removeEventCat,
    })),
  );
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.cat, (m.get(e.cat) ?? 0) + 1);
    return m;
  }, [events]);

  const addColor = color ?? nextCatColor(eventCats);

  function add() {
    const name = label.trim();
    if (name.length < 1) {
      toast("Name the category");
      return;
    }
    let id = slugCatId(name);
    if (eventCats.some((c) => c.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
    const row: EventCategory = { id, label: name, color: addColor };
    addEventCat(row);
    setLabel("");
    setColor(null);
    toast(`Added ${name}`);
  }

  function saveEdit() {
    if (!editId) return;
    const name = editLabel.trim();
    if (name.length < 1) {
      toast("Name the category");
      return;
    }
    updateEventCat(editId, { label: name, color: editColor || undefined });
    setEditId(null);
    toast("Category updated");
  }

  function confirmRemove(c: EventCategory) {
    const target = remapCatId(eventCats, c.id);
    const moved = counts.get(c.id) ?? 0;
    removeEventCat(c.id, target);
    setConfirmId(null);
    toast(
      moved
        ? `Removed ${c.label} · ${moved} event${moved === 1 ? "" : "s"} moved to ${eventCatLabel(eventCats, target)}`
        : `Removed ${c.label}`,
    );
  }

  function setOpen(next: boolean) {
    if (!next) {
      setConfirmId(null);
      setEditId(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Event categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">Add, rename, recolour, or remove. Removing asks first and moves its events.</p>
          <ul className="space-y-2">
            {eventCats.map((c) => {
              const fill = normalizeCatColor(c.color) ?? eventCatColor(eventCats, c.id);
              const n = counts.get(c.id) ?? 0;
              if (confirmId === c.id) {
                const target = eventCatLabel(eventCats, remapCatId(eventCats, c.id));
                return (
                  <ConfirmRow
                    key={c.id}
                    as="li"
                    subject={c.label}
                    verb="Delete"
                    detail={`Events remapped to ${target}.`}
                    triggerId={c.id}
                    onCancel={() => setConfirmId(null)}
                    onConfirm={() => confirmRemove(c)}
                  />
                );
              }
              if (editId === c.id) {
                return (
                  <li key={c.id} className="space-y-2 rounded-md border border-border p-2">
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="h-11"
                      aria-label="Category name"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveEdit();
                        }
                      }}
                    />
                    <CatSwatches value={editColor} onChange={setEditColor} label={`Colour for ${c.label}`} />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" className="h-11" onClick={() => setEditId(null)}>
                        Cancel
                      </Button>
                      <Button type="button" className="h-11" onClick={saveEdit}>
                        Save
                      </Button>
                    </div>
                  </li>
                );
              }
              return (
                <li key={c.id} className="flex min-h-11 items-center gap-2 rounded-md border border-border py-1 pl-2 pr-1">
                  <span className="cat-tag cat-tag-lg" style={catTagStyle(fill)}>
                    <span>{c.label}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground" aria-label={`${n} event${n === 1 ? "" : "s"}`}>
                    {n}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      className={`${ICON_BTN} hover:text-foreground`}
                      aria-label={`Edit ${c.label}`}
                      onClick={() => {
                        setConfirmId(null);
                        setEditId(c.id);
                        setEditLabel(c.label);
                        setEditColor(fill);
                      }}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={`${ICON_BTN} hover:text-destructive`}
                      aria-label={`Delete ${c.label}`}
                      data-confirm-trigger={c.id}
                      disabled={eventCats.length <= 1}
                      onClick={() => {
                        setEditId(null);
                        setConfirmId(c.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="space-y-2 border-t border-border pt-3">
            <Label htmlFor="new-cat">
              <Plus className="mr-1 inline size-3.5" aria-hidden="true" />
              Add category
            </Label>
            <div className="flex gap-2">
              <Input
                id="new-cat"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Name"
                className="h-11 min-w-0 flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              <Button type="button" className="h-11" onClick={add}>
                Add
              </Button>
            </div>
            <CatSwatches value={addColor} onChange={setColor} label="Colour for new category" />
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" className="h-11" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
