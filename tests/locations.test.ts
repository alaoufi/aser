import { test } from "node:test";
import assert from "node:assert/strict";
import { cities } from "../src/server/constants";
import { regionOptions } from "../src/lib/regions";
test("region order follows requested administrative sequence independently of city input order", () => {
  assert.deepEqual(
    regionOptions([...cities].reverse())
      .slice(0, 4)
      .map((r) => r[0]),
    ["riyadh", "makkah", "madinah", "qassim"],
  );
});
test("Qassim contains governorate seats, all regions have multiple locations, and existing city IDs remain stable", () => {
  for (const name of [
    "بريدة",
    "عنيزة",
    "الرس",
    "البكيرية",
    "البدائع",
    "المذنب",
    "رياض الخبراء",
    "عيون الجواء",
    "الأسياح",
    "الشماسية",
    "النبهانية",
    "عقلة الصقور",
    "ضرية",
    "أبانات",
  ])
    assert.ok(
      cities.some((c) => c.regionId === "qassim" && c.name === name),
      name,
    );
  assert.equal(cities.find((c) => c.name === "بريدة")?.id, "buraydah");
  assert.equal(cities.find((c) => c.name === "جدة")?.id, "jeddah");
  assert.equal(new Set(cities.map((c) => c.id)).size, cities.length);
  assert.equal(
    new Set(cities.map((c) => c.regionId + ":" + c.name)).size,
    cities.length,
  );
  for (const [id] of regionOptions(cities))
    assert.ok(cities.filter((c) => c.regionId === id).length >= 4, id);
});
