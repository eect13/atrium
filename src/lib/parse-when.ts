import { fromManila, manilaParts } from "./format.ts";

const DAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function applyClock(hour: number, minute: number, ap?: string) {
  let h = hour;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return { hour: Math.min(23, Math.max(0, h)), minute: Math.min(59, Math.max(0, minute)) };
}

export function parseWhen(text: string, now = new Date()) {
  const p = manilaParts(now);
  let title = text.trim();
  const year = p.year;
  const month = p.month;
  let day = p.day;
  let hour = Math.min(23, p.hour + 1);
  let minute = 0;
  const lower = title.toLowerCase();
  const wantsNext = /\bnext\b/.test(lower);

  if (/\btomorrow\b/.test(lower)) {
    day = p.day + 1;
    hour = 9;
    minute = 0;
    title = title.replace(/tomorrow/gi, "").trim();
  } else if (/\btoday\b/.test(lower)) {
    hour = Math.min(23, p.hour + 1);
    minute = 0;
    title = title.replace(/today/gi, "").trim();
  }

  for (const [name, idx] of Object.entries(DAYS)) {
    if (!new RegExp(`\\b${name}\\b`, "i").test(lower)) continue;
    let add = (idx - p.weekdayIndex + 7) % 7;
    if (add === 0 && wantsNext) add = 7;
    day = p.day + add;
    hour = 9;
    minute = 0;
    title = title.replace(new RegExp(`\\b${name}\\b`, "ig"), "").trim();
  }

  const colon = title.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
  const ampm = colon ? null : title.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (colon) {
    const clock = applyClock(Number(colon[1]), Number(colon[2]), colon[3]?.toLowerCase());
    hour = clock.hour;
    minute = clock.minute;
    title = title.replace(colon[0], "").trim();
  } else if (ampm) {
    const clock = applyClock(Number(ampm[1]), 0, ampm[2].toLowerCase());
    hour = clock.hour;
    minute = clock.minute;
    title = title.replace(ampm[0], "").trim();
  }

  title = title
    .replace(/\bnext\b/gi, "")
    .replace(/(?:^|\s)(at|on)(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–—]\s*/, "")
    .trim();
  if (!title) title = "New event";

  const start = fromManila(year, month, day, hour, minute);
  const end = fromManila(year, month, day, hour + 1, minute);
  return { title, start: start.toISOString(), end: end.toISOString() };
}
