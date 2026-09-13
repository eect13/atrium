import type { BookCcy } from "./types.ts";
import { BOOK_CCY } from "./types.ts";

export const TZ = "Asia/Manila";
export const LOCALE = "en-PH";

type DeskZone = { tz: string; locale: string };
let zone: DeskZone = { tz: TZ, locale: LOCALE };

export function deskZone() {
  return zone;
}

export function setDeskZone(next: Partial<DeskZone>) {
  zone = {
    tz: next.tz?.trim() || zone.tz,
    locale: next.locale?.trim() || zone.locale,
  };
}

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
    timeZone: zone.tz,
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

/** Wall time in the desk region. Month is 1-based. */
export function fromManila(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) {
  const tz = zone.tz;
  let utc = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i += 1) {
    const map: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(utc))) {
      if (part.type !== "literal") map[part.type] = part.value;
    }
    const got = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
    );
    utc += Date.UTC(year, month - 1, day, hour, minute) - got;
  }
  return new Date(utc);
}

export function manilaAt(date: string, hour = 0, minute = 0) {
  const [year, month, day] = date.split("-").map(Number);
  return fromManila(year, month, day, hour, minute);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `datetime-local` value in the desk region, not the host zone. */
export function toManilaInput(d: Date | string = new Date()) {
  const p = manilaParts(new Date(d));
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Parse a `datetime-local` string as desk-region wall time. */
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
  return new Intl.DateTimeFormat(zone.locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: zone.tz,
  }).formatRange(start, end);
}

/** Calendar date in the desk region, not the host timezone. */
export function isoDate(d: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone.tz,
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
  return new Date(iso).toLocaleTimeString(zone.locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone.tz,
  });
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(zone.locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: zone.tz,
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

export const CCY_META: Record<BookCcy, { symbol: string; name: string; locale: string }> = {
  PHP: { symbol: "₱", name: "Philippine peso", locale: "en-PH" },
  USD: { symbol: "$", name: "US dollar", locale: "en-US" },
  EUR: { symbol: "€", name: "Euro", locale: "de-DE" },
  GBP: { symbol: "£", name: "Pound sterling", locale: "en-GB" },
  JPY: { symbol: "¥", name: "Yen", locale: "ja-JP" },
  KRW: { symbol: "₩", name: "Won", locale: "ko-KR" },
  SGD: { symbol: "S$", name: "Singapore dollar", locale: "en-SG" },
  HKD: { symbol: "HK$", name: "Hong Kong dollar", locale: "en-HK" },
  CNY: { symbol: "¥", name: "Yuan", locale: "zh-CN" },
  AUD: { symbol: "A$", name: "Australian dollar", locale: "en-AU" },
  CAD: { symbol: "C$", name: "Canadian dollar", locale: "en-CA" },
  CHF: { symbol: "Fr", name: "Swiss franc", locale: "de-CH" },
  NZD: { symbol: "NZ$", name: "New Zealand dollar", locale: "en-NZ" },
  INR: { symbol: "₹", name: "Indian rupee", locale: "en-IN" },
  THB: { symbol: "฿", name: "Thai baht", locale: "th-TH" },
  MYR: { symbol: "RM", name: "Malaysian ringgit", locale: "en-MY" },
  IDR: { symbol: "Rp", name: "Indonesian rupiah", locale: "id-ID" },
  VND: { symbol: "₫", name: "Vietnamese dong", locale: "vi-VN" },
  TWD: { symbol: "NT$", name: "New Taiwan dollar", locale: "zh-TW" },
  AED: { symbol: "د.إ", name: "UAE dirham", locale: "ar-AE" },
  SAR: { symbol: "﷼", name: "Saudi riyal", locale: "ar-SA" },
  QAR: { symbol: "QR", name: "Qatari riyal", locale: "ar-QA" },
  KWD: { symbol: "KD", name: "Kuwaiti dinar", locale: "ar-KW" },
  BHD: { symbol: "BD", name: "Bahraini dinar", locale: "ar-BH" },
  OMR: { symbol: "﷼", name: "Omani rial", locale: "ar-OM" },
  TRY: { symbol: "₺", name: "Turkish lira", locale: "tr-TR" },
  ILS: { symbol: "₪", name: "Israeli shekel", locale: "he-IL" },
  ZAR: { symbol: "R", name: "South African rand", locale: "en-ZA" },
  BRL: { symbol: "R$", name: "Brazilian real", locale: "pt-BR" },
  MXN: { symbol: "MX$", name: "Mexican peso", locale: "es-MX" },
  NOK: { symbol: "kr", name: "Norwegian krone", locale: "nb-NO" },
  SEK: { symbol: "kr", name: "Swedish krona", locale: "sv-SE" },
  DKK: { symbol: "kr", name: "Danish krone", locale: "da-DK" },
  PLN: { symbol: "zł", name: "Polish zloty", locale: "pl-PL" },
  CZK: { symbol: "Kč", name: "Czech koruna", locale: "cs-CZ" },
  HUF: { symbol: "Ft", name: "Hungarian forint", locale: "hu-HU" },
  RON: { symbol: "lei", name: "Romanian leu", locale: "ro-RO" },
  RUB: { symbol: "₽", name: "Russian ruble", locale: "ru-RU" },
  UAH: { symbol: "₴", name: "Ukrainian hryvnia", locale: "uk-UA" },
  NGN: { symbol: "₦", name: "Nigerian naira", locale: "en-NG" },
  EGP: { symbol: "E£", name: "Egyptian pound", locale: "ar-EG" },
  KES: { symbol: "KSh", name: "Kenyan shilling", locale: "en-KE" },
  PKR: { symbol: "Rs", name: "Pakistani rupee", locale: "en-PK" },
  BDT: { symbol: "৳", name: "Bangladeshi taka", locale: "bn-BD" },
  LKR: { symbol: "Rs", name: "Sri Lankan rupee", locale: "si-LK" },
  NPR: { symbol: "Rs", name: "Nepalese rupee", locale: "ne-NP" },
  MMK: { symbol: "K", name: "Myanmar kyat", locale: "my-MM" },
  KHR: { symbol: "៛", name: "Cambodian riel", locale: "km-KH" },
  BND: { symbol: "B$", name: "Brunei dollar", locale: "ms-BN" },
  FJD: { symbol: "FJ$", name: "Fijian dollar", locale: "en-FJ" },
};

const CCY_HINTS: { id: BookCcy; test: RegExp }[] = [
  { id: "PHP", test: /\bphp\b|peso|₱|philippine/i },
  { id: "USD", test: /\busd\b|us\s*dollar|\bdollars?\b/i },
  { id: "EUR", test: /\beur\b|euro|€/i },
  { id: "GBP", test: /\bgbp\b|pound|sterling|£/i },
  { id: "JPY", test: /\bjpy\b|\byen\b|\bjapan\b/i },
  { id: "KRW", test: /\bkrw\b|\bwon\b|korea/i },
  { id: "SGD", test: /\bsgd\b|singapore/i },
  { id: "HKD", test: /\bhkd\b|hong\s*kong/i },
  { id: "CNY", test: /\bcny\b|\byuan\b|\brmb\b/i },
  { id: "AUD", test: /\baud\b|australian/i },
  { id: "CAD", test: /\bcad\b|canadian/i },
  { id: "CHF", test: /\bchf\b|swiss|franc/i },
  { id: "NZD", test: /\bnzd\b|zealand/i },
  { id: "INR", test: /\binr\b|rupee|₹|india/i },
  { id: "THB", test: /\bthb\b|baht|thailand/i },
  { id: "MYR", test: /\bmyr\b|ringgit|malaysia/i },
  { id: "IDR", test: /\bidr\b|rupiah|indonesia/i },
  { id: "VND", test: /\bvnd\b|dong|vietnam/i },
  { id: "TWD", test: /\btwd\b|taiwan/i },
  { id: "AED", test: /\baed\b|dirham|emirates/i },
  { id: "SAR", test: /\bsar\b|riyal|saudi/i },
  { id: "QAR", test: /\bqar\b|qatar/i },
  { id: "KWD", test: /\bkwd\b|kuwait/i },
  { id: "BHD", test: /\bbhd\b|bahrain/i },
  { id: "OMR", test: /\bomr\b|oman/i },
  { id: "TRY", test: /\btry\b|lira|turkey/i },
  { id: "ILS", test: /\bils\b|shekel|israel/i },
  { id: "ZAR", test: /\bzar\b|rand|africa/i },
  { id: "BRL", test: /\bbrl\b|real|brazil/i },
  { id: "MXN", test: /\bmxn\b|mexican/i },
  { id: "NOK", test: /\bnok\b|norway|krone/i },
  { id: "SEK", test: /\bsek\b|sweden|krona/i },
  { id: "DKK", test: /\bdkk\b|denmark/i },
  { id: "PLN", test: /\bpln\b|zloty|poland/i },
  { id: "CZK", test: /\bczk\b|koruna|czech/i },
  { id: "HUF", test: /\bhuf\b|forint|hungary/i },
  { id: "RON", test: /\bron\b|leu|romania/i },
  { id: "RUB", test: /\brub\b|ruble|russia/i },
  { id: "UAH", test: /\buah\b|hryvnia|ukraine/i },
  { id: "NGN", test: /\bngn\b|naira|nigeria/i },
  { id: "EGP", test: /\begp\b|egypt/i },
  { id: "KES", test: /\bkes\b|shilling|kenya/i },
  { id: "PKR", test: /\bpkr\b|pakistan/i },
  { id: "BDT", test: /\bbdt\b|taka|bangladesh/i },
  { id: "LKR", test: /\blkr\b|sri\s*lanka/i },
  { id: "NPR", test: /\bnpr\b|nepal/i },
  { id: "MMK", test: /\bmmk\b|kyat|myanmar/i },
  { id: "KHR", test: /\bkhr\b|riel|cambodia/i },
  { id: "BND", test: /\bbnd\b|brunei/i },
  { id: "FJD", test: /\bfjd\b|fiji/i },
];

export function isBookCcy(raw: unknown): raw is BookCcy {
  return typeof raw === "string" && (BOOK_CCY as readonly string[]).includes(raw);
}

export function normalizeCcy(raw: unknown, fallback: BookCcy = "PHP"): BookCcy {
  if (typeof raw === "string" && isBookCcy(raw.toUpperCase())) return raw.toUpperCase() as BookCcy;
  return fallback;
}

/** Name / city → ISO code. Philippine cash defaults to peso. */
export function inferCcy(hay: string | undefined, fallback: BookCcy = "PHP"): BookCcy {
  const s = hay ?? "";
  for (const row of CCY_HINTS) {
    if (row.test.test(s)) return row.id;
  }
  if (/\b(manila|luzon|visayas|mindanao|piñas|quezon|cebu|davao|philippines|\bph\b)/i.test(s)) {
    return "PHP";
  }
  return fallback;
}

export function ccySymbol(ccy: string | undefined): string {
  const id = normalizeCcy(ccy);
  return CCY_META[id].symbol;
}

export function monthName(d: Date) {
  return d.toLocaleDateString(zone.locale, { month: "long", year: "numeric", timeZone: zone.tz });
}

export function peso(n: number) {
  return money(n, "PHP");
}

export function money(n: number, ccy: string = "PHP") {
  const id = normalizeCcy(ccy);
  const meta = CCY_META[id];
  return `${meta.symbol}${Number(n).toLocaleString(meta.locale, { maximumFractionDigits: 0 })}`;
}

export function maskedPeso(n: number, mask: boolean) {
  return maskedMoney(n, mask, "PHP");
}

export function maskedMoney(n: number, mask: boolean, ccy: string = "PHP") {
  return mask ? `${ccySymbol(ccy)} ••••` : money(n, ccy);
}

const QUOTE_SYM: Record<string, string> = {
  PHP: "₱",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  HKD: "HK$",
  KRW: "₩",
  SGD: "S$",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF ",
  CNY: "CN¥",
  INR: "₹",
};

/** Market quote that keeps cents for FX and drops them for large notionals. */
export function moneyQuote(n: number, ccy = "PHP") {
  const abs = Math.abs(Number(n));
  const digits = ccy === "JPY" || ccy === "KRW" ? 0 : abs >= 100_000 ? 0 : abs >= 1 ? 2 : 4;
  const num = Number(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sym = QUOTE_SYM[ccy];
  if (!sym) return `${ccy} ${num}`;
  return `${sym}${num}`;
}

/** PHP quote that keeps cents for FX and drops them for large crypto. */
export function phpQuote(n: number) {
  return moneyQuote(n, "PHP");
}

/** Compact last for tight columns — ₱4.85M instead of ₱4,850,048. */
export function moneyShort(n: number, ccy = "PHP") {
  const abs = Math.abs(Number(n));
  const sym = QUOTE_SYM[ccy] ?? (ccy ? `${ccy} ` : "");
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return `${sym}${v.toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  }
  if (abs >= 100_000) return `${sym}${(n / 1_000).toFixed(0)}K`;
  return moneyQuote(n, ccy);
}

export function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export function chgPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function vol(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(zone.locale);
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
  "#ffffff",
  "#f3f3f3",
  "#e7e7e7",
  "#cfd2d6",
  "#9aa0a6",
  "#2c2d30",
];

/** Normalize a CSS color to `#rrggbb` for `<input type="color">`. */
export function hexColor(raw: string): string {
  const s = (raw ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1]!;
    const g = s[2]!;
    const b = s[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return NOTE_COLORS[0]!;
}

/** Body ink that holds contrast on a sticky-note paper color. */
export function inkOnPaper(raw: string): string {
  const h = hexColor(raw).slice(1);
  const r = Number.parseInt(h.slice(0, 2), 16) / 255;
  const g = Number.parseInt(h.slice(2, 4), 16) / 255;
  const b = Number.parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 0.45 ? "#1c1b16" : "#f6f3ea";
}

/** Month grid for the calendar and the floating month peek. */
export function monthCells(cursor: Date) {
  const { year: y, month: m } = manilaParts(cursor);
  const first = fromManila(y, m, 1, 12);
  const startDow = manilaParts(first).weekdayIndex;
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: { day: number; out: boolean; date: Date }[] = [];
  for (let i = 0; i < startDow; i++) {
    const date = fromManila(y, m, i - startDow + 1, 12);
    out.push({ day: manilaParts(date).day, out: true, date });
  }
  for (let d = 1; d <= daysIn; d++) out.push({ day: d, out: false, date: fromManila(y, m, d, 12) });
  while (out.length % 7) {
    const n = out.length - (startDow + daysIn) + 1;
    out.push({ day: n, out: true, date: fromManila(y, m + 1, n, 12) });
  }
  return out;
}

export function notePlain(html?: string, text = "") {
  const raw = html?.trim() ? html : text;
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function staleTagline(raw?: string) {
  const line = (raw ?? "").trim();
  if (!line || line === "Local-first desk" || line === "Local-first · Asia/Manila") return "";
  return line.slice(0, 48);
}


/** Display title for a sticky note — explicit title, else first body line. */
export function noteTitle(note: { title?: string; html?: string; text: string }) {
  const t = (note.title ?? "").trim();
  if (t) return t;
  const body = notePlain(note.html, note.text).trim();
  const line = body.split("\n").find((l) => l.trim()) ?? "";
  return line.trim() || "Untitled";
}

export const WORLD_ZONES = [
  { id: "desk", label: "Desk (profile)" },
  { id: "local", label: "This computer" },
  { id: "UTC", label: "UTC" },
  { id: "America/New_York", label: "New York" },
  { id: "America/Los_Angeles", label: "Los Angeles" },
  { id: "America/Chicago", label: "Chicago" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Paris", label: "Paris" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Asia/Hong_Kong", label: "Hong Kong" },
  { id: "Asia/Manila", label: "Manila" },
  { id: "Australia/Sydney", label: "Sydney" },
] as const;

export function resolveEventTz(id: string) {
  if (id === "desk") return deskZone().tz;
  if (id === "local") return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return id;
}

export function partsInTz(d: Date, tz: string): ManilaParts {
  const prev = deskZone();
  setDeskZone({ tz });
  const p = manilaParts(d);
  setDeskZone(prev);
  return p;
}

export function toZoneInput(d: Date | string = new Date(), tz?: string) {
  const use = tz || deskZone().tz;
  const p = partsInTz(new Date(d), use);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function fromZoneInput(value: string, tz?: string) {
  const use = tz || deskZone().tz;
  const [date, time = "00:00"] = value.split("T");
  if (!date) return null;
  const [y, mo, da] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const prev = deskZone();
  setDeskZone({ tz: use });
  const dt = fromManila(y || 0, mo || 1, da || 1, h || 0, mi || 0);
  setDeskZone(prev);
  return Number.isNaN(dt.getTime()) ? null : dt;
}