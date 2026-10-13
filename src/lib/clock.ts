/** World clocks + hour-cycle prefs. Zones are dynamic IANA / clockZones() — no product-hardcoded cities. */

import { clockZones } from "./region.ts";

export type ClockPrefs = {
  /** Ordered IANA zone ids for the world-clock list (beyond the desk primary). */
  zones: string[];
  /** Prefer 24-hour clock in world clocks / clock widget. */
  hour24: boolean;
  /** Working hours in each city's own local time (Card 161 Clock A). Whole hours, start < end. */
  workHours: WorkHours;
};

export type WorkHours = { start: number; end: number };

/** Card 161: 09:00–18:00 by default. */
export const DEFAULT_WORK_HOURS: WorkHours = { start: 9, end: 18 };

export const DEFAULT_CLOCK_PREFS: ClockPrefs = {
  zones: [],
  hour24: true,
  workHours: { ...DEFAULT_WORK_HOURS },
};

export function normalizeWorkHours(raw: unknown): WorkHours {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const start = Number(r.start);
  const end = Number(r.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || start >= end) return { ...DEFAULT_WORK_HOURS };
  return { start, end };
}

const ZONE_MAX = 12;

export function cityFromTz(tz: string): string {
  return tz.split("/").pop()?.replace(/_/g, " ") || tz;
}

export function isValidIana(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Match city / label / IANA against clockZones() first, then accept a valid IANA id. */
export function resolveZoneId(raw: string): string | null {
  const q = raw.trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  const known = clockZones();
  const exact = known.find((z) => z.id.toLowerCase() === lower);
  if (exact) return exact.id;
  const byCity = known.find((z) => cityFromTz(z.id).toLowerCase() === lower);
  if (byCity) return byCity.id;
  const byLabel = known.find((z) => z.label.toLowerCase().includes(lower));
  if (byLabel) return byLabel.id;
  if (isValidIana(q)) return q;
  // Title-Case path segments: america/new_york → America/New_York
  const guess = q
    .split("/")
    .map((p) =>
      p
        .split("_")
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
        .join("_"),
    )
    .join("/");
  if (guess !== q && isValidIana(guess)) return guess;
  return null;
}

export function zoneLabel(tz: string): string {
  const hit = clockZones().find((z) => z.id === tz);
  if (hit) return hit.label;
  return `${cityFromTz(tz)} · ${tz}`;
}

export function normalizeClockPrefs(raw: unknown): ClockPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const zones: string[] = [];
  const seen = new Set<string>();
  for (const v of Array.isArray(r.zones) ? r.zones : []) {
    if (typeof v !== "string") continue;
    const id = resolveZoneId(v) ?? (isValidIana(v.trim()) ? v.trim() : "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    zones.push(id);
    if (zones.length >= ZONE_MAX) break;
  }
  return {
    zones,
    hour24: r.hour24 !== false,
    workHours: normalizeWorkHours(r.workHours),
  };
}

export function withClockZone(p: ClockPrefs, raw: string): ClockPrefs {
  const id = resolveZoneId(raw);
  if (!id || p.zones.includes(id)) return p;
  if (p.zones.length >= ZONE_MAX) return p;
  return { ...p, zones: [...p.zones, id] };
}

export function withoutClockZone(p: ClockPrefs, id: string): ClockPrefs {
  return { ...p, zones: p.zones.filter((z) => z !== id) };
}

/** Desk primary + world list, deduped, primary first. */
export function clockList(primaryTz: string, prefs: ClockPrefs): string[] {
  const primary = primaryTz.trim() || "UTC";
  const out = [primary];
  const seen = new Set([primary]);
  for (const z of prefs.zones) {
    if (seen.has(z)) continue;
    seen.add(z);
    out.push(z);
  }
  return out;
}

export function formatZoneTime(
  date: Date,
  tz: string,
  opts: { hour24: boolean; seconds?: boolean; locale?: string },
): string {
  return date.toLocaleTimeString(opts.locale || "en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: opts.seconds ? "2-digit" : undefined,
    hourCycle: opts.hour24 ? "h23" : "h12",
  });
}

export function formatZoneWeekday(date: Date, tz: string, locale?: string): string {
  return date.toLocaleDateString(locale || "en-GB", {
    timeZone: tz,
    weekday: "long",
  });
}

/** Offset of `tz` from UTC in minutes at `date` (positive = east of UTC). */
export function zoneOffsetMinutes(date: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  });
  const part = fmt.formatToParts(date).find((x) => x.type === "timeZoneName")?.value ?? "GMT";
  const m = part.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const h = Number(m[2] || 0);
  const min = Number(m[3] || 0);
  return sign * (h * 60 + min);
}

/** Offset label of `tz` vs `localTz` (e.g. −7h, +1h, +5h 30m). */
export function formatOffsetVsLocal(date: Date, tz: string, localTz: string): string {
  const delta = zoneOffsetMinutes(date, tz) - zoneOffsetMinutes(date, localTz);
  if (delta === 0) return "±0h";
  const sign = delta > 0 ? "+" : "−";
  const abs = Math.abs(delta);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/** YYYY-MM-DD civil date in `tz`. */
export function civilDateKey(date: Date, tz: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}

export function differentCivilDay(date: Date, tz: string, localTz: string): boolean {
  return civilDateKey(date, tz) !== civilDateKey(date, localTz);
}

export function formatZoneDate(date: Date, tz: string, locale?: string): string {
  return date.toLocaleDateString(locale || "en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatLocalOffsetLabel(date: Date, tz: string): string {
  const mins = zoneOffsetMinutes(date, tz);
  const sign = mins >= 0 ? "+" : "−";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (m === 0) return `UTC${sign}${h}`;
  return `UTC${sign}${h}:${String(m).padStart(2, "0")}`;
}

export function reorderClockZones(p: ClockPrefs, fromId: string, toId: string): ClockPrefs {
  if (fromId === toId) return p;
  const zones = [...p.zones];
  const from = zones.indexOf(fromId);
  const to = zones.indexOf(toId);
  if (from < 0 || to < 0) return p;
  zones.splice(from, 1);
  zones.splice(to, 0, fromId);
  return { ...p, zones };
}


/** Local wall-clock hours (fractional) in `tz` at `date`. */
export function zoneHours(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}

/**
 * Day/night is a fixed 06:00–18:00 local split (no sunrise data file; Card 161 band).
 * Work hours come from `clockPrefs.workHours`.
 */
export const DAY_START = 6;
export const DAY_END = 18;

export type ZoneState = "work" | "day" | "night";

export function zoneState(date: Date, tz: string, wh: WorkHours = DEFAULT_WORK_HOURS): ZoneState {
  const h = zoneHours(date, tz);
  if (h >= wh.start && h < wh.end) return "work";
  return h >= DAY_START && h < DAY_END ? "day" : "night";
}

export const ZONE_STATE_LABEL: Record<ZoneState, string> = { work: "Work hours", day: "Off hours", night: "Night" };

/**
 * Next DST / offset change in `tz` within `days` (from Intl offsets only), or null.
 * `delta` is in minutes (negative = clocks go back).
 */
export function nextClockChange(tz: string, now: Date = new Date(), days = 30): { at: Date; delta: number } | null {
  const hour = 3_600_000;
  const base = zoneOffsetMinutes(now, tz);
  let lo = now.getTime();
  let hi = -1;
  for (let t = lo + hour; t <= now.getTime() + days * 86_400_000; t += hour) {
    if (zoneOffsetMinutes(new Date(t), tz) !== base) {
      hi = t;
      break;
    }
    lo = t;
  }
  if (hi < 0) return null;
  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (zoneOffsetMinutes(new Date(mid), tz) === base) lo = mid;
    else hi = mid;
  }
  return { at: new Date(hi), delta: zoneOffsetMinutes(new Date(hi), tz) - base };
}

/** "Clocks −1h Sun 25 Oct" (date in that city's zone). */
export function clockChangeLabel(change: { at: Date; delta: number }, tz: string, locale?: string): string {
  const abs = Math.abs(change.delta);
  const amount = abs % 60 ? `${Math.floor(abs / 60) ? `${Math.floor(abs / 60)}h ` : ""}${abs % 60}m` : `${abs / 60}h`;
  const day = change.at.toLocaleDateString(locale || "en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).replace(",", "");
  return `Clocks ${change.delta < 0 ? "−" : "+"}${amount} ${day}`;
}

/**
 * Today's overlap of every city's work hours, as instants. Null when they never overlap.
 * Uses each zone's offset at `now`.
 */
export function sharedWorkWindow(zones: string[], wh: WorkHours = DEFAULT_WORK_HOURS, now: Date = new Date()): { from: Date; to: Date } | null {
  if (zones.length < 2) return null;
  let from = -Infinity;
  let to = Infinity;
  for (const z of zones) {
    const local = zoneHours(now, z);
    const startMs = now.getTime() + (wh.start - local) * 3_600_000;
    let s0 = startMs;
    let e0 = startMs + (wh.end - wh.start) * 3_600_000;
    // Use the work window that is current or next for that city.
    if (e0 <= now.getTime() - 12 * 3_600_000) {
      s0 += 86_400_000;
      e0 += 86_400_000;
    }
    from = Math.max(from, s0);
    to = Math.min(to, e0);
  }
  return to > from ? { from: new Date(from), to: new Date(to) } : null;
}
