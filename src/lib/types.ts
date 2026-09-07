export type ModuleId = "calendar" | "notes" | "finance" | "news";
export type ViewId = "dashboard" | ModuleId | "options";
export type CalMode = "month" | "week" | "day" | "agenda";
export type EventCat = "work" | "personal" | "family" | "health" | "other";
export type EventSource = "local" | "ics" | "google";
export type WidgetKind = "weather" | "agenda" | "calendar" | "quote" | "finance" | "news";
export type WatchKind = "crypto" | "fx" | "stock";
export const QUOTE_CCY = ["PHP", "USD", "EUR", "GBP", "JPY"] as const;
export type QuoteCcy = (typeof QUOTE_CCY)[number];

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

export type Account = { id: string; name: string; balance: number };
export type Budget = { id: string; name: string; limit: number };
export type Tx = {
  id: string;
  date: string;
  payee: string;
  amount: number;
  cat: string;
  accountId?: string;
};

export type WatchItem = {
  id: string;
  symbol: string;
  label: string;
  kind: WatchKind;
  name?: string;
};

export const WATCH_CATALOG: WatchItem[] = [
  { id: "bdo", symbol: "BDO", label: "BDO", name: "BDO Unibank", kind: "stock" },
  { id: "sm", symbol: "SM", label: "SM", name: "SM Investments", kind: "stock" },
  { id: "jfc", symbol: "JFC", label: "JFC", name: "Jollibee", kind: "stock" },
  { id: "bpi", symbol: "BPI", label: "BPI", name: "Bank of the PH Islands", kind: "stock" },
  { id: "ali", symbol: "ALI", label: "ALI", name: "Ayala Land", kind: "stock" },
  { id: "ac", symbol: "AC", label: "AC", name: "Ayala Corp", kind: "stock" },
  { id: "ict", symbol: "ICT", label: "ICT", name: "ICTSI", kind: "stock" },
  { id: "tel", symbol: "TEL", label: "TEL", name: "PLDT", kind: "stock" },
  { id: "glo", symbol: "GLO", label: "GLO", name: "Globe", kind: "stock" },
  { id: "mer", symbol: "MER", label: "MER", name: "Meralco", kind: "stock" },
  { id: "urc", symbol: "URC", label: "URC", name: "URC", kind: "stock" },
  { id: "mbt", symbol: "MBT", label: "MBT", name: "Metrobank", kind: "stock" },
  { id: "smc", symbol: "SMC", label: "SMC", name: "San Miguel", kind: "stock" },
  { id: "cnvrg", symbol: "CNVRG", label: "CNVRG", name: "Converge", kind: "stock" },
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
