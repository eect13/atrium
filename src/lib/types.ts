import type { ScreenCap, ScreenPe, ScreenVol, ScreenYld, ScreenerId } from "./screener";

export type ModuleId = "calendar" | "weather" | "notes" | "finance" | "news" | "quotes";
export type ViewId = "dashboard" | ModuleId | "options";
export type CalMode = "month" | "week" | "day" | "agenda";
export type EventCat = "work" | "personal" | "family" | "health" | "other";
export type EventSource = "local" | "ics" | "google";
export type WidgetKind = "weather" | "agenda" | "calendar" | "quote" | "finance" | "news";
export type WatchKind = "crypto" | "fx" | "stock" | "global" | "cmdty";
export const QUOTE_CCY = ["PHP", "USD", "EUR", "GBP", "JPY"] as const;
export type QuoteCcy = (typeof QUOTE_CCY)[number];

export type BoardTab = "all" | "watcher" | "starred" | "blue" | "reit" | "div" | "crypto" | "fx" | "global" | "cmdty" | "screen";
export type BoardSort = "name" | "chg" | "vol" | "last" | "pe" | "cap";
export type SparkRange = "1d" | "1w" | "1m" | "3m" | "6m" | "1y";
export type ScreenId = ScreenerId;
export type StockTape = "auto" | "yahoo";

export const STOCK_TAPES = [
  { id: "auto" as const, label: "Auto", blurb: "PSE last from phisix. Global last, sparks, and PE from Yahoo." },
  { id: "yahoo" as const, label: "Yahoo", blurb: "Last, sparks, and PE from Yahoo — including .PS names." },
] as const;

export function normalizeStockTape(raw?: string): StockTape {
  return raw === "yahoo" ? "yahoo" : "auto";
}

export type MarketPrefs = {
  spark: boolean;
  sparkRange: SparkRange;
  dualPhp: boolean;
  cryptoUsdt: boolean;
  compact: boolean;
  showVol: boolean;
  showTape: boolean;
  showMarkets: boolean;
  showBooks: boolean;
  cmdtyPhp: boolean;
  stockTape: StockTape;
  screen: ScreenId;
  screenPe: ScreenPe;
  screenCap: ScreenCap;
  screenVol: ScreenVol;
  screenYld: ScreenYld;
  home: "books" | "markets";
  tab: BoardTab;
  sort: BoardSort;
  sortDir: 1 | -1;
};

export const DEFAULT_MARKET_PREFS: MarketPrefs = {
  spark: true,
  sparkRange: "3m",
  dualPhp: true,
  cryptoUsdt: true,
  compact: false,
  showVol: true,
  showTape: true,
  showMarkets: true,
  showBooks: true,
  cmdtyPhp: false,
  stockTape: "auto",
  screen: "day_gainers",
  screenPe: "any",
  screenCap: "any",
  screenVol: "any",
  screenYld: "any",
  home: "markets",
  tab: "watcher",
  sort: "chg",
  sortDir: -1,
};

export const WIDGET_LABEL: Record<WidgetKind, string> = {
  weather: "Weather",
  agenda: "Up next",
  calendar: "Calendar",
  quote: "Quote",
  finance: "Finance",
  news: "Headlines",
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  cat: EventCat;
  loc: string;
  source: EventSource;
  allDay?: boolean;
};

export type NoteStroke = { color: string; w: number; pts: number[] };
export type NotePhoto = { id: string; src: string };

export type StickyNote = {
  id: string;
  text: string;
  /** Plain title line (Windows Sticky Notes). Empty → first body line is shown. */
  title?: string;
  color: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  pinned: boolean;
  ink?: NoteStroke[];
  html?: string;
  photos?: NotePhoto[];
  /** Last floating-desk box. Unpin parks the pad on the board; pin restores this. */
  fx?: number;
  fy?: number;
  fw?: number;
  fh?: number;
};

export type FloatWin = {
  id: string;
  kind: WidgetKind;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
};

export type AccountKind = "cash" | "bank" | "card" | "ewallet";
export type BooksLayout = "list" | "grid";
export type NotesLayout = "list" | "board";
export type TxKind = "expense" | "income" | "transfer" | "deposit";
export type TxStatus = "pending" | "cleared";

export const ACCOUNT_KINDS = [
  { id: "cash", label: "Cash" },
  { id: "bank", label: "Bank" },
  { id: "ewallet", label: "Wallet" },
  { id: "card", label: "Card" },
] as const;

export const TX_KINDS = [
  { id: "expense", label: "Expense" },
  { id: "income", label: "Income" },
  { id: "transfer", label: "Transfer" },
  { id: "deposit", label: "Deposit" },
] as const;

export const FINANCE_CATS = ["food", "trans", "bills", "fun", "income", "other"] as const;

export const BOOK_CCY = [
  "PHP",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "KRW",
  "SGD",
  "HKD",
  "CNY",
  "AUD",
  "CAD",
  "CHF",
  "NZD",
  "INR",
  "THB",
  "MYR",
  "IDR",
  "VND",
  "TWD",
  "AED",
  "SAR",
  "QAR",
  "KWD",
  "BHD",
  "OMR",
  "TRY",
  "ILS",
  "ZAR",
  "BRL",
  "MXN",
  "NOK",
  "SEK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "RUB",
  "UAH",
  "NGN",
  "EGP",
  "KES",
  "PKR",
  "BDT",
  "LKR",
  "NPR",
  "MMK",
  "KHR",
  "BND",
  "FJD",
] as const;
export type BookCcy = (typeof BOOK_CCY)[number];

export type Account = {
  id: string;
  name: string;
  balance: number;
  kind: AccountKind;
  currency?: BookCcy;
  number?: string;
  last4?: string;
  expiry?: string;
  cvc?: string;
  hidden?: boolean;
  hideNumber?: boolean;
};

export type Budget = { id: string; name: string; limit: number };

export type Tx = {
  id: string;
  date: string;
  payee: string;
  amount: number;
  cat: string;
  accountId?: string;
  memo?: string;
  kind?: TxKind;
  status?: TxStatus;
  transferToId?: string;
};

export type Books = {
  name: string;
  density: "comfortable" | "compact";
  mask?: boolean;
  currency: BookCcy;
  walletLayout?: BooksLayout;
  registerLayout?: BooksLayout;
};

export type WatchItem = {
  id: string;
  symbol: string;
  label: string;
  kind: WatchKind;
  name?: string;
  starred?: boolean;
  qty?: number;
  avg?: number;
};

export const WATCH_CATALOG: WatchItem[] = [
  { id: "ac", symbol: "AC", label: "AC", name: "Ayala Corp", kind: "stock" },
  { id: "acen", symbol: "ACEN", label: "ACEN", name: "ACEN", kind: "stock" },
  { id: "aev", symbol: "AEV", label: "AEV", name: "Aboitiz Equity", kind: "stock" },
  { id: "ali", symbol: "ALI", label: "ALI", name: "Ayala Land", kind: "stock" },
  { id: "areit", symbol: "AREIT", label: "AREIT", name: "AREIT", kind: "stock" },
  { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" },
  { id: "bpi", symbol: "BPI", label: "BPI", name: "Bank of the PH Islands", kind: "stock" },
  { id: "cbc", symbol: "CBC", label: "CBC", name: "China Bank", kind: "stock" },
  { id: "cnpf", symbol: "CNPF", label: "CNPF", name: "Century Pacific", kind: "stock" },
  { id: "dmc", symbol: "DMC", label: "DMC", name: "DMCI Holdings", kind: "stock" },
  { id: "emi", symbol: "EMI", label: "EMI", name: "Emperador", kind: "stock" },
  { id: "glo", symbol: "GLO", label: "GLO", name: "Globe", kind: "stock" },
  { id: "gtcap", symbol: "GTCAP", label: "GTCAP", name: "GT Capital", kind: "stock" },
  { id: "ict", symbol: "ICT", label: "ICT", name: "ICTSI", kind: "stock" },
  { id: "jfc", symbol: "JFC", label: "JFC", name: "Jollibee", kind: "stock" },
  { id: "jgs", symbol: "JGS", label: "JGS", name: "JG Summit", kind: "stock" },
  { id: "ltg", symbol: "LTG", label: "LTG", name: "LT Group", kind: "stock" },
  { id: "mbt", symbol: "MBT", label: "MBT", name: "Metrobank", kind: "stock" },
  { id: "mer", symbol: "MER", label: "MER", name: "Meralco", kind: "stock" },
  { id: "monde", symbol: "MONDE", label: "MONDE", name: "Monde Nissin", kind: "stock" },
  { id: "mynld", symbol: "MYNLD", label: "MYNLD", name: "Maynilad", kind: "stock" },
  { id: "pgold", symbol: "PGOLD", label: "PGOLD", name: "Puregold", kind: "stock" },
  { id: "plus", symbol: "PLUS", label: "PLUS", name: "DigiPlus", kind: "stock" },
  { id: "rcr", symbol: "RCR", label: "RCR", name: "RL Commercial REIT", kind: "stock" },
  { id: "scc", symbol: "SCC", label: "SCC", name: "Semirara", kind: "stock" },
  { id: "sm", symbol: "SM", label: "SM", name: "SM Investments", kind: "stock" },
  { id: "smc", symbol: "SMC", label: "SMC", name: "San Miguel", kind: "stock" },
  { id: "smph", symbol: "SMPH", label: "SMPH", name: "SM Prime", kind: "stock" },
  { id: "tel", symbol: "TEL", label: "TEL", name: "PLDT", kind: "stock" },
  { id: "urc", symbol: "URC", label: "URC", name: "Universal Robina", kind: "stock" },
  { id: "btc", symbol: "bitcoin", label: "BTC", name: "Bitcoin", kind: "crypto" },
  { id: "eth", symbol: "ethereum", label: "ETH", name: "Ethereum", kind: "crypto" },
  { id: "sol", symbol: "solana", label: "SOL", name: "Solana", kind: "crypto" },
  { id: "xrp", symbol: "ripple", label: "XRP", name: "XRP", kind: "crypto" },
  { id: "usdphp", symbol: "USDPHP", label: "USD/PHP", name: "US Dollar", kind: "fx" },
  { id: "eurphp", symbol: "EURPHP", label: "EUR/PHP", name: "Euro", kind: "fx" },
  { id: "jpyphp", symbol: "JPYPHP", label: "JPY/PHP", name: "Yen", kind: "fx" },
  { id: "gbpphp", symbol: "GBPPHP", label: "GBP/PHP", name: "Pound", kind: "fx" },
  { id: "spx", symbol: "^GSPC", label: "S&P 500", name: "S&P 500", kind: "global" },
  { id: "dji", symbol: "^DJI", label: "DJIA", name: "Dow Jones", kind: "global" },
  { id: "ixic", symbol: "^IXIC", label: "Nasdaq", name: "Nasdaq Composite", kind: "global" },
  { id: "n225", symbol: "^N225", label: "Nikkei", name: "Nikkei 225", kind: "global" },
  { id: "hsi", symbol: "^HSI", label: "HSI", name: "Hang Seng", kind: "global" },
  { id: "ftse", symbol: "^FTSE", label: "FTSE", name: "FTSE 100", kind: "global" },
  { id: "dax", symbol: "^GDAXI", label: "DAX", name: "DAX", kind: "global" },
  { id: "cac", symbol: "^FCHI", label: "CAC 40", name: "CAC 40", kind: "global" },
  { id: "stoxx", symbol: "^STOXX50E", label: "SX5E", name: "Euro Stoxx 50", kind: "global" },
  { id: "asx", symbol: "^AXJO", label: "ASX 200", name: "S&P/ASX 200", kind: "global" },
  { id: "kospi", symbol: "^KS11", label: "KOSPI", name: "KOSPI", kind: "global" },
  { id: "sti", symbol: "^STI", label: "STI", name: "Straits Times", kind: "global" },
  { id: "aapl", symbol: "AAPL", label: "AAPL", name: "Apple", kind: "global" },
  { id: "msft", symbol: "MSFT", label: "MSFT", name: "Microsoft", kind: "global" },
  { id: "googl", symbol: "GOOGL", label: "GOOGL", name: "Alphabet", kind: "global" },
  { id: "amzn", symbol: "AMZN", label: "AMZN", name: "Amazon", kind: "global" },
  { id: "nvda", symbol: "NVDA", label: "NVDA", name: "NVIDIA", kind: "global" },
  { id: "meta", symbol: "META", label: "META", name: "Meta", kind: "global" },
  { id: "tsla", symbol: "TSLA", label: "TSLA", name: "Tesla", kind: "global" },
  { id: "brk", symbol: "BRK-B", label: "BRK.B", name: "Berkshire Hathaway", kind: "global" },
  { id: "jpm", symbol: "JPM", label: "JPM", name: "JPMorgan", kind: "global" },
  { id: "v", symbol: "V", label: "V", name: "Visa", kind: "global" },
  { id: "unh", symbol: "UNH", label: "UNH", name: "UnitedHealth", kind: "global" },
  { id: "xom", symbol: "XOM", label: "XOM", name: "Exxon Mobil", kind: "global" },
  { id: "lly", symbol: "LLY", label: "LLY", name: "Eli Lilly", kind: "global" },
  { id: "avgo", symbol: "AVGO", label: "AVGO", name: "Broadcom", kind: "global" },
  { id: "wmt", symbol: "WMT", label: "WMT", name: "Walmart", kind: "global" },
  { id: "gold", symbol: "GC=F", label: "Gold", name: "Gold", kind: "cmdty" },
  { id: "silver", symbol: "SI=F", label: "Silver", name: "Silver", kind: "cmdty" },
  { id: "wti", symbol: "CL=F", label: "WTI", name: "Crude Oil WTI", kind: "cmdty" },
  { id: "brent", symbol: "BZ=F", label: "Brent", name: "Brent Crude", kind: "cmdty" },
  { id: "natgas", symbol: "NG=F", label: "Nat Gas", name: "Natural Gas", kind: "cmdty" },
  { id: "copper", symbol: "HG=F", label: "Copper", name: "Copper", kind: "cmdty" },
  { id: "platinum", symbol: "PL=F", label: "Platinum", name: "Platinum", kind: "cmdty" },
  { id: "corn", symbol: "ZC=F", label: "Corn", name: "Corn", kind: "cmdty" },
  { id: "wheat", symbol: "ZW=F", label: "Wheat", name: "Wheat", kind: "cmdty" },
  { id: "coffee", symbol: "KC=F", label: "Coffee", name: "Coffee", kind: "cmdty" },
];

/** Old PH-only factory desks pick up S&P 500 and Gold once. Custom global/cmdty lists stay as-is. */
export function withFactoryGlobals(watch: WatchItem[]): WatchItem[] {
  if (!watch.length) return watch;
  if (watch.some((w) => w.kind === "global" || w.kind === "cmdty")) return watch;
  const ph = ["bdo", "sm", "jfc"].some((id) => watch.some((w) => w.id === id));
  if (!ph) return watch;
  const extra = WATCH_CATALOG.filter((w) => w.id === "spx" || w.id === "gold");
  return extra.length ? [...watch, ...extra] : watch;
}

export type Feed = {
  id: string;
  name: string;
  url: string;
  category: string;
  enabled: boolean;
};

export type NewsItem = {
  title: string;
  link: string;
  desc: string;
  date: string;
  src: string;
  category: string;
};

export type Profile = {
  name: string;
  city: string;
  lat: number | null;
  lon: number | null;
  tagline: string;
  region: string;
};

export const DEFAULT_TAGLINE = "";
