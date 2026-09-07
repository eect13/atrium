const SOURCE_TAIL = /\s+[-–—|]\s*(?:help\.)?x\.com\s*$/i;
const PROFILE_ON_X = /\(@[\w.]+\)\s+on X(?:\s+[-–—]\s*x\.com)?\s*$/i;
const EMOJI_BITS = /\p{Extended_Pictographic}|\p{Emoji_Component}|[\uFE0F\u200D]/gu;

export function cleanHeadline(title: string) {
  return title.replace(SOURCE_TAIL, "").replace(PROFILE_ON_X, "").replace(/\s+/g, " ").trim();
}

/** Drop emoji-only tweets, X chrome, and untitled rows. Keep real headlines. */
export function keepStory(story: { title: string; link?: string; src?: string; category?: string }) {
  const raw = story.title.trim();
  if (!raw || /^untitled$/i.test(raw)) return false;
  const link = story.link ?? "";
  if (/help\.x\.com/i.test(raw) || /help\.x\.com/i.test(link)) return false;
  if (PROFILE_ON_X.test(raw)) return false;

  const title = cleanHeadline(raw);
  if (!title || /^untitled$/i.test(title) || /^x\.com$/i.test(title)) return false;

  const noEmoji = title.replace(EMOJI_BITS, " ");
  const letters = noEmoji.match(/\p{L}/gu) ?? [];
  const words = noEmoji.match(/\p{L}[\p{L}'’-]{1,}/gu) ?? [];
  if (letters.length < 8 || words.length < 2) return false;

  const fromX =
    story.category === "X" ||
    story.src === "X" ||
    /(?:^|[./])x\.com(?:\/|$)/i.test(link) ||
    SOURCE_TAIL.test(raw);

  if (fromX) {
    if (letters.length < 28 || words.length < 6) return false;
    if (title.length < 40 && !/[.!?…]/.test(title)) return false;
  }
  return true;
}

/** Round-robin by source so one feed cannot bury the briefing. */
export function mixStories<T extends { src?: string; category?: string; date?: string }>(items: T[], limit = 40): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = it.src || it.category || "_";
    const arr = groups.get(k);
    if (arr) arr.push(it);
    else groups.set(k, [it]);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => +new Date(b.date || 0) - +new Date(a.date || 0));
  }
  const queues = [...groups.values()];
  const out: T[] = [];
  while (out.length < limit) {
    let added = false;
    for (const q of queues) {
      const next = q.shift();
      if (!next) continue;
      out.push(next);
      added = true;
      if (out.length >= limit) break;
    }
    if (!added) break;
  }
  return out;
}

