"use client";

import { useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { ChipMark, Contactless, CurrencyMark } from "@/components/issuer-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  digits4,
  digitsOnly,
  downloadText,
  formatExpiryInput,
  numberLabel,
  registerCsv,
  registerRows,
  signedAmount,
  txKindOf,
  txStatusOf,
  type RegisterFilter,
} from "@/lib/books";
import { ccySymbol, isoDate, isoMonth, maskedMoney, money, uid } from "@/lib/format";
import { useAtrium } from "@/lib/store";
import {
  ACCOUNT_KINDS,
  BOOK_CCY,
  FINANCE_CATS,
  TX_KINDS,
  type Account,
  type AccountKind,
  type BookCcy,
  type BooksLayout,
  type Tx,
  type TxKind,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Chip, FIELD_SELECT } from "./finance-chip";

function kindLabel(kind: AccountKind) {
  if (kind === "cash") return "Cash";
  if (kind === "card") return "Card";
  if (kind === "ewallet") return "Wallet";
  return "Bank";
}

function PlasticCard({
  account,
  active,
  mask,
  onSelect,
  onEdit,
  onToggleMask,
  onToggleNumber,
}: {
  account: Account;
  active: boolean;
  mask: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggleMask: () => void;
  onToggleNumber: () => void;
}) {
  const cash = account.kind === "cash";
  const ccy = account.currency ?? "PHP";
  const symbol = ccySymbol(ccy);
  const digits = numberLabel(account);
  const skip = useRef(false);
  const hold = useRef(0);

  function select(e: { detail: number }) {
    if (e.detail >= 2 || skip.current) {
      skip.current = false;
      return;
    }
    onSelect();
  }

  return (
    <article
      data-face="desk"
      data-kind={account.kind}
      className={cn(
        "wallet-face relative flex aspect-plastic w-72 shrink-0 snap-center flex-col justify-between overflow-hidden rounded-xl p-5",
        active && "ring-2 ring-ring",
      )}
      onDoubleClick={(e) => {
        e.preventDefault();
        onEdit();
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        hold.current = window.setTimeout(() => {
          skip.current = true;
          onEdit();
        }, 500);
      }}
      onPointerUp={() => window.clearTimeout(hold.current)}
      onPointerLeave={() => window.clearTimeout(hold.current)}
      onPointerCancel={() => window.clearTimeout(hold.current)}
    >
      <span className="wallet-face-mark" aria-hidden>
        {symbol}
      </span>
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CurrencyMark symbol={symbol} />
          <p className="min-w-0 truncate text-xs font-medium uppercase tracking-widest opacity-80">
            {kindLabel(account.kind)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Contactless className="opacity-70" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md opacity-80 hover:opacity-100"
                aria-label={mask ? "Show balances" : "Hide balances"}
                aria-pressed={mask}
                onClick={onToggleMask}
              >
                {mask ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{mask ? "Show amounts" : "Hide amounts"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <button type="button" className="relative block min-h-11 text-left" onClick={select}>
        <p className="font-display text-3xl tabular-nums tracking-tight">
          {maskedMoney(account.balance, mask, ccy)}
        </p>
      </button>
      <div className="relative flex min-h-11 items-end justify-between gap-3">
        <ChipMark />
        <span className="min-w-0 text-right">
          <button type="button" className="block min-h-11 w-full truncate text-right text-sm" onClick={select}>
            {account.name}
          </button>
          {cash ? (
            <span className="block min-h-11 font-mono text-xs tabular-nums opacity-80">{ccy}</span>
          ) : (
            <button
              type="button"
              className="block min-h-11 w-full font-mono text-xs tabular-nums opacity-80"
              onClick={onToggleNumber}
              aria-label={account.hideNumber === false ? "Hide account number" : "Show account number"}
            >
              {digits || "••••"}
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

export function FinanceBooks() {
  const {
    accounts,
    budgets,
    txs,
    books,
    addTx,
    updateTx,
    removeTx,
    setAccounts,
    addAccount,
    updateAccount,
    removeAccount,
    setBooks,
  } = useAtrium(
    useShallow((s) => ({
      accounts: s.accounts,
      budgets: s.budgets,
      txs: s.txs,
      books: s.books,
      addTx: s.addTx,
      updateTx: s.updateTx,
      removeTx: s.removeTx,
      setAccounts: s.setAccounts,
      addAccount: s.addAccount,
      updateAccount: s.updateAccount,
      removeAccount: s.removeAccount,
      setBooks: s.setBooks,
    })),
  );
  const compact = books.density === "compact";
  const mask = Boolean(books.mask);
  const home = books.currency ?? "PHP";
  const amt = (n: number) => money(n, home);
  const hid = (n: number) => maskedMoney(n, mask, home);
  const month = isoMonth();
  const year = month.slice(0, 4);
  const [layout, setLayout] = useState<BooksLayout>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches ? "grid" : "list",
  );
  const [filter, setFilter] = useState<RegisterFilter>({
    accountId: "all",
    range: "month",
    flow: "all",
    query: "",
    month,
    year,
  });
  const [acctOpen, setAcctOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<AccountKind>("bank");
  const [newNumber, setNewNumber] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [newCvc, setNewCvc] = useState("");
  const [newHideNumber, setNewHideNumber] = useState(true);
  const [newHidden, setNewHidden] = useState(false);
  const [newBal, setNewBal] = useState("");
  const [newCcy, setNewCcy] = useState<BookCcy>(home);
  const [showVault, setShowVault] = useState(false);
  const [editing, setEditing] = useState<Tx | "new" | null>(null);

  const acctName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const spent = txs.filter((t) => t.date.startsWith(month) && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const income = txs.filter((t) => t.date.startsWith(month) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const wallet = accounts.filter((a) => !a.hidden);
  const vault = accounts.filter((a) => a.hidden);
  const liquid = accounts.reduce((s, a) => s + a.balance, 0);
  const byCat: Record<string, number> = {};
  for (const t of txs) {
    if (!t.date.startsWith(month) || t.amount >= 0) continue;
    byCat[t.cat] = (byCat[t.cat] || 0) + Math.abs(t.amount);
  }
  const rows = useMemo(() => registerRows(txs, accounts, filter), [txs, accounts, filter]);
  const rowPad = compact ? "py-1.5" : "py-2.5";

  function exportCsv() {
    downloadText(`atrium-register-${isoDate()}.csv`, registerCsv(rows, accounts), "text/csv;charset=utf-8");
    toast("Register CSV downloaded");
  }

  function toggleMask() {
    setBooks({ mask: !mask });
  }

  function hideAccount(id: string, hidden: boolean) {
    setAccounts(accounts.map((a) => (a.id === id ? { ...a, hidden } : a)));
    if (hidden && filter.accountId === id) setFilter((f) => ({ ...f, accountId: "all" }));
  }

  function toggleNumber(id: string) {
    setAccounts(accounts.map((a) => (a.id === id ? { ...a, hideNumber: a.hideNumber === false } : a)));
  }

  function openWallet() {
    setEditingId(null);
    setConfirmDelete(false);
    setNewName("");
    setNewNumber("");
    setNewExpiry("");
    setNewCvc("");
    setNewHideNumber(true);
    setNewHidden(false);
    setNewBal("");
    setNewKind("bank");
    setNewCcy(home);
    setAcctOpen(true);
  }

  function openEdit(account: Account) {
    setEditingId(account.id);
    setConfirmDelete(false);
    setNewName(account.name);
    setNewNumber(account.number || account.last4 || "");
    setNewExpiry(account.expiry ?? "");
    setNewCvc(account.cvc ?? "");
    setNewHideNumber(account.hideNumber !== false);
    setNewHidden(Boolean(account.hidden));
    setNewBal(String(account.balance));
    setNewKind(account.kind);
    setNewCcy(account.currency ?? home);
    setAcctOpen(true);
  }

  function saveCard() {
    const name = newName.trim();
    if (!name) {
      toast("Name the account");
      return;
    }
    const bal = Number(newBal);
    const number = newKind === "cash" ? "" : digitsOnly(newNumber);
    const patch: Partial<Account> = {
      name,
      balance: Number.isFinite(bal) ? bal : 0,
      kind: newKind,
      currency: newCcy,
      number: number || undefined,
      last4: number ? digits4(number) : undefined,
      expiry: newKind === "card" && newExpiry ? formatExpiryInput(newExpiry) : undefined,
      cvc: newKind === "card" && newCvc ? digitsOnly(newCvc).slice(0, 4) : undefined,
      hideNumber: newKind !== "cash" ? newHideNumber : undefined,
      hidden: newHidden || undefined,
    };
    if (editingId) {
      updateAccount(editingId, patch);
      setAcctOpen(false);
      toast("Account updated");
      return;
    }
    addAccount({
      id: uid(),
      name,
      balance: Number.isFinite(bal) ? bal : 0,
      kind: newKind,
      currency: newCcy,
      ...(number ? { number, last4: digits4(number) } : {}),
      ...(newKind === "card" && newExpiry ? { expiry: formatExpiryInput(newExpiry) } : {}),
      ...(newKind === "card" && newCvc ? { cvc: digitsOnly(newCvc).slice(0, 4) } : {}),
      ...(newKind !== "cash" ? { hideNumber: newHideNumber } : {}),
      ...(newHidden ? { hidden: true } : {}),
    });
    setAcctOpen(false);
    toast(
      newKind === "cash" ? "Cash added" : newKind === "card" ? "Card added" : newKind === "ewallet" ? "Wallet added" : "Bank added",
    );
  }

  function deleteCard() {
    if (!editingId) return;
    if (accounts.length <= 1) {
      toast("Keep at least one account");
      return;
    }
    removeAccount(editingId, { unhook: true });
    if (filter.accountId === editingId) setFilter((f) => ({ ...f, accountId: "all" }));
    setConfirmDelete(false);
    setAcctOpen(false);
    toast("Account deleted");
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">On hand</p>
          <p className="font-display text-4xl tabular-nums tracking-tight">{hid(liquid)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            In {hid(income)}
            <span className="mx-2 text-border">·</span>
            Out {hid(spent)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" aria-label={mask ? "Show balances" : "Hide balances"} aria-pressed={mask} onClick={toggleMask}>
            {mask ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {mask ? "Show" : "Hide"}
          </Button>
          <Button variant="outline" onClick={openWallet}>
            <Plus className="size-4" />
            Add
          </Button>
          <Button size="lg" onClick={() => setEditing("new")}>
            Post
          </Button>
        </div>
      </div>

      <div className="-mx-4 mb-6 flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory md:-mx-6 md:px-6">
        {wallet.map((a) => (
          <PlasticCard
            key={a.id}
            account={a}
            active={filter.accountId === a.id}
            mask={mask}
            onSelect={() => setFilter((f) => ({ ...f, accountId: f.accountId === a.id ? "all" : a.id }))}
            onEdit={() => openEdit(a)}
            onToggleMask={toggleMask}
            onToggleNumber={() => toggleNumber(a.id)}
          />
        ))}
        <button
          type="button"
          onClick={openWallet}
          className="flex aspect-plastic w-72 shrink-0 snap-center flex-col items-start justify-between rounded-xl border border-dashed border-border bg-muted/40 p-5 text-left text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-5" />
          <span>
            <span className="block font-display text-xl text-foreground">Add account</span>
            <span className="mt-1 block text-sm">Cash, bank, wallet, or card.</span>
          </span>
        </button>
      </div>

      {vault.length ? (
        <div className="mb-6">
          <button
            type="button"
            className="min-h-11 text-xs uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
            onClick={() => setShowVault((v) => !v)}
          >
            {showVault ? "Hide vault" : `${vault.length} hidden`}
          </button>
          {showVault ? (
            <div className="mt-2 space-y-2">
              {vault.map((a) => (
                <div key={a.id} className="flex min-h-11 items-center justify-between gap-3 rounded-md bg-muted px-3">
                  <button type="button" className="min-w-0 text-left text-sm" onDoubleClick={() => openEdit(a)}>
                    {a.name}
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{numberLabel(a)}</span>
                  </button>
                  <button
                    type="button"
                    className="min-h-11 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => hideAccount(a.id, false)}
                  >
                    Return to wallet
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <Card className="mb-4">
        <CardHeader className="flex-row flex-wrap items-center justify-between space-y-0">
          <CardTitle>Register</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Chip active={layout === "list"} onClick={() => setLayout("list")}>
              List
            </Chip>
            <Chip active={layout === "grid"} onClick={() => setLayout("grid")}>
              Grid
            </Chip>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Chip active={filter.range === "month"} onClick={() => setFilter((f) => ({ ...f, range: "month" }))}>
              This month
            </Chip>
            <Chip active={filter.range === "year"} onClick={() => setFilter((f) => ({ ...f, range: "year" }))}>
              This year
            </Chip>
            <Chip active={filter.range === "all"} onClick={() => setFilter((f) => ({ ...f, range: "all" }))}>
              All dates
            </Chip>
            <Chip active={filter.flow === "all"} onClick={() => setFilter((f) => ({ ...f, flow: "all" }))}>
              In + out
            </Chip>
            <Chip active={filter.flow === "in"} onClick={() => setFilter((f) => ({ ...f, flow: "in" }))}>
              In
            </Chip>
            <Chip active={filter.flow === "out"} onClick={() => setFilter((f) => ({ ...f, flow: "out" }))}>
              Out
            </Chip>
          </div>
          <Input
            value={filter.query}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            placeholder="Find in register"
            aria-label="Find in register"
          />
          {layout === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map((r) => (
                <button
                  key={r.tx.id}
                  type="button"
                  className="rounded-lg bg-muted p-4 text-left"
                  onClick={() => setEditing(r.tx)}
                >
                  <p className="text-xs text-muted-foreground">{r.tx.date}</p>
                  <p className="mt-1 text-sm">{r.tx.payee}</p>
                  <p className="mt-2 font-mono text-sm tabular-nums">
                    {mask ? "••••" : `${r.effect < 0 ? "−" : "+"}${amt(Math.abs(r.effect))}`}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="font-medium">Date</th>
                    <th className="font-medium">Payee</th>
                    <th className="font-medium">Memo</th>
                    <th className="font-medium">Account</th>
                    <th className="font-medium text-right">In</th>
                    <th className="font-medium text-right">Out</th>
                    <th className="font-medium text-right">Balance</th>
                    <th className="font-medium">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.tx.id} className="border-t border-border">
                      <td className={rowPad}>
                        <button type="button" className="min-h-11" onClick={() => setEditing(r.tx)}>
                          {r.tx.date}
                        </button>
                      </td>
                      <td className={rowPad}>
                        <button type="button" className="min-h-11 text-left" onClick={() => setEditing(r.tx)}>
                          {r.tx.payee}
                          <span className="block text-xs text-muted-foreground">{txKindOf(r.tx)}</span>
                        </button>
                      </td>
                      <td className={cn("text-muted-foreground", rowPad)}>{r.tx.memo || "—"}</td>
                      <td className={cn("text-muted-foreground", rowPad)}>
                        {r.tx.accountId ? acctName[r.tx.accountId] ?? r.tx.accountId : "—"}
                      </td>
                      <td className={cn("text-right tabular-nums text-ok", rowPad)}>
                        {r.inAmt ? (mask ? "••••" : amt(r.inAmt)) : ""}
                      </td>
                      <td className={cn("text-right tabular-nums text-destructive", rowPad)}>
                        {r.outAmt ? (mask ? "••••" : amt(r.outAmt)) : ""}
                      </td>
                      <td className={cn("text-right tabular-nums", rowPad)}>
                        {r.balance != null ? (mask ? "••••" : amt(r.balance)) : "—"}
                      </td>
                      <td className={rowPad}>
                        <button
                          type="button"
                          className="min-h-11 text-xs"
                          onClick={() =>
                            updateTx(r.tx.id, {
                              status: txStatusOf(r.tx) === "cleared" ? "pending" : "cleared",
                            })
                          }
                        >
                          {txStatusOf(r.tx) === "cleared" ? "Cleared" : "Pending"}
                        </button>
                      </td>
                      <td className={rowPad}>
                        <Button variant="ghost" size="sm" onClick={() => removeTx(r.tx.id)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!rows.length ? (
            <p className="py-6 text-sm text-muted-foreground">No lines this period. Post a transaction or widen the dates.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budgets this month</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {budgets.map((b) => {
            const used = byCat[b.id] || 0;
            const pctUsed = Math.min(100, Math.round((used / b.limit) * 100));
            return (
              <div key={b.id} className="grid grid-cols-[7rem_1fr_7rem] items-center gap-3 text-xs">
                <span>{b.name}</span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${pctUsed}%` }} />
                </div>
                <span className="text-right tabular-nums text-muted-foreground">
                  {mask ? "••••" : `${amt(used)} / ${amt(b.limit)}`}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <TxDialog
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        open={editing !== null}
        tx={editing === "new" || editing === null ? null : editing}
        accounts={accounts}
        onClose={() => setEditing(null)}
        onSave={(next, isNew) => {
          if (isNew) addTx(next);
          else updateTx(next.id, next);
          setEditing(null);
          toast(isNew ? "Posted" : "Updated");
        }}
      />

      <Dialog open={acctOpen} onOpenChange={(v) => {
        setAcctOpen(v);
        if (!v) setConfirmDelete(false);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Account" : "Add account"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveCard();
            }}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ACCOUNT_KINDS.map((k) => (
                <Chip
                  key={k.id}
                  className="w-full"
                  active={newKind === k.id}
                  onClick={() => {
                    setNewKind(k.id);
                    if (k.id !== "card") {
                      setNewExpiry("");
                      setNewCvc("");
                    }
                  }}
                >
                  {k.label}
                </Chip>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {newKind === "cash"
                ? "Name and currency."
                : newKind === "card"
                  ? "Card number, expiration, CVV / CVC."
                  : "Account name, account number, currency."}
            </p>
            <div className="space-y-1">
              <Label htmlFor="new-acct-name">{newKind === "cash" || newKind === "card" ? "Name" : "Account name"}</Label>
              <Input id="new-acct-name" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="new-acct-bal">{editingId ? "Balance" : "Opening"}</Label>
                <Input
                  id="new-acct-bal"
                  type="number"
                  inputMode="decimal"
                  value={newBal}
                  onChange={(e) => setNewBal(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-acct-ccy">Currency</Label>
                <select
                  id="new-acct-ccy"
                  className={FIELD_SELECT}
                  value={newCcy}
                  onChange={(e) => setNewCcy(e.target.value as BookCcy)}
                >
                  {BOOK_CCY.map((c) => (
                    <option key={c} value={c}>
                      {c} · {ccySymbol(c)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {newKind === "bank" || newKind === "ewallet" ? (
              <div className="space-y-1">
                <Label htmlFor="new-acct-number">Account number</Label>
                <Input
                  id="new-acct-number"
                  inputMode="numeric"
                  autoComplete="off"
                  value={newNumber}
                  onChange={(e) => setNewNumber(digitsOnly(e.target.value).slice(0, 20))}
                />
              </div>
            ) : null}
            {newKind === "card" ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="new-acct-pan">Card number</Label>
                  <Input
                    id="new-acct-pan"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    value={newNumber}
                    onChange={(e) => setNewNumber(digitsOnly(e.target.value).slice(0, 19))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="new-acct-exp">Expiration date</Label>
                    <Input
                      id="new-acct-exp"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                      value={newExpiry}
                      onChange={(e) => setNewExpiry(formatExpiryInput(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-acct-cvc">CVV / CVC</Label>
                    <Input
                      id="new-acct-cvc"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      value={newCvc}
                      onChange={(e) => setNewCvc(digitsOnly(e.target.value).slice(0, 4))}
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {newKind !== "cash" ? (
              <div className="flex min-h-11 items-center justify-between gap-3">
                <div>
                  <p className="text-sm">Hide account number</p>
                  <p className="text-xs text-muted-foreground">Show only the last four on the desk.</p>
                </div>
                <Switch
                  checked={newHideNumber}
                  onCheckedChange={setNewHideNumber}
                  aria-label="Hide account number"
                />
              </div>
            ) : null}
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div>
                <p className="text-sm">Hide from wallet</p>
                <p className="text-xs text-muted-foreground">Vault it. Still in the books.</p>
              </div>
              <Switch checked={newHidden} onCheckedChange={setNewHidden} aria-label="Hide from wallet" />
            </div>
            <div className="flex justify-end gap-2">
              {editingId ? (
                confirmDelete ? (
                  <>
                    <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                      Keep
                    </Button>
                    <Button type="button" variant="destructive" onClick={deleteCard}>
                      Delete account
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setAcctOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Save</Button>
                  </>
                )
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setAcctOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {newKind === "cash"
                      ? "Add cash"
                      : newKind === "card"
                        ? "Add card"
                        : newKind === "ewallet"
                          ? "Add wallet"
                          : "Add bank"}
                  </Button>
                </>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TxDialog({
  open,
  tx,
  accounts,
  onClose,
  onSave,
}: {
  open: boolean;
  tx: Tx | null;
  accounts: Account[];
  onClose: () => void;
  onSave: (tx: Tx, isNew: boolean) => void;
}) {
  const isNew = !tx;
  const [payee, setPayee] = useState(tx?.payee ?? "");
  const [amount, setAmount] = useState(tx ? String(Math.abs(tx.amount)) : "");
  const [date, setDate] = useState(tx?.date ?? isoDate());
  const [cat, setCat] = useState(tx?.cat ?? "food");
  const [kind, setKind] = useState<TxKind>(tx ? txKindOf(tx) : "expense");
  const [accountId, setAccountId] = useState(tx?.accountId ?? accounts[0]?.id ?? "cash");
  const [transferToId, setTransferToId] = useState(
    tx?.transferToId ?? accounts[1]?.id ?? accounts[0]?.id ?? "cash",
  );
  const [memo, setMemo] = useState(tx?.memo ?? "");
  const [status, setStatus] = useState<"pending" | "cleared">(tx ? txStatusOf(tx) : "cleared");

  const resolved = accounts.some((a) => a.id === accountId) ? accountId : (accounts[0]?.id ?? "cash");
  const resolvedTo = accounts.some((a) => a.id === transferToId) ? transferToId : (accounts[1]?.id ?? resolved);

  function submit() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) {
      toast("Enter an amount");
      return;
    }
    if (kind === "transfer" && resolved === resolvedTo) {
      toast("Pick two different accounts");
      return;
    }
    onSave(
      {
        id: tx?.id ?? uid(),
        date,
        payee: payee.trim() || "Entry",
        amount: signedAmount(kind, n),
        cat: kind === "income" ? "income" : cat,
        accountId: resolved,
        memo: memo.trim() || undefined,
        kind,
        status,
        transferToId: kind === "transfer" ? resolvedTo : undefined,
      },
      isNew,
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Post" : "Transaction"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-wrap gap-2">
            {TX_KINDS.map((k) => (
              <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
                {k.label}
              </Chip>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="tx-payee">Payee</Label>
            <Input id="tx-payee" autoFocus value={payee} onChange={(e) => setPayee(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tx-amt">Amount</Label>
              <Input id="tx-amt" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tx-date">Date</Label>
              <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {kind === "transfer" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tx-from">From</Label>
                <select
                  id="tx-from"
                  className={FIELD_SELECT}
                  value={resolved}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tx-to">To</Label>
                <select
                  id="tx-to"
                  className={FIELD_SELECT}
                  value={resolvedTo}
                  onChange={(e) => setTransferToId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="tx-cat">Category</Label>
                <select id="tx-cat" className={FIELD_SELECT} value={cat} onChange={(e) => setCat(e.target.value)}>
                  {FINANCE_CATS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tx-acct">Account</Label>
                <select
                  id="tx-acct"
                  className={FIELD_SELECT}
                  value={resolved}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="tx-memo">Memo</Label>
            <Input id="tx-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip active={status === "cleared"} onClick={() => setStatus("cleared")}>
              Cleared
            </Chip>
            <Chip active={status === "pending"} onClick={() => setStatus("pending")}>
              Pending
            </Chip>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{isNew ? "Post" : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
