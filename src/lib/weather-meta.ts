export type PlaceRef = { city: string; lat: number; lon: number; detail?: string };

function placeCore(p: PlaceRef) {
  return (p.detail || p.city).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cityCore(p: PlaceRef) {
  return p.city.split(",")[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** True when two geocode hits are the same city — coords or a matching label. */
export function samePlace(a: PlaceRef, b: PlaceRef) {
  if (Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01) return true;
  const la = placeCore(a);
  const lb = placeCore(b);
  if (la && lb && la === lb) return true;
  const ca = cityCore(a);
  const cb = cityCore(b);
  return Boolean(ca && ca === cb && Math.abs(a.lat - b.lat) < 0.35 && Math.abs(a.lon - b.lon) < 0.35);
}

export function uvBand(n: number) {
  if (n < 3) return { label: "Low", n };
  if (n < 6) return { label: "Moderate", n };
  if (n < 8) return { label: "High", n };
  if (n < 11) return { label: "Very high", n };
  return { label: "Extreme", n };
}

export function aqiBand(n: number) {
  if (n <= 50) return { label: "Good", n };
  if (n <= 100) return { label: "Moderate", n };
  if (n <= 150) return { label: "Sensitive", n };
  if (n <= 200) return { label: "Unhealthy", n };
  if (n <= 300) return { label: "Very unhealthy", n };
  return { label: "Hazardous", n };
}

/** Wall-clock from an Open-Meteo local ISO (`2026-09-18T05:48`). */
export function sunClock(iso?: string) {
  if (!iso || iso.length < 16) return "—";
  const hour = Number(iso.slice(11, 13));
  const min = Number(iso.slice(14, 16));
  if (!Number.isFinite(hour) || !Number.isFinite(min)) return "—";
  const ap = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}:${String(Math.round(min)).padStart(2, "0")} ${ap}`;
}

function julianDay(ms: number) {
  return ms / 86_400_000 + 2_440_587.5;
}

function fromJulian(j: number) {
  return new Date((j - 2_440_587.5) * 86_400_000);
}

function isoInTz(d: Date, tz: string) {
  const map: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function gmtEtc(lon: number) {
  const hours = Math.max(-12, Math.min(12, Math.round(lon / 15)));
  return hours <= 0 ? `Etc/GMT+${-hours}` : `Etc/GMT-${hours}`;
}

/** NOAA-style sunrise / sunset as local ISO. Pass `tz` or we guess from longitude. */
export function solarDay(lat: number, lon: number, at = new Date(), tz = gmtEtc(lon)) {
  const rad = Math.PI / 180;
  const noon = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 12, 0, 0);
  const n = julianDay(noon) - 2_451_545 + 0.0008;
  const jstar = n - lon / 360;
  const M = ((357.5291 + 0.98560028 * jstar) % 360) * rad;
  const C = 1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M);
  const lambda = M + C * rad + (180 + 102.9372) * rad;
  const jtransit = 2_451_545 + jstar + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * lambda);
  const delta = Math.asin(Math.sin(lambda) * Math.sin(23.4397 * rad));
  const latR = lat * rad;
  const cosOmega = (Math.sin(-0.83 * rad) - Math.sin(latR) * Math.sin(delta)) / (Math.cos(latR) * Math.cos(delta));
  if (cosOmega <= -1 || cosOmega >= 1) return { sunrise: undefined, sunset: undefined };
  const omegaDeg = Math.acos(cosOmega) / rad;
  return {
    sunrise: isoInTz(fromJulian(jtransit - omegaDeg / 360), tz),
    sunset: isoInTz(fromJulian(jtransit + omegaDeg / 360), tz),
  };
}
