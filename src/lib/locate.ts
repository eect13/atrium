import { reversePlace, type PlaceHit } from "./weather";

export type LocateResult = { hit: PlaceHit; via: "gps" | "network" };

function withTimeout<T>(p: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function gpsFix(): Promise<{ lat: number; lon: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  try {
    const pos = await withTimeout(
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 4_000,
          maximumAge: 300_000,
        });
      }),
      4_500,
    );
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  } catch {
    return null;
  }
}

async function readGeojs(): Promise<PlaceHit | null> {
  try {
    const res = await fetch("https://get.geojs.io/v1/ip/geo.json", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      city?: string;
      region?: string;
      country?: string;
      latitude?: string | number;
      longitude?: string | number;
    };
    const lat = Number(json.latitude);
    const lon = Number(json.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const city = [json.city, json.region].filter(Boolean).join(", ") || json.country || "";
    return { city, lat, lon };
  } catch {
    return null;
  }
}

async function readIpwho(): Promise<PlaceHit | null> {
  try {
    const res = await fetch("https://ipwho.is/", { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      city?: string;
      region?: string;
      country?: string;
      latitude?: number;
      longitude?: number;
    };
    if (json.success === false) return null;
    const lat = Number(json.latitude);
    const lon = Number(json.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const city = [json.city, json.region].filter(Boolean).join(", ") || json.country || "";
    return { city, lat, lon };
  } catch {
    return null;
  }
}

/** GPS first; preview iframes usually deny it, so fall back to the browser's public IP. */
export async function locateMe(): Promise<LocateResult | null> {
  const gps = await gpsFix();
  if (gps) {
    try {
      const place = await reversePlace({ data: gps });
      return { hit: { lat: gps.lat, lon: gps.lon, city: place.city }, via: "gps" };
    } catch {
      return { hit: { ...gps, city: "" }, via: "gps" };
    }
  }
  const net = (await readGeojs()) ?? (await readIpwho());
  return net ? { hit: net, via: "network" } : null;
}
