"use client";

import { useShallow } from "zustand/react/shallow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgendaBody, FinancePeek, FloatBtn, NewsPeek, NotesPeek, QuoteBody, WeatherBody } from "@/components/widgets";
import { deskZone } from "@/lib/format";
import { regionOf } from "@/lib/region";
import { useAtrium } from "@/lib/store";
import type { NewsItem } from "@/lib/types";

export function DashboardView({
  headlines,
  newsLoading = false,
  newsError = false,
}: {
  headlines: NewsItem[];
  newsLoading?: boolean;
  newsError?: boolean;
}) {
  const { profile, notes, modules } = useAtrium(
    useShallow((s) => ({
      profile: s.profile,
      notes: s.notes,
      modules: s.modules,
    })),
  );

  return (
    <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-5">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <CardTitle>Today</CardTitle>
          <FloatBtn kind="weather" />
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card className="lg:col-span-4">
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <CardTitle>Up next</CardTitle>
          <FloatBtn kind="calendar" />
        </CardHeader>
        <CardContent>
          <AgendaBody />
        </CardContent>
      </Card>

      {modules.quotes !== false && (
        <Card className="order-last lg:order-none lg:col-span-3">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <CardTitle>Quote</CardTitle>
            <FloatBtn kind="quote" />
          </CardHeader>
          <CardContent>
            <QuoteBody />
          </CardContent>
        </Card>
      )}

      {modules.finance && (
        <Card className="lg:col-span-4">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <CardTitle>Finance</CardTitle>
            <FloatBtn kind="finance" />
          </CardHeader>
          <CardContent>
            <FinancePeek />
          </CardContent>
        </Card>
      )}

      {modules.notes && (
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <NotesPeek />
            {notes.some((n) => n.pinned) ? (
              <p className="mt-3 hidden text-xs text-muted-foreground lg:block">
                Pinned notes float over every screen on desktop.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {modules.news && (
        <Card className="lg:col-span-4">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <CardTitle>Headlines</CardTitle>
            <FloatBtn kind="news" />
          </CardHeader>
          <CardContent>
            <NewsPeek headlines={headlines} loading={newsLoading} error={newsError} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
