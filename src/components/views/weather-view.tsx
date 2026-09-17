"use client";

import { useShallow } from "zustand/react/shallow";
import { FloatBtn } from "@/components/desk-chrome";
import { WeatherBoard, WeatherPin } from "@/components/weather-panel";
import { useAtrium } from "@/lib/store";
import { regionOf } from "@/lib/region";

export function WeatherView() {
  const profile = useAtrium(
    useShallow((s) => ({
      city: s.profile.city,
      region: s.profile.region,
    })),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-start gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-medium tracking-tight">Weather</h2>
          <p className="text-xs text-muted-foreground">
            {profile.city.trim() || regionOf(profile.region).name}
          </p>
        </div>
        <div className="grow" />
        <FloatBtn kind="weather" />
      </div>

      <div className="mb-6 max-w-md">
        <WeatherPin />
        <p className="mt-2 text-xs text-muted-foreground">
          City or ZIP. 10001 is New York even on a Philippines desk.
        </p>
      </div>

      <WeatherBoard />
    </div>
  );
}
