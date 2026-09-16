"use client";

import { useShallow } from "zustand/react/shallow";
import { FloatBtn } from "@/components/widgets";
import { WeatherGlance, WeatherPin } from "@/components/weather-panel";
import { hasWeatherPin, mapsPin } from "@/lib/weather";
import { useAtrium } from "@/lib/store";
import { regionOf } from "@/lib/region";

export function WeatherView() {
  const profile = useAtrium(
    useShallow((s) => ({
      city: s.profile.city,
      lat: s.profile.lat,
      lon: s.profile.lon,
      region: s.profile.region,
    })),
  );
  const pinned = hasWeatherPin(profile);
  const pin = pinned ? mapsPin(profile.lat!, profile.lon!) : null;
  const ns = (profile.lat ?? 0) >= 0 ? "N" : "S";
  const ew = (profile.lon ?? 0) >= 0 ? "E" : "W";
  const coord = pinned
    ? `${Math.abs(profile.lat!).toFixed(4)}° ${ns}  ${Math.abs(profile.lon!).toFixed(4)}° ${ew}`
    : null;

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

      <WeatherGlance hours={12} days={7} prompt={false} />

      {pin ? (
        <div className="mt-6 space-y-2">
          <iframe
            title={`Map of ${profile.city || "weather pin"}`}
            src={pin.src}
            className="h-56 w-full rounded-lg border border-border bg-muted"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-xs tabular-nums text-muted-foreground">{coord}</p>
            <a
              href={pin.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-xs text-muted-foreground hover:text-foreground"
            >
              Open in Maps
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
