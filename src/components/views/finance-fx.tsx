"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { deskZone, phpQuote } from "@/lib/format";
import { Chip, FIELD_SELECT } from "./finance-chip";
import { FX_UNITS, fxToPhp } from "./finance-market-bits";

export function FxConverter({
  fx,
}: {
  fx?: { usdphp: number; eurphp: number; jpyphp: number; gbpphp: number } | null;
}) {
  const [fromUnit, setFromUnit] = useState<(typeof FX_UNITS)[number]>("USD");
  const [toUnit, setToUnit] = useState<(typeof FX_UNITS)[number]>("PHP");
  const [fxAmt, setFxAmt] = useState("100");
  const [fxOpen, setFxOpen] = useState(false);
  const fromPhp = fx ? fxToPhp(fromUnit, fx) : 0;
  const toPhp = fx ? fxToPhp(toUnit, fx) : 0;
  const converted = fromPhp && toPhp ? (Number(fxAmt) * fromPhp) / toPhp : 0;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Currency converter</CardTitle>
        <Chip active={fxOpen} onClick={() => setFxOpen((v) => !v)}>
          {fxOpen ? "Hide" : "Show"}
        </Chip>
      </CardHeader>
      {fxOpen ? (
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="fx-amt">Amount</Label>
            <Input id="fx-amt" className="h-11" type="number" value={fxAmt} onChange={(e) => setFxAmt(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="fx-from">From</Label>
              <select
                id="fx-from"
                className={FIELD_SELECT}
                value={fromUnit}
                onChange={(e) => setFromUnit(e.target.value as (typeof FX_UNITS)[number])}
              >
                {FX_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="inline-flex size-11 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
              aria-label="Swap currencies"
              onClick={() => {
                setFromUnit(toUnit);
                setToUnit(fromUnit);
              }}
            >
              <ArrowLeftRight className="size-4" />
            </button>
            <div className="space-y-1">
              <Label htmlFor="fx-to">To</Label>
              <select
                id="fx-to"
                className={FIELD_SELECT}
                value={toUnit}
                onChange={(e) => setToUnit(e.target.value as (typeof FX_UNITS)[number])}
              >
                {FX_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="font-display text-3xl tabular-nums">
            {fx === undefined ? (
              <Skeleton className="inline-block h-8 w-36" />
            ) : (
              <>
                {Number.isFinite(converted) && fx ? converted.toLocaleString(deskZone().locale, { maximumFractionDigits: 2 }) : "—"}{" "}
                <span className="text-sm text-muted-foreground">{toUnit}</span>
              </>
            )}
          </p>
          {fx?.usdphp ? <p className="text-xs text-muted-foreground">USD/PHP {phpQuote(fx.usdphp)}</p> : null}
        </CardContent>
      ) : (
        <CardContent>
          <p className="text-sm text-muted-foreground">PHP, USD, EUR, GBP, JPY from the same FX tape as On hand.</p>
        </CardContent>
      )}
    </Card>
  );
}
