export type ModuleId = "calendar" | "notes" | "finance" | "news";
export type ViewId = "dashboard" | ModuleId | "options" | "quotes";
export type CalMode = "month" | "week" | "day" | "agenda";
export type EventCat = "work" | "personal" | "family" | "health" | "other";
export type EventSource = "local" | "ics" | "google";
export type WidgetKind = "weather" | "agenda" | "calendar" | "quote" | "finance" | "news";
export type WatchKind = "crypto" | "fx" | "stock";
export const QUOTE_CCY = ["PHP", "USD", "EUR", "GBP", "JPY"] as const;
export type QuoteCcy = (typeof QUOTE_CCY)[number];

export type BoardTab = "all" | "watcher" | "starred" | "blue" | "reit" | "div" | "crypto" | "fx";
export type BoardSort = "name" | "chg" | "vol" | "last";
export type SparkRange = "1d" | "1w" | "1m" | "3m" | "6m" | "1y";

export type MarketPrefs = {
  spark: boolean;
  sparkRange: SparkRange;
  dualPhp: boolean;
  cryptoUsdt: boolean;
  compact: boolean;
  showVol: boolean;
  showTape: boolean;
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
  home: "markets",
  tab: "watcher",
  sort: "chg",
  sortDir: -1,
};

export const WIDGET_LABEL: Record<WidgetKind, string> = {
  weather: "Today",
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

export type StickyNote = {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  pinned: boolean;
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
];

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
  lat: number;
  lon: number;
};
