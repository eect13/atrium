import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyTx,
  demoBooks,
  digits4,
  effectOnAccount,
  liquidEffect,
  normalizeAccount,
  numberLabel,
  normalizeBooks,
  parseBooksFile,
  registerCsv,
  registerRows,
  signedAmount,
  toBooksFile,
  txKindOf,
} from "./books.ts";

const accounts = [
  { id: "cash", name: "Cash", balance: 1000, kind: "cash" as const },
  { id: "bank", name: "Bank", balance: 5000, kind: "bank" as const },
];

test("signedAmount flips expenses and transfers", () => {
  assert.equal(signedAmount("expense", 250), -250);
  assert.equal(signedAmount("income", 250), 250);
  assert.equal(signedAmount("deposit", 250), 250);
  assert.equal(signedAmount("transfer", 250), -250);
});

test("transfer moves between accounts without changing cash on hand", () => {
  const tx = {
    id: "t1",
    date: "2026-09-07",
    payee: "Top-up",
    amount: -800,
    cat: "other",
    accountId: "bank",
    transferToId: "cash",
    kind: "transfer" as const,
  };
  assert.equal(liquidEffect(tx), 0);
  assert.equal(effectOnAccount(tx, "bank"), -800);
  assert.equal(effectOnAccount(tx, "cash"), 800);
  const next = applyTx(accounts, tx, 1);
  assert.equal(next.find((a) => a.id === "bank")?.balance, 4200);
  assert.equal(next.find((a) => a.id === "cash")?.balance, 1800);
  assert.equal(
    next.reduce((s, a) => s + a.balance, 0),
    accounts.reduce((s, a) => s + a.balance, 0),
  );
});

test("register running balance is true for a filtered month", () => {
  const txs = [
    { id: "a", date: "2026-08-31", payee: "Aug", amount: -100, cat: "food", accountId: "cash" },
    { id: "b", date: "2026-09-01", payee: "Sep in", amount: 400, cat: "income", accountId: "cash" },
    { id: "c", date: "2026-09-02", payee: "Sep out", amount: -50, cat: "food", accountId: "cash" },
  ];
  const books = [{ id: "cash", name: "Cash", balance: 1250, kind: "cash" as const }];
  const rows = registerRows(txs, books, {
    accountId: "cash",
    range: "month",
    flow: "all",
    query: "",
    month: "2026-09",
    year: "2026",
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.tx.payee, "Sep out");
  assert.equal(rows[0]?.balance, 1250);
  assert.equal(rows[1]?.tx.payee, "Sep in");
  assert.equal(rows[1]?.balance, 1300);
});

test("all-accounts register still shows transfer as out", () => {
  const txs = [
    {
      id: "t",
      date: "2026-09-07",
      payee: "Top-up",
      amount: -800,
      cat: "other",
      accountId: "bank",
      transferToId: "cash",
      kind: "transfer" as const,
    },
  ];
  const rows = registerRows(txs, accounts, {
    accountId: "all",
    range: "all",
    flow: "all",
    query: "",
    month: "2026-09",
    year: "2026",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.outAmt, 800);
  assert.equal(rows[0]?.inAmt, 0);
  assert.equal(rows[0]?.balance, 6000);
});

test("parseBooksFile round-trips an Atrium snapshot", () => {
  const demo = demoBooks("Eric");
  const file = toBooksFile(demo, "2026-09-07T00:00:00.000Z");
  const parsed = parseBooksFile(JSON.stringify(file));
  assert.equal(parsed.books.name, "Eric — personal books");
  assert.equal(parsed.accounts.length, 3);
  assert.ok(parsed.txs.length >= 4);
  assert.equal(txKindOf(parsed.txs.find((t) => t.payee === "Salary")!), "income");
});

test("parseBooksFile rejects a Finance Manager company", () => {
  assert.throws(
    () => parseBooksFile(JSON.stringify({ settings: { companyName: "Pacific Harbor" }, banks: [] })),
    /Finance Manager/,
  );
});

test("register CSV includes payee and signed columns", () => {
  const rows = registerRows(
    [{ id: "x", date: "2026-09-07", payee: "Grab", amount: -248, cat: "trans", accountId: "cash" }],
    accounts,
    { accountId: "all", range: "all", flow: "all", query: "", month: "2026-09", year: "2026" },
  );
  const csv = registerCsv(rows, accounts);
  assert.match(csv, /Grab/);
  assert.match(csv, /248/);
});

test("digits4 keeps the last four numerals", () => {
  assert.equal(digits4("4821"), "4821");
  assert.equal(digits4("****-1904"), "1904");
  assert.equal(digits4(""), undefined);
});

test("normalizeAccount keeps last4 and hidden", () => {
  const a = normalizeAccount({ id: "bdo", name: "BDO", balance: 10, kind: "bank", last4: "1904", hidden: true });
  assert.equal(a?.last4, "1904");
  assert.equal(a?.hidden, true);
  assert.equal(a?.hideNumber, true);
});

test("card fields round-trip and numbers mask by default", () => {
  const a = normalizeAccount({
    id: "c",
    name: "Visa",
    balance: 1,
    kind: "card",
    number: "4111 1111 1111 1904",
    expiry: "0928",
    cvc: "123",
  });
  assert.equal(a?.number, "4111111111111904");
  assert.equal(a?.last4, "1904");
  assert.equal(a?.expiry, "09/28");
  assert.equal(a?.cvc, "123");
  assert.equal(numberLabel(a!), "•••• 1904");
  assert.equal(numberLabel({ ...a!, hideNumber: false }), "4111 1111 1111 1904");
});

test("normalizeBooks keeps mask", () => {
  assert.equal(normalizeBooks({ name: "X", density: "compact", mask: true }).mask, true);
  assert.equal(normalizeBooks({ name: "X" }).mask, false);
});

test("normalizeBooks defaults currency to PHP", () => {
  assert.equal(normalizeBooks({ name: "X" }).currency, "PHP");
  assert.equal(normalizeBooks({ name: "X", currency: "USD" }).currency, "USD");
});

test("normalizeAccount infers currency", () => {
  assert.equal(normalizeAccount({ id: "c", name: "Cash", kind: "cash" })?.currency, "PHP");
  assert.equal(normalizeAccount({ id: "u", name: "USD travel", kind: "cash" })?.currency, "USD");
});

test("wallet kind and number round-trip", () => {
  const a = normalizeAccount({
    id: "w",
    name: "GCash",
    balance: 500,
    kind: "ewallet",
    number: "09171234567",
  });
  assert.equal(a?.kind, "ewallet");
  assert.equal(a?.number, "09171234567");
  assert.equal(a?.last4, "4567");
  assert.equal(numberLabel(a!), "•••• 4567");
});

