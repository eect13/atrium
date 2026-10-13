"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { FloatBtn } from "@/components/desk-chrome";
import { cn } from "@/lib/utils";
import { useAtrium } from "@/lib/store";
import type { CalMode } from "@/lib/types";

const MODES = ["month", "week", "day", "agenda"] as const;
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Card 161 U3: one toolbar. ≥md one line; <md three rows (title + actions, nav, full-width switch). */
export function CalendarToolbar({
  title,
  mode,
  onMode,
  onPrev,
  onNext,
  onToday,
  onImportFile,
  onExport,
  onAccounts,
  onNew,
}: {
  title: string;
  mode: CalMode;
  onMode: (m: CalMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onImportFile: (f: File) => void;
  onExport: () => void;
  onAccounts: () => void;
  onNew: () => void;
}) {
  const file = useRef<HTMLInputElement | null>(null);
  const openWindow = useAtrium((s) => s.openWindow);
  const unit = mode === "agenda" ? "month" : mode;
  const nav = (
    <div className="flex shrink-0 items-center rounded-xl border border-border">
      <button type="button" aria-label={`Previous ${unit}`} className={cn("inline-flex size-11 items-center justify-center rounded-l-xl text-muted-foreground hover:bg-muted hover:text-foreground", FOCUS)} onClick={onPrev}>
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <button type="button" className={cn("h-11 border-x border-border px-3 text-sm hover:bg-muted", FOCUS)} onClick={onToday}>
        Today
      </button>
      <button type="button" aria-label={`Next ${unit}`} className={cn("inline-flex size-11 items-center justify-center rounded-r-xl text-muted-foreground hover:bg-muted hover:text-foreground", FOCUS)} onClick={onNext}>
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  );
  const views = (full: boolean) => (
    <div role="group" aria-label="View" className={cn("flex rounded-xl bg-muted p-0.5", full && "w-full")}>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          onClick={() => onMode(m)}
          className={cn("min-h-11 rounded-[10px] px-3 text-sm capitalize", full && "flex-1", mode === m ? "bg-card text-foreground shadow-[var(--shadow-border)]" : "text-muted-foreground hover:text-foreground", FOCUS)}
        >
          {m}
        </button>
      ))}
    </div>
  );
  return (
    <div className="mb-4">
      <input
        ref={file}
        type="file"
        accept=".ics,text/calendar"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFile(f);
          e.target.value = "";
        }}
      />
      <div className="hidden items-center gap-2 md:flex">
        <h2 className="min-w-0 truncate font-display text-[28px] font-medium leading-tight tracking-tight">{title}</h2>
        {nav}
        {views(false)}
        <div className="grow" />
        <Button variant="outline" className="h-11" onClick={() => file.current?.click()}>
          Import ICS
        </Button>
        <Button variant="outline" className="h-11" onClick={onExport}>
          Export
        </Button>
        <Button variant="outline" className="h-11" onClick={onAccounts}>
          Accounts
        </Button>
        <Button className="h-11" onClick={onNew}>
          New event
        </Button>
        <FloatBtn kind="calendar" />
      </div>
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center gap-1">
          <h2 className="min-w-0 flex-1 truncate font-display text-2xl font-medium tracking-tight">{title}</h2>
          <Button size="icon" className="size-11 shrink-0" aria-label="New event" onClick={onNew}>
            <Plus className="size-5" aria-hidden />
          </Button>
          <OverflowMenu
            label="Calendar actions"
            menuClassName="w-52"
            items={[
              { label: "Import ICS", onSelect: () => file.current?.click() },
              { label: "Export", onSelect: onExport },
              { label: "Calendar accounts…", onSelect: onAccounts },
              { label: "Float", onSelect: () => openWindow("calendar") },
            ]}
          />
        </div>
        <div className="flex">{nav}</div>
        {views(true)}
      </div>
    </div>
  );
}
