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
    cityHint: "Manila, Cebu, Davao",
    factory: true,
  },
  {
    id: "US",
    name: "United States",
    tz: "America/New_York",
    locale: "en-US",
    ccy: "USD",
    yahoo: "US",
    cityHint: "New York, Chicago, Los Angeles",
  },
  {
    id: "SG",
    name: "Singapore",
    tz: "Asia/Singapore",
    locale: "en-SG",
    ccy: "SGD",
    yahoo: "SG",
    cityHint: "Singapore",
  },
  {
    id: "JP",
    name: "Japan",
    tz: "Asia/Tokyo",
    locale: "en-US",
    ccy: "JPY",
    yahoo: "JP",
    cityHint: "Tokyo, Osaka",
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
    cityHint: "London, Manchester",
  },
  {
    id: "AU",
    name: "Australia",
    tz: "Australia/Sydney",
    locale: "en-AU",
    ccy: "AUD",
    yahoo: "AU",
    cityHint: "Sydney, Melbourne",
  },
  {
    id: "IN",
    name: "India",
    tz: "Asia/Kolkata",
    locale: "en-IN",
    ccy: "INR",
    yahoo: "IN",
    cityHint: "Mumbai, Delhi, Bengaluru",
  },
  {
    id: "EU",
    name: "Euro area",
    tz: "Europe/Berlin",
    locale: "en-GB",
    ccy: "EUR",
    yahoo: "DE",
    cityHint: "Berlin, Paris, Amsterdam",
  },
  {
    id: "CA",
    name: "Canada",
    tz: "America/Toronto",
    locale: "en-CA",
    ccy: "CAD",
    yahoo: "CA",
    cityHint: "Toronto, Vancouver",
  },
];

export const DEFAULT_REGION = "PH";

export function regionOf(id?: string | null): DeskRegion {
  return DESK_REGIONS.find((r) => r.id === id) ?? DESK_REGIONS[0]!;
}

export function applyDeskRegion(id?: string | null) {
  const r = regionOf(id);
  setDeskZone({ tz: r.tz, locale: r.locale });
  return r;
}
