"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SPARK_RANGES, type SparkRange } from "@/lib/sparks";
import { Chip } from "./finance-chip";
import { PrefSwitch } from "./finance-market-bits";

export function BoardViewDialog({
  open,
  onOpenChange,
  spark,
  range,
  dualPhp,
  cmdtyPhp,
  cryptoUsdt,
  showVol,
  showTape,
  compact,
  onPatch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spark: boolean;
  range: SparkRange;
  dualPhp: boolean;
  cmdtyPhp: boolean;
  cryptoUsdt: boolean;
  showVol: boolean;
  showTape: boolean;
  compact: boolean;
  onPatch: (patch: {
    spark?: boolean;
    sparkRange?: SparkRange;
    dualPhp?: boolean;
    cmdtyPhp?: boolean;
    cryptoUsdt?: boolean;
    showVol?: boolean;
    showTape?: boolean;
    compact?: boolean;
  }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Board view</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <PrefSwitch
            label="Spark"
            hint="Range chips 1D–1Y. Coins from Binance, FX from Frankfurter, PSE from this desk."
            checked={spark}
            onCheckedChange={(v) => onPatch({ spark: v })}
          />
          {spark ? (
            <div className="flex flex-wrap gap-2 py-2">
              {SPARK_RANGES.map((r) => (
                <Chip key={r.id} active={range === r.id} onClick={() => onPatch({ sparkRange: r.id })}>
                  {r.label}
                </Chip>
              ))}
            </div>
          ) : null}
          <PrefSwitch
            label="PHP under last"
            hint="Peso line under coins, FX, and global stocks — not commodities"
            checked={dualPhp}
            onCheckedChange={(v) => onPatch({ dualPhp: v })}
          />
          <PrefSwitch
            label="Convert commodities"
            hint="Peso line under gold, oil, and metals. Off by default."
            checked={cmdtyPhp}
            onCheckedChange={(v) => onPatch({ cmdtyPhp: v })}
          />
          <PrefSwitch
            label="USDT last"
            hint="Coins in dollars, PHP underneath"
            checked={cryptoUsdt}
            onCheckedChange={(v) => onPatch({ cryptoUsdt: v })}
          />
          <PrefSwitch
            label="Volume line"
            hint="Turnover under the name"
            checked={showVol}
            onCheckedChange={(v) => onPatch({ showVol: v })}
          />
          <PrefSwitch
            label="Tape"
            hint="Strip of live last prices"
            checked={showTape}
            onCheckedChange={(v) => onPatch({ showTape: v })}
          />
          <PrefSwitch
            label="Compact rows"
            hint="Tighter board rows"
            checked={compact}
            onCheckedChange={(v) => onPatch({ compact: v })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
