"use client";

import { useEffect, useId, useRef, useState } from "react";
import { lookupPlaces, type PlaceHit } from "@/lib/weather";
import { cn } from "@/lib/utils";

export function PlaceField({
  id,
  country,
  placeholder,
  pinned,
  ariaLabel = "City or ZIP",
  onPick,
  onClear,
}: {
  id?: string;
  country?: string;
  placeholder?: string;
  pinned?: string;
  ariaLabel?: string;
  onPick: (hit: PlaceHit) => void;
  onClear?: () => void;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listId = `${inputId}-list`;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const picked = useRef(false);
  const seq = useRef(0);
  const hitFor = useRef("");

  useEffect(() => {
    const query = q.trim();
    setHits([]);
    setActive(-1);
    hitFor.current = "";
    if (query.length < 2) return;
    const t = window.setTimeout(() => {
      const n = ++seq.current;
      void lookupPlaces({ data: { name: query, country } }).then((rows) => {
        if (n !== seq.current) return;
        hitFor.current = query;
        setHits(rows);
        setOpen(rows.length > 0 && !picked.current);
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [q, country]);

  async function submit(raw: string) {
    const query = raw.trim();
    if (!query) {
      onClear?.();
      setHits([]);
      hitFor.current = "";
      setQ("");
      return;
    }
    setBusy(true);
    try {
      const rows = hitFor.current === query && hits.length ? hits : await lookupPlaces({ data: { name: query, country } });
      const hit = rows[0];
      if (!hit) return;
      pick(hit);
    } finally {
      setBusy(false);
    }
  }

  function pick(hit: PlaceHit) {
    picked.current = true;
    setQ("");
    setHits([]);
    setOpen(false);
    onPick(hit);
    window.setTimeout(() => {
      picked.current = false;
    }, 400);
  }

  return (
    <div className="relative">
      <input
        id={inputId}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && hits.length > 0}
        aria-activedescendant={open && active >= 0 && active < hits.length ? `${listId}-${active}` : undefined}
        value={q}
        placeholder={pinned?.trim() || placeholder || "City or ZIP"}
        onChange={(e) => {
          picked.current = false;
          setQ(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
            if (!picked.current && q.trim()) void submit(q);
          }, 160);
        }}
        onKeyDown={(e) => {
          if ((e.key === "ArrowDown" || e.key === "ArrowUp") && hits.length) {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (e.key === "ArrowDown" ? (a + 1) % hits.length : a <= 0 ? hits.length - 1 : a - 1));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && active >= 0 && active < hits.length) pick(hits[active]);
            else void submit(q);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="flex h-hit w-full rounded-md border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {open && hits.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card p-1 text-card-foreground shadow-[var(--shadow-float)]"
        >
          {hits.map((hit, i) => (
            <li
              key={`${hit.lat},${hit.lon},${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn(
                "flex min-h-hit w-full items-center rounded-sm px-2 text-left text-sm",
                i === active ? "bg-muted" : "hover:bg-muted",
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(hit)}
            >
              {hit.detail || hit.city}
            </li>
          ))}
        </ul>
      ) : null}
      {busy ? <span className="sr-only">Looking up place</span> : null}
    </div>
  );
}
