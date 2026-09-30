"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signedAmount, txKindOf, txStatusOf } from "@/lib/books";
import { isoDate, uid } from "@/lib/format";
import { TX_KINDS, type Account, type Tx, type TxKind } from "@/lib/types";
import { Chip, FIELD_SELECT } from "./finance-chip";

export function TxDialog({
  open,
  tx,
  accounts,
  cats,
  defaultAccountId,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  tx: Tx | null;
  accounts: Account[];
  cats: { id: string; name: string }[];
  defaultAccountId?: string;
  onClose: () => void;
  onSave: (tx: Tx, isNew: boolean) => void;
  onDelete?: (id: string) => void;
}) {
  const isNew = !tx;
  const [payee, setPayee] = useState(tx?.payee ?? "");
  const [amount, setAmount] = useState(tx ? String(Math.abs(tx.amount)) : "");
  const [date, setDate] = useState(tx?.date ?? isoDate());
  const [cat, setCat] = useState(tx?.cat ?? cats[0]?.id ?? "other");
  const [kind, setKind] = useState<TxKind>(tx ? txKindOf(tx) : "expense");
  const [accountId, setAccountId] = useState(tx?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? "cash");
  const [transferToId, setTransferToId] = useState(
    tx?.transferToId ?? accounts[1]?.id ?? accounts[0]?.id ?? "cash",
  );
  const [memo, setMemo] = useState(tx?.memo ?? "");
  const [status, setStatus] = useState<"pending" | "cleared">(tx ? txStatusOf(tx) : "cleared");

  const resolved = accounts.some((a) => a.id === accountId) ? accountId : (accounts[0]?.id ?? "cash");
  const resolvedTo = accounts.some((a) => a.id === transferToId) ? transferToId : (accounts[1]?.id ?? resolved);
  const catOptions = cats.some((c) => c.id === cat) ? cats : [...cats, { id: cat, name: cat }];

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
                  {catOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
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
            {tx && onDelete ? (
              <Button type="button" variant="outline" onClick={() => onDelete(tx.id)}>
                Remove
              </Button>
            ) : null}
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

