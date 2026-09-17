import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePostal, postalCountries } from "./postal.ts";
import { aqiBand, samePlace, solarDay, sunClock, uvBand } from "./weather-meta.ts";

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

test("samePlace treats nearby New York hits as one city", () => {
  const nominatim = { city: "New York", lat: 40.7484, lon: -73.9967, detail: "New York, New York, United States" };
  const meteo = { city: "New York", lat: 40.7128, lon: -74.006, detail: "New York, New York, United States" };
  assert.equal(samePlace(nominatim, meteo), true);
  assert.equal(
    samePlace(nominatim, { city: "Newark", lat: 40.7357, lon: -74.1724, detail: "Newark, New Jersey, United States" }),
    false,
  );
});

test("uvBand and aqiBand follow EPA-style bands", () => {
  assert.equal(uvBand(1).label, "Low");
  assert.equal(uvBand(5).label, "Moderate");
  assert.equal(uvBand(7).label, "High");
  assert.equal(uvBand(9).label, "Very high");
  assert.equal(uvBand(12).label, "Extreme");
  assert.equal(aqiBand(32).label, "Good");
  assert.equal(aqiBand(80).label, "Moderate");
  assert.equal(aqiBand(140).label, "Sensitive");
  assert.equal(aqiBand(180).label, "Unhealthy");
  assert.equal(sunClock("2026-09-18T05:48"), "5:48 am");
  assert.equal(sunClock("2026-09-18T18:02"), "6:02 pm");
  assert.equal(sunClock(undefined), "—");
});

test("solarDay returns a NY sunrise before noon local", () => {
  const sun = solarDay(40.75, -74, new Date("2026-09-17T16:00:00Z"));
  assert.ok(sun.sunrise && sun.sunset);
  const riseH = Number(sun.sunrise.slice(11, 13));
  const setH = Number(sun.sunset.slice(11, 13));
  assert.ok(riseH >= 4 && riseH <= 8, sun.sunrise);
  assert.ok(setH >= 16 && setH <= 20, sun.sunset);
});
