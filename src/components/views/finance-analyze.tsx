"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchFinanceAnalyze } from "@/lib/analyze";
import { deskMarket } from "@/lib/desk-market";
import { useAtrium } from "@/lib/store";

export function FinanceAnalyze() {
  const region = useAtrium((s) => s.profile.region);
  const seed = useAtrium((s) => s.analyzeSeed);
  const setAnalyzeSeed = useAtrium((s) => s.setAnalyzeSeed);
  const market = deskMarket(region);
  const [ticker, setTicker] = useState(seed?.ticker ?? "");
  const [question, setQuestion] = useState(seed?.question ?? "");

  useEffect(() => {
    if (!seed) return;
    if (seed.ticker) setTicker(seed.ticker);
    if (seed.question) setQuestion(seed.question);
  }, [seed]);

  const run = useMutation({
    mutationFn: () =>
      fetchFinanceAnalyze({
        data: {
          question: question.trim() || `CFA take on ${ticker.trim() || market.index.label}.`,
          region: market.id,
          ticker: ticker.trim() || undefined,
          context: seed?.context,
        },
      }),
  });

  const take = run.data && run.data.ok ? run.data.text : null;
  const error = run.data && !run.data.ok ? run.data.error : run.error ? "Analyzer could not run." : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-0">
          <CardTitle>Analyzer</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {market.name} desk. You click — it does not run on open. Not a recommendation.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="analyze-ticker">Ticker</Label>
            <Input
              id="analyze-ticker"
              className="h-11"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder={market.pseHome ? "BDO" : market.names[0]?.label ?? market.index.label}
              maxLength={16}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="analyze-q">Question</Label>
            <Textarea
              id="analyze-q"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={`What does the tape say about ${market.index.label}?`}
              maxLength={400}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={run.isPending || question.trim().length + ticker.trim().length < 3}
              onClick={() => run.mutate()}
            >
              {run.isPending ? "Working…" : "Run take"}
            </Button>
            {seed ? (
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setAnalyzeSeed(null)}>
                Clear sheet seed
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {error ? (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      ) : null}
      {take ? (
        <Card>
          <CardHeader className="space-y-0">
            <CardTitle>Take</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {run.data && run.data.ok ? run.data.model : "grok-4.5"} · not an offer to buy or sell
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 whitespace-pre-wrap text-sm leading-relaxed">{take}</div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Name a ticker or ask a question, then run. The sheet can seed this tab. Quota is the app owner's, so it
          never fires on its own.
        </p>
      )}
    </div>
  );
}
