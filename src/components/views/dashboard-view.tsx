"use client";

import { useRef, useState, type ReactNode } from "react";
import { GripVertical, Lock, LockOpen, RotateCcw } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FloatBtn } from "@/components/desk-chrome";
import { AgendaBody, CalendarPeek, ClockBody, FinancePeek, NewsPeek, NotesPeek, QuoteBody, WeatherBody } from "@/components/widgets";
import {
  DASH_LABEL,
  DASH_SPAN_N,
  DEFAULT_DASH,
  cycleDashSpan,
  dashEntry,
  dashSpanClass,
  dashVisible,
  moveDash,
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
          {notes.some((n) => n.pinned) ? (
            <p className="mt-3 hidden text-xs text-muted-foreground lg:block">
              Pinned notes float over every screen on desktop.
            </p>
          ) : null}
        </>
      );
    },
    news: () => <NewsPeek headlines={headlines} loading={newsLoading} error={newsError} missed={newsMissed} />,
    calendar: () => <CalendarPeek widgetId="dash-calendar" />,
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
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
              aria-label={dashLocked ? "Unlock layout" : "Lock layout"}
              aria-pressed={!dashLocked}
              onClick={() => setDashLocked(!dashLocked)}
            >
              {dashLocked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{dashLocked ? "Unlock to rearrange" : "Lock layout"}</TooltipContent>
        </Tooltip>
        {dirty ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
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
        {visible.map((id) => {
          const kind = dashEntry(id).float ?? null;
          return (
            <Card
              key={id}
              data-dash={id}
              className={cn(dashSpanClass(id, dashSpan[id]), drag === id && "ring-1 ring-ring")}
              onPointerMove={over}
              onPointerUp={drop}
              onPointerCancel={drop}
            >
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="flex min-w-0 items-center gap-1">
                  {dashLocked ? null : (
                    <button
                      type="button"
                      aria-label={`Move ${DASH_LABEL[id]}`}
                      title="Drag to rearrange"
                      className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground hover:text-foreground active:cursor-grabbing"
                      onPointerDown={(e) => grab(e, id)}
                    >
                      <GripVertical className="size-4" />
                    </button>
                  )}
                  <CardTitle>{DASH_LABEL[id]}</CardTitle>
                </div>
                <div className="flex items-center">
                  {dashLocked ? null : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex size-9 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                          aria-label={`Resize ${DASH_LABEL[id]}`}
                          onClick={() => setDashSpan(id, cycleDashSpan(dashSpan[id] ?? DASH_SPAN_N[id]))}
                        >
                          <span className="block size-2.5 border-b-2 border-r-2 border-current" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Wider / narrower</TooltipContent>
                    </Tooltip>
                  )}
                  {kind ? <FloatBtn kind={kind} /> : null}
                </div>
              </CardHeader>
              <CardContent>{body(id)}</CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
