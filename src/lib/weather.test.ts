import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePostal, postalCountries } from "./postal.ts";

test("parsePostal reads PH / US / ZIP+4 digits", () => {
  assert.deepEqual(parsePostal("1740"), { postal: "1740", hint: "ph" });
  assert.deepEqual(parsePostal("10001"), { postal: "10001", hint: "us" });
  assert.deepEqual(parsePostal("10001-1234"), { postal: "10001", hint: "us" });
  assert.deepEqual(parsePostal("018956"), { postal: "018956", hint: "in" });
});

test("parsePostal reads UK and CA postcodes", () => {
  assert.deepEqual(parsePostal("SW1A 1AA"), { postal: "SW1A 1AA", hint: "gb" });
  assert.deepEqual(parsePostal("sw1a1aa"), { postal: "SW1A 1AA", hint: "gb" });
  assert.deepEqual(parsePostal("M5V 2T6"), { postal: "M5V 2T6", hint: "ca" });
});

test("parsePostal pulls a trailing code off a city name", () => {
  assert.deepEqual(parsePostal("Las Pinas 1740"), { postal: "1740", hint: "ph" });
  assert.deepEqual(parsePostal("New York 10001"), { postal: "10001", hint: "us" });
});

test("parsePostal reads JP 7-digit and ignores junk", () => {
  assert.deepEqual(parsePostal("100-0001"), { postal: "1000001", hint: "jp" });
  assert.equal(parsePostal("Las Piñas"), null);
  assert.equal(parsePostal("Manila"), null);
  assert.equal(parsePostal("100"), null);
  assert.equal(parsePostal(""), null);
});

test("postalCountries prefers US for 5-digit even on a PH desk", () => {
  assert.equal(postalCountries("PH", "us")[0], "us");
  assert.equal(postalCountries("PH", "ph")[0], "ph");
  assert.ok(postalCountries("AU", "ph")[0] === "au");
});
