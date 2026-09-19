import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSparkRange, pointsToPath, pointsToTape, sessionSpark, sparkFetchable, tapeSpark, writeTapeSpark } from "./sparks.ts";

test("normalizeSparkRange defaults to 3m", () => {
  assert.equal(normalizeSparkRange(undefined), "3m");
  assert.equal(normalizeSparkRange("1w"), "1w");
  assert.equal(normalizeSparkRange("nope"), "3m");
});

test("sessionSpark is a curve, not a 2-point line", () => {
  const pts = sessionSpark(110, 10, "BDO:3m:2026-09-07", 36);
  assert.equal(pts.length, 36);
  assert.ok(Math.abs((pts[0] ?? 0) - 100) < 1e-6);
  assert.equal(pts[pts.length - 1], 110);
  const unique = new Set(pts.map((n) => n.toFixed(4)));
  assert.ok(unique.size > 4, "must wobble, not collinear");
});

test("sessionSpark is stable for the same seed", () => {
  const a = sessionSpark(50, -2, "TEL:1d", 20);
  const b = sessionSpark(50, -2, "TEL:1d", 20);
  assert.deepEqual(a, b);
});

test("pointsToPath uses cubics for a curve", () => {
  const pts = sessionSpark(120, 1.4, "BDO", 16);
  const { line, area } = pointsToPath(pts, 120, 36);
  assert.match(line, /^M/);
  assert.match(line, /C/);
  assert.match(area, /Z$/);
});

test("sparkFetchable skips PSE last and keeps Yahoo symbols", () => {
  assert.equal(sparkFetchable({ id: "BDO", kind: "stock" }), false);
  assert.equal(sparkFetchable({ id: "BDO.PS", kind: "stock" }), false);
  assert.equal(sparkFetchable({ id: "PSEI.PS", kind: "global" }), true);
  assert.equal(sparkFetchable({ id: "^NSEI", kind: "global" }), true);
  assert.equal(sparkFetchable({ id: "0700.HK", kind: "global" }), true);
  assert.equal(sparkFetchable({ id: "bitcoin", kind: "crypto" }), true);
});

test("pointsToTape needs nine prints", () => {
  assert.deepEqual(pointsToTape([100, 101, 102], 90), []);
  const pts = pointsToTape(
    Array.from({ length: 10 }, (_, i) => 100 + i),
    90,
    Date.UTC(2026, 8, 19),
  );
  assert.equal(pts.length, 10);
  assert.ok(pts.every((p) => p.p >= 100 && /^\d{4}-\d{2}-\d{2}$/.test(p.d)));
});

test("writeTapeSpark backfills and keeps today's last", () => {
  const mem = new Map<string, string>();
  const store = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
  const vals = Array.from({ length: 12 }, (_, i) => 100 + i);
  writeTapeSpark("PSEI.PS", vals, 90);
  const first = tapeSpark("PSEI.PS", 90);
  assert.ok(first && first.length >= 9);
  const raw = JSON.parse(mem.get("atrium.tape.v1") ?? "{}") as Record<string, { d: string; p: number }[]>;
  const today = raw["PSEI.PS"]?.at(-1)?.d;
  assert.ok(today);
  raw["PSEI.PS"] = [...(raw["PSEI.PS"] ?? []).filter((p) => p.d !== today), { d: today, p: 999 }];
  mem.set("atrium.tape.v1", JSON.stringify(raw));
  writeTapeSpark(
    "PSEI.PS",
    vals.map((v) => v + 50),
    90,
  );
  const after = tapeSpark("PSEI.PS", 90);
  assert.equal(after?.at(-1), 999);
});
