"use client";

import { useFloatsAllowed, useIsPhone } from "@/lib/use-platform";
import { TitleBar, type TitleAction } from "@/components/widget-shell";
import { useCardMenu } from "@/lib/widget-menu";
import { widgetLook } from "@/lib/widget-prefs";
import { useRef, useState, type ReactNode } from "react";
import { Check, LayoutGrid, Plus, RotateCcw } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FloatBtn } from "@/components/desk-chrome";
import { CalendarTiles } from "@/components/calendar-tiles";
import { AgendaBody, ClockBody, FinancePeek, NewsPeek, NotesPeek, QuoteBody, WeatherBody } from "@/components/widgets";
import {
  DASH_SPAN_N,
  DEFAULT_DASH,
  cycleDashSpan,
  dashEntry,
  dashSpanClass,
  dashVisible,
  moveDash,
  shiftDash,
  type DashCard,
} from "@/lib/dash";
import { deskZone } from "@/lib/format";
import { useAtrium } from "@/lib/store";
import type { NewsItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DashboardView({
  headlines,
  newsLoading = false,
  newsError = false,
  newsMissed = [],
}: {
  headlines: NewsItem[];
  newsLoading?: boolean;
  newsError?: boolean;
  newsMissed?: string[];
}) {
  const floats = useFloatsAllowed();
  const { profile, notes, modules, dashOrder, dashLocked, dashSpan, setDashOrder, setDashLocked, setDashSpan, resetDash, setView } =
    useAtrium(
      useShallow((s) => ({
        profile: s.profile,
        notes: s.notes,
        modules: s.modules,
        dashOrder: s.dashOrder,
        dashLocked: s.dashLocked,
        dashSpan: s.dashSpan,
        setDashOrder: s.setDashOrder,
        setDashLocked: s.setDashLocked,
        setDashSpan: s.setDashSpan,
        resetDash: s.resetDash,
        setView: s.setView,
      })),
    );
  const compact = useAtrium((s) => widgetLook(s.dashPrefs).compact);
  const [drag, setDrag] = useState<DashCard | null>(null);
  const from = useRef<DashCard | null>(null);
  const hover = useRef<DashCard | null>(null);

  // Registry (lib/dash.ts) decides which cards exist and which module hides them.
  const visible = dashVisible(dashOrder, modules);

  function body(id: DashCard): ReactNode {
    return BODY[id]();
  }

  // One body per registered card — `Record<DashCard, …>` fails typecheck if a
  // registry entry has no body, so a new widget cannot silently render blank.
  const BODY: Record<DashCard, () => ReactNode> = {
    weather: () => {
      return (
        <>
          <p className="font-display text-2xl font-medium tracking-tight md:text-3xl">
            {new Date().toLocaleDateString(deskZone().locale, {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: deskZone().tz,
            })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date().toLocaleDateString(deskZone().locale, { year: "numeric", timeZone: deskZone().tz })}
            {` · ${(profile.tz || deskZone().tz).split("/").pop()?.replace(/_/g, " ")}`}
            {profile.city.trim() ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="hover:text-foreground hover:underline"
                  onClick={() => setView("weather")}
                >
                  {profile.city}
                </button>
              </>
            ) : null}
          </p>
          <div className="mt-5">
            <WeatherBody />
          </div>
        </>
      );
    },
    agenda: () => <AgendaBody />,
    quote: () => <QuoteBody />,
    finance: () => <FinancePeek />,
    notes: () => {
      return (
        <>
          <NotesPeek />
          {floats && notes.some((n) => n.pinned) ? (
            <p className="mt-3 hidden text-xs text-muted-foreground lg:block">
              Pinned notes float over every screen on desktop.
            </p>
          ) : null}
        </>
      );
    },
    news: () => <NewsPeek headlines={headlines} loading={newsLoading} error={newsError} missed={newsMissed} />,
    calendar: () => <CalendarTiles />,
    clock: () => <ClockBody />,
  };

  function grab(e: React.PointerEvent, id: DashCard) {
    if (dashLocked || e.button !== 0) return;
    e.preventDefault();
    from.current = id;
    hover.current = id;
    setDrag(id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function over(e: React.PointerEvent) {
    if (!from.current) return;
    const node = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-dash]");
    const to = node?.getAttribute("data-dash") as DashCard | null;
    if (to) hover.current = to;
    if (to && to !== drag) setDrag(to);
  }

  function drop() {
    const target = hover.current ?? drag;
    if (from.current && target && from.current !== target) setDashOrder(moveDash(dashOrder, from.current, target));
    from.current = null;
    hover.current = null;
    setDrag(null);
  }

  const dirty =
    dashOrder.some((id, i) => id !== DEFAULT_DASH[i]) || Object.keys(dashSpan).length > 0;

  return (
    <div>
      <h2 className="sr-only">Dashboard</h2>
      <div className="mb-2 flex items-center justify-end gap-0.5">
        {/* Card 216 step 3: grip + resize live in an explicit Arrange mode (the saved dashLocked toggle). */}
        <button
          type="button"
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-sm px-3 text-sm text-muted-foreground hover:text-foreground",
            !dashLocked && "text-foreground",
          )}
          aria-pressed={!dashLocked}
          onClick={() => setDashLocked(!dashLocked)}
        >
          {dashLocked ? <LayoutGrid className="size-4" /> : <Check className="size-4" />}
          {dashLocked ? "Arrange" : "Done"}
        </button>
        {dirty ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex size-11 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                aria-label="Reset layout"
                onClick={() => resetDash()}
              >
                <RotateCcw className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Reset layout</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-12">
        {visible.map((id) => (
          <DashShell
            key={id}
            id={id}
            arrange={!dashLocked}
            compact={compact}
            className={cn(dashSpanClass(id, dashSpan[id]), drag === id && "ring-1 ring-ring")}
            onGrab={(e) => grab(e, id)}
            onResize={() => setDashSpan(id, cycleDashSpan(dashSpan[id] ?? DASH_SPAN_N[id]))}
            onShift={(dir) => setDashOrder(shiftDash(dashOrder, id, dir))}
            onPointerMove={over}
            onPointerUp={drop}
            onPointerCancel={drop}
          >
            {body(id)}
          </DashShell>
        ))}
      </div>
    </div>
  );
}

const ICON_BTN = "inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Card 216/216b: the dashboard surface of WidgetShell — registry-driven TitleBar, no per-widget branches. */
function DashShell({
  id,
  arrange,
  compact,
  className,
  onGrab,
  onResize,
  onShift,
  children,
  ...rest
}: {
  id: DashCard;
  arrange: boolean;
  compact: boolean;
  className?: string;
  onGrab: (e: React.PointerEvent) => void;
  onResize: () => void;
  onShift: (dir: -1 | 1) => void;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  const e = dashEntry(id);
  const phone = useIsPhone();
  const { label, groups, floatRow, primaryRow, menuLabel } = useCardMenu(
    id,
    // D2/D4: Arrange mode — the bar is the drag handle; Wider/narrower and keyboard moves live in ⋯.
    arrange
      ? { window: [{ label: "Wider / narrower", onSelect: onResize }, { label: "Move earlier", onSelect: () => onShift(-1) }, { label: "Move later", onSelect: () => onShift(1) }] }
      : undefined,
  );
  const actions: TitleAction[] = [
    ...(primaryRow
      ? [{ id: "primary", group: "primary" as const, row: primaryRow, node: (
          <button type="button" className={ICON_BTN} aria-label={String(primaryRow.label)} onClick={primaryRow.onSelect}>
            <Plus className="size-4" />
          </button>
        ) }]
      : []),
    ...(floatRow && e.float ? [{ id: "float", group: "float" as const, row: floatRow, node: <FloatBtn kind={e.float} /> }] : []),
  ];
  return (
    <Card data-dash={id} data-arrange={arrange ? "" : undefined} className={cn("@container", className)} {...rest}>
      <TitleBar
        className={cn("mt-1 pl-4 pr-2", arrange && "cursor-grab touch-none active:cursor-grabbing")}
        title={label}
        titleProps={arrange ? { title: "Drag to rearrange" } : undefined}
        onPointerDown={arrange ? (ev) => !(ev.target as HTMLElement).closest("button,[data-no-drag]") && onGrab(ev) : undefined}
        actions={actions}
        groups={groups}
        menuLabel={menuLabel}
        phone={phone}
        compact={compact}
      />
      <div className="px-4 pb-4 pt-1">{children}</div>
    </Card>
  );
}
