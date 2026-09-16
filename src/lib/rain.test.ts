import assert from "node:assert/strict";
import { test } from "node:test";
import { rainSoon } from "./rain.ts";

test("rainSoon is silent with no hours", () => {
  assert.equal(rainSoon([]), null);
});

test("rainSoon reports dry when nothing is wet", () => {
  assert.equal(rainSoon([{ t: "2026-09-17T12:00", rain: 10 }]), "Dry next 6 hours");
});

test("rainSoon names the next wet hour", () => {
  const hours = [
    { t: "2026-09-17T12:00", rain: 5 },
    { t: "2026-09-17T15:00", rain: 60 },
  ];
  assert.equal(rainSoon(hours), "Rain around 3pm (60%)");
});

test("rainSoon says now when the first hour is wet", () => {
  assert.equal(rainSoon([{ t: "2026-09-17T08:00", rain: 40, mm: 0.4 }]), "Rain now (40%)");
});
