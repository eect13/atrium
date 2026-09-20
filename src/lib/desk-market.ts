/** Home tape for the desk region. Philippines stays the factory PSE board.
 *  Other regions use Yahoo most-actives plus a short liquid seed — not a broker book. */

import { regionOf } from "./region.ts";
import { PSEI_SYMBOL } from "./yahoo.ts";
import { BLUECHIPS, type BoardRow, type TapeQuote } from "./market-board.ts";
import type { WatchItem, WatchKind } from "./types.ts";

export const NIFTY_SYMBOL = "^NSEI";

export type DeskName = { symbol: string; name: string; label?: string };

/** World indices the compare picker can take. Home index is the desk region; the other is this list. */
export const WORLD_INDICES: DeskName[] = [
  { symbol: PSEI_SYMBOL, name: "PSEi INDEX", label: "PSEi" },
  { symbol: NIFTY_SYMBOL, name: "Nifty 50", label: "Nifty" },
  { symbol: "^GSPC", name: "S&P 500", label: "S&P 500" },
  { symbol: "^IXIC", name: "Nasdaq Composite", label: "Nasdaq" },
  { symbol: "^DJI", name: "Dow Jones", label: "DJIA" },
  { symbol: "^HSI", name: "Hang Seng", label: "HSI" },
  { symbol: "^N225", name: "Nikkei 225", label: "Nikkei" },
  { symbol: "^FTSE", name: "FTSE 100", label: "FTSE" },
  { symbol: "^GDAXI", name: "DAX", label: "DAX" },
  { symbol: "^FCHI", name: "CAC 40", label: "CAC 40" },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50", label: "SX5E" },
  { symbol: "^AXJO", name: "S&P/ASX 200", label: "ASX 200" },
  { symbol: "^STI", name: "Straits Times", label: "STI" },
  { symbol: "^GSPTSE", name: "S&P/TSX", label: "TSX" },
  { symbol: "^KS11", name: "KOSPI", label: "KOSPI" },
  { symbol: "^VNINDEX", name: "VN-Index", label: "VN-Index" },
  { symbol: "^TWII", name: "TAIEX", label: "TAIEX" },
  { symbol: "^SET.BK", name: "SET Index", label: "SET" },
  { symbol: "^KLSE", name: "FTSE Bursa", label: "KLCI" },
  { symbol: "^JKSE", name: "Jakarta Composite", label: "JCI" },
  { symbol: "^NZ50", name: "S&P/NZX 50", label: "NZX 50" },
  { symbol: "^SSMI", name: "SMI", label: "SMI" },
  { symbol: "^BVSP", name: "Bovespa", label: "Bovespa" },
  { symbol: "^MXX", name: "S&P/BMV IPC", label: "IPC" },
  { symbol: "^J203.JO", name: "JSE Top 40", label: "JSE 40" },
  { symbol: "^DFMGI", name: "DFM General", label: "DFM" },
];

export function worldIndex(symbol: string): DeskName {
  return WORLD_INDICES.find((i) => i.symbol === symbol) ?? { symbol, name: symbol, label: symbol.replace(/^\^/, "") };
}

/** Default "other" index for a desk. PH vs Nifty; US vs Nasdaq; rest vs a regional peer or S&P. */
export function comparePeer(regionId?: string | null): string {
  const home = deskMarket(regionId).index.symbol;
  if (home === PSEI_SYMBOL) return NIFTY_SYMBOL;
  if (home === "^GSPC") return "^IXIC";
  if (home === NIFTY_SYMBOL) return "^GSPC";
  if (home === "^HSI") return "^N225";
  if (home === "^N225") return "^HSI";
  if (home === "^FTSE") return "^GDAXI";
  if (home === "^STI") return "^HSI";
  if (home === "^STOXX50E") return "^GSPC";
  if (home === "^VNINDEX") return "^STI";
  if (home === "^KS11") return "^TWII";
  if (home === "^TWII") return "^KS11";
  if (home === "^SET.BK" || home === "^KLSE" || home === "^JKSE") return "^STI";
  if (home === "^NZ50") return "^AXJO";
  if (home === "^SSMI") return "^GDAXI";
  return "^GSPC";
}

/** Picked compare index, never the home index. */
export function resolveCompare(regionId?: string | null, picked?: string | null): string {
  const home = deskMarket(regionId).index.symbol;
  const hit = WORLD_INDICES.find((i) => i.symbol === picked);
  if (hit && hit.symbol !== home) return hit.symbol;
  const peer = comparePeer(regionId);
  return peer === home ? "^GSPC" : peer;
}

export type DeskMarket = {
  id: string;
  name: string;
  /** Yahoo chart symbol for the home index. */
  index: DeskName;
  yahooRegion: string;
  newsQuery: string;
  newsLocale: string;
  /** Liquid names so All is not empty if the screener is thin. */
  names: DeskName[];
  /** PSE last still lives on this desk. Other regions are Yahoo. */
  pseHome: boolean;
  tape: string[];
};

const US_NAMES: DeskName[] = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "META", name: "Meta" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "BRK-B", name: "Berkshire Hathaway", label: "BRK.B" },
  { symbol: "JPM", name: "JPMorgan" },
  { symbol: "V", name: "Visa" },
  { symbol: "UNH", name: "UnitedHealth" },
  { symbol: "XOM", name: "Exxon Mobil" },
  { symbol: "LLY", name: "Eli Lilly" },
  { symbol: "AVGO", name: "Broadcom" },
  { symbol: "WMT", name: "Walmart" },
  { symbol: "JNJ", name: "Johnson & Johnson" },
];

const HK_NAMES: DeskName[] = [
  { symbol: "0700.HK", name: "Tencent", label: "0700" },
  { symbol: "9988.HK", name: "Alibaba", label: "9988" },
  { symbol: "3690.HK", name: "Meituan", label: "3690" },
  { symbol: "1299.HK", name: "AIA", label: "1299" },
  { symbol: "0939.HK", name: "CCB", label: "0939" },
  { symbol: "1398.HK", name: "ICBC", label: "1398" },
  { symbol: "0388.HK", name: "HKEX", label: "0388" },
  { symbol: "0005.HK", name: "HSBC", label: "0005" },
  { symbol: "2318.HK", name: "Ping An", label: "2318" },
  { symbol: "1810.HK", name: "Xiaomi", label: "1810" },
  { symbol: "9618.HK", name: "JD.com", label: "9618" },
  { symbol: "0941.HK", name: "China Mobile", label: "0941" },
];

const IN_NAMES: DeskName[] = [
  { symbol: "RELIANCE.NS", name: "Reliance", label: "RIL" },
  { symbol: "TCS.NS", name: "TCS", label: "TCS" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", label: "HDFCB" },
  { symbol: "INFY.NS", name: "Infosys", label: "INFY" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", label: "ICICIB" },
  { symbol: "SBIN.NS", name: "SBI", label: "SBIN" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", label: "BHARTI" },
  { symbol: "ITC.NS", name: "ITC", label: "ITC" },
  { symbol: "LT.NS", name: "Larsen & Toubro", label: "LT" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever", label: "HUL" },
  { symbol: "AXISBANK.NS", name: "Axis Bank", label: "AXIS" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance", label: "BAJFIN" },
];

const JP_NAMES: DeskName[] = [
  { symbol: "7203.T", name: "Toyota", label: "7203" },
  { symbol: "6758.T", name: "Sony", label: "6758" },
  { symbol: "9984.T", name: "SoftBank", label: "9984" },
  { symbol: "8306.T", name: "MUFG", label: "8306" },
  { symbol: "6861.T", name: "Keyence", label: "6861" },
  { symbol: "6098.T", name: "Recruit", label: "6098" },
  { symbol: "4063.T", name: "Shin-Etsu", label: "4063" },
  { symbol: "8035.T", name: "Tokyo Electron", label: "8035" },
  { symbol: "9432.T", name: "NTT", label: "9432" },
  { symbol: "7267.T", name: "Honda", label: "7267" },
  { symbol: "7974.T", name: "Nintendo", label: "7974" },
  { symbol: "9983.T", name: "Fast Retailing", label: "9983" },
];

const SG_NAMES: DeskName[] = [
  { symbol: "D05.SI", name: "DBS", label: "D05" },
  { symbol: "O39.SI", name: "OCBC", label: "O39" },
  { symbol: "U11.SI", name: "UOB", label: "U11" },
  { symbol: "Z74.SI", name: "Singtel", label: "Z74" },
  { symbol: "C6L.SI", name: "SIA", label: "C6L" },
  { symbol: "BN4.SI", name: "Keppel", label: "BN4" },
  { symbol: "S63.SI", name: "ST Engineering", label: "S63" },
  { symbol: "C07.SI", name: "Jardine C&C", label: "C07" },
];

const GB_NAMES: DeskName[] = [
  { symbol: "SHEL.L", name: "Shell", label: "SHEL" },
  { symbol: "AZN.L", name: "AstraZeneca", label: "AZN" },
  { symbol: "HSBA.L", name: "HSBC", label: "HSBA" },
  { symbol: "ULVR.L", name: "Unilever", label: "ULVR" },
  { symbol: "BP.L", name: "BP", label: "BP" },
  { symbol: "GSK.L", name: "GSK", label: "GSK" },
  { symbol: "DGE.L", name: "Diageo", label: "DGE" },
  { symbol: "RIO.L", name: "Rio Tinto", label: "RIO" },
  { symbol: "LLOY.L", name: "Lloyds", label: "LLOY" },
  { symbol: "BATS.L", name: "BAT", label: "BATS" },
];

const AU_NAMES: DeskName[] = [
  { symbol: "BHP.AX", name: "BHP", label: "BHP" },
  { symbol: "CBA.AX", name: "Commonwealth Bank", label: "CBA" },
  { symbol: "CSL.AX", name: "CSL", label: "CSL" },
  { symbol: "NAB.AX", name: "NAB", label: "NAB" },
  { symbol: "WBC.AX", name: "Westpac", label: "WBC" },
  { symbol: "ANZ.AX", name: "ANZ", label: "ANZ" },
  { symbol: "WES.AX", name: "Wesfarmers", label: "WES" },
  { symbol: "MQG.AX", name: "Macquarie", label: "MQG" },
];

const CA_NAMES: DeskName[] = [
  { symbol: "RY.TO", name: "RBC", label: "RY" },
  { symbol: "TD.TO", name: "TD", label: "TD" },
  { symbol: "ENB.TO", name: "Enbridge", label: "ENB" },
  { symbol: "SHOP.TO", name: "Shopify", label: "SHOP" },
  { symbol: "CNR.TO", name: "CN Rail", label: "CNR" },
  { symbol: "BMO.TO", name: "BMO", label: "BMO" },
  { symbol: "CNQ.TO", name: "Canadian Natural", label: "CNQ" },
  { symbol: "SU.TO", name: "Suncor", label: "SU" },
];


const VN_NAMES: DeskName[] = [
  { symbol: "VNM.VN", name: "Vinamilk", label: "VNM" },
  { symbol: "VIC.VN", name: "Vingroup", label: "VIC" },
  { symbol: "VHM.VN", name: "Vinhomes", label: "VHM" },
  { symbol: "VCB.VN", name: "Vietcombank", label: "VCB" },
  { symbol: "HPG.VN", name: "Hoa Phat", label: "HPG" },
  { symbol: "GAS.VN", name: "PetroVietnam Gas", label: "GAS" },
  { symbol: "MSN.VN", name: "Masan", label: "MSN" },
  { symbol: "BID.VN", name: "BIDV", label: "BID" },
  { symbol: "FPT.VN", name: "FPT", label: "FPT" },
  { symbol: "VRE.VN", name: "Vincom Retail", label: "VRE" },
];

const TH_NAMES: DeskName[] = [
  { symbol: "PTT.BK", name: "PTT", label: "PTT" },
  { symbol: "AOT.BK", name: "Airports of Thailand", label: "AOT" },
  { symbol: "CPALL.BK", name: "CP All", label: "CPALL" },
  { symbol: "ADVANC.BK", name: "AIS", label: "ADVANC" },
  { symbol: "KBANK.BK", name: "Kasikornbank", label: "KBANK" },
  { symbol: "BDMS.BK", name: "Bangkok Dusit", label: "BDMS" },
];

const MY_NAMES: DeskName[] = [
  { symbol: "1155.KL", name: "Maybank", label: "MAYBANK" },
  { symbol: "1023.KL", name: "CIMB", label: "CIMB" },
  { symbol: "5347.KL", name: "Tenaga", label: "TENAGA" },
  { symbol: "5183.KL", name: "Petronas Chemicals", label: "PCHEM" },
  { symbol: "1295.KL", name: "Public Bank", label: "PBBANK" },
];

const ID_NAMES: DeskName[] = [
  { symbol: "BBCA.JK", name: "Bank Central Asia", label: "BBCA" },
  { symbol: "BBRI.JK", name: "Bank Rakyat", label: "BBRI" },
  { symbol: "TLKM.JK", name: "Telkom Indonesia", label: "TLKM" },
  { symbol: "BMRI.JK", name: "Bank Mandiri", label: "BMRI" },
  { symbol: "ASII.JK", name: "Astra International", label: "ASII" },
];

const KR_NAMES: DeskName[] = [
  { symbol: "005930.KS", name: "Samsung Electronics", label: "005930" },
  { symbol: "000660.KS", name: "SK Hynix", label: "000660" },
  { symbol: "035420.KS", name: "Naver", label: "035420" },
  { symbol: "035720.KS", name: "Kakao", label: "035720" },
  { symbol: "005380.KS", name: "Hyundai Motor", label: "005380" },
];

const TW_NAMES: DeskName[] = [
  { symbol: "2330.TW", name: "TSMC", label: "2330" },
  { symbol: "2317.TW", name: "Hon Hai", label: "2317" },
  { symbol: "2454.TW", name: "MediaTek", label: "2454" },
  { symbol: "2308.TW", name: "Delta Electronics", label: "2308" },
];

const NZ_NAMES: DeskName[] = [
  { symbol: "FPH.NZ", name: "Fisher & Paykel", label: "FPH" },
  { symbol: "AIA.NZ", name: "Auckland Airport", label: "AIA" },
  { symbol: "SPK.NZ", name: "Spark", label: "SPK" },
  { symbol: "MEL.NZ", name: "Meridian Energy", label: "MEL" },
];

const CH_NAMES: DeskName[] = [
  { symbol: "NESN.SW", name: "Nestle", label: "NESN" },
  { symbol: "ROG.SW", name: "Roche", label: "ROG" },
  { symbol: "NOVN.SW", name: "Novartis", label: "NOVN" },
  { symbol: "UBSG.SW", name: "UBS", label: "UBSG" },
];

const BR_NAMES: DeskName[] = [
  { symbol: "PETR4.SA", name: "Petrobras", label: "PETR4" },
  { symbol: "VALE3.SA", name: "Vale", label: "VALE3" },
  { symbol: "ITUB4.SA", name: "Itau Unibanco", label: "ITUB4" },
  { symbol: "BBDC4.SA", name: "Bradesco", label: "BBDC4" },
];

const MX_NAMES: DeskName[] = [
  { symbol: "AMXB.MX", name: "America Movil", label: "AMXB" },
  { symbol: "WALMEX.MX", name: "Walmart de Mexico", label: "WALMEX" },
  { symbol: "GFNORTEO.MX", name: "Banorte", label: "GFNORTEO" },
  { symbol: "FEMSAUBD.MX", name: "Femsa", label: "FEMSA" },
];

const ZA_NAMES: DeskName[] = [
  { symbol: "NPN.JO", name: "Naspers", label: "NPN" },
  { symbol: "FSR.JO", name: "FirstRand", label: "FSR" },
  { symbol: "SBK.JO", name: "Standard Bank", label: "SBK" },
  { symbol: "SOL.JO", name: "Sasol", label: "SOL" },
];

const AE_NAMES: DeskName[] = [
  { symbol: "EMAAR.AE", name: "Emaar", label: "EMAAR" },
  { symbol: "FAB.AE", name: "First Abu Dhabi Bank", label: "FAB" },
  { symbol: "ADNOCDIST.AE", name: "ADNOC Distribution", label: "ADNOCDIST" },
];

const EU_NAMES: DeskName[] = [
  { symbol: "ASML", name: "ASML" },
  { symbol: "SAP.DE", name: "SAP", label: "SAP" },
  { symbol: "SIE.DE", name: "Siemens", label: "SIE" },
  { symbol: "ALV.DE", name: "Allianz", label: "ALV" },
  { symbol: "AIR.PA", name: "Airbus", label: "AIR" },
  { symbol: "MC.PA", name: "LVMH", label: "MC" },
  { symbol: "OR.PA", name: "L'Oreal", label: "OR" },
  { symbol: "TTE.PA", name: "TotalEnergies", label: "TTE" },
  { symbol: "SAN.PA", name: "Sanofi", label: "SAN" },
];

const MARKETS: Record<string, Omit<DeskMarket, "id" | "name" | "yahooRegion">> = {
  PH: {
    index: { symbol: PSEI_SYMBOL, name: "PSEi INDEX", label: "PSEi" },
    newsQuery: 'PSEi OR "Philippine Stock Exchange" OR PSE OR "Manila shares"',
    newsLocale: "hl=en-PH&gl=PH&ceid=PH:en",
    names: [],
    pseHome: true,
    tape: [PSEI_SYMBOL, "BDO", "ICT", "SM", "^GSPC", NIFTY_SYMBOL, "GC=F"],
  },
  US: {
    index: { symbol: "^GSPC", name: "S&P 500", label: "S&P 500" },
    newsQuery: '"S&P 500" OR Nasdaq OR "Wall Street" OR "US stocks"',
    newsLocale: "hl=en&gl=US&ceid=US:en",
    names: US_NAMES,
    pseHome: false,
    tape: ["^GSPC", "^IXIC", "AAPL", "NVDA", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  HK: {
    index: { symbol: "^HSI", name: "Hang Seng", label: "HSI" },
    newsQuery: '"Hang Seng" OR HKEX OR "Hong Kong stocks"',
    newsLocale: "hl=en&gl=HK&ceid=HK:en",
    names: HK_NAMES,
    pseHome: false,
    tape: ["^HSI", "0700.HK", "9988.HK", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  IN: {
    index: { symbol: NIFTY_SYMBOL, name: "Nifty 50", label: "Nifty" },
    newsQuery: '"Nifty 50" OR NSE OR "Indian stocks" OR Sensex',
    newsLocale: "hl=en-IN&gl=IN&ceid=IN:en",
    names: IN_NAMES,
    pseHome: false,
    tape: [NIFTY_SYMBOL, "RELIANCE.NS", "TCS.NS", PSEI_SYMBOL, "^GSPC", "GC=F"],
  },
  JP: {
    index: { symbol: "^N225", name: "Nikkei 225", label: "Nikkei" },
    newsQuery: '"Nikkei" OR "Tokyo stocks" OR TSE',
    newsLocale: "hl=en&gl=JP&ceid=JP:en",
    names: JP_NAMES,
    pseHome: false,
    tape: ["^N225", "7203.T", "6758.T", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  SG: {
    index: { symbol: "^STI", name: "Straits Times", label: "STI" },
    newsQuery: '"Straits Times Index" OR "Singapore stocks" OR SGX',
    newsLocale: "hl=en-SG&gl=SG&ceid=SG:en",
    names: SG_NAMES,
    pseHome: false,
    tape: ["^STI", "D05.SI", "O39.SI", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  GB: {
    index: { symbol: "^FTSE", name: "FTSE 100", label: "FTSE" },
    newsQuery: '"FTSE 100" OR "London stocks" OR LSE',
    newsLocale: "hl=en-GB&gl=GB&ceid=GB:en",
    names: GB_NAMES,
    pseHome: false,
    tape: ["^FTSE", "SHEL.L", "AZN.L", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  AU: {
    index: { symbol: "^AXJO", name: "S&P/ASX 200", label: "ASX 200" },
    newsQuery: '"ASX 200" OR "Australian stocks" OR ASX',
    newsLocale: "hl=en-AU&gl=AU&ceid=AU:en",
    names: AU_NAMES,
    pseHome: false,
    tape: ["^AXJO", "BHP.AX", "CBA.AX", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  CA: {
    index: { symbol: "^GSPTSE", name: "S&P/TSX", label: "TSX" },
    newsQuery: '"TSX" OR "Canadian stocks" OR "Toronto stocks"',
    newsLocale: "hl=en-CA&gl=CA&ceid=CA:en",
    names: CA_NAMES,
    pseHome: false,
    tape: ["^GSPTSE", "RY.TO", "SHOP.TO", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },
  EU: {
    index: { symbol: "^STOXX50E", name: "Euro Stoxx 50", label: "SX5E" },
    newsQuery: '"Euro Stoxx" OR DAX OR "European stocks"',
    newsLocale: "hl=en&gl=DE&ceid=DE:en",
    names: EU_NAMES,
    pseHome: false,
    tape: ["^STOXX50E", "^GDAXI", "ASML", PSEI_SYMBOL, NIFTY_SYMBOL, "GC=F"],
  },

  VN: {
    index: { symbol: "^VNINDEX", name: "VN-Index", label: "VN-Index" },
    newsQuery: '"VN-Index" OR "Ho Chi Minh stocks" OR HOSE OR "Vietnam stocks"',
    newsLocale: "hl=en&gl=VN&ceid=VN:en",
    names: VN_NAMES,
    pseHome: false,
    tape: ["^VNINDEX", "VNM.VN", "VIC.VN", PSEI_SYMBOL, "^STI", "GC=F"],
  },
  TH: {
    index: { symbol: "^SET.BK", name: "SET Index", label: "SET" },
    newsQuery: '"SET Index" OR "Thai stocks" OR "Bangkok stocks"',
    newsLocale: "hl=en&gl=TH&ceid=TH:en",
    names: TH_NAMES,
    pseHome: false,
    tape: ["^SET.BK", "PTT.BK", "AOT.BK", PSEI_SYMBOL, "^STI", "GC=F"],
  },
  MY: {
    index: { symbol: "^KLSE", name: "FTSE Bursa", label: "KLCI" },
    newsQuery: '"KLCI" OR "Bursa Malaysia" OR "Malaysian stocks"',
    newsLocale: "hl=en&gl=MY&ceid=MY:en",
    names: MY_NAMES,
    pseHome: false,
    tape: ["^KLSE", "1155.KL", "1023.KL", PSEI_SYMBOL, "^STI", "GC=F"],
  },
  ID: {
    index: { symbol: "^JKSE", name: "Jakarta Composite", label: "JCI" },
    newsQuery: '"Jakarta Composite" OR "Indonesian stocks" OR IDX',
    newsLocale: "hl=en&gl=ID&ceid=ID:en",
    names: ID_NAMES,
    pseHome: false,
    tape: ["^JKSE", "BBCA.JK", "TLKM.JK", PSEI_SYMBOL, "^STI", "GC=F"],
  },
  KR: {
    index: { symbol: "^KS11", name: "KOSPI", label: "KOSPI" },
    newsQuery: "KOSPI OR \"Korean stocks\" OR \"Seoul stocks\"",
    newsLocale: "hl=en&gl=KR&ceid=KR:en",
    names: KR_NAMES,
    pseHome: false,
    tape: ["^KS11", "005930.KS", "000660.KS", PSEI_SYMBOL, "^TWII", "GC=F"],
  },
  TW: {
    index: { symbol: "^TWII", name: "TAIEX", label: "TAIEX" },
    newsQuery: "TAIEX OR \"Taiwan stocks\" OR TSMC",
    newsLocale: "hl=en&gl=TW&ceid=TW:en",
    names: TW_NAMES,
    pseHome: false,
    tape: ["^TWII", "2330.TW", "2317.TW", PSEI_SYMBOL, "^KS11", "GC=F"],
  },
  NZ: {
    index: { symbol: "^NZ50", name: "S&P/NZX 50", label: "NZX 50" },
    newsQuery: '"NZX 50" OR "New Zealand stocks" OR NZX',
    newsLocale: "hl=en-NZ&gl=NZ&ceid=NZ:en",
    names: NZ_NAMES,
    pseHome: false,
    tape: ["^NZ50", "FPH.NZ", "AIA.NZ", PSEI_SYMBOL, "^AXJO", "GC=F"],
  },
  CH: {
    index: { symbol: "^SSMI", name: "SMI", label: "SMI" },
    newsQuery: '"Swiss Market Index" OR "Swiss stocks" OR SMI',
    newsLocale: "hl=en&gl=CH&ceid=CH:en",
    names: CH_NAMES,
    pseHome: false,
    tape: ["^SSMI", "NESN.SW", "ROG.SW", PSEI_SYMBOL, "^GDAXI", "GC=F"],
  },
  BR: {
    index: { symbol: "^BVSP", name: "Bovespa", label: "Bovespa" },
    newsQuery: "Bovespa OR \"Brazilian stocks\" OR Ibovespa",
    newsLocale: "hl=en&gl=BR&ceid=BR:en",
    names: BR_NAMES,
    pseHome: false,
    tape: ["^BVSP", "PETR4.SA", "VALE3.SA", PSEI_SYMBOL, "^GSPC", "GC=F"],
  },
  MX: {
    index: { symbol: "^MXX", name: "S&P/BMV IPC", label: "IPC" },
    newsQuery: '"Mexican stocks" OR BMV OR "IPC index"',
    newsLocale: "hl=en&gl=MX&ceid=MX:en",
    names: MX_NAMES,
    pseHome: false,
    tape: ["^MXX", "AMXB.MX", "WALMEX.MX", PSEI_SYMBOL, "^GSPC", "GC=F"],
  },
  ZA: {
    index: { symbol: "^J203.JO", name: "JSE Top 40", label: "JSE 40" },
    newsQuery: '"JSE" OR "South African stocks" OR Johannesburg',
    newsLocale: "hl=en&gl=ZA&ceid=ZA:en",
    names: ZA_NAMES,
    pseHome: false,
    tape: ["^J203.JO", "NPN.JO", "FSR.JO", PSEI_SYMBOL, "^GSPC", "GC=F"],
  },
  AE: {
    index: { symbol: "^DFMGI", name: "DFM General", label: "DFM" },
    newsQuery: '"Dubai stocks" OR DFM OR "Abu Dhabi stocks" OR ADX',
    newsLocale: "hl=en&gl=AE&ceid=AE:en",
    names: AE_NAMES,
    pseHome: false,
    tape: ["^DFMGI", "EMAAR.AE", "FAB.AE", PSEI_SYMBOL, "^GSPC", "GC=F"],
  },
};

export function deskMarket(regionId?: string | null): DeskMarket {
  const r = regionOf(regionId);
  const spec = MARKETS[r.id] ?? MARKETS.PH!;
  return {
    id: r.id,
    name: r.name,
    yahooRegion: r.yahoo,
    ...spec,
  };
}

export function deskYahooSymbols(regionId?: string | null): string[] {
  const m = deskMarket(regionId);
  return [
    ...new Set([...WORLD_INDICES.map((n) => n.symbol), m.index.symbol, ...m.tape, ...m.names.map((n) => n.symbol)]),
  ].filter(yahooTapeSymbol);
}

/** Yahoo last for SM is SM Energy, not SM Investments. Bare PSEi names stay on the PSE tape. */
export function yahooTapeSymbol(symbol: string): boolean {
  const s = symbol.trim();
  if (!s) return false;
  if (/^PSEI(\.PS)?$/i.test(s)) return true;
  if (/\.PS$/i.test(s)) return false;
  const bare = s.replace(/\.PS$/i, "").toUpperCase();
  if (BLUECHIPS.has(bare)) return false;
  return true;
}

export function asDeskItem(name: DeskName, kind: WatchItem["kind"] = "global"): WatchItem {
  return {
    id: `yh-${name.symbol}`,
    symbol: name.symbol,
    label: name.label ?? name.symbol.replace(/\.[A-Z]{1,2}$/i, ""),
    name: name.name,
    kind,
  };
}

export function homeBoardRows(
  quotes: Record<string, TapeQuote | undefined>,
  live: Array<{
    id: string;
    label: string;
    name?: string;
    kind: WatchKind;
    price: number;
    change?: number;
    ccy: string;
    volume?: number;
    pe?: number;
    marketCap?: number;
    yieldPct?: number;
  }> | undefined,
  market: DeskMarket,
  isWatching: (item: WatchItem) => boolean,
): BoardRow[] {
  if (market.pseHome) return [];
  const seen = new Set<string>();
  const out: BoardRow[] = [];
  const push = (item: WatchItem, q?: TapeQuote) => {
    const key = item.symbol.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key: item.id, item, q: q ?? quotes[item.symbol], watching: isWatching(item) });
  };
  if (live?.length) {
    for (const q of live) {
      if (q.kind === "crypto" || q.kind === "fx") continue;
      if (!isHomeSymbol(q.id, market.id)) continue;
      const seed = market.names.find((n) => n.symbol === q.id);
      push(
        {
          id: q.id,
          symbol: q.id,
          label: seed?.label ?? q.label,
          name: seed?.name ?? q.name,
          kind: q.kind,
        },
        q,
      );
    }
  }
  for (const n of market.names) push(asDeskItem(n), quotes[n.symbol]);
  return out;
}

export function digestUrl(regionId?: string | null, window: "1d" | "7d" = "1d") {
  const m = deskMarket(regionId);
  const q = `${m.newsQuery} when:${window}`.replace(/\s+/g, " ").trim();
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${m.newsLocale}`;
}

/** Yahoo most-actives often ignores region and dumps US names. Keep the home exchange. */
export function isHomeSymbol(symbol: string, regionId?: string | null) {
  const id = (regionId ?? "PH").toUpperCase();
  const s = symbol.trim();
  if (id === "US") return !/\.(HK|NS|BO|T|SI|L|AX|TO|DE|PA|VN|HM|KS|KQ|TW|BK|KL|JK|NZ|SW|SA|MX|JO|AE|DU|AD)$/i.test(s);
  if (id === "HK") return /\.HK$/i.test(s);
  if (id === "IN") return /\.(NS|BO)$/i.test(s);
  if (id === "JP") return /\.T$/i.test(s);
  if (id === "SG") return /\.SI$/i.test(s);
  if (id === "GB") return /\.L$/i.test(s);
  if (id === "AU") return /\.AX$/i.test(s);
  if (id === "CA") return /\.(TO|V)$/i.test(s);
  if (id === "EU") return /\.(DE|PA)$/i.test(s) || /^(ASML|SAP|SIE)$/i.test(s);
  if (id === "VN") return /\.(VN|HM)$/i.test(s);
  if (id === "TH") return /\.BK$/i.test(s);
  if (id === "MY") return /\.KL$/i.test(s);
  if (id === "ID") return /\.JK$/i.test(s);
  if (id === "KR") return /\.(KS|KQ)$/i.test(s);
  if (id === "TW") return /\.TW$/i.test(s);
  if (id === "NZ") return /\.NZ$/i.test(s);
  if (id === "CH") return /\.SW$/i.test(s);
  if (id === "BR") return /\.SA$/i.test(s);
  if (id === "MX") return /\.MX$/i.test(s);
  if (id === "ZA") return /\.JO$/i.test(s);
  if (id === "AE") return /\.(AE|DU|AD)$/i.test(s);
  return true;
}
