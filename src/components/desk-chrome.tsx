"use client";

import { AppWindow, House } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { OverflowMenu } from "@/components/ui/overflow-menu";
import { groupItems, type MenuRow } from "@/lib/menu-groups";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAtrium } from "@/lib/store";
import { WIDGET_LABEL, type WidgetKind } from "@/lib/types";
import { useFloatsAllowed } from "@/lib/use-platform";
import { cn } from "@/lib/utils";

/** Shared look for the page-header Float buttons (44×44, desktop only). */
const FLOAT_BTN =
  "hidden size-hit items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground lg:flex";

export function FloatBtn({ kind }: { kind: WidgetKind }) {
  const openWindow = useAtrium((s) => s.openWindow);
  const on = useAtrium((s) => s.windows.some((w) => w.kind === kind));
  const floats = useFloatsAllowed();
  const label = on ? "On desk" : "Float";
  if (!floats) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            FLOAT_BTN,
            on && "text-foreground",
          )}
          aria-label={label}
          onClick={() => openWindow(kind)}
        >
          <AppWindow className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function DeskMenu() {
  const floats = useFloatsAllowed();
  const { openWindow, windows, closeWindow, closeAllWindows, homeWindows, modules, notes, pinAllNotes, unpinAllNotes } =
    useAtrium(
      useShallow((s) => ({
        openWindow: s.openWindow,
        windows: s.windows,
        closeWindow: s.closeWindow,
        closeAllWindows: s.closeAllWindows,
        homeWindows: s.homeWindows,
        modules: s.modules,
        notes: s.notes,
        pinAllNotes: s.pinAllNotes,
        unpinAllNotes: s.unpinAllNotes,
      })),
    );
  const kinds: WidgetKind[] = [
    ...(modules.weather !== false ? (["weather"] as const) : []),
    "calendar",
    ...(modules.clock !== false ? (["clock"] as const) : []),
  ];
  const afterNotes: WidgetKind[] = [
    ...(modules.quotes !== false ? (["quote"] as const) : []),
    ...(modules.finance ? (["finance"] as const) : []),
    ...(modules.news ? (["news"] as const) : []),
  ];
  const pinnedN = notes.filter((n) => n.pinned).length;
  const showNotes = modules.notes !== false;
  const row = (label: string, on: boolean) => (
    <span className="flex w-full items-center justify-between">
      <span>{label}</span>
      <span className="text-xs text-muted-foreground">{on ? "Close" : "Open"}</span>
    </span>
  );
  const slot = (kind: WidgetKind): MenuRow => {
    const win = windows.find((w) => w.kind === kind);
    return { label: row(WIDGET_LABEL[kind], Boolean(win)), onSelect: () => (win ? closeWindow(win.id) : openWindow(kind)) };
  };
  const any = windows.length > 0 || pinnedN > 0;
  // Card 216 step 4: the shared OverflowMenu (no hand-rolled role=menu); groups per §5.
  const items = groupItems({
    window: [
      ...kinds.map(slot),
      ...(showNotes ? [{ label: row("Notes", pinnedN > 0), onSelect: () => (pinnedN ? unpinAllNotes() : pinAllNotes()) }] : []),
      ...afterNotes.map(slot),
    ],
    go: any
      ? [
          {
            label: (
              <span className="flex items-center gap-2">
                <House className="size-3.5" />
                Bring windows home
              </span>
            ),
            onSelect: homeWindows,
          },
        ]
      : [],
    close: windows.length > 0 ? [{ label: "Close all windows", onSelect: closeAllWindows }] : [],
  });

  // Card 187/192: the float layer is lg-only on the web and absent in the mobile app.
  if (!floats) return null;
  return (
    <div className="relative hidden lg:block">
      <OverflowMenu
        label="Windows"
        icon={<AppWindow className="size-4" />}
        triggerClassName="text-foreground shadow-[var(--shadow-border)] hover:bg-muted"
        menuClassName="w-56 z-50"
        items={items}
      />
    </div>
  );
}
