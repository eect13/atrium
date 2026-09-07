import type { Account, AccountKind, BookCcy } from "./types.ts";
import { BOOK_CCY } from "./types.ts";
import { ccySymbol, inferCcy, normalizeCcy } from "./format.ts";

export type IssuerId = string;

export type IssuerRow = {
  id: IssuerId;
  test: RegExp;
  name: string;
  label: string;
  mark: string;
  aliases: string[];
  kind: AccountKind;
  bg: string;
  digital?: boolean;
  card?: boolean;
};

const INK = "#f3efe6";

export const ISSUER_CATALOG: IssuerRow[] = [
  { id: "gcash", test: /\bgcash\b|\bg-?credit\b|\bgsave\b/, name: "GCash", label: "GCASH", mark: "G", aliases: ["gcash", "g-credit", "gsave"], kind: "ewallet", bg: "#0b3d91", digital: true },
  { id: "maya", test: /\bmaya\b|\bpaymaya\b/, name: "Maya", label: "MAYA", mark: "M", aliases: ["maya", "paymaya", "maya bank"], kind: "ewallet", bg: "#0f4d38", digital: true },
  { id: "grab", test: /\bgrab(?:pay)?\b/, name: "Grab", label: "GRAB", mark: "G", aliases: ["grab", "grabpay"], kind: "ewallet", bg: "#1b3d22", digital: true },
  { id: "zed", test: /\bzed\b/, name: "Zed", label: "ZED", mark: "Z", aliases: ["zed", "zed card"], kind: "bank", bg: "#141414", card: true },
  { id: "tonik", test: /\btonik\b/, name: "Tonik", label: "TONIK", mark: "T", aliases: ["tonik"], kind: "ewallet", bg: "#4a1c32", digital: true },
  { id: "gotyme", test: /\bgo\s*tyme\b|\bgotyme\b/, name: "GoTyme", label: "GOTYME", mark: "GT", aliases: ["gotyme", "go tyme"], kind: "ewallet", bg: "#4a3814", digital: true },
  { id: "cimb", test: /\bcimb\b/, name: "CIMB", label: "CIMB", mark: "C", aliases: ["cimb"], kind: "ewallet", bg: "#7a1c1c", digital: true },
  { id: "mari", test: /\bmari\s*bank\b|\bmaribank\b|\bsea\s*bank\b|\bseabank\b/, name: "MariBank", label: "MARI", mark: "M", aliases: ["maribank", "mari", "seabank", "sea bank"], kind: "ewallet", bg: "#12383a", digital: true },
  { id: "komo", test: /\bkomo\b/, name: "Komo", label: "KOMO", mark: "K", aliases: ["komo"], kind: "ewallet", bg: "#1a2740", digital: true },
  { id: "own", test: /\bown\s*bank\b|\bownbank\b/, name: "Own Bank", label: "OWN", mark: "O", aliases: ["ownbank", "own bank"], kind: "ewallet", bg: "#14315c", digital: true },
  { id: "uno", test: /\buno\s*bank\b|\bunobank\b/, name: "UNO", label: "UNO", mark: "U", aliases: ["uno", "unobank", "uno digital"], kind: "ewallet", bg: "#0a2a6e", digital: true },
  { id: "netbank", test: /\bnetbank\b|\bnet\s*bank\b/, name: "Netbank", label: "NETBANK", mark: "N", aliases: ["netbank"], kind: "ewallet", bg: "#16233d", digital: true },
  { id: "ofbank", test: /\bofbank\b|\bof\s*bank\b|\boverseas filipino bank\b/, name: "OFBank", label: "OFB", mark: "OF", aliases: ["ofbank", "of bank", "overseas filipino"], kind: "ewallet", bg: "#1b3d2a", digital: true },
  { id: "coins", test: /\bcoins(?:\.ph)?\b/, name: "Coins.ph", label: "COINS", mark: "C", aliases: ["coins", "coins.ph"], kind: "ewallet", bg: "#1b3d22", digital: true },
  { id: "shopee", test: /\bshopee(?:pay)?\b/, name: "ShopeePay", label: "SHOPEE", mark: "S", aliases: ["shopee", "shopeepay"], kind: "ewallet", bg: "#7a2a12", digital: true },
  { id: "palawan", test: /\bpalawan(?:pay)?\b/, name: "PalawanPay", label: "PALAWAN", mark: "P", aliases: ["palawan", "palawanpay"], kind: "ewallet", bg: "#5c1a1a", digital: true },
  { id: "paypal", test: /\bpaypal\b/, name: "PayPal", label: "PAYPAL", mark: "P", aliases: ["paypal"], kind: "ewallet", bg: "#12324a", digital: true },
  { id: "wise", test: /\bwise\b|\btransferwise\b/, name: "Wise", label: "WISE", mark: "W", aliases: ["wise", "transferwise"], kind: "ewallet", bg: "#1a3030", digital: true },
  { id: "revolut", test: /\brevolut\b/, name: "Revolut", label: "REV", mark: "R", aliases: ["revolut"], kind: "ewallet", bg: "#141414", digital: true },
  { id: "alipay", test: /\balipay\b/, name: "Alipay", label: "ALI", mark: "A", aliases: ["alipay"], kind: "ewallet", bg: "#0a3a6b", digital: true },
  { id: "diskartech", test: /\bdiskartech\b/, name: "DiskarTech", label: "DT", mark: "DT", aliases: ["diskartech"], kind: "ewallet", bg: "#12324a", digital: true },
  { id: "bdo", test: /\bbdo\b/, name: "BDO", label: "BDO", mark: "BDO", aliases: ["bdo", "banco de oro", "bdo unibank", "bdo network"], kind: "bank", bg: "#0a2a6e" },
  { id: "bpi", test: /\bbpi\b|\bbanko\b/, name: "BPI", label: "BPI", mark: "BPI", aliases: ["bpi", "bank of the philippine islands", "banko", "robinsons bank"], kind: "bank", bg: "#7a1c1c" },
  { id: "metro", test: /\bmetro(?:bank)?\b/, name: "Metrobank", label: "METRO", mark: "MB", aliases: ["metro", "metrobank"], kind: "bank", bg: "#0a2e5c" },
  { id: "psbank", test: /\bpsbank\b|\bphilippine savings\b/, name: "PSBank", label: "PSB", mark: "PS", aliases: ["psbank", "philippine savings"], kind: "bank", bg: "#1c2260" },
  { id: "union", test: /\bunion\s*bank\b|\bubp\b|\buniondigital\b/, name: "UnionBank", label: "UB", mark: "UB", aliases: ["unionbank", "union bank", "ubp", "uniondigital"], kind: "bank", bg: "#6b2d12" },
  { id: "rcbc", test: /\brcbc\b/, name: "RCBC", label: "RCBC", mark: "RC", aliases: ["rcbc"], kind: "bank", bg: "#0d3d3d" },
  { id: "pnb", test: /\bpnb\b|\bphilippine national\b|\ballied bank\b/, name: "PNB", label: "PNB", mark: "PNB", aliases: ["pnb", "philippine national", "allied bank"], kind: "bank", bg: "#1a2258" },
  { id: "land", test: /\bland\s*bank\b|\blbp\b|\bucpb\b/, name: "Landbank", label: "LBP", mark: "LB", aliases: ["landbank", "land bank", "lbp", "ucpb"], kind: "bank", bg: "#1b3d2a" },
  { id: "dbp", test: /\bdbp\b|\bdevelopment bank\b/, name: "DBP", label: "DBP", mark: "DBP", aliases: ["dbp", "development bank"], kind: "bank", bg: "#0c2e6b" },
  { id: "china", test: /\bchina\s*bank\b|\bchinabank\b/, name: "Chinabank", label: "CBC", mark: "CB", aliases: ["chinabank", "china bank", "cbc", "china bank savings"], kind: "bank", bg: "#5c1a1a" },
  { id: "eastwest", test: /\beast[\s-]?west\b|\bewb\b/, name: "EastWest", label: "EW", mark: "EW", aliases: ["eastwest", "east west", "ewb"], kind: "bank", bg: "#1f2a44" },
  { id: "security", test: /\bsecurity\s*bank\b|\bsecb\b/, name: "Security Bank", label: "SECB", mark: "SB", aliases: ["security bank", "secb"], kind: "bank", bg: "#6b1518" },
  { id: "aub", test: /\baub\b|\basia united\b/, name: "AUB", label: "AUB", mark: "AUB", aliases: ["aub", "asia united"], kind: "bank", bg: "#1a4a32" },
  { id: "bocomm", test: /\bbank of commerce\b|\bbocom\b|\bbankcom\b/, name: "BankCom", label: "BOC", mark: "BC", aliases: ["bank of commerce", "bankcom", "bocom"], kind: "bank", bg: "#12324a" },
  { id: "pbcom", test: /\bpbcom\b|\bphilippine bank of communications\b/, name: "PBCom", label: "PBCOM", mark: "PB", aliases: ["pbcom", "philippine bank of communications"], kind: "bank", bg: "#1a3050" },
  { id: "philtrust", test: /\bphiltrust\b|\bphilippine trust\b/, name: "Philtrust", label: "PTC", mark: "PT", aliases: ["philtrust", "philippine trust"], kind: "bank", bg: "#1a2740" },
  { id: "veterans", test: /\bveterans\b|\bpvb\b/, name: "Veterans", label: "PVB", mark: "PV", aliases: ["veterans", "pvb", "philippine veterans"], kind: "bank", bg: "#14315c" },
  { id: "pbb", test: /\bpbb\b|\bphilippine business bank\b/, name: "PBB", label: "PBB", mark: "PBB", aliases: ["pbb", "philippine business bank"], kind: "bank", bg: "#5c1a1a" },
  { id: "sterling", test: /\bsterling\b/, name: "Sterling", label: "SBA", mark: "ST", aliases: ["sterling", "sterling bank"], kind: "bank", bg: "#2c2418" },
  { id: "maybank", test: /\bmaybank\b/, name: "Maybank", label: "MAY", mark: "MY", aliases: ["maybank"], kind: "bank", bg: "#4a3814" },
  { id: "hsbc", test: /\bhsbc\b/, name: "HSBC", label: "HSBC", mark: "HS", aliases: ["hsbc"], kind: "bank", bg: "#6b1218" },
  { id: "citi", test: /\bciti(?:bank)?\b/, name: "Citi", label: "CITI", mark: "C", aliases: ["citi", "citibank"], kind: "bank", bg: "#0a2a4a" },
  { id: "scb", test: /\bstandard chartered\b|\bscb\b/, name: "StanChart", label: "SC", mark: "SC", aliases: ["standard chartered", "stanchart", "scb"], kind: "bank", bg: "#0f3d24" },
  { id: "ctbc", test: /\bctbc\b|\bchinatrust\b/, name: "CTBC", label: "CTBC", mark: "CT", aliases: ["ctbc", "chinatrust"], kind: "bank", bg: "#5c1a1a" },
  { id: "anz", test: /\banz\b/, name: "ANZ", label: "ANZ", mark: "ANZ", aliases: ["anz"], kind: "bank", bg: "#0a2048" },
  { id: "boc", test: /\bbank of china\b|\bboc\b/, name: "Bank of China", label: "BOC", mark: "中", aliases: ["bank of china", "boc"], kind: "bank", bg: "#6b1518" },
  { id: "icbc", test: /\bicbc\b/, name: "ICBC", label: "ICBC", mark: "工", aliases: ["icbc"], kind: "bank", bg: "#6b1518" },
  { id: "mufg", test: /\bmufg\b/, name: "MUFG", label: "MUFG", mark: "MU", aliases: ["mufg"], kind: "bank", bg: "#6b1518" },
  { id: "mizuho", test: /\bmizuho\b/, name: "Mizuho", label: "MZ", mark: "MZ", aliases: ["mizuho"], kind: "bank", bg: "#12324a" },
  { id: "smbc", test: /\bsmbc\b|\bsumitomo\b/, name: "SMBC", label: "SMBC", mark: "SM", aliases: ["smbc", "sumitomo"], kind: "bank", bg: "#1b3d2a" },
  { id: "ing", test: /\bing\b/, name: "ING", label: "ING", mark: "ING", aliases: ["ing"], kind: "bank", bg: "#6b2d12" },
  { id: "jpm", test: /\bjpmorgan\b|\bjpm\b|\bchase\b/, name: "Chase", label: "JPM", mark: "JP", aliases: ["jpmorgan", "jpm", "chase"], kind: "bank", bg: "#0a2038" },
  { id: "deutsche", test: /\bdeutsche\b/, name: "Deutsche", label: "DB", mark: "DB", aliases: ["deutsche", "deutsche bank"], kind: "bank", bg: "#0a1e3c" },
  { id: "hana", test: /\bhana\b|\bkeb\b/, name: "Hana", label: "KEB", mark: "H", aliases: ["hana", "keb hana", "keb"], kind: "bank", bg: "#0f3d38" },
  { id: "shinhan", test: /\bshinhan\b/, name: "Shinhan", label: "SH", mark: "SH", aliases: ["shinhan"], kind: "bank", bg: "#0a2a6e" },
  { id: "ibk", test: /\bibk\b|\bindustrial bank of korea\b/, name: "IBK", label: "IBK", mark: "IBK", aliases: ["ibk", "industrial bank of korea"], kind: "bank", bg: "#0a2a6e" },
  { id: "bbl", test: /\bbangkok bank\b/, name: "Bangkok Bank", label: "BBL", mark: "BB", aliases: ["bangkok bank"], kind: "bank", bg: "#0a2a6e" },
  { id: "uob", test: /\buob\b|\bunited overseas\b/, name: "UOB", label: "UOB", mark: "UOB", aliases: ["uob", "united overseas"], kind: "bank", bg: "#12324a" },
  { id: "bofa", test: /\bbank of america\b|\bbofa\b/, name: "BofA", label: "BOA", mark: "BA", aliases: ["bank of america", "bofa"], kind: "bank", bg: "#0a2a4a" },
  { id: "amex", test: /\bamex\b|\bamerican express\b/, name: "Amex", label: "AMEX", mark: "AX", aliases: ["amex", "american express"], kind: "bank", bg: "#0a2a4a", card: true },
  { id: "wealth", test: /\bwealth (?:dev|bank)\b|\bwealthbank\b/, name: "Wealth", label: "WDB", mark: "W", aliases: ["wealth", "wealthbank"], kind: "bank", bg: "#1a2740" },
  { id: "queenbank", test: /\bqueenbank\b|\bqueen city\b/, name: "Queenbank", label: "QB", mark: "Q", aliases: ["queenbank", "queen city"], kind: "bank", bg: "#1a2740" },
  { id: "malayan", test: /\bmalayan\b/, name: "Malayan", label: "MB", mark: "MY", aliases: ["malayan"], kind: "bank", bg: "#5c1a1a" },
  { id: "equicom", test: /\bequicom\b/, name: "Equicom", label: "EQ", mark: "EQ", aliases: ["equicom"], kind: "bank", bg: "#14315c" },
  { id: "allbank", test: /\ballbank\b/, name: "AllBank", label: "AB", mark: "AB", aliases: ["allbank"], kind: "bank", bg: "#1a3050" },
  { id: "citystate", test: /\bcitystate\b/, name: "Citystate", label: "CSB", mark: "CS", aliases: ["citystate"], kind: "bank", bg: "#16233d" },
  { id: "producers", test: /\bproducers\b/, name: "Producers", label: "PSB", mark: "PR", aliases: ["producers"], kind: "bank", bg: "#1b3d2a" },
  { id: "amanah", test: /\bamanah\b|\bal-?amanah\b/, name: "Amanah", label: "AAIIBP", mark: "A", aliases: ["amanah", "al-amanah"], kind: "bank", bg: "#1b3d2a" },
];

const CCY_FACE = Object.fromEntries(BOOK_CCY.map((c) => [c, c.toLowerCase()])) as Record<BookCcy, IssuerId>;

export type IssuerHit = {
  id: IssuerId;
  label: string;
  ccy: BookCcy;
  symbol: string;
  face: string;
  mark: string;
  digital: boolean;
  card: boolean;
  bg?: string;
  ink?: string;
};

const POPULAR: Record<AccountKind, IssuerId[]> = {
  bank: ["bdo", "bpi", "metro", "land", "pnb", "union", "rcbc", "aub", "dbp", "zed", "security", "china"],
  ewallet: ["gcash", "maya", "grab", "mari", "tonik", "gotyme", "palawan", "shopee", "paypal", "wise"],
  card: ["zed", "amex"],
  cash: [],
};

function hashTone(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `tone-${h % 6}`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return name.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase() || "•";
}

function haystack(row: IssuerRow) {
  return [row.name, row.label, ...row.aliases].join(" ").toLowerCase();
}

function scoreIssuer(row: IssuerRow, q: string) {
  const label = row.label.toLowerCase();
  const name = row.name.toLowerCase();
  if (name === q || label === q || row.aliases.includes(q)) return 100;
  if (name.startsWith(q) || label.startsWith(q)) return 80;
  if (row.aliases.some((a) => a.startsWith(q))) return 70;
  if (row.test.test(q)) return 60;
  if (haystack(row).includes(q)) return 40;
  return 0;
}

export function searchIssuers(query: string, kind: AccountKind = "bank", limit = 12): IssuerRow[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    const ids = POPULAR[kind];
    return ids.map((id) => ISSUER_CATALOG.find((r) => r.id === id)).filter((r): r is IssuerRow => Boolean(r));
  }
  return ISSUER_CATALOG.map((row) => ({ row, s: scoreIssuer(row, q) }))
    .filter((x) => x.s > 0)
    .toSorted((a, b) => b.s - a.s || a.row.name.localeCompare(b.row.name))
    .slice(0, limit)
    .map((x) => x.row);
}

export function matchIssuer(query: string): IssuerRow | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return ISSUER_CATALOG.find((row) => row.test.test(q) || scoreIssuer(row, q) >= 80);
}

export function inferIssuer(
  account: Pick<Account, "id" | "name" | "kind" | "currency"> | {
    id?: string;
    name?: string;
    kind?: AccountKind;
    currency?: BookCcy;
  },
): IssuerHit {
  const ccy = normalizeCcy(account.currency, inferCcy(`${account.id ?? ""} ${account.name ?? ""}`));
  const hay = `${account.id ?? ""} ${account.name ?? ""}`.toLowerCase();
  const symbol = ccySymbol(ccy);
  const name = account.name ?? "";
  if (account.kind === "cash") {
    return {
      id: CCY_FACE[ccy],
      label: ccy,
      ccy,
      symbol,
      face: CCY_FACE[ccy],
      mark: symbol,
      digital: false,
      card: false,
    };
  }
  for (const row of ISSUER_CATALOG) {
    if (row.test.test(hay)) {
      return {
        id: row.id,
        label: row.label,
        ccy,
        symbol,
        face: row.id,
        mark: row.mark,
        digital: Boolean(row.digital || account.kind === "ewallet"),
        card: Boolean(row.card),
        bg: row.bg,
        ink: INK,
      };
    }
  }
  const digital = account.kind === "ewallet";
  return {
    id: CCY_FACE[ccy],
    label: digital ? name : ccy,
    ccy,
    symbol,
    face: name.trim() ? hashTone(hay || "bank") : "blank",
    mark: initials(name),
    digital,
    card: account.kind === "bank",
  };
}
