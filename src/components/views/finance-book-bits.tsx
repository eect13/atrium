"use client";

import { useRef } from "react";
import { LayoutGrid, LayoutList } from "lucide-react";
import { ChipMark, Contactless, CurrencyMark } from "@/components/issuer-mark";
import { Button } from "@/components/ui/button";
import { ccySymbol, maskedMoney } from "@/lib/format";
import { numberLabel, txKindOf, txStatusOf, type RegisterRow } from "@/lib/books";
import type { Account, AccountKind, BooksLayout } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Chip } from "./finance-chip";

export function kindLabel(kind: AccountKind) {
  if (kind === "cash") return "Cash";
  if (kind === "card") return "Card";
  if (kind === "ewallet") return "Wallet";
  return "Bank";
}

export function LayoutChips({
  value,
  onChange,
  listLabel = "List",
  gridLabel = "Grid",
}: {
  value: BooksLayout;
  onChange: (next: BooksLayout) => void;
  listLabel?: string;
  gridLabel?: string;
}) {
  return (
    <>
      <Chip active={value === "list"} onClick={() => onChange("list")}>
        <LayoutList className="size-3.5" />
        {listLabel}
      </Chip>
      <Chip active={value === "grid"} onClick={() => onChange("grid")}>
        <LayoutGrid className="size-3.5" />
        {gridLabel}
      </Chip>
    </>
  );
}

export function PlasticCard({
  account,
  active,
  mask,
  onSelect,
  onEdit,
  onToggleNumber,
}: {
  account: Account;
  active: boolean;
  mask: boolean;
  onSelect: () => void;
  onEdit: () => void;
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
        "wallet-face relative flex aspect-plastic w-full flex-col justify-between overflow-hidden rounded-xl p-5",
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

export function AccountRow({
  account,
  active,
  mask,
  onSelect,
  onEdit,
  onToggleNumber,
}: {
  account: Account;
  active: boolean;
  mask: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggleNumber: () => void;
}) {
  const ccy = account.currency ?? "PHP";
  const cash = account.kind === "cash";
  return (
    <div
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-lg bg-card px-3 shadow-[var(--shadow-border)]",
        active && "ring-2 ring-ring",
      )}
    >
      <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left" onClick={onSelect}>
        <CurrencyMark symbol={ccySymbol(ccy)} />
        <span className="min-w-0">
          <span className="block truncate text-sm">{account.name}</span>
          <span className="block text-xs text-muted-foreground">
            {kindLabel(account.kind)}
            {cash ? ` · ${ccy}` : ""}
          </span>
        </span>
      </button>
      {cash ? null : (
        <button
          type="button"
          className="hidden min-h-11 font-mono text-xs tabular-nums text-muted-foreground sm:block"
          onClick={onToggleNumber}
          aria-label={account.hideNumber === false ? "Hide account number" : "Show account number"}
        >
          {numberLabel(account) || "••••"}
        </button>
      )}
      <p className="font-display text-lg tabular-nums tracking-tight">{maskedMoney(account.balance, mask, ccy)}</p>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
        Edit
      </Button>
    </div>
  );
}

export function RegisterLine({
  row,
  mask,
  amt,
  accountName,
  onEdit,
  onToggleStatus,
}: {
  row: RegisterRow;
  mask: boolean;
  amt: (n: number) => string;
  accountName: string;
  onEdit: () => void;
  onToggleStatus: () => void;
}) {
  const signed = mask ? "••••" : `${row.effect < 0 ? "−" : row.effect > 0 ? "+" : ""}${amt(Math.abs(row.effect))}`;
  if (row.opening) {
    return (
      <div className="flex items-start justify-between gap-3 border-b border-border py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">Opening</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.tx.date || "Start of books"}</p>
        </div>
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {row.balance != null ? (mask ? "••••" : amt(row.balance)) : "—"}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-3">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onEdit}>
        <p className="truncate text-sm">{row.tx.payee}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {row.tx.date}
          {accountName ? ` · ${accountName}` : ""}
          {` · ${txKindOf(row.tx)}`}
        </p>
        {row.tx.memo ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.tx.memo}</p> : null}
      </button>
      <div className="shrink-0 text-right">
        <p className={cn("font-mono text-sm tabular-nums", row.effect < 0 ? "text-destructive" : row.effect > 0 ? "text-ok" : "text-muted-foreground")}>
          {row.effect === 0 && !mask ? "—" : signed}
        </p>
        <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
          {row.balance != null ? (mask ? "••••" : amt(row.balance)) : "—"}
        </p>
        <button type="button" className="mt-1 min-h-11 text-xs text-muted-foreground" onClick={onToggleStatus}>
          {txStatusOf(row.tx) === "cleared" ? "Cleared" : "Pending"}
        </button>
      </div>
    </div>
  );
}
