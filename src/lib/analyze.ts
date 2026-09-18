/** User-initiated CFA-style take. Spends the app owner's xAI quota — never on page load. */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { deskMarket } from "./desk-market.ts";

const MAX_Q = 400;
const MAX_CTX = 2_400;

export type AnalyzeResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

function clip(s: string, n: number) {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

export async function runFinanceAnalyze(input: {
  question: string;
  region?: string;
  ticker?: string;
  context?: string;
}): Promise<AnalyzeResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "Analyzer is off in this environment." };
  const question = clip(input.question, MAX_Q);
  if (question.length < 3) return { ok: false, error: "Ask a real question, or name a ticker." };
  const market = deskMarket(input.region);
  const ticker = clip(input.ticker ?? "", 16);
  const context = clip(input.context ?? "", MAX_CTX);
  const system = [
    "You are Atrium's CFA desk. Short, numbered takes. No emoji.",
    "Not a recommendation, not a DCF, not a target. Label assumptions.",
    `Desk region is ${market.name}. Home index is ${market.index.label ?? market.index.symbol}.`,
    "Use only the tape and headlines in the user message. If a number is missing, say so.",
    "PSEi vs Nifty is two delayed index lasts, not a pairs trade.",
    "End with one line: Not an offer to buy or sell.",
  ].join(" ");
  const user = [
    ticker ? `Ticker: ${ticker}` : "",
    `Question: ${question}`,
    context ? `Context:\n${context}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 700,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return { ok: false, error: `Analyzer returned ${res.status}.` };
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false, error: "Empty take from the model." };
    return { ok: true, text, model: "grok-4.5" };
  } catch {
    return { ok: false, error: "Analyzer could not reach xAI." };
  }
}

export const fetchFinanceAnalyze = createServerFn({ method: "POST" })
  .validator(
    z.object({
      question: z.string().min(3).max(MAX_Q),
      region: z.string().max(8).optional(),
      ticker: z.string().max(16).optional(),
      context: z.string().max(MAX_CTX).optional(),
    }),
  )
  .handler(async ({ data }) => runFinanceAnalyze(data));
