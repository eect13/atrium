/**
 * Card 195 (Critic 193 G1): loose topic matching — a light suffix stemmer + the alias table.
 * Pure helpers; place names live only in topic-aliases.ts.
 */
import { TOPIC_ALIASES, type AliasGroup } from "./topic-aliases.ts";

/** Longest first. Only stripped when ≥4 letters remain, so "news", "gas", "bus" stay whole. */
const SUFFIXES = ["ically", "ations", "ation", "ities", "ical", "ics", "ies", "ied", "ing", "ity", "ial", "ic", "al", "ed", "ly", "s", "y"];

/** economy / economic / economies / economics / economical → "econom"; Philippines → "philippine". */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/['’]s$/, "");
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  return w;
}

/** Words of a text, case kept (codes are case-sensitive). */
export function tokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** The alias group a typed word belongs to (any case), or null. */
export function aliasGroup(word: string, table: readonly AliasGroup[] = TOPIC_ALIASES): AliasGroup | null {
  const k = word.toLowerCase();
  return table.find((g) => g.codes.some((c) => c.toLowerCase() === k) || g.names.some((n) => n.toLowerCase() === k)) ?? null;
}

type Want = { kind: "group"; group: AliasGroup } | { kind: "word"; word: string };

/** Find one wanted word in the token list; returns the matched span (lower case) or null. */
function find(toks: readonly string[], low: readonly string[], want: Want): string | null {
  if (want.kind === "word") {
    const w = want.word.toLowerCase();
    const s = w.length >= 4 ? stem(w) : null;
    const i = low.findIndex((t) => t === w || (s !== null && t.length >= 4 && stem(t) === s));
    return i < 0 ? null : low[i]!;
  }
  for (const code of want.group.codes) {
    if (toks.includes(code)) return code.toLowerCase();
  }
  for (const name of want.group.names) {
    const parts = name.toLowerCase().split(" ");
    for (let i = 0; i + parts.length <= low.length; i++) {
      if (parts.every((p, j) => low[i + j] === p || (p.length >= 4 && stem(low[i + j]!) === stem(p)))) return low.slice(i, i + parts.length).join(" ");
    }
  }
  return null;
}

/**
 * Every word of `term` found in `text` by stem or alias (multi-word aliases like "United States"
 * count as one word of the term). Returns the words actually found, e.g. "philippine economic",
 * or null when any word is missing.
 */
export function looseHit(text: string, term: string, table: readonly AliasGroup[] = TOPIC_ALIASES): string | null {
  const typed = tokens(term);
  if (!typed.length) return null;
  const wants: Want[] = [];
  for (let i = 0; i < typed.length; i++) {
    // Prefer the longest multi-word alias name starting here ("united states").
    let took = false;
    for (let n = Math.min(3, typed.length - i); n >= 2; n--) {
      const g = aliasGroup(typed.slice(i, i + n).join(" "), table);
      if (g) {
        wants.push({ kind: "group", group: g });
        i += n - 1;
        took = true;
        break;
      }
    }
    if (took) continue;
    const g = aliasGroup(typed[i]!, table);
    wants.push(g ? { kind: "group", group: g } : { kind: "word", word: typed[i]! });
  }
  const toks = tokens(text);
  const low = toks.map((t) => t.toLowerCase());
  const found: string[] = [];
  for (const w of wants) {
    const hit = find(toks, low, w);
    if (!hit) return null;
    found.push(hit);
  }
  return found.join(" ");
}
