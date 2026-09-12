"use client";

import { useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgendaBody, FinancePeek, FloatBtn, NewsPeek, NotesPeek, QuoteBody, WeatherBody } from "@/components/widgets";
import { DASH_LABEL, DASH_SPAN, DEFAULT_DASH, moveDash, type DashCard } from "@/lib/dash";
import { deskZone } from "@/lib/format";
import { regionOf } from "@/lib/region";
import { useAtrium } from "@/lib/store";
import type { NewsItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DashboardView({
  headlines,
  newsLoading = false,
  newsError = false,
}: {
  headlines: NewsItem[];
  newsLoading?: boolean;
  newsError?: boolean;
}) {
  const { profile, notes, modules, dashOrder, setDashOrder, resetDash } = useAtrium(
    useShallow((s) => ({
      profile: s.profile,
      notes: s.notes,
      modules: s.modules,
      dashOrder: s.dashOrder,
      setDashOrder: s.setDashOrder,
      resetDash: s.resetDash,
    })),
  );
  const [drag, setDrag] = useState<DashCard | null>(null);

  const visible = dashOrder.filter((id) => {
    if (id === "quote") return modules.quotes !== false;
    if (id === "finance") return modules.finance;
    if (id === "notes") return modules.notes;
    if (id === "news") return modules.news;
    return true;
  });

  function body(id: DashCard): ReactNode {
    if (id === "weather") {
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
            {` · ${regionOf(profile.region).name}`}
            {profile.city.trim() ? ` · ${profile.city}` : ""}
          </p>
          <div className="mt-5">
            <WeatherBody />
          </div>
        </>
      );
    }
    if (id === "agenda") return <AgendaBody />;
    if (id === "quote") return <QuoteBody />;
    if (id === "finance") return <FinancePeek />;
    if (id === "notes") {
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
    }
    return <NewsPeek headlines={headlines} loading={newsLoading} error={newsError} />;
  }

  function floatKind(id: DashCard) {
    if (id === "weather") return "weather" as const;
    if (id === "agenda") return "calendar" as const;
    if (id === "quote") return "quote" as const;
    if (id === "finance") return "finance" as const;
    if (id === "news") return "news" as const;
    return null;
  }

  const dirty = dashOrder.some((id, i) => id !== DEFAULT_DASH[i]);

  return (
    <div>
      {dirty ? (
        <div className="mb-2 flex items-center justify-end">
          <button
            type="button"
            className="min-h-11 px-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => resetDash()}
          >
            Reset layout
          </button>
        </div>
      ) : (
        <p className="mb-2 hidden text-right text-xs text-muted-foreground lg:block">Drag a card grip to rearrange</p>
      )}
    <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-12">
      {visible.map((id) => {
        const kind = floatKind(id);
        return (
          <Card
            key={id}
            className={cn(DASH_SPAN[id], drag === id && "ring-1 ring-ring")}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag) setDashOrder(moveDash(dashOrder, drag, id));
              setDrag(null);
            }}
          >
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  draggable
                  aria-label={`Move ${DASH_LABEL[id]}`}
                  title="Drag to rearrange"
                  className="flex size-9 shrink-0 cursor-grab items-center justify-center rounded-sm text-muted-foreground hover:text-foreground active:cursor-grabbing"
                  onDragStart={() => setDrag(id)}
                  onDragEnd={() => setDrag(null)}
                >
                  <GripVertical className="size-4" />
                </button>
                <CardTitle>{DASH_LABEL[id]}</CardTitle>
              </div>
              {kind ? <FloatBtn kind={kind} /> : null}
            </CardHeader>
            <CardContent>{body(id)}</CardContent>
          </Card>
        );
      })}
    </div>
    </div>
  );
}
