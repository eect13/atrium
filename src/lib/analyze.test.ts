import assert from "node:assert/strict";
import { test } from "node:test";
import { runFinanceAnalyze } from "./analyze.ts";

test("analyzer does not spend quota without a key", async () => {
  const prev = process.env.XAI_API_KEY;
  delete process.env.XAI_API_KEY;
  const out = await runFinanceAnalyze({ question: "Take on BDO versus the PSEi" });
  assert.equal(out.ok, false);
  if (out.ok === false) assert.match(out.error, /off/i);
  if (prev) process.env.XAI_API_KEY = prev;
  else delete process.env.XAI_API_KEY;
});

test("analyzer rejects a blank question", async () => {
  const prev = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "test";
  const out = await runFinanceAnalyze({ question: "hi" });
  assert.equal(out.ok, false);
  if (prev) process.env.XAI_API_KEY = prev;
  else delete process.env.XAI_API_KEY;
});
