"use client";

import { useEffect } from "react";
import { useAfterPaint } from "@/lib/boot";
import { useAtrium } from "@/lib/store";
import { useMarkets } from "@/components/use-markets";
import { useWeather } from "@/components/weather-panel";

export function WarmQueries() {
  const financeOn = useAtrium((s) => s.modules.finance);
  const marketsOn = useAtrium((s) => s.marketPrefs.showMarkets !== false);
  useWeather();
  useMarkets();
  const pseReady = useAfterPaint(1400, financeOn && marketsOn);
  useEffect(() => {
    if (!pseReady) return;
    void fetch("/api/pse").catch(() => undefined);
  }, [pseReady]);
  return null;
}
