export const TZ = "Asia/Manila";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type ManilaParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
  weekdayIndex: number;
};

export function manilaParts(d: Date = new Date()): ManilaParts {
  const map: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(d)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const weekday = map.weekday ?? "Sun";
  const weekdayIndex = WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday,
    weekdayIndex: weekdayIndex < 0 ? 0 : weekdayIndex,
  };
}

/** Manila is UTC+8 year-round (no DST). Month is 1-based. */
export function fromManila(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
}

export function manilaAt(date: string, hour = 0, minute = 0) {
  const [year, month, day] = date.split("-").map(Number);
  return fromManila(year, month, day, hour, minute);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `datetime-local` value in Asia/Manila, not the host zone. */
export function toManilaInput(d: Date | string = new Date()) {
  const p = manilaParts(new Date(d));
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Parse a `datetime-local` string as Manila wall time. */
export function fromManilaInput(value: string) {
  const [date, time = "00:00"] = value.split("T");
  if (!date) return null;
  const [h, mi] = time.split(":").map(Number);
  const dt = manilaAt(date, h || 0, mi || 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function weekRangeLabel(cursor: Date) {
  const p = manilaParts(cursor);
  const start = fromManila(p.year, p.month, p.day - p.weekdayIndex, 12);
  const end = fromManila(p.year, p.month, p.day - p.weekdayIndex + 6, 12);
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: TZ,
  }).formatRange(start, end);
}

/** Calendar date in Asia/Manila, not the host timezone. */
export function isoDate(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function isoMonth(d: Date = new Date()) {
  return isoDate(d).slice(0, 7);
}

export function hourInTZ(d: Date = new Date()) {
  return manilaParts(d).hour;
}

export function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}

export function sameDay(a: string | Date, b: string | Date) {
  return isoDate(new Date(a)) === isoDate(new Date(b));
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  });
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: TZ,
  });
}

/** True when the event is flagged all-day or spans at least 12 hours. */
export function isAllDayEvent(e: { start: string; end: string; allDay?: boolean }) {
  if (e.allDay) return true;
  const ms = new Date(e.end).getTime() - new Date(e.start).getTime();
  return Number.isFinite(ms) && ms >= 12 * 3_600_000;
}

export function fmtWhen(e: { start: string; end: string; allDay?: boolean }) {
  if (isAllDayEvent(e)) return "All day";
  return `${fmtTime(e.start)} – ${fmtTime(e.end)}`;
}

export function monthName(d: Date) {
  return d.toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: TZ });
}

export function peso(n: number) {
  return `₱${Number(n).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

const QUOTE_SYM: Record<string, string> = {
  PHP: "₱",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
};

/** Market quote that keeps cents for FX and drops them for large notionals. */
export function moneyQuote(n: number, ccy = "PHP") {
  const unit = QUOTE_SYM[ccy] ? ccy : "PHP";
  const abs = Math.abs(Number(n));
  const digits = unit === "JPY" ? 0 : abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return `${QUOTE_SYM[unit]}${Number(n).toLocaleString("en-PH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** PHP quote that keeps cents for FX and drops them for large crypto. */
export function phpQuote(n: number) {
  return moneyQuote(n, "PHP");
}

export function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function vol(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-PH");
}

export function uid() {
  return crypto.randomUUID();
}

export const CAT_COLORS: Record<string, string> = {
  work: "var(--color-ring)",
  personal: "var(--color-foreground)",
  family: "var(--color-destructive)",
  health: "var(--color-ok)",
  other: "var(--color-muted-foreground)",
};

export const NOTE_COLORS = [
  "#e8e4d4",
  "#ead9d4",
  "#d7e4dc",
  "#d6dde8",
  "#e2dce8",
];
