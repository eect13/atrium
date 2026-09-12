/** Yahoo predefined screeners + local PE / cap / volume / yield filters. No API key. */

export const SCREEN_FETCH = 100;

export const SESSION_SCREENS = [
  { id: "day_gainers", label: "Gainers" },
  { id: "day_losers", label: "Losers" },
  { id: "most_actives", label: "Active" },
] as const;

export const STYLE_SCREENS = [
  { id: "undervalued_large_caps", label: "Cheap large" },
  { id: "undervalued_growth_stocks", label: "Cheap growth" },
  { id: "growth_technology_stocks", label: "Growth tech" },
  { id: "small_cap_gainers", label: "Small cap" },
  { id: "most_shorted_stocks", label: "Most shorted" },
  { id: "aggressive_small_caps", label: "Aggressive" },
] as const;

export const SECTOR_SCREENS = [
  { id: "ms_healthcare", label: "Health" },
  { id: "ms_financial_services", label: "Finance" },
  { id: "ms_consumer_cyclical", label: "Consumer" },
] as const;

export const SCREENERS = [...SESSION_SCREENS, ...STYLE_SCREENS, ...SECTOR_SCREENS] as const;

export type ScreenerId = (typeof SCREENERS)[number]["id"];

export const SCREEN_PES = [
  { id: "any", label: "Any PE" },
  { id: "lt15", label: "PE < 15" },
  { id: "lt25", label: "PE < 25" },
  { id: "gt25", label: "PE > 25" },
] as const;

export const SCREEN_CAPS = [
  { id: "any", label: "Any cap" },
  { id: "micro", label: "Micro" },
  { id: "small", label: "Small" },
  { id: "mid", label: "Mid" },
  { id: "large", label: "Large" },
  { id: "mega", label: "Mega" },
] as const;

export const SCREEN_VOLS = [
  { id: "any", label: "Any vol" },
  { id: "m1", label: "> 1M" },
  { id: "m5", label: "> 5M" },
  { id: "m20", label: "> 20M" },
] as const;

export const SCREEN_YLDS = [
  { id: "any", label: "Any yld" },
  { id: "gt2", label: "Yld > 2%" },
  { id: "gt4", label: "Yld > 4%" },
] as const;

export type ScreenPe = (typeof SCREEN_PES)[number]["id"];
export type ScreenCap = (typeof SCREEN_CAPS)[number]["id"];
export type ScreenVol = (typeof SCREEN_VOLS)[number]["id"];
export type ScreenYld = (typeof SCREEN_YLDS)[number]["id"];

export function normalizeScreen(raw?: string): ScreenerId {
  return SCREENERS.some((s) => s.id === raw) ? (raw as ScreenerId) : "day_gainers";
}

export function normalizeScreenPe(raw?: string): ScreenPe {
  return SCREEN_PES.some((s) => s.id === raw) ? (raw as ScreenPe) : "any";
}

export function normalizeScreenCap(raw?: string): ScreenCap {
  return SCREEN_CAPS.some((s) => s.id === raw) ? (raw as ScreenCap) : "any";
}

export function normalizeScreenVol(raw?: string): ScreenVol {
  return SCREEN_VOLS.some((s) => s.id === raw) ? (raw as ScreenVol) : "any";
}

export function normalizeScreenYld(raw?: string): ScreenYld {
  return SCREEN_YLDS.some((s) => s.id === raw) ? (raw as ScreenYld) : "any";
}

export function capBand(n: number): Exclude<ScreenCap, "any"> {
  if (n < 300_000_000) return "micro";
  if (n < 2_000_000_000) return "small";
  if (n < 10_000_000_000) return "mid";
  if (n < 200_000_000_000) return "large";
  return "mega";
}

export function capLabel(n?: number) {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  return String(Math.round(n));
}

export function peLabel(n?: number) {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  return `PE ${n >= 100 ? n.toFixed(0) : n.toFixed(1)}`;
}

export function yldLabel(n?: number) {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  return `${n.toFixed(1)}% yld`;
}

export type ScreenFilters = {
  pe?: ScreenPe;
  cap?: ScreenCap;
  vol?: ScreenVol;
  yld?: ScreenYld;
};

export function screensOn(f: ScreenFilters) {
  return (
    (f.pe != null && f.pe !== "any") ||
    (f.cap != null && f.cap !== "any") ||
    (f.vol != null && f.vol !== "any") ||
    (f.yld != null && f.yld !== "any")
  );
}

export type ScreenRow = {
  pe?: number;
  marketCap?: number;
  volume?: number;
  yieldPct?: number;
};

export function applyScreenFilters<T extends ScreenRow>(rows: T[], f: ScreenFilters): T[] {
  const pe = f.pe && f.pe !== "any" ? f.pe : undefined;
  const cap = f.cap && f.cap !== "any" ? f.cap : undefined;
  const vol = f.vol && f.vol !== "any" ? f.vol : undefined;
  const yld = f.yld && f.yld !== "any" ? f.yld : undefined;
  if (!pe && !cap && !vol && !yld) return rows;
  const minVol = vol === "m1" ? 1_000_000 : vol === "m5" ? 5_000_000 : vol === "m20" ? 20_000_000 : 0;
  const minYld = yld === "gt4" ? 4 : yld === "gt2" ? 2 : 0;
  return rows.filter((r) => {
    if (pe) {
      if (r.pe == null || r.pe <= 0) return false;
      if (pe === "lt15" && r.pe >= 15) return false;
      if (pe === "lt25" && r.pe >= 25) return false;
      if (pe === "gt25" && r.pe <= 25) return false;
    }
    if (cap) {
      if (r.marketCap == null || r.marketCap <= 0) return false;
      if (capBand(r.marketCap) !== cap) return false;
    }
    if (minVol && (r.volume ?? 0) < minVol) return false;
    if (minYld && (r.yieldPct ?? 0) < minYld) return false;
    return true;
  });
}
