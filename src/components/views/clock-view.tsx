"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { FloatBtn } from "@/components/desk-chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  cityFromTz,
  differentCivilDay,
  formatLocalOffsetLabel,
  formatOffsetVsLocal,
  formatZoneDate,
  formatZoneTime,
  reorderClockZones,
  resolveZoneId,
  withClockZone,
  withoutClockZone,
} from "@/lib/clock";
import { clockZones, regionOf } from "@/lib/region";
import { useAtrium } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ClockView() {
  const { profile, clockPrefs, updateClock } = useAtrium(
    useShallow((s) => ({
      profile: s.profile,
      clockPrefs: s.clockPrefs,
      updateClock: s.updateClock,
    })),
  );
  const [now, setNow] = useState(() => new Date());
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const localTz = profile.tz?.trim() || regionOf(profile.region).tz;
  const locale = profile.locale;
  const hour24 = clockPrefs.hour24;
  const zones = clockPrefs.zones;
  const known = useMemo(() => clockZones(), []);

  const localTime = formatZoneTime(now, localTz, { hour24, locale });
  const localMeta = [
    now.toLocaleDateString(locale || "en-GB", {
      timeZone: localTz,
      weekday: "long",
    }),
    now.toLocaleDateString(locale || "en-GB", {
      timeZone: localTz,
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    formatLocalOffsetLabel(now, localTz),
  ].join(" · ");

  function add() {
    const id = resolveZoneId(draft);
    if (!id) {
      toast("Use a city or IANA zone");
      return;
    }
    if (id === localTz || clockPrefs.zones.includes(id)) {
      toast("Already on the list");
      setDraft("");
      return;
    }
    updateClock((p) => withClockZone(p, id));
    setDraft("");
    toast(`Added ${cityFromTz(id)}`);
  }

  function finishDrag(toId: string | null) {
    const from = dragId;
    setDragId(null);
    setOverId(null);
    if (!from || !toId || from === toId) return;
    updateClock((p) => reorderClockZones(p, from, toId));
  }

  const suggestions = draft.trim()
    ? known.filter((z) => {
        const q = draft.trim().toLowerCase();
        return (
          z.id.toLowerCase().includes(q) ||
          z.label.toLowerCase().includes(q) ||
          cityFromTz(z.id).toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-medium tracking-tight">Clock</h2>
        <div className="grow" />
        <label className="flex min-h-11 items-center gap-2.5 text-sm text-muted-foreground">
          <span id="clock-hour24-label">24-hour time</span>
          <Switch
            checked={hour24}
            onCheckedChange={(v) => updateClock((p) => ({ ...p, hour24: v }))}
            aria-labelledby="clock-hour24-label"
          />
        </label>
        <FloatBtn kind="clock" />
      </div>

      <section
        className="mb-4 rounded-2xl bg-card p-[18px_20px] shadow-[0_0_0_1px_rgb(242_242_240/0.08)]"
        aria-label="Local time"
      >
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Local · {localTz}
        </p>
        <p className="mt-1.5 font-display text-5xl font-medium tabular-nums tracking-tight sm:text-[56px] sm:leading-none">
          {localTime}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{localMeta}</p>
      </section>

      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          World clocks
        </h3>
      </div>

      {zones.length === 0 ? (
        <div
          className="mb-3 rounded-[14px] border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground"
          role="status"
        >
          No world clocks yet. Search a city below to add one.
        </div>
      ) : (
        <ul className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="list">
          {zones.map((z) => {
            const city = cityFromTz(z);
            const confirming = confirmId === z;
            const dragging = dragId === z;
            const over = overId === z && dragId && dragId !== z;
            if (confirming) {
              return (
                <li
                  key={z}
                  className={cn(
                    "flex min-h-[88px] items-stretch gap-1 rounded-[14px] bg-destructive/10 p-2.5 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-destructive)_50%,var(--color-border))]",
                  )}
                  aria-label={`Remove ${city}?`}
                >
                  <span className="inline-flex size-11 shrink-0 items-center justify-center self-center text-muted-foreground" aria-hidden>
                    <GripVertical className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 py-1 pr-1">
                    <p className="text-[15px] font-semibold">
                      Remove <strong className="font-semibold">{city}</strong>?
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{z}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Removes it from your world clocks.</p>
                  </div>
                  <div className="flex flex-row items-center gap-1 self-center sm:flex-col">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 px-2.5 text-xs"
                      onClick={() => setConfirmId(null)}
                      autoFocus
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="h-11 px-2.5 text-xs"
                      onClick={() => {
                        updateClock((p) => withoutClockZone(p, z));
                        setConfirmId(null);
                        toast(`Removed ${city}`);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            }
            const showDate = differentCivilDay(now, z, localTz);
            return (
              <li
                key={z}
                draggable
                onDragStart={() => {
                  setDragId(z);
                  setOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== z) setOverId(z);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  finishDrag(z);
                }}
                className={cn(
                  "flex min-h-[88px] items-stretch gap-1 rounded-[14px] bg-card p-2.5 shadow-[0_0_0_1px_rgb(242_242_240/0.08)]",
                  dragging && "opacity-60",
                  over && "ring-1 ring-ring",
                )}
              >
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 cursor-grab items-center justify-center self-center rounded-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                  aria-label={`Reorder ${city}`}
                  onPointerDown={() => setDragId(z)}
                >
                  <GripVertical className="size-4" />
                </button>
                <div className="min-w-0 flex-1 py-1 pr-1">
                  <p className="text-[15px] font-semibold">{city}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{z}</p>
                  <div className="mt-2 flex items-baseline gap-2.5">
                    <span className="font-display text-[22px] font-medium tabular-nums">
                      {formatZoneTime(now, z, { hour24, locale })}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatOffsetVsLocal(now, z, localTz)}
                    </span>
                  </div>
                  {showDate ? (
                    <p className="mt-1 text-xs text-muted-foreground">{formatZoneDate(now, z, locale)}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center self-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${city}`}
                  onClick={() => setConfirmId(z)}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search cities"
          aria-label="Search cities"
          className="h-11 min-w-0 flex-1 rounded-[10px]"
          autoComplete="off"
          list="clock-tab-zones"
        />
        <datalist id="clock-tab-zones">
          {known.map((z) => (
            <option key={z.id} value={z.id}>
              {z.label}
            </option>
          ))}
        </datalist>
        <Button type="submit" className="h-11 shrink-0 gap-1.5 rounded-full px-4" disabled={!draft.trim()}>
          <Plus className="size-4" />
          Add city
        </Button>
      </form>
      {suggestions.length ? (
        <p className="mt-2.5 font-mono text-[11px] text-muted-foreground">
          {suggestions.map((s) => s.id).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
