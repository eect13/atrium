import type { CalendarEvent } from "./types";
import { fromManila, isAllDayEvent, manilaParts, uid } from "./format";

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

function parseDt(s: string, allDayHour = 9) {
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
  if (s.endsWith("Z")) return new Date(Date.UTC(y, mo - 1, d, h, mi)).toISOString();
  return fromManila(y, mo, d, h, mi).toISOString();
}

export function parseICS(text: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  for (const b of blocks) {
    const body = b.split(/END:VEVENT/i)[0];
    const get = (k: string) => {
      const re = new RegExp("^" + k + "(?:;[^:]*)?:(.*)$", "im");
      const m = body.match(re);
      return m ? icsUnescape(m[1].trim()) : "";
    };
    const rawS = get("DTSTART");
    if (!rawS) continue;
    const allDay = /^\d{8}$/.test(compactStamp(rawS));
    const start = parseDt(rawS, 9);
    const rawE = get("DTEND");
    const end = allDay ? parseDt(rawS, 10) : rawE ? parseDt(rawE) : parseDt(rawS);
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
