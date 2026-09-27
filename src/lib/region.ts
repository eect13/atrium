import { setDeskZone } from "./format.ts";
import type { BookCcy } from "./types.ts";

export type DeskRegion = {
  id: string;
  name: string;
  tz: string;
  locale: string;
  ccy: BookCcy;
  yahoo: string;
  cityHint: string;
  factory?: boolean;
};

/** Philippines is the factory desk. Other countries are first-class, not afterthoughts. */
export const DESK_REGIONS: DeskRegion[] = [
  {
    id: "PH",
    name: "Philippines",
    tz: "Asia/Manila",
    locale: "en-PH",
    ccy: "PHP",
    yahoo: "PH",
    cityHint: "Manila, Cebu, or 1740",
    factory: true,
  },
  {
    id: "US",
    name: "United States",
    tz: "America/New_York",
    locale: "en-US",
    ccy: "USD",
    yahoo: "US",
    cityHint: "New York, or 10001",
  },
  {
    id: "SG",
    name: "Singapore",
    tz: "Asia/Singapore",
    locale: "en-SG",
    ccy: "SGD",
    yahoo: "SG",
    cityHint: "Singapore, or 018956",
  },
  {
    id: "JP",
    name: "Japan",
    tz: "Asia/Tokyo",
    locale: "en-US",
    ccy: "JPY",
    yahoo: "JP",
    cityHint: "Tokyo, or 100-0001",
  },
  {
    id: "HK",
    name: "Hong Kong",
    tz: "Asia/Hong_Kong",
    locale: "en-HK",
    ccy: "HKD",
    yahoo: "HK",
    cityHint: "Hong Kong",
  },
  {
    id: "GB",
    name: "United Kingdom",
    tz: "Europe/London",
    locale: "en-GB",
    ccy: "GBP",
    yahoo: "GB",
    cityHint: "London, or SW1A 1AA",
  },
  {
    id: "AU",
    name: "Australia",
    tz: "Australia/Sydney",
    locale: "en-AU",
    ccy: "AUD",
    yahoo: "AU",
    cityHint: "Sydney, or 2000",
  },
  {
    id: "IN",
    name: "India",
    tz: "Asia/Kolkata",
    locale: "en-IN",
    ccy: "INR",
    yahoo: "IN",
    cityHint: "Mumbai, or 400001",
  },
  {
    id: "EU",
    name: "Euro area",
    tz: "Europe/Berlin",
    locale: "en-GB",
    ccy: "EUR",
    yahoo: "DE",
    cityHint: "Berlin, or 10115",
  },
  {
    id: "CA",
    name: "Canada",
    tz: "America/Toronto",
    locale: "en-CA",
    ccy: "CAD",
    yahoo: "CA",
    cityHint: "Toronto, or M5V 2T6",
  },
  {
    id: "VN",
    name: "Vietnam",
    tz: "Asia/Ho_Chi_Minh",
    locale: "en-US",
    ccy: "VND",
    yahoo: "VN",
    cityHint: "Ho Chi Minh City, or 700000",
  },
  {
    id: "TH",
    name: "Thailand",
    tz: "Asia/Bangkok",
    locale: "en-US",
    ccy: "THB",
    yahoo: "TH",
    cityHint: "Bangkok, or 10110",
  },
  {
    id: "MY",
    name: "Malaysia",
    tz: "Asia/Kuala_Lumpur",
    locale: "en-US",
    ccy: "MYR",
    yahoo: "MY",
    cityHint: "Kuala Lumpur, or 50000",
  },
  {
    id: "ID",
    name: "Indonesia",
    tz: "Asia/Jakarta",
    locale: "en-US",
    ccy: "IDR",
    yahoo: "ID",
    cityHint: "Jakarta, or 10110",
  },
  {
    id: "KR",
    name: "South Korea",
    tz: "Asia/Seoul",
    locale: "en-US",
    ccy: "KRW",
    yahoo: "KR",
    cityHint: "Seoul, or 04524",
  },
  {
    id: "TW",
    name: "Taiwan",
    tz: "Asia/Taipei",
    locale: "en-US",
    ccy: "TWD",
    yahoo: "TW",
    cityHint: "Taipei, or 100",
  },
  {
    id: "NZ",
    name: "New Zealand",
    tz: "Pacific/Auckland",
    locale: "en-NZ",
    ccy: "NZD",
    yahoo: "NZ",
    cityHint: "Auckland, or 1010",
  },
  {
    id: "CH",
    name: "Switzerland",
    tz: "Europe/Zurich",
    locale: "en-GB",
    ccy: "CHF",
    yahoo: "CH",
    cityHint: "Zurich, or 8001",
  },
  {
    id: "BR",
    name: "Brazil",
    tz: "America/Sao_Paulo",
    locale: "en-US",
    ccy: "BRL",
    yahoo: "BR",
    cityHint: "São Paulo, or 01310-100",
  },
  {
    id: "MX",
    name: "Mexico",
    tz: "America/Mexico_City",
    locale: "en-US",
    ccy: "MXN",
    yahoo: "MX",
    cityHint: "Mexico City, or 06600",
  },
  {
    id: "ZA",
    name: "South Africa",
    tz: "Africa/Johannesburg",
    locale: "en-ZA",
    ccy: "ZAR",
    yahoo: "ZA",
    cityHint: "Johannesburg, or 2000",
  },
  {
    id: "AE",
    name: "United Arab Emirates",
    tz: "Asia/Dubai",
    locale: "en-US",
    ccy: "AED",
    yahoo: "AE",
    cityHint: "Dubai",
  },
];

export const DEFAULT_REGION = "PH";

export function regionOf(id?: string | null): DeskRegion {
  return DESK_REGIONS.find((r) => r.id === id) ?? DESK_REGIONS[0]!;
}

/** ISO 3166-1 alpha-2 for geocoders. Euro area is not a country — leave blank. */
export function isoCountry(id?: string | null): string {
  const r = regionOf(id);
  return r.id === "EU" ? "" : r.id;
}

export function clockZones(): { id: string; label: string }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string }[] = [];
  const push = (id: string, label: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, label });
  };
  for (const r of DESK_REGIONS) {
    const city = r.tz.split("/").pop()?.replace(/_/g, " ") || r.tz;
    push(r.tz, `${city} · ${r.name}`);
  }
  push("UTC", "UTC");
  push("America/Los_Angeles", "Los Angeles");
  push("America/Chicago", "Chicago");
  push("Europe/Paris", "Paris");
  return out;
}

export function normalizeMarkets(raw?: unknown, fallback?: string | null): string[] {
  const ids = Array.isArray(raw)
    ? raw.map((x) => (typeof x === "string" ? regionOf(x).id : "")).filter(Boolean)
    : [];
  const uniq = [...new Set(ids)];
  return uniq.length ? uniq : [regionOf(fallback).id];
}

export function toggleMarket(current: string[] | undefined, id: string): string[] {
  const next = new Set(normalizeMarkets(current));
  const rid = regionOf(id).id;
  if (next.has(rid)) {
    if (next.size <= 1) return [...next];
    next.delete(rid);
  } else {
    next.add(rid);
  }
  return DESK_REGIONS.map((r) => r.id).filter((x) => next.has(x));
}

export function applyDeskProfile(profile: { region?: string | null; tz?: string | null; locale?: string | null }) {
  const r = regionOf(profile.region);
  setDeskZone({
    tz: profile.tz?.trim() || r.tz,
    locale: profile.locale?.trim() || r.locale,
  });
  return r;
}

export function applyDeskRegion(id?: string | null) {
  return applyDeskProfile({ region: id });
}

