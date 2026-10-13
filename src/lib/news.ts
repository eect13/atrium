import { parseRss } from "./feeds.ts";
import { cleanHeadline } from "./headline.ts";
import { manilaParts } from "./format.ts";
import { BLUECHIPS, DIVIDENDS, PSEI_NAMES, REITS } from "./market-board.ts";
import { deskMarket } from "./desk-market.ts";
import { PSEI_WEIGHTS } from "./psei-weight.ts";
import { isPseiItem } from "./yahoo.ts";

export type NewsWindow = "1d" | "7d" | "30d" | "1y";

const GENERIC_NAME = /^(inc|corp|corporation|holdings?|plc|ltd|limited|group|the|and|of|ph|co|company|philippine|philippines|investments?|services?|bank|islands?|interactive|foods?|mining|power|water|food|equity|ventures?|capital|commercial|container|terminal|electric|metropolitan|trust|international|prime|index)$/i;

/** PH market / Unibank context — used when the ticker is a short collision (BDO, SM, ICT). */
const PH_MARK =
  /philippines?|philippine|\bpse\b|manila|peso|\bbsp\b|unibank|bilyonaryo|inquirer|philstar|businessworld|bworld|gmanews|gma news|abs-cbn|rappler|politiko|abante|manila bulletin|manila standard|businessmirror|philippine news agency|pna\.gov|pse\.com|edge\.pse|insiderph|insider ph|manilatimes|manila times|tribune\.net|onenews|dealroom|fintechnews|mb\.com/i;

type IssuerNews = { names: string[]; minus: string[]; reject: RegExp };

const ISSUER_NEWS: Record<string, IssuerNews> = {
  BDO: {
    names: ["BDO Unibank", "Banco de Oro"],
    minus: ["Luxembourg", "BDO Zone", "biomass", "auditor"],
    reject: /bdo zone|biomass|woody|luxembourg|bdo llp|appointed bdo|bdo as (?:the )?auditor|bowie county|vegreville|noble county|accountancy today|pembroke vct|bdo luxembourg|renewableenergymagazine|canadianbiomass|railwayage|bdo exec average|tops bdo exec/i,
  },
  BPI: {
    names: ["Bank of the Philippine Islands", "BPI Unibank"],
    minus: ["France"],
    reject: /banque|\bbpi sa\b|bpi france|bpi group france/i,
  },
  SM: {
    names: ["SM Investments", "SMIC"],
    minus: ["SM Entertainment"],
    reject: /sm entertainment|sm town|hybe|k-pop|sm entertainment/i,
  },
  SMPH: { names: ["SM Prime", "SM Prime Holdings"], minus: [], reject: /$^/ },
  ICT: {
    names: ["ICTSI", "International Container Terminal"],
    minus: ["ICT sector"],
    reject: /information and communications|ict ministry|ict sector|ict department|converge ict|\bon ict\b|partnership on ict|ict, defense/i,
  },
  AC: {
    names: ["Ayala Corp", "Ayala Corporation"],
    minus: ["Air Canada"],
    reject: /air canada|\bac\/dc\b|\bacer\b/i,
  },
  ALI: {
    names: ["Ayala Land"],
    minus: ["Alibaba"],
    reject: /alibaba|ali express|aliexpress/i,
  },
  MER: {
    names: ["Meralco", "Manila Electric"],
    minus: ["Merrill"],
    reject: /merrill lynch|\bmercedes\b|\bmerck\b/i,
  },
  MBT: { names: ["Metrobank", "Metropolitan Bank"], minus: [], reject: /$^/ },
  TEL: {
    names: ["PLDT", "Philippine Long Distance"],
    minus: [],
    reject: /tel aviv|telecom italia/i,
  },
  CBC: {
    names: ["China Banking", "China Bank"],
    minus: ["CBC News"],
    reject: /canadian broadcasting|\bcbc radio\b|\bcbc news\b|\bcbc\.ca\b/i,
  },
  JFC: { names: ["Jollibee"], minus: [], reject: /$^/ },
  JGS: { names: ["JG Summit"], minus: [], reject: /$^/ },
  RCR: { names: ["RL Commercial REIT"], minus: [], reject: /$^/ },
  EMI: {
    names: ["Emperador"],
    minus: ["EMI Records"],
    reject: /\bemi records\b|\bemi music\b|\bemi group\b/i,
  },
  AREIT: { names: ["AREIT"], minus: [], reject: /$^/ },
  URC: { names: ["Universal Robina"], minus: [], reject: /$^/ },
  GLO: {
    names: ["Globe Telecom"],
    minus: [],
    reject: /globacom|\bglo nigeria\b/i,
  },
  MONDE: { names: ["Monde Nissin"], minus: [], reject: /$^/ },
  LTG: { names: ["LT Group"], minus: [], reject: /$^/ },
  GTCAP: { names: ["GT Capital"], minus: [], reject: /$^/ },
  PGOLD: { names: ["Puregold"], minus: [], reject: /$^/ },
  CNPF: { names: ["Century Pacific"], minus: [], reject: /$^/ },
  MYNLD: { names: ["Maynilad"], minus: [], reject: /$^/ },
  SMC: {
    names: ["San Miguel"],
    minus: ["Sumitomo"],
    reject: /sumitomo|\bsmbc\b/i,
  },
  DMC: { names: ["DMCI"], minus: [], reject: /$^/ },
  ACEN: { names: ["ACEN"], minus: [], reject: /$^/ },
  PLUS: {
    names: ["DigiPlus", "DigiPlus Interactive"],
    minus: ["Google Plus"],
    reject: /plus size|google plus|\bgoogle\+\b/i,
  },
  SCC: { names: ["Semirara"], minus: [], reject: /$^/ },
  AEV: { names: ["Aboitiz Equity"], minus: [], reject: /$^/ },
  LPZ: {
    names: ["Lopez Holdings Corporation", "Lopez Holdings"],
    minus: [],
    reject: /$^/,
  },
};



/** News wires rarely use the full legal suffix. Keep both forms for search + match. */
function issuerAliasNames(name: string) {
  const full = name.trim();
  if (!full) return [];
  const short = full
    .replace(/\s+(Corporation|Corp\.?|Incorporated|Inc\.?|Limited|Ltd\.?|PLC|Company|Co\.?)\s*$/i, "")
    .trim();
  if (!short || short.toLowerCase() === full.toLowerCase()) return [full];
  // Drop one-word stubs ("Ayala") — they flood the wires. Keep "Lopez Holdings".
  if (!short.includes(" ") && short.length < 10) return [full];
  return [full, short];
}

function quoteTerm(s: string) {
  const t = s.trim();
  if (!t) return t;
  if (t.startsWith('"') || !t.includes(" ")) return t;
  return `"${t}"`;
}

export function newsTicker(item: { label: string; symbol: string }) {
  return item.symbol.replace(/^\^/, "").replace(/\.PS$/i, "").trim().toUpperCase() || item.label.trim().toUpperCase();
}

function uniqNames(rows: string[]) {
  const out: string[] = [];
  for (const n of rows) {
    const t = n.trim();
    if (!t) continue;
    if (out.some((x) => x.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
  }
  return out;
}

export function issuerNews(item: { label: string; symbol: string; name?: string; kind?: string }): IssuerNews | null {
  if (isPseiItem(item)) return null;
  const t = newsTicker(item);
  const official = PSEI_WEIGHTS.find((w) => w.ticker === t)?.name;
  const extra = [official, item.name, item.label].filter((x): x is string => {
    const n = x?.trim() ?? "";
    return n.length > 3 || n.includes(" ");
  });
  if (ISSUER_NEWS[t]) {
    const seeded = [...ISSUER_NEWS[t].names, ...extra].flatMap(issuerAliasNames);
    return { ...ISSUER_NEWS[t], names: uniqNames(seeded) };
  }
  if (item.kind && item.kind !== "stock") return null;
  const name = (item.name ?? item.label).trim();
  if (!name) return null;
  const seeded = [name, extra.find((n) => n !== name) ?? "", official ?? ""].flatMap(issuerAliasNames);
  return { names: uniqNames(seeded), minus: [], reject: /$^/ };
}

/** Shared react-query key for one stock's harvested news — quote sheet and Feed share the cache. */
export function stockNewsKey(item: { id?: string; label: string; symbol: string; name?: string; kind?: string }) {
  return ["stock-news", item.id ?? item.symbol, item.symbol, item.name, issuerDisplay(item).legal, newsDeskId(item), "v13"] as const;
}

/** Legal / trade names the CFA desk and harvest use for this ticker. */
export function issuerDisplay(item: { label: string; symbol: string; name?: string; kind?: string }) {
  if (isPseiItem(item)) {
    return {
      ticker: "PSEi",
      legal: "PSE index",
      aliases: ["Philippine Stock Exchange"],
      line: "PSE index · Philippine Stock Exchange",
    };
  }
  const ticker = newsTicker(item);
  const spec = issuerNews(item);
  const names = spec?.names?.length ? spec.names : [(item.name ?? item.label).trim()].filter(Boolean);
  const legal = names[0] || ticker;
  const aliases = names.slice(1).filter((n) => n.toLowerCase() !== legal.toLowerCase());
  return { ticker, legal, aliases, line: [legal, ...aliases].join(" · ") };
}

/** Search terms for the issuer — never a bare 3-letter ticker as the whole query. */
export function issuerSearchQuery(item: { label: string; symbol: string; name?: string; kind?: string }, siteLocked = false) {
  if (isPseiItem(item)) return { q: `(PSEi OR "PSE index" OR "Philippine Stock Exchange")`, minus: "" };
  const spec = issuerNews(item);
  const ticker = newsTicker(item);
  const name = (item.name ?? item.label).trim();
  const minusOf = (rows: string[]) => rows.map((m) => (m.includes(" ") ? `-"${m}"` : `-${m}`)).join(" ");
  if (spec) {
    const names = spec.names.map(quoteTerm);
    if (siteLocked) {
      const bits = [ticker, ...names].filter((s, i, a) => s && a.indexOf(s) === i);
      return { q: `(${bits.join(" OR ")})`, minus: minusOf(spec.minus) };
    }
    // Never nest (TICKER (Philippines|PSE|…)) — that shape empties Google News RSS for
    // short PH tickers across the book (LPZ 0 raw; AC/AEV/DMC lose Latest). Legal names
    // + bare ticker carry the query; PH wires + isRelatedStory already scope relevance.
    const bits = [...names, ticker];
    return { q: `(${[...new Set(bits)].join(" OR ")})`, minus: minusOf(spec.minus) };
  }
  const bits = [ticker, name].filter((s, i, a) => s && a.indexOf(s) === i);
  const long = bits.filter((s) => s.length > 3 || s.includes(" "));
  const use = long.length ? long : bits;
  return { q: use.map(quoteTerm).join(" OR "), minus: "" };
}

export function relatedNeedles(item: { label: string; symbol: string; name?: string; kind: string }) {
  if (isPseiItem(item)) return ["psei", "pse index", "philippine stock exchange"];
  const spec = issuerNews(item);
  const name = (item.name ?? item.label).trim();
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  };
  for (const n of spec?.names ?? []) add(n);
  if (name) add(name);
  for (const part of name.split(/[\s,/&-]+/)) {
    const bit = part.replace(/[.]/g, "");
    if (bit.length >= 5 && !GENERIC_NAME.test(bit)) add(bit);
  }
  return out;
}

function wordHit(hay: string, token: string) {
  const t = token.trim();
  if (!t) return false;
  if (t.length <= 3) {
    return new RegExp(`(?:^|[^a-z0-9])${t.replace(/[^a-z0-9]/gi, '')}(?:[^a-z0-9]|$)`, 'i').test(hay);
  }
  return hay.includes(t.toLowerCase());
}

export function isRelatedStory(
  story: { title: string; desc?: string; src?: string },
  item: { label: string; symbol: string; name?: string; kind: string },
) {
  const titleHay = `${story.title} ${story.src ?? ""}`.toLowerCase();
  const hay = `${story.title} ${story.desc ?? ""} ${story.src ?? ""}`.toLowerCase();
  // Stock-scoped: the name or ticker must be in the TITLE (or outlet). RSS descriptions — Google News
  // clusters especially — list other outlets' headlines, so a desc-only hit is an unrelated story.
  if (isPseiItem(item)) {
    return /psei|\bpse index\b|philippine stock exchange|manila (?:shares|bourse)|local bourse|pse composite/.test(titleHay);
  }
  const spec = issuerNews(item);
  if (spec?.reject.test(hay)) return false;
  for (const n of spec?.names ?? []) {
    if (n.length >= 4 && titleHay.includes(n.toLowerCase())) return true;
  }
  for (const n of relatedNeedles(item)) {
    if (n.length >= 4 && titleHay.includes(n)) return true;
  }
  const ticker = newsTicker(item);
  // Short tickers must hit the TITLE — RSS descriptions often dump other headlines.
  if (!wordHit(titleHay, ticker)) return false;
  // A short ticker needs a Philippine mark only on the PH book. GE or UAL must not.
  if (newsDeskId(item) !== "PH") return true;
  if (ticker.length >= 4) return true;
  return PH_MARK.test(titleHay);
}

const NEWS_SUFFIX: Array<[RegExp, string]> = [
  [/\.HK$/i, "HK"],
  [/\.(NS|BO)$/i, "IN"],
  [/\.T$/i, "JP"],
  [/\.SI$/i, "SG"],
  [/\.L$/i, "GB"],
  [/\.AX$/i, "AU"],
  [/\.(TO|V)$/i, "CA"],
  [/\.(DE|PA|AS|MI|MC)$/i, "EU"],
  [/\.(VN|HM)$/i, "VN"],
  [/\.BK$/i, "TH"],
  [/\.KL$/i, "MY"],
  [/\.JK$/i, "ID"],
  [/\.(KS|KQ)$/i, "KR"],
  [/\.TW$/i, "TW"],
  [/\.NZ$/i, "NZ"],
  [/\.SW$/i, "CH"],
  [/\.SA$/i, "BR"],
  [/\.MX$/i, "MX"],
  [/\.JO$/i, "ZA"],
  [/\.(AE|DU|AD)$/i, "AE"],
  [/\.PS$/i, "PH"],
];

/** PSE sleeves and named issuers. A bare AAPL is not in this set, so it is not Manila. */
const PH_BOOK = new Set<string>([
  ...BLUECHIPS,
  ...REITS,
  ...DIVIDENDS,
  ...Object.keys(PSEI_NAMES),
  ...Object.keys(ISSUER_NEWS),
]);

/** Which book's wires this name belongs to. A bare ticker is the US tape unless it is on the PSE book. */
export function newsDeskId(item: { symbol: string; kind?: string; label?: string; id?: string; name?: string }) {
  if (isPseiItem(item)) return "PH";
  const symbol = item.symbol.toUpperCase();
  for (const [re, id] of NEWS_SUFFIX) if (re.test(symbol)) return id;
  const ticker = newsTicker({ symbol: item.symbol, label: item.label ?? item.symbol });
  const label = item.label ? newsTicker({ symbol: item.label, label: item.label }) : "";
  if (PH_BOOK.has(ticker) || (label && PH_BOOK.has(label))) return "PH";
  if (item.id?.toLowerCase().startsWith("pse-")) return "PH";
  if (item.kind === "fx") return fxDeskId(item);
  return "US";
}

const FX_QUOTE_DESK: Record<string, string> = {
  PHP: "PH",
  USD: "US",
  HKD: "HK",
  INR: "IN",
  JPY: "JP",
  VND: "VN",
  GBP: "GB",
  AUD: "AU",
  SGD: "SG",
  KRW: "KR",
  TWD: "TW",
  THB: "TH",
  MYR: "MY",
  IDR: "ID",
  EUR: "EU",
  CAD: "CA",
  NZD: "NZ",
  CHF: "CH",
  BRL: "BR",
  MXN: "MX",
  ZAR: "ZA",
  AED: "AE",
};

function fxDeskId(item: { symbol: string; label?: string }) {
  const raw = `${item.label ?? ""} ${item.symbol}`.toUpperCase();
  const slash = raw.match(/([A-Z]{3})\s*\/\s*([A-Z]{3})/);
  const quote = slash?.[2] ?? item.symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(-3);
  return FX_QUOTE_DESK[quote] ?? "US";
}

const DESK_WIRES: Record<string, string[]> = {
  PH: ["bilyonaryo.com", "insiderph.com", "bworldonline.com", "businessmirror.com.ph", "politiko.com.ph", "abante.com.ph", "manilatimes.net"],
  US: ["reuters.com", "wsj.com", "cnbc.com", "ft.com"],
  IN: ["economictimes.indiatimes.com", "livemint.com", "business-standard.com"],
  HK: ["scmp.com", "thestandard.com.hk"],
  JP: ["japantimes.co.jp", "asia.nikkei.com"],
  VN: ["vnexpress.net", "vietnamnews.vn"],
  GB: ["ft.com", "theguardian.com", "reuters.com"],
  AU: ["afr.com", "smh.com.au"],
  SG: ["straitstimes.com", "businesstimes.com.sg"],
  KR: ["koreaherald.com", "koreajoongangdaily.joins.com"],
  TW: ["taipeitimes.com", "focustaiwan.tw"],
  TH: ["bangkokpost.com", "nationthailand.com"],
  MY: ["thestar.com.my", "theedgemalaysia.com"],
  ID: ["thejakartapost.com"],
};

const WORLD_WIRES = ["reuters.com", "ft.com", "bloomberg.com"];

const WIRE_LABEL: Record<string, string> = {
  "bilyonaryo.com": "Bilyonaryo",
  "politiko.com.ph": "Politiko",
  "abante.com.ph": "Abante",
  "insiderph.com": "InsiderPH",
  "bworldonline.com": "BusinessWorld",
  "businessmirror.com.ph": "BusinessMirror",
  "manilatimes.net": "Manila Times",
  "philstar.com": "Philstar",
  "inquirer.net": "Inquirer",
  "manilastandard.net": "Manila Standard",
  "tribune.net.ph": "Tribune",
  "reuters.com": "Reuters",
  "wsj.com": "WSJ",
  "cnbc.com": "CNBC",
  "ft.com": "FT",
  "bloomberg.com": "Bloomberg",
  "economictimes.indiatimes.com": "Economic Times",
  "livemint.com": "Mint",
  "business-standard.com": "Business Standard",
  "scmp.com": "SCMP",
  "vnexpress.net": "VnExpress",
};

function wiresFor(item: { symbol: string; kind?: string; label?: string; id?: string }) {
  return DESK_WIRES[newsDeskId(item)] ?? WORLD_WIRES;
}

export function newsAsked(item: { symbol: string; kind?: string; label?: string; id?: string }) {
  return wiresFor(item).map((site) => WIRE_LABEL[site] ?? site);
}

/** One line on a board row. The quote sheet harvests; this does not. */
export function newsRowHint(item: { symbol: string; kind?: string; label?: string; id?: string }) {
  const labels = newsAsked(item).slice(0, 2);
  return labels.length ? `Facts · ${labels.join(" · ")}` : "";
}

function newsLocale(item: { symbol: string; kind?: string }) {
  return deskMarket(newsDeskId(item)).newsLocale;
}

/** Google `when:1d` often comes back empty. A dated `after:` still respects the lane window. */
export function newsAfterDay(window: NewsWindow, now = new Date()) {
  const days = window === "1d" ? 1 : window === "7d" ? 7 : window === "30d" ? 30 : 365;
  const p = manilaParts(new Date(now.getTime() - days * 86_400_000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function datedQuery(query: string, window: NewsWindow, now: Date) {
  return `${query} after:${newsAfterDay(window, now)}`.replace(/\s+/g, " ").trim();
}

export function relatedNewsQuery(
  item: { label: string; symbol: string; name?: string; kind: string },
  window: NewsWindow = "1d",
  now = new Date(),
) {
  const name = (item.name ?? item.label).trim();
  const sym = item.symbol.replace(/^\^/, "").replace(/\.PS$/i, "").trim();
  if (item.kind === "crypto") return datedQuery(`${item.label} OR ${name} crypto`, window, now);
  if (item.kind === "fx") {
    const label = (item.label || item.symbol).trim();
    const php = /php|peso/i.test(`${item.symbol} ${item.label ?? ""} ${item.name ?? ""}`);
    return datedQuery(`${label} forex${php ? " peso" : ""}`, window, now);
  }
  if (item.kind === "cmdty") return datedQuery(`${item.label} OR ${name} commodity`, window, now);
  if (item.kind === "global" && !isPseiItem(item)) return datedQuery(`${sym} OR ${name}`, window, now);
  const { q, minus } = issuerSearchQuery(item);
  return datedQuery(`${q} ${minus}`, window, now);
}

export function relatedNewsUrl(
  item: { label: string; symbol: string; name?: string; kind: string },
  window: NewsWindow = "1d",
  now = new Date(),
) {
  const q = relatedNewsQuery(item, window, now);
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${newsLocale(item)}`;
}

/** Same issuer query without after: — used when dated Google RSS returns nothing. */
export function undatedRelatedNewsUrl(
  item: { label: string; symbol: string; name?: string; kind: string },
  window: NewsWindow = "30d",
  now = new Date(),
) {
  const dated = relatedNewsQuery(item, window, now);
  const q = dated.replace(/\s+after:\d{4}-\d{2}-\d{2}\b/, "").trim();
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${newsLocale(item)}`;
}

export const NEWS_LANE_KEEP = 8;
export const NEWS_LANE_MIN = 5;
/** When nothing is new, show this many latest relevant stories — not the whole archive. */
export const NEWS_QUIET_KEEP = 10;
/** Latest facts stay inside two weeks. Older copy is Earlier, not Latest. */
export const NEWS_FRESH_DAYS = 14;
/** Talk can run a month. Beyond that it is archive. */
export const NEWS_TALK_DAYS = 30;

export function storyAgeDays(date: string, now = new Date()) {
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / 86_400_000;
}

export function isFreshStory(story: { date?: string }, days: number, now = new Date()) {
  return storyAgeDays(story.date || "", now) <= days;
}

function googleNewsRss(
  query: string,
  window: NewsWindow,
  item: { symbol: string; kind?: string },
  now = new Date(),
) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(datedQuery(query, window, now))}&${newsLocale(item)}`;
}

export function rumorSiteUrls(
  item: { label: string; symbol: string; name?: string; kind?: string },
  window: NewsWindow = "7d",
  now = new Date(),
) {
  const { q, minus } = issuerSearchQuery(item, true);
  const core = `${q} ${minus}`.replace(/\s+/g, " ").trim();
  return wiresFor(item).map((site) => googleNewsRss(`site:${site} ${core}`, window, item, now));
}

export function rumorTalkUrls(
  item: { label: string; symbol: string; name?: string; kind?: string },
  window: NewsWindow = "7d",
  now = new Date(),
) {
  const { q, minus } = issuerSearchQuery(item, true);
  const core = `${q} ${minus}`.replace(/\s+/g, " ").trim();
  return [
    googleNewsRss(
      `${core} (in talks OR "sources say" OR rumored OR allegedly OR alleged OR "people familiar" OR mulling OR reportedly)`,
      window,
      item,
      now,
    ),
    googleNewsRss(
      `${core} ("takeover talks" OR "merger talks" OR "advanced talks" OR "said to be in talks")`,
      window,
      item,
      now,
    ),
  ];
}

export function rumorFillUrls(
  item: { label: string; symbol: string; name?: string; kind?: string },
  window: NewsWindow = "30d",
  now = new Date(),
) {
  const { q, minus } = issuerSearchQuery(item, true);
  const core = `${q} ${minus}`.replace(/\s+/g, " ").trim();
  const legal = issuerNews(item)?.names?.[0] ?? item.name ?? item.label;
  const desk = newsDeskId(item);
  const extra =
    desk === "PH"
      ? ["philstar.com", "inquirer.net", "manilastandard.net", "tribune.net.ph"]
      : wiresFor(item).slice(0, 3);
  return [
    ...extra.map((site) => googleNewsRss(`site:${site} ${core}`, window, item, now)),
    googleNewsRss(
      `${quoteTerm(legal)} (reportedly OR rumored OR mulling OR allegedly OR alleged OR "in talks" OR "people familiar" OR "sources say")`,
      window,
      item,
      now,
    ),
  ];
}

export function rumorNewsUrls(item: { label: string; symbol: string; name?: string; kind?: string }, window: NewsWindow = "7d") {
  return [...rumorSiteUrls(item, window), ...rumorTalkUrls(item, window)];
}

export function rumorNewsUrl(item: { label: string; symbol: string; name?: string; kind?: string }, window: NewsWindow = "7d") {
  return rumorNewsUrls(item, window)[0]!;
}

export type StoryLane = "fact" | "rumor" | "wire";

export type RelatedStory = {
  title: string;
  link: string;
  desc: string;
  date: string;
  src: string;
  lane: StoryLane;
};

const RUMOR_COPY =
  /bilyonaryo|politiko|abante|in talks|sources? say|rumou?r\b|unconfirmed|\balleged(?:ly)?\b|hearsay|tipped to|said to be (?:in talks|eyeing)|according to people familiar|people familiar|unnamed source|mulling|advanced talks|takeover talk|merger talks|exploring a (?:deal|stake|bid)|reportedly/i;
const FACT_COPY =
  /pse\.com\.ph|edge\.pse|businessworld|bworldonline|businessmirror|insiderph|reuters|inquirer|bloomberg|abs-cbn|gmanews|gma news|philstar\.com|mb\.com|manila bulletin|businessmirror|rappler|ft\.com|wsj|associated press/i;

export function storyLane(story: { title: string; desc?: string; src?: string }): StoryLane {
  const hay = `${story.title} ${story.desc ?? ""} ${story.src ?? ""}`;
  if (RUMOR_COPY.test(hay)) return "rumor";
  if (FACT_COPY.test(hay)) return "fact";
  return "wire";
}

export function asStories(xml: string): RelatedStory[] {
  return parseRss(xml)
    .filter((s) => s.title && !/^untitled$/i.test(s.title))
    .map((s) => {
      const title = cleanHeadline(s.title) || s.title;
      const src = s.source || "Google News";
      return {
        title,
        link: s.link,
        desc: s.desc,
        date: s.date,
        src,
        lane: storyLane({ title, desc: s.desc, src }),
      };
    })
    .filter((s) => s.title);
}

function mergeStories(rows: RelatedStory[]) {
  const seen = new Set<string>();
  const out: RelatedStory[] = [];
  for (const row of rows) {
    const key = `${row.link}|${row.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.sort((a, b) => Date.parse(b.date || "") - Date.parse(a.date || ""));
}

const DESK_JUNK =
  /tradingview|stock price and chart|live better with|pay mo na|credit cards|referral campaign|anniversary raffle|easy,\s*simple and secure banking|deeper ties with filipinos|facebook into ofw|^winning\s*\||named best digital wallet|ofws chart future|summit point|holds nerve|golf tournament|\buaap\b|\bpba\b|basketball championship/i;

export function isDeskStory(story: { title: string; src?: string }) {
  const hay = `${story.title} ${story.src ?? ""}`;
  if (DESK_JUNK.test(hay)) return false;
  if (/facebook\.com|twitter\.com|\bx\.com\b/i.test(story.src ?? "")) return false;
  if (/full story:\s*https?:\/\//i.test(story.title)) return false;
  return true;
}

const FP_STOP = new Set(["the", "from", "with", "for", "and", "its", "has", "was", "are"]);

export function storyFingerprint(title: string) {
  const t = title.toLowerCase().replace(/\s*[-—|].*$/, "");
  const nums = [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]).join("-");
  const words = t
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !FP_STOP.has(w));
  if (nums && words[0]) return `${words[0]}#${nums}`;
  return `${words.slice(0, 2).join(" ")}#`;
}

export function collapseNearDup(rows: RelatedStory[]) {
  const seen = new Set<string>();
  const out: RelatedStory[] = [];
  for (const row of rows) {
    const fp = storyFingerprint(row.title);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(row);
  }
  return out;
}

export function pickNewsLanes(related: RelatedStory[], now = new Date()) {
  const facts = related.filter((s) => s.lane !== "rumor" && isFreshStory(s, NEWS_FRESH_DAYS, now)).slice(0, NEWS_LANE_KEEP);
  const rumors = related.filter((s) => s.lane === "rumor" && isFreshStory(s, NEWS_TALK_DAYS, now)).slice(0, NEWS_LANE_KEEP);
  const used = new Set([...facts, ...rumors].map((s) => `${s.link}|${s.title}`.toLowerCase()));
  const quiet = facts.length === 0 && rumors.length === 0;
  const earlier = related.filter((s) => !used.has(`${s.link}|${s.title}`.toLowerCase())).slice(0, quiet ? NEWS_QUIET_KEEP : NEWS_LANE_KEEP);
  return { facts, rumors, earlier, stories: mergeStories([...facts, ...rumors]) };
}

const SOFT_TALK =
  /in talks|sources? say|rumou?r|\balleged(?:ly)?\b|mulling|reportedly|people familiar|tipped|unconfirmed|may (?:buy|sell|raise)|takeover talk|merger talks|advanced talks|said to be/i;

export function fillRumorLane(related: RelatedStory[], min = NEWS_LANE_MIN, now = new Date()) {
  const rumors = related.filter((s) => s.lane === "rumor");
  const facts = related.filter((s) => s.lane !== "rumor");
  const freshRumors = rumors.filter((s) => isFreshStory(s, NEWS_TALK_DAYS, now));
  if (freshRumors.length >= min) return pickNewsLanes(related, now);
  const need = min - freshRumors.length;
  const promoted: RelatedStory[] = [];
  const rest: RelatedStory[] = [];
  for (const s of facts) {
    if (
      promoted.length < need &&
      isFreshStory(s, NEWS_TALK_DAYS, now) &&
      SOFT_TALK.test(`${s.title} ${s.desc ?? ""} ${s.src}`)
    ) {
      promoted.push({ ...s, lane: "rumor" });
    } else rest.push(s);
  }
  return pickNewsLanes([...rest, ...rumors, ...promoted], now);
}

export function prepRelated(
  gathered: RelatedStory[],
  item: { label: string; symbol: string; name?: string; kind: string },
) {
  return collapseNearDup(mergeStories(gathered.filter((s) => isRelatedStory(s, item) && isDeskStory(s))));
}

export function wireName(url: string) {
  let q = url;
  try {
    q = decodeURIComponent(url);
  } catch {
    /* keep the raw url */
  }
  const site = q.match(/site:([^\s&]+)/)?.[1]?.replace(/^www\./, "");
  if (!site) return "Google News";
  return WIRE_LABEL[site] ?? site;
}

