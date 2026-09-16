import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isoDate, manilaParts, deskZone } from "./format";
import { parsePostal, postalCountries, type PostalHint } from "./postal";

export { parsePostal };

export type WmoKind = "sun" | "partly" | "cloud" | "fog" | "drizzle" | "rain" | "snow" | "storm";

/** Open-Meteo WMO weather-code bands. Lookup with `wmo()`. */
export const WMO_BANDS = [
  { max: 0, label: "Clear", kind: "sun", wmo: 0 },
  { max: 1, label: "Mostly clear", kind: "sun", wmo: 1 },
  { max: 2, label: "Partly cloudy", kind: "partly", wmo: 2 },
  { max: 3, label: "Overcast", kind: "cloud", wmo: 3 },
  { max: 48, label: "Fog", kind: "fog", wmo: 45 },
  { max: 57, label: "Drizzle", kind: "drizzle", wmo: 51 },
  { max: 67, label: "Rain", kind: "rain", wmo: 63 },
  { max: 77, label: "Snow", kind: "snow", wmo: 73 },
  { max: 82, label: "Showers", kind: "rain", wmo: 80 },
  { max: 86, label: "Snow showers", kind: "snow", wmo: 85 },
  { max: Number.POSITIVE_INFINITY, label: "Thunderstorm", kind: "storm", wmo: 95 },
] as const satisfies readonly { max: number; label: string; kind: WmoKind; wmo: number }[];

export function wmo(code: number) {
  return WMO_BANDS.find((band) => code <= band.max) ?? WMO_BANDS.at(-1)!;
}

/** yr.no / MET Norway `symbol_code` → same bands as `wmo()`. */
export function metSymbol(code: string) {
  const s = code.replace(/_(day|night|polartwilight)$/, "");
  if (s.includes("thunder")) return wmo(95);
  if (s.includes("snow") || s.includes("sleet")) return wmo(73);
  if (s.includes("shower")) return wmo(80);
  if (s === "lightrain" || s.includes("drizzle")) return wmo(51);
  if (s.includes("rain")) return wmo(63);
  if (s.includes("fog") || s.includes("mist")) return wmo(45);
  if (s === "cloudy") return wmo(3);
  if (s.includes("partlycloudy")) return wmo(2);
  if (s === "fair") return wmo(1);
  if (s.includes("clearsky")) return wmo(0);
  return wmo(3);
}

export type WeatherPayload = {
  error?: boolean;
  current?: {
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability?: number[];
    precipitation?: number[];
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code?: number[];
  };
};

const UA = "Atrium/1.2.11 (personal dashboard)";
const CACHE_MS = 15 * 60_000;
const STALE_MS = 6 * 60 * 60_000;
const FETCH_MS = 5_000;
const cache = new Map<string, { exp: number; staleExp: number; data: WeatherPayload }>();

function cacheKey(lat: number, lon: number) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function stamp(d: Date) {
  const p = manilaParts(d);
  return `${isoDate(d)}T${String(p.hour).padStart(2, "0")}:00`;
}

function apparentTemp(t: number, rh: number, windMs: number) {
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
  return t + 0.33 * e - 0.7 * windMs - 4;
}

type MetRow = {
  time: string;
  data: {
    instant: {
      details: {
        air_temperature: number;
        relative_humidity?: number;
        wind_speed?: number;
      };
    };
    next_1_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
    next_6_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
    next_12_hours?: { summary?: { symbol_code?: string } };
  };
};

async function fromOpenMeteo(lat: number, lon: number): Promise<WeatherPayload | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature",
  );
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability");
  url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", deskZone().tz);
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("forecast_hours", "24");
  url.searchParams.set("models", "best_match");
  url.searchParams.set("cell_selection", "nearest");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS) });
    if (!res.ok) return null;
    const json = (await res.json()) as WeatherPayload & { error?: boolean };
    if (json.error || !json.current || !json.daily) return null;
    return json;
  } catch {
    return null;
  }
}

function fromMetSeries(series: MetRow[]): WeatherPayload | null {
  const now = series[0];
  if (!now) return null;
  const det = now.data.instant.details;
  const symbol =
    now.data.next_1_hours?.summary?.symbol_code ??
    now.data.next_6_hours?.summary?.symbol_code ??
    "cloudy";
  const sky = metSymbol(symbol);
  const rh = det.relative_humidity ?? 70;
  const windMs = det.wind_speed ?? 0;

  const hourlySlice = series.slice(0, 24);
  const hourly = {
    time: hourlySlice.map((row) => stamp(new Date(row.time))),
    temperature_2m: hourlySlice.map((row) => row.data.instant.details.air_temperature),
    precipitation: hourlySlice.map(
      (row) => row.data.next_1_hours?.details?.precipitation_amount ?? 0,
    ),
  };

  const byDay = Object.groupBy(series, (row) => isoDate(new Date(row.time)));
  const days = Object.keys(byDay).toSorted().slice(0, 5);
  const daily = {
    time: days,
    temperature_2m_max: days.map((d) =>
      Math.max(...(byDay[d] ?? []).map((row) => row.data.instant.details.air_temperature)),
    ),
    temperature_2m_min: days.map((d) =>
      Math.min(...(byDay[d] ?? []).map((row) => row.data.instant.details.air_temperature)),
    ),
    weather_code: days.map((d) => {
      const rows = byDay[d] ?? [];
      const noon =
        rows.find((row) => manilaParts(new Date(row.time)).hour >= 12) ??
        rows.at(Math.floor(rows.length / 2)) ??
        rows[0];
      const code =
        noon?.data.next_6_hours?.summary?.symbol_code ??
        noon?.data.next_1_hours?.summary?.symbol_code ??
        symbol;
      return metSymbol(code).wmo;
    }),
  };

  return {
    current: {
      temperature_2m: det.air_temperature,
      weather_code: sky.wmo,
      wind_speed_10m: windMs * 3.6,
      relative_humidity_2m: rh,
      apparent_temperature: apparentTemp(det.air_temperature, rh, windMs),
    },
    hourly,
    daily,
  };
}

async function fromMetNo(lat: number, lon: number): Promise<WeatherPayload | null> {
  const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": UA },
      signal: AbortSignal.timeout(FETCH_MS),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { properties?: { timeseries?: MetRow[] } };
    return fromMetSeries(json.properties?.timeseries ?? []);
  } catch {
    return null;
  }
}

/** Open-Meteo (ECMWF blend) first — Met.no is Nordic-centric and used to win a race. */
async function firstWeather(lat: number, lon: number): Promise<WeatherPayload | null> {
  return (await fromOpenMeteo(lat, lon)) ?? (await fromMetNo(lat, lon));
}

export const fetchWeather = createServerFn({ method: "POST" })
  .validator(
    z.object({
      lat: z.coerce.number().finite(),
      lon: z.coerce.number().finite(),
    }),
  )
  .handler(async ({ data }): Promise<WeatherPayload> => {
    const key = cacheKey(data.lat, data.lon);
    const hit = cache.get(key);
    if (hit && hit.exp > Date.now()) return hit.data;
    const payload = await firstWeather(data.lat, data.lon);
    if (payload && !payload.error) {
      cache.set(key, { exp: Date.now() + CACHE_MS, staleExp: Date.now() + STALE_MS, data: payload });
      return payload;
    }
    if (hit && hit.staleExp > Date.now()) return hit.data;
    return { error: true };
  });

export type PlaceHit = { city: string; lat: number; lon: number; detail?: string };

function isoFrom(country?: string) {
  const cc = (country ?? "").trim().toUpperCase();
  if (!cc || cc === "EU") return "";
  return cc.slice(0, 2);
}

function placeLabel(name: string, admin?: string, country?: string) {
  return [name, admin, country].filter(Boolean).join(", ");
}

async function lookupZippopotam(postal: string, countries: string[]): Promise<PlaceHit | null> {
  const code = postal.replace(/\s+/g, "");
  for (const country of countries.slice(0, 4)) {
    try {
      const res = await fetch(`https://api.zippopotam.us/${country}/${encodeURIComponent(code)}`, {
        signal: AbortSignal.timeout(3_500),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        "country abbreviation"?: string;
        places?: { "place name"?: string; state?: string; latitude?: string; longitude?: string }[];
      };
      const place = json.places?.[0];
      const lat = Number(place?.latitude);
      const lon = Number(place?.longitude);
      if (!place || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const city = [place["place name"], place.state].filter(Boolean).join(", ") || postal;
      return { city, lat, lon, detail: city };
    } catch {
      /* next */
    }
  }
  return null;
}

function cityFromAddress(a: Record<string, string>, fallback: string) {
  return a.city || a.town || a.municipality || a.village || a.suburb || a.county || a.state || fallback;
}

async function lookupNominatimPostal(postal: string, cc: string): Promise<PlaceHit | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("postalcode", postal);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  if (cc) url.searchParams.set("countrycodes", cc.toLowerCase());
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      lat?: string;
      lon?: string;
      address?: Record<string, string>;
    }[];
    const hit = json[0];
    const lat = Number(hit?.lat);
    const lon = Number(hit?.lon);
    if (!hit || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const a = hit.address ?? {};
    const city = cityFromAddress(a, postal);
    return { city, lat, lon, detail: placeLabel(city, a.state, a.country) };
  } catch {
    return null;
  }
}

async function lookupPostal(postal: string, deskCc: string, hint?: PostalHint) {
  const countries = postalCountries(deskCc, hint);
  const first = countries[0] ?? "";
  const hit =
    (await lookupNominatimPostal(postal, first)) ??
    (first ? await lookupNominatimPostal(postal, "") : null) ??
    (await lookupZippopotam(postal, countries));
  return hit;
}

type GeoRow = {
  name?: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  country_code?: string;
};

async function lookupNames(name: string, cc: string, count: number): Promise<PlaceHit[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", String(count));
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: GeoRow[] };
    const rows = [...(json.results ?? [])];
    if (cc) rows.sort((a, b) => Number(b.country_code?.toUpperCase() === cc) - Number(a.country_code?.toUpperCase() === cc));
    return rows
      .filter((hit) => Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude))
      .map((hit) => {
        const city = [hit.name, hit.admin1].filter(Boolean).join(", ") || name;
        return {
          city,
          lat: hit.latitude,
          lon: hit.longitude,
          detail: placeLabel(hit.name || name, hit.admin1, hit.country),
        };
      });
  } catch {
    return [];
  }
}

const placeInput = z.object({
  name: z.string().trim().min(2).max(80),
  country: z.string().trim().max(8).optional(),
});

export const lookupPlace = createServerFn({ method: "POST" })
  .validator(placeInput)
  .handler(async ({ data }): Promise<PlaceHit | null> => {
    const hits = await findPlaces(data.name, isoFrom(data.country), 1);
    return hits[0] ?? null;
  });

export const lookupPlaces = createServerFn({ method: "POST" })
  .validator(placeInput)
  .handler(async ({ data }): Promise<PlaceHit[]> => {
    return findPlaces(data.name, isoFrom(data.country), 6);
  });

async function findPlaces(name: string, cc: string, count: number): Promise<PlaceHit[]> {
  const postal = parsePostal(name);
  const out: PlaceHit[] = [];
  if (postal) {
    const hit = await lookupPostal(postal.postal, cc, postal.hint);
    if (hit) out.push(hit);
    if (count <= 1) return out;
  }
  const names = await lookupNames(name, cc, count);
  for (const hit of names) {
    if (out.some((p) => Math.abs(p.lat - hit.lat) < 0.01 && Math.abs(p.lon - hit.lon) < 0.01)) continue;
    out.push(hit);
    if (out.length >= count) break;
  }
  return out;
}

export const reversePlace = createServerFn({ method: "POST" })
  .validator(
    z.object({
      lat: z.coerce.number().finite(),
      lon: z.coerce.number().finite(),
    }),
  )
  .handler(async ({ data }): Promise<PlaceHit> => {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(data.lat));
    url.searchParams.set("lon", String(data.lon));
    url.searchParams.set("format", "json");
    url.searchParams.set("zoom", "16");
    url.searchParams.set("addressdetails", "1");
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(4_000),
      });
      if (!res.ok) return { city: "", lat: data.lat, lon: data.lon };
      const json = (await res.json()) as { address?: Record<string, string> };
      const a = json.address ?? {};
      const place = a.city || a.town || a.municipality || a.village || a.suburb || a.county || "";
      const city = [place, a.postcode].filter(Boolean).join(" ");
      return { city, lat: data.lat, lon: data.lon };
    } catch {
      return { city: "", lat: data.lat, lon: data.lon };
    }
  });

export function hasWeatherPin(p: { lat?: number | null; lon?: number | null }) {
  return typeof p.lat === "number" && typeof p.lon === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lon);
}

export function mapsPin(lat: number, lon: number, z = 15) {
  const q = `${lat},${lon}`;
  return {
    src: `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${z}&hl=en&output=embed`,
    href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
  };
}
