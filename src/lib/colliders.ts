/** Watcher name collisions — dual listings, group sleeves, and short-ticker traps.
 *  Not a corporate-action feed. */

import type { WatchItem } from "./types.ts";

export type ColliderKind = "dual" | "group" | "alias" | "foreign";

export type Collider = {
  id: string;
  kind: ColliderKind;
  symbols: string[];
  note: string;
};

export const STOCK_COLLIDERS: Collider[] = [
  {
    id: "sm-smc",
    kind: "alias",
    symbols: ["SM", "SMC"],
    note: "SM is SM Investments. SMC is San Miguel — not the same group.",
  },
  {
    id: "sm-group",
    kind: "group",
    symbols: ["SM", "SMPH"],
    note: "SM and SMPH are the SM group. Two listings, one house.",
  },
  {
    id: "ayala",
    kind: "group",
    symbols: ["AC", "ALI", "AREIT", "ACEN", "GLO"],
    note: "Ayala sleeve. AC is the holdco, not ACEN.",
  },
  {
    id: "jg-group",
    kind: "group",
    symbols: ["JGS", "URC", "RCR"],
    note: "JG Summit sleeve. JGS is the holdco; URC and RCR sit under it.",
  },
  {
    id: "gt-group",
    kind: "group",
    symbols: ["GTCAP", "MBT"],
    note: "GT Capital and Metrobank are the Ty group. Two listings, one house.",
  },
  {
    id: "bdo-foreign",
    kind: "foreign",
    symbols: ["BDO"],
    note: "BDO is Banco de Oro / BDO Unibank on this desk, not BDO Luxembourg or biomass.",
  },
  {
    id: "ict-foreign",
    kind: "foreign",
    symbols: ["ICT"],
    note: "ICT is ICTSI, not the ICT ministry.",
  },
  {
    id: "bpi-foreign",
    kind: "foreign",
    symbols: ["BPI"],
    note: "BPI is Bank of the Philippine Islands, not BPI France.",
  },
  {
    id: "ac-foreign",
    kind: "foreign",
    symbols: ["AC"],
    note: "AC is Ayala Corporation on this desk, not Air Canada or ACEN.",
  },
  {
    id: "plus-foreign",
    kind: "foreign",
    symbols: ["PLUS"],
    note: "PLUS is DigiPlus Interactive, not Plus500.",
  },
  {
    id: "tencent",
    kind: "dual",
    symbols: ["0700.HK", "TCEHY"],
    note: "Tencent: 0700.HK is the HK listing; TCEHY is the ADR.",
  },
  {
    id: "alibaba",
    kind: "dual",
    symbols: ["9988.HK", "BABA"],
    note: "Alibaba: 9988.HK is the HK listing; BABA is the US ADR.",
  },
  {
    id: "hsbc",
    kind: "dual",
    symbols: ["0005.HK", "HSBA.L", "HSBC"],
    note: "HSBC lists in Hong Kong and London. Same house, two tapes.",
  },
  {
    id: "toyota",
    kind: "dual",
    symbols: ["7203.T", "TM"],
    note: "Toyota: 7203.T is Tokyo; TM is the ADR.",
  },
  {
    id: "pldt-adr",
    kind: "dual",
    symbols: ["TEL", "PHI"],
    note: "PLDT: TEL is the PSE listing; PHI is the US ADR.",
  },
];

export function colliderKey(raw?: string | null) {
  return (raw ?? "").replace(/^\^/, "").replace(/\.PS$/i, "").trim().toUpperCase();
}

function tickerToken(raw?: string | null) {
  const t = (raw ?? "").trim().split(/\s+/)[0] ?? "";
  if (!/^[A-Z][A-Z0-9.=^-]{0,11}$/i.test(t)) return "";
  return colliderKey(t);
}

function keysOf(item: { symbol?: string; label?: string; id?: string; name?: string }) {
  return [
    ...new Set(
      [colliderKey(item.symbol), colliderKey(item.label), colliderKey(item.id), tickerToken(item.name)].filter(Boolean),
    ),
  ];
}

export function matchesCollider(item: { symbol?: string; label?: string; id?: string; name?: string }, c: Collider) {
  const keys = keysOf(item);
  return c.symbols.some((s) => keys.includes(colliderKey(s)));
}

export function collidersFor(item: { symbol?: string; label?: string; id?: string; name?: string }): Collider[] {
  return STOCK_COLLIDERS.filter((c) => matchesCollider(item, c));
}

function watchKeys(watch: WatchItem[]) {
  const keys = new Set<string>();
  for (const w of watch) for (const k of keysOf(w)) keys.add(k);
  return keys;
}

/** Notes that apply to this watcher: foreign traps for a held name; dual/group/alias only when two+ listings sit on the desk. */
export function watchColliderNotes(watch: WatchItem[]): string[] {
  const keys = watchKeys(watch);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of STOCK_COLLIDERS) {
    const hit = c.symbols.filter((s) => keys.has(colliderKey(s)));
    if (!hit.length) continue;
    if (c.kind !== "foreign" && hit.length < 2) continue;
    if (seen.has(c.note)) continue;
    seen.add(c.note);
    out.push(c.note);
  }
  return out;
}

export function addColliderNote(watch: WatchItem[], next: { symbol?: string; label?: string; id?: string; name?: string }): string | undefined {
  const keys = watchKeys(watch);
  for (const c of collidersFor(next)) {
    if (c.kind === "foreign") return c.note;
    const others = c.symbols.filter((s) => keys.has(colliderKey(s)) && !keysOf(next).includes(colliderKey(s)));
    if (others.length) return c.note;
  }
  return undefined;
}
