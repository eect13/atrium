import assert from "node:assert/strict";
import { test } from "node:test";
import { boxOffscreen, normalizeWinBox, resizeFrom, restoreBox, snapDesk } from "./desk.ts";

const box = { x: 100, y: 80, w: 200, h: 160 };

test("resizeFrom se grows without moving origin", () => {
  const next = resizeFrom("se", box, 40, 20, 180, 120);
  assert.deepEqual(next, { x: 100, y: 80, w: 240, h: 180 });
});

test("resizeFrom nw moves origin", () => {
  const next = resizeFrom("nw", box, -30, -20, 180, 120);
  assert.deepEqual(next, { x: 70, y: 60, w: 230, h: 180 });
});

test("resizeFrom respects min size from the west", () => {
  const next = resizeFrom("sw", box, 80, 0, 180, 120);
  assert.equal(next.w, 180);
  assert.equal(next.x, 120);
  assert.equal(next.y, 80);
});

test("resizeFrom e grows width only", () => {
  const box = { x: 100, y: 80, w: 200, h: 160 };
  const next = resizeFrom("e", box, 40, 99, 180, 120);
  assert.equal(next.x, 100);
  assert.equal(next.y, 80);
  assert.equal(next.w, 240);
  assert.equal(next.h, 160);
});

test("resizeFrom n moves top", () => {
  const box = { x: 100, y: 80, w: 200, h: 160 };
  const next = resizeFrom("n", box, 0, -20, 180, 120);
  assert.equal(next.y, 60);
  assert.equal(next.h, 180);
});

test("normalizeWinBox keeps finite boxes and drops junk", () => {
  const next = normalizeWinBox({
    weather: { x: 400, y: 120, w: 320, h: 360 },
    news: { x: "nope", y: 1, w: 2, h: 3 },
    bogus: { x: 1, y: 2, w: 3, h: 4 },
  });
  assert.deepEqual(next.weather, { x: 400, y: 120, w: 320, h: 360 });
  assert.equal(next.news, undefined);
  assert.equal(Object.keys(next).length, 1);
});

test("restoreBox reuses last box and cascades when missing", () => {
  const saved = { x: 512, y: 160, w: 340, h: 280 };
  assert.deepEqual(restoreBox(saved, { w: 300, h: 240 }), saved);
  const cascaded = restoreBox(undefined, { w: 320, h: 360 }, 0);
  assert.equal(cascaded.w, 320);
  assert.equal(cascaded.h, 360);
  assert.ok(cascaded.x >= 248);
});

test("boxOffscreen is false without a window (SSR)", () => {
  assert.equal(boxOffscreen(-4000, -4000, 320, 360), false);
});

test("snapDesk is a no-op without a window (SSR)", () => {
  assert.deepEqual(snapDesk(1084, 56, 320, 360), { x: 1084, y: 56 });
});
