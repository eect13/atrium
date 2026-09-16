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

export function applyDeskRegion(id?: string | null) {
  const r = regionOf(id);
  setDeskZone({ tz: r.tz, locale: r.locale });
  return r;
}
