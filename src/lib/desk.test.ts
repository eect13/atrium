import assert from "node:assert/strict";
import { test } from "node:test";
import { resizeFrom } from "./desk.ts";

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
