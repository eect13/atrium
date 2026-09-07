import type { BookCcy } from "./types.ts";
import { BOOK_CCY } from "./types.ts";

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
  return d.toLocaleDateString("en-PH", { month: "long", year: "numeric", timeZone: TZ });
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
};

/** Market quote that keeps cents for FX and drops them for large notionals. */
export function moneyQuote(n: number, ccy = "PHP") {
  const unit = QUOTE_SYM[ccy] ? ccy : "PHP";
  const abs = Math.abs(Number(n));
  const digits = unit === "JPY" ? 0 : abs >= 100_000 ? 0 : abs >= 1 ? 2 : 4;
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

export function chgPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
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
