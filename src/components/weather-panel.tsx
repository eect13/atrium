"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Gauge,
  LocateFixed,
  Sun,
  Sunrise,
  Sunset,
  Wind,
} from "lucide-react";
import { toast } from "sonner";
import { PlaceField } from "@/components/place-field";
import { Skeleton } from "@/components/ui/skeleton";
import { deskZone, hourInTZ, isoDate, manilaAt } from "@/lib/format";
import { locateMe, locationBlockedCopy } from "@/lib/locate";
import { rainSoon } from "@/lib/rain";
import { regionOf } from "@/lib/region";
import { useAtrium } from "@/lib/store";
import { fetchWeather, hasWeatherPin, wmo, aqiBand, solarDay, sunClock, uvBand, type WeatherPayload, type WmoKind } from "@/lib/weather";

const WMO_ICON: Record<WmoKind, typeof Sun> = {
  sun: Sun,
  partly: CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

const WEATHER_SNAP = "atrium.weather.snap.12";

function hourLabel(hour: number) {
  const ap = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}${ap}`;
}

function readSnap<T>(key: string): T | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function writeSnap(key: string, value: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export function useWeather() {
  const profile = useAtrium((s) => s.profile);
  const pinned = hasWeatherPin(profile);
  const lat = pinned ? Number(profile.lat) : Number.NaN;
  const lon = pinned ? Number(profile.lon) : Number.NaN;
  return useQuery({
    queryKey: ["weather", lat, lon],
    queryFn: async () => {
      const data = await fetchWeather({ data: { lat, lon } });
      writeSnap(WEATHER_SNAP, { lat, lon, data });
      return data;
    },
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
    placeholderData: (prev) => {
      if (prev) return prev;
      const snap = readSnap<{ lat: number; lon: number; data: WeatherPayload }>(WEATHER_SNAP);
      if (!snap?.data?.current) return undefined;
      if (Math.abs(snap.lat - lat) > 0.05 || Math.abs(snap.lon - lon) > 0.05) return undefined;
      return snap.data;
    },
    enabled: pinned,
  });
}

export function WeatherPin() {
  const profile = useAtrium((s) => s.profile);
  const setProfile = useAtrium((s) => s.setProfile);
  const [locating, setLocating] = useState(false);

  function applyPin(hit: { city: string; lat: number; lon: number }) {
    setProfile({ city: hit.city, lat: hit.lat, lon: hit.lon });
    toast(`Weather pin: ${hit.city}`);
  }

  async function useMyLocation() {
    setLocating(true);
    try {
      const found = await locateMe();
      if (!found) {
        toast(locationBlockedCopy());
        return;
      }
      const city = found.hit.city || profile.city;
      setProfile({ lat: found.hit.lat, lon: found.hit.lon, city });
      toast(
        city
          ? found.via === "gps"
            ? `Weather pin: ${city}`
            : `Weather pin: ${city} (network)`
          : "Weather pin updated",
      );
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-2">
      <PlaceField
        country={profile.region}
        placeholder={regionOf(profile.region).cityHint}
        pinned={profile.city}
        onPick={applyPin}
        onClear={() => {
          setProfile({ city: "", lat: null, lon: null });
          toast("Weather pin cleared");
        }}
      />
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
        onClick={() => void useMyLocation()}
        disabled={locating}
      >
        <LocateFixed className="size-4" />
        {locating ? "Locating…" : "Use my location"}
      </button>
    </div>
  );
}

function HoursStrip({
  hours,
}: {
  hours: { t: string; temp: number; rain?: number; mm?: number }[];
}) {
  if (!hours.length) return null;
  return (
    <div className="mt-4 flex gap-1 overflow-x-auto">
      {hours.map((h) => (
        <div
          key={h.t}
          className="min-w-10 flex-1 rounded-md bg-muted px-1 py-2 text-center text-xs text-muted-foreground"
        >
          {hourLabel(Number(h.t.slice(11, 13)))}
          <strong className="mt-1 block text-sm text-foreground tabular-nums">{Math.round(h.temp)}°</strong>
          {h.rain != null && h.rain > 0 ? (
            <span className="tabular-nums">{h.rain}%</span>
          ) : h.mm != null && h.mm > 0 ? (
            <span className="tabular-nums">{h.mm.toFixed(1)}mm</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DaysStrip({
  daily,
  fallback,
  count,
}: {
  daily: NonNullable<WeatherPayload["daily"]>;
  fallback: number;
  count: number;
}) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto">
      {daily.time.slice(0, count).map((t, i) => {
        const daySky = wmo(daily.weather_code?.[i] ?? fallback);
        const DayIcon = WMO_ICON[daySky.kind];
        return (
          <div
            key={t}
            className="flex min-w-12 flex-1 flex-col items-center rounded-md bg-muted px-1 py-2 text-xs text-muted-foreground"
          >
            <DayIcon className="mb-1 size-3.5" aria-hidden />
            {manilaAt(t, 12).toLocaleDateString(deskZone().locale, {
              weekday: "short",
              timeZone: deskZone().tz,
            })}
            <strong className="mt-1 text-sm text-foreground tabular-nums">
              {Math.round(daily.temperature_2m_max[i]!)}°
            </strong>
            <span className="tabular-nums">
              {Math.round(daily.temperature_2m_min?.[i] ?? daily.temperature_2m_max[i]!)}°
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Glanceable forecast — no ZIP / locate. Those live on the Weather tab. */
export function WeatherGlance({
  hours: hourCount = 6,
  days = 5,
  prompt = true,
}: {
  hours?: number;
  days?: number;
  prompt?: boolean;
}) {
  const profile = useAtrium((s) => s.profile);
  const setView = useAtrium((s) => s.setView);
  const weather = useWeather();
  const hasPin = hasWeatherPin(profile);

  if (!hasPin) {
    if (!prompt) return null;
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">No place pinned yet.</p>
        <button
          type="button"
          className="min-h-11 text-sm text-foreground underline-offset-2 hover:underline"
          onClick={() => setView("weather")}
        >
          Pin a city or ZIP
        </button>
      </div>
    );
  }

  if (weather.isPending && !weather.data) {
    return (
      <div aria-busy aria-live="polite">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-md" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-9 w-16" />
            <Skeleton className="mt-2 h-3 w-40" />
          </div>
        </div>
        <div className="mt-4 flex gap-1">
          {Array.from({ length: Math.min(hourCount, 6) }, (_, i) => (
            <Skeleton key={i} className="h-16 flex-1 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const payload = weather.data;
  if (weather.isError || payload?.error || !payload?.current || !payload.daily) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Weather unavailable.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="min-h-11 text-sm underline" onClick={() => void weather.refetch()}>
            Retry
          </button>
          <button
            type="button"
            className="min-h-11 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => setView("weather")}
          >
            Change pin
          </button>
        </div>
      </div>
    );
  }

  const daily = payload.daily;
  const current = payload.current;
  const sky = wmo(current.weather_code);
  const Icon = WMO_ICON[sky.kind];
  const nowKey = isoDate();
  const nowHour = hourInTZ();
  const hourly = payload.hourly;
  const start = hourly
    ? hourly.time.findIndex((t) => t.startsWith(nowKey) && Number(t.slice(11, 13)) >= nowHour)
    : -1;
  const hours =
    hourly && start >= 0
      ? hourly.time.slice(start, start + hourCount).map((t, i) => ({
          t,
          temp: hourly.temperature_2m[start + i]!,
          rain: hourly.precipitation_probability?.[start + i],
          mm: hourly.precipitation?.[start + i],
        }))
      : [];
  const rainLine = rainSoon(hours);

  return (
    <div>
      <div className="flex items-center gap-3">
        <Icon className="size-10 shrink-0 text-ring" aria-hidden />
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl tabular-nums">{Math.round(current.temperature_2m)}°</span>
          <span className="text-sm text-muted-foreground">
            {sky.label}
            {rainLine ? (
              <>
                <br />
                {rainLine}
              </>
            ) : null}
            <br />
            Feels {Math.round(current.apparent_temperature ?? current.temperature_2m)}°
            {" · "}
            Wind {Math.round(current.wind_speed_10m)} km/h
            {current.relative_humidity_2m != null ? ` · ${Math.round(current.relative_humidity_2m)}% hum` : ""}
          </span>
        </div>
      </div>
      <HoursStrip hours={hours} />
      <DaysStrip daily={daily} fallback={current.weather_code} count={days} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Sun;
}) {
  return (
    <div className="rounded-lg bg-muted px-3 py-3">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.06em] text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <p className="mt-1 font-display text-xl tabular-nums leading-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** AccuWeather-style board for the Weather tab — UV, AQI, sun, hourly, 7-day. */
export function WeatherBoard() {
  const profile = useAtrium((s) => s.profile);
  const weather = useWeather();
  const hasPin = hasWeatherPin(profile);

  if (!hasPin) return null;

  if (weather.isPending && !weather.data) {
    return (
      <div aria-busy aria-live="polite">
        <Skeleton className="h-24 w-40" />
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const payload = weather.data;
  if (weather.isError || payload?.error || !payload?.current || !payload.daily) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Weather unavailable.</p>
        <button type="button" className="min-h-11 text-sm underline" onClick={() => void weather.refetch()}>
          Retry
        </button>
      </div>
    );
  }

  const daily = payload.daily;
  const current = payload.current;
  const sky = wmo(current.weather_code);
  const Icon = WMO_ICON[sky.kind];
  const nowKey = isoDate();
  const nowHour = hourInTZ();
  const hourly = payload.hourly;
  const start = hourly
    ? hourly.time.findIndex((t) => t.startsWith(nowKey) && Number(t.slice(11, 13)) >= nowHour)
    : -1;
  const hours =
    hourly && start >= 0
      ? hourly.time.slice(start, start + 12).map((t, i) => ({
          t,
          temp: hourly.temperature_2m[start + i]!,
          rain: hourly.precipitation_probability?.[start + i],
          uv: hourly.uv_index?.[start + i],
        }))
      : [];
  const rainLine = rainSoon(hours);
  const uvNow = hours[0]?.uv ?? current.uv_index ?? daily.uv_index_max?.[0];
  const uv = uvNow != null ? uvBand(uvNow) : null;
  const aqi = current.us_aqi != null ? aqiBand(current.us_aqi) : null;
  const todayRain = daily.precipitation_probability_max?.[0];
  const sun =
    typeof profile.lat === "number" && typeof profile.lon === "number"
      ? solarDay(profile.lat, profile.lon)
      : { sunrise: daily.sunrise?.[0], sunset: daily.sunset?.[0] };

  return (
    <div>
      <div className="flex items-start gap-4">
        <Icon className="mt-1 size-14 shrink-0 text-ring sm:size-16" aria-hidden />
        <div className="min-w-0">
          <p className="font-display text-5xl tabular-nums leading-none sm:text-6xl">{Math.round(current.temperature_2m)}°</p>
          <p className="mt-2 text-sm font-medium">{sky.label}</p>
          <p className="text-sm text-muted-foreground">
            RealFeel {Math.round(current.apparent_temperature ?? current.temperature_2m)}°
          </p>
          {rainLine ? <p className="mt-1 text-sm text-muted-foreground">{rainLine}</p> : null}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="UV" value={uv ? String(Math.round(uv.n)) : "—"} hint={uv?.label} icon={Sun} />
        <Stat label="Air" value={aqi ? String(Math.round(aqi.n)) : "—"} hint={aqi ? `AQI · ${aqi.label}` : "AQI"} icon={Gauge} />
        <Stat label="Sunrise" value={sunClock(sun.sunrise ?? daily.sunrise?.[0])} icon={Sunrise} />
        <Stat label="Sunset" value={sunClock(sun.sunset ?? daily.sunset?.[0])} icon={Sunset} />
        <Stat
          label="Wind"
          value={`${Math.round(current.wind_speed_10m)} km/h`}
          icon={Wind}
        />
        <Stat
          label="Humidity"
          value={current.relative_humidity_2m != null ? `${Math.round(current.relative_humidity_2m)}%` : "—"}
          icon={Droplets}
        />
        <Stat
          label="Rain"
          value={todayRain != null ? `${Math.round(todayRain)}%` : "—"}
          hint="Chance today"
          icon={CloudRain}
        />
        <Stat
          label="High / Low"
          value={`${Math.round(daily.temperature_2m_max[0] ?? current.temperature_2m)}° / ${Math.round(daily.temperature_2m_min[0] ?? current.temperature_2m)}°`}
          icon={CloudSun}
        />
      </div>

      {hours.length ? (
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">Hourly</p>
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {hours.map((h, i) => (
              <div
                key={h.t}
                className="min-w-12 flex-1 rounded-md bg-muted px-1 py-2 text-center text-xs text-muted-foreground"
              >
                {i === 0 ? "Now" : hourLabel(Number(h.t.slice(11, 13)))}
                <strong className="mt-1 block text-sm text-foreground tabular-nums">{Math.round(h.temp)}°</strong>
                {h.rain != null && h.rain > 0 ? <span className="tabular-nums">{Math.round(h.rain)}%</span> : <span>—</span>}
                {h.uv != null ? <span className="mt-0.5 block tabular-nums">UV {Math.round(h.uv)}</span> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <p className="text-xs uppercase tracking-[0.06em] text-muted-foreground">7-day</p>
        <div className="mt-1">
          {daily.time.slice(0, 7).map((t, i) => {
            const daySky = wmo(daily.weather_code?.[i] ?? current.weather_code);
            const DayIcon = WMO_ICON[daySky.kind];
            const uvMax = daily.uv_index_max?.[i];
            const rain = daily.precipitation_probability_max?.[i];
            return (
              <div key={t} className="flex min-h-11 items-center gap-2 border-b border-border py-2 last:border-0">
                <span className="w-14 shrink-0 text-sm">
                  {i === 0
                    ? "Today"
                    : manilaAt(t, 12).toLocaleDateString(deskZone().locale, {
                        weekday: "short",
                        timeZone: deskZone().tz,
                      })}
                </span>
                <DayIcon className="size-4 shrink-0 text-ring" aria-hidden />
                <span className="min-w-0 grow truncate text-sm text-muted-foreground">{daySky.label}</span>
                {rain != null && rain > 0 ? (
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{Math.round(rain)}%</span>
                ) : (
                  <span className="w-10 shrink-0" />
                )}
                {uvMax != null ? (
                  <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                    UV {Math.round(uvMax)}
                  </span>
                ) : null}
                <span className="w-16 shrink-0 text-right text-sm tabular-nums">
                  {Math.round(daily.temperature_2m_max[i]!)}°
                  <span className="text-muted-foreground">
                    {" / "}
                    {Math.round(daily.temperature_2m_min?.[i] ?? daily.temperature_2m_max[i]!)}°
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Open-Meteo forecast and US AQI. Stays on this device.</p>
    </div>
  );
}
