import { addDays, inferCcy, isoDate, normalizeCcy, uid } from "./format.ts";
import type { Account, AccountKind, BookCcy, Books, Budget, Tx, TxKind, TxStatus } from "./types.ts";

export const BOOKS_SNAP_KEY = "atrium.books.snap";
export const BOOKS_KIND = "atrium.books" as const;

export type BooksFile = {
  kind: typeof BOOKS_KIND;
  version: 1;
  savedAt: string;
  books: Books;
  accounts: Account[];
  budgets: Budget[];
  txs: Tx[];
};

export type RegisterFilter = {
  accountId: string | "all";
  range: "month" | "year" | "all";
  flow: "all" | "in" | "out";
  query: string;
  month: string;
  year: string;
};

export type RegisterRow = {
  tx: Tx;
  inAmt: number;
  outAmt: number;
  balance: number | null;
  effect: number;
};

export function digits4(raw: string | undefined): string | undefined {
  const d = digitsOnly(raw).slice(-4);
  return d.length ? d : undefined;
}

export function digitsOnly(raw: string | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function groupedDigits(raw: string | undefined): string {
  const d = digitsOnly(raw);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function formatExpiryInput(raw: string | undefined): string {
  const d = digitsOnly(raw).slice(0, 4);
  if (!d) return "";
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

export function accountDigits(a: Pick<Account, "number" | "last4">): string {
  return digitsOnly(a.number) || digitsOnly(a.last4);
}

export function numberLabel(a: Account, forceHide = false): string {
  if (a.kind === "cash") return a.currency ?? "PHP";
  const d = accountDigits(a);
  if (!d) return "";
  if (forceHide || a.hideNumber !== false) return `•••• ${d.slice(-4)}`;
  return groupedDigits(d);
}

export function inferAccountKind(a: { id?: string; name?: string; kind?: AccountKind }): AccountKind {
  if (a.kind === "cash" || a.kind === "bank" || a.kind === "card" || a.kind === "ewallet") return a.kind;
  const hay = `${a.id ?? ""} ${a.name ?? ""}`.toLowerCase();
  if (/\bcard\b|\bvisa\b|\bmastercard\b|\bcvc\b/.test(hay)) return "card";
  if (/\bgcash\b|\bmaya\b|\bwallet\b|\bpocket\b/.test(hay)) return "ewallet";
  if (/\bcash\b/.test(hay)) return "cash";
  return "bank";
}

export function txKindOf(t: Tx): TxKind {
  if (t.kind === "expense" || t.kind === "income" || t.kind === "transfer" || t.kind === "deposit") {
    return t.kind;
  }
  return t.amount < 0 ? "expense" : "income";
}

export function txStatusOf(t: Tx): TxStatus {
  return t.status === "pending" ? "pending" : "cleared";
}

export function signedAmount(kind: TxKind, raw: number): number {
  const n = Math.abs(Number(raw));
  if (!Number.isFinite(n)) return 0;
  if (kind === "expense" || kind === "transfer") return -n;
  return n;
}

export function liquidEffect(t: Tx): number {
  return txKindOf(t) === "transfer" ? 0 : t.amount;
}

export function effectOnAccount(t: Tx, accountId: string): number {
  if (txKindOf(t) === "transfer" && t.transferToId) {
    if (t.accountId === accountId) return -Math.abs(t.amount);
    if (t.transferToId === accountId) return Math.abs(t.amount);
    return 0;
  }
  return (t.accountId ?? "") === accountId ? t.amount : 0;
}

export function applyTx(accounts: Account[], t: Tx, sign: 1 | -1): Account[] {
  return accounts.map((a) => {
    const d = effectOnAccount(t, a.id);
    return d ? { ...a, balance: a.balance + d * sign } : a;
  });
}

export function normalizeAccount(raw: unknown, fallbackIndex = 0): Account | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id ? o.id : `acct-${fallbackIndex}`;
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : "Account";
  const balance = Number(o.balance);
  const number = digitsOnly(typeof o.number === "string" ? o.number : "");
  const last4 = digits4(number || (typeof o.last4 === "string" ? o.last4 : ""));
  const expiry = formatExpiryInput(typeof o.expiry === "string" ? o.expiry : "");
  const cvc = digitsOnly(typeof o.cvc === "string" ? o.cvc : "").slice(0, 4);
  const kind = inferAccountKind({ id, name, kind: o.kind as AccountKind | undefined });
  const currency: BookCcy = normalizeCcy(o.currency, inferCcy(`${id} ${name}`));
  return {
    id,
    name,
    balance: Number.isFinite(balance) ? balance : 0,
    kind,
    currency,
    ...(number ? { number } : {}),
    ...(last4 ? { last4 } : {}),
    ...(expiry ? { expiry } : {}),
    ...(cvc ? { cvc } : {}),
    ...(o.hidden === true ? { hidden: true } : {}),
    ...(kind !== "cash" ? { hideNumber: o.hideNumber === false ? false : true } : {}),
  };
}

export function normalizeTx(raw: unknown, fallbackIndex = 0): Tx | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const amount = Number(o.amount);
  if (!Number.isFinite(amount) || amount === 0) return null;
  const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(o.date) ? o.date.slice(0, 10) : isoDate();
  const tx: Tx = {
    id: typeof o.id === "string" && o.id ? o.id : `tx-${fallbackIndex}`,
    date,
    payee: typeof o.payee === "string" && o.payee.trim() ? o.payee.trim() : "Entry",
    amount,
    cat: typeof o.cat === "string" && o.cat ? o.cat : "other",
  };
  if (typeof o.accountId === "string") tx.accountId = o.accountId;
  if (typeof o.memo === "string" && o.memo.trim()) tx.memo = o.memo.trim();
  if (o.kind === "expense" || o.kind === "income" || o.kind === "transfer" || o.kind === "deposit") {
    tx.kind = o.kind;
  }
  if (o.status === "pending" || o.status === "cleared") tx.status = o.status;
  if (typeof o.transferToId === "string" && o.transferToId) tx.transferToId = o.transferToId;
  return tx;
}

export function normalizeBooks(raw: unknown, fallbackName = "Personal books"): Books {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : fallbackName;
  const density: Books["density"] = o.density === "compact" ? "compact" : "comfortable";
  return { name, density, mask: o.mask === true, currency: normalizeCcy(o.currency) };
}

export function normalizeBudget(raw: unknown, fallbackIndex = 0): Budget | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const limit = Number(o.limit);
  return {
    id: typeof o.id === "string" && o.id ? o.id : `b-${fallbackIndex}`,
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : "Budget",
    limit: Number.isFinite(limit) ? limit : 0,
  };
}

export function demoBooks(profileName = "Eric"): Pick<BooksFile, "books" | "accounts" | "budgets" | "txs"> {
  const now = new Date();
  const today = isoDate(now);
  return {
    books: { name: `${profileName} — personal books`, density: "comfortable", currency: "PHP" },
    accounts: [
      { id: "cash", name: "Cash", balance: 8500, kind: "cash", currency: "PHP" },
      { id: "bank", name: "BDO checking", balance: 126400, kind: "bank", last4: "1904", currency: "PHP" },
      { id: "gcash", name: "GCash", balance: 4320, kind: "ewallet", last4: "8832", currency: "PHP" },
    ],
    budgets: [
      { id: "food", name: "Food", limit: 15000 },
      { id: "trans", name: "Transport", limit: 4000 },
      { id: "bills", name: "Bills", limit: 18000 },
      { id: "fun", name: "Discretionary", limit: 6000 },
    ],
    txs: [
      {
        id: uid(),
        date: today,
        payee: "Grocery — S&R",
        amount: -2850,
        cat: "food",
        accountId: "cash",
        kind: "expense",
        status: "cleared",
        memo: "Weekly run",
      },
      {
        id: uid(),
        date: today,
        payee: "Salary",
        amount: 72000,
        cat: "income",
        accountId: "bank",
        kind: "income",
        status: "cleared",
      },
      {
        id: uid(),
        date: isoDate(addDays(now, -1)),
        payee: "Grab",
        amount: -248,
        cat: "trans",
        accountId: "gcash",
        kind: "expense",
        status: "pending",
        memo: "Home from BGC",
      },
      {
        id: uid(),
        date: isoDate(addDays(now, -2)),
        payee: "Meralco",
        amount: -4200,
        cat: "bills",
        accountId: "bank",
        kind: "expense",
        status: "cleared",
      },
      {
        id: uid(),
        date: isoDate(addDays(now, -3)),
        payee: "Transfer to GCash",
        amount: -2000,
        cat: "other",
        accountId: "bank",
        transferToId: "gcash",
        kind: "transfer",
        status: "cleared",
        memo: "Wallet top-up",
      },
    ],
  };
}

export function emptyBooks(name: string): Pick<BooksFile, "books" | "accounts" | "budgets" | "txs"> {
  return {
    books: { name, density: "comfortable", currency: "PHP" },
    accounts: [{ id: "cash", name: "Cash", balance: 0, kind: "cash", currency: "PHP" }],
    budgets: [
      { id: "food", name: "Food", limit: 15000 },
      { id: "trans", name: "Transport", limit: 4000 },
      { id: "bills", name: "Bills", limit: 18000 },
      { id: "fun", name: "Discretionary", limit: 6000 },
    ],
    txs: [],
  };
}

export function toBooksFile(
  slice: Pick<BooksFile, "books" | "accounts" | "budgets" | "txs">,
  savedAt = new Date().toISOString(),
): BooksFile {
  return { kind: BOOKS_KIND, version: 1, savedAt, ...slice };
}

function looksLikeFinanceManager(o: Record<string, unknown>) {
  return Boolean(
    (o.settings && typeof o.settings === "object") ||
      Array.isArray(o.banks) ||
      Array.isArray(o.invoices) ||
      Array.isArray(o.receipts),
  );
}

export function parseBooksFile(text: string): BooksFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not JSON.");
  }
  if (!raw || typeof raw !== "object") throw new Error("Not an Atrium books file.");
  const root = raw as Record<string, unknown>;
  if (looksLikeFinanceManager(root) && root.kind !== BOOKS_KIND) {
    throw new Error("That file is a Finance Manager company, not an Atrium books file.");
  }
  const state =
    root.state && typeof root.state === "object" ? (root.state as Record<string, unknown>) : root;
  const accounts = Array.isArray(state.accounts)
    ? state.accounts.map(normalizeAccount).filter((a): a is Account => Boolean(a))
    : [];
  const txs = Array.isArray(state.txs)
    ? state.txs.map(normalizeTx).filter((t): t is Tx => Boolean(t))
    : [];
  if (!accounts.length && !txs.length) throw new Error("No accounts or register lines in that file.");
  const budgets = Array.isArray(state.budgets)
    ? state.budgets.map(normalizeBudget).filter((b): b is Budget => Boolean(b))
    : [];
  const books = normalizeBooks(state.books, "Personal books");
  const savedAt = typeof root.savedAt === "string" ? root.savedAt : new Date().toISOString();
  return {
    kind: BOOKS_KIND,
    version: 1,
    savedAt,
    books,
    accounts: accounts.length ? accounts : emptyBooks(books.name).accounts,
    budgets: budgets.length ? budgets : emptyBooks(books.name).budgets,
    txs,
  };
}

export function readBooksSnap(): BooksFile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOOKS_SNAP_KEY);
    if (!raw) return null;
    return parseBooksFile(raw);
  } catch {
    return null;
  }
}

export function writeBooksSnap(file: BooksFile) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(BOOKS_SNAP_KEY, JSON.stringify(file));
  } catch {
    /* quota */
  }
}

export function inRange(date: string, filter: RegisterFilter) {
  if (filter.range === "month") return date.startsWith(filter.month);
  if (filter.range === "year") return date.startsWith(filter.year);
  return true;
}

export function registerRows(
  txs: Tx[],
  accounts: Account[],
  filter: RegisterFilter,
): RegisterRow[] {
  const names = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const q = filter.query.trim().toLowerCase();
  const scoped = txs
    .slice()
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const effectOf = (t: Tx) =>
    filter.accountId === "all" ? liquidEffect(t) : effectOnAccount(t, filter.accountId);

  const relevant = scoped.filter((t) => (filter.accountId === "all" ? true : effectOf(t) !== 0));
  const opening =
    filter.accountId === "all"
      ? accounts.reduce((s, a) => s + a.balance, 0) - relevant.reduce((s, t) => s + effectOf(t), 0)
      : (accounts.find((a) => a.id === filter.accountId)?.balance ?? 0) -
        relevant.reduce((s, t) => s + effectOf(t), 0);

  let running = opening;
  const rows: RegisterRow[] = [];
  for (const tx of relevant) {
    const run = effectOf(tx);
    running += run;
    const shown =
      filter.accountId === "all" && txKindOf(tx) === "transfer" ? -Math.abs(tx.amount) : run;
    const hay = `${tx.payee} ${tx.memo ?? ""} ${tx.cat} ${tx.accountId ? names[tx.accountId] ?? "" : ""}`.toLowerCase();
    if (q && !hay.includes(q)) continue;
    if (!inRange(tx.date, filter)) continue;
    if (filter.flow === "in" && shown <= 0) continue;
    if (filter.flow === "out" && shown >= 0) continue;
    rows.push({
      tx,
      effect: shown,
      inAmt: shown > 0 ? shown : 0,
      outAmt: shown < 0 ? Math.abs(shown) : 0,
      balance: running,
    });
  }
  return rows.toReversed();
}

export function registerCsv(rows: RegisterRow[], accounts: Account[]) {
  const names = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lines = [
    "Date,Payee,Memo,Type,Account,In,Out,Balance,Status,Category",
    ...rows.map((r) =>
      [
        r.tx.date,
        esc(r.tx.payee),
        esc(r.tx.memo ?? ""),
        txKindOf(r.tx),
        esc(r.tx.accountId ? (names[r.tx.accountId] ?? r.tx.accountId) : ""),
        r.inAmt || "",
        r.outAmt || "",
        r.balance ?? "",
        txStatusOf(r.tx),
        r.tx.cat,
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function localBytes(): number {
  if (typeof localStorage === "undefined") return 0;
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    n += k.length + (localStorage.getItem(k)?.length ?? 0);
  }
  return n * 2;
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageInfo(): Promise<{
  used: number;
  quota: number;
  persisted: boolean | null;
}> {
  let used = localBytes();
  let quota = 0;
  let persisted: boolean | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.usage) used = estimate.usage;
    quota = estimate?.quota ?? 0;
  } catch {
    /* ignore */
  }
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    persisted = null;
  }
  return { used, quota, persisted };
}
