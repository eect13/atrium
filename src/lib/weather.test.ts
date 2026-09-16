import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePostal } from "./postal.ts";

test("parsePostal reads PH / US / ZIP+4 digits", () => {
  assert.deepEqual(parsePostal("1740"), { postal: "1740" });
  assert.deepEqual(parsePostal("10001"), { postal: "10001" });
  assert.deepEqual(parsePostal("10001-1234"), { postal: "10001" });
  assert.deepEqual(parsePostal("018956"), { postal: "018956" });
});

test("parsePostal reads UK and CA postcodes", () => {
  assert.deepEqual(parsePostal("SW1A 1AA"), { postal: "SW1A 1AA" });
  assert.deepEqual(parsePostal("sw1a1aa"), { postal: "SW1A 1AA" });
  assert.deepEqual(parsePostal("M5V 2T6"), { postal: "M5V 2T6" });
});

test("parsePostal pulls a trailing code off a city name", () => {
  assert.deepEqual(parsePostal("Las Pinas 1740"), { postal: "1740" });
  assert.deepEqual(parsePostal("New York 10001"), { postal: "10001" });
});

test("parsePostal reads JP 7-digit and ignores junk", () => {
  assert.deepEqual(parsePostal("100-0001"), { postal: "1000001" });
  assert.equal(parsePostal("Las Piñas"), null);
  assert.equal(parsePostal("Manila"), null);
  assert.equal(parsePostal("100"), null);
  assert.equal(parsePostal(""), null);
});
