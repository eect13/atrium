"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eventCatColor, slugCatId, type EventCategory } from "@/lib/event-cats";
import { useAtrium } from "@/lib/store";

const SWATCHES = [
  "var(--color-ring)",
  "var(--color-foreground)",
  "var(--color-destructive)",
  "var(--color-ok)",
  "var(--color-muted-foreground)",
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
  "#14b8a6",
  "#ec4899",
];

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
  const [color, setColor] = useState(SWATCHES[0]!);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.cat, (m.get(e.cat) ?? 0) + 1);
    return m;
  }, [events]);

  function add() {
    const name = label.trim();
    if (name.length < 1) {
      toast("Name the category");
      return;
    }
    let id = slugCatId(name);
    if (eventCats.some((c) => c.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
    const row: EventCategory = { id, label: name, color };
    addEventCat(row);
    setLabel("");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Event categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Categories are yours — rename, add, or remove. Events keep their assignment; removing remaps to another category.
          </p>
          <ul className="space-y-2">
            {eventCats.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ background: c.color || eventCatColor(eventCats, c.id) }}
                  aria-hidden
                />
                {editId === c.id ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="h-9 min-w-0 flex-1"
                      aria-label="Category name"
                    />
                    <div className="flex flex-wrap gap-1">
                      {SWATCHES.map((sw) => (
                        <button
                          key={sw}
                          type="button"
                          className="size-6 rounded-full border border-border"
                          style={{ background: sw, outline: editColor === sw ? "2px solid currentColor" : undefined }}
                          aria-label={`Color ${sw}`}
                          onClick={() => setEditColor(sw)}
                        />
                      ))}
                    </div>
                    <Button type="button" size="sm" onClick={saveEdit}>
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="min-w-0 grow truncate text-sm">{c.label}</span>
                    <span className="text-xs text-muted-foreground">{counts.get(c.id) ?? 0}</span>
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Edit ${c.label}`}
                      onClick={() => {
                        setEditId(c.id);
                        setEditLabel(c.label);
                        setEditColor(c.color || eventCatColor(eventCats, c.id));
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label={`Remove ${c.label}`}
                      disabled={eventCats.length <= 1}
                      onClick={() => {
                        removeEventCat(c.id);
                        toast(`Removed ${c.label}`);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="space-y-2 border-t border-border pt-3">
            <Label htmlFor="new-cat">New category</Label>
            <div className="flex flex-wrap gap-2">
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
              <Button type="button" onClick={add}>
                <Plus className="size-3.5" />
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {SWATCHES.map((sw) => (
                <button
                  key={sw}
                  type="button"
                  className="size-6 rounded-full border border-border"
                  style={{ background: sw, outline: color === sw ? "2px solid currentColor" : undefined }}
                  aria-label={`Color ${sw}`}
                  onClick={() => setColor(sw)}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
