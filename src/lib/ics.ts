import type { CalendarEvent } from "./types.ts";
import { fromManila, isAllDayEvent, manilaParts, uid } from "./format.ts";

function icsEscape(s: string) {
  return String(s || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function icsUnescape(s: string) {
  return s.replace(/\\([;,nN\\])/g, (_, ch: string) =>
    ch === "n" || ch === "N" ? "\n" : ch,
  );
}

function toICSDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
}

function toICSDay(iso: string) {
  const p = manilaParts(new Date(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}${pad(p.month)}${pad(p.day)}`;
}

function nextManilaDay(iso: string) {
  const p = manilaParts(new Date(iso));
  return fromManila(p.year, p.month, p.day + 1, 12).toISOString();
}

export function eventsToICS(events: CalendarEvent[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Atrium//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const ev of events) {
    const uidLine = ev.id.includes("@") ? ev.id : `${ev.id}@atrium.local`;
    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + uidLine);
    lines.push("DTSTAMP:" + toICSDate(new Date().toISOString()));
    if (isAllDayEvent(ev)) {
      lines.push("DTSTART;VALUE=DATE:" + toICSDay(ev.start));
      lines.push("DTEND;VALUE=DATE:" + toICSDay(nextManilaDay(ev.start)));
    } else {
      lines.push("DTSTART:" + toICSDate(ev.start));
      lines.push("DTEND:" + toICSDate(ev.end));
    }
    lines.push("SUMMARY:" + icsEscape(ev.title));
    if (ev.loc) lines.push("LOCATION:" + icsEscape(ev.loc));
    if (ev.cat) lines.push("CATEGORIES:" + ev.cat);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function compactStamp(s: string) {
  return s.replace(/[^0-9T]/g, "");
}

function zoneOk(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Wall clock in an IANA zone → UTC. Unknown zones return null. */
function wallInZone(y: number, mo: number, d: number, h: number, mi: number, tz: string) {
  if (!zoneOk(tz)) return null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = (ms: number) => {
    const map: Record<string, string> = {};
    for (const p of fmt.formatToParts(new Date(ms))) {
      if (p.type !== "literal") map[p.type] = p.value;
    }
    return Date.UTC(+map.year!, +map.month! - 1, +map.day!, +map.hour!, +map.minute!);
  };
  let ms = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 3; i++) ms += Date.UTC(y, mo - 1, d, h, mi) - parts(ms);
  return new Date(ms).toISOString();
}

function parseDt(s: string, allDayHour = 9, tz = "") {
  const compact = compactStamp(s);
  if (/^\d{8}$/.test(compact)) {
    return fromManila(
      +compact.slice(0, 4),
      +compact.slice(4, 6),
      +compact.slice(6, 8),
      allDayHour,
    ).toISOString();
  }
  const y = +compact.slice(0, 4);
  const mo = +compact.slice(4, 6);
  const d = +compact.slice(6, 8);
  const h = +compact.slice(9, 11) || 0;
  const mi = +compact.slice(11, 13) || 0;
  if (s.endsWith("Z") || /Z$/i.test(s.trim())) return new Date(Date.UTC(y, mo - 1, d, h, mi)).toISOString();
  const zoned = tz ? wallInZone(y, mo, d, h, mi, tz) : null;
  if (zoned) return zoned;
  return fromManila(y, mo, d, h, mi).toISOString();
}

export function parseICS(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  for (const b of blocks) {
    const body = b.split(/END:VEVENT/i)[0];
    const line = (k: string) => {
      const re = new RegExp("^" + k + "(?:;[^:\\r\\n]*)?:(.*)$", "im");
      const m = body.match(re);
      return m ? m[0] : "";
    };
    const get = (k: string) => {
      const raw = line(k);
      const i = raw.indexOf(":");
      return i < 0 ? "" : icsUnescape(raw.slice(i + 1).trim());
    };
    const tzOf = (k: string) => {
      const m = line(k).match(/TZID=([^;:]+)/i);
      return m ? m[1]!.replace(/^"|"$/g, "") : "";
    };
    const rawS = get("DTSTART");
    if (!rawS) continue;
    const allDay = /^\d{8}$/.test(compactStamp(rawS));
    const start = parseDt(rawS, 9, tzOf("DTSTART"));
    const rawE = get("DTEND");
    const end = rawE
      ? parseDt(rawE, allDay ? 0 : 9, tzOf("DTEND") || tzOf("DTSTART"))
      : allDay
        ? parseDt(rawS, 23)
        : parseDt(rawS, 9, tzOf("DTSTART"));
    const catRaw = (get("CATEGORIES") || "other").toLowerCase().split(",")[0];
    const cat =
      catRaw === "work" ||
      catRaw === "personal" ||
      catRaw === "family" ||
      catRaw === "health"
        ? catRaw
        : "other";
    const rawUid = get("UID").trim();
    events.push({
      id: rawUid || uid(),
      title: get("SUMMARY") || "Imported event",
      start,
      end,
      cat,
      loc: get("LOCATION") || "",
      source: "ics",
      allDay: allDay || undefined,
    });
  }
  return events;
}

export function downloadICS(events: CalendarEvent[]) {
  const blob = new Blob([eventsToICS(events)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "atrium.ics";
  a.rel = "noopener";
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
