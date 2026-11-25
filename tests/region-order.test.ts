import { test } from "node:test";
import assert from "node:assert/strict";
import { compareCities, regionOrder } from "../src/lib/regions";
import { getCities } from "../src/server/catalog";

test("cities follow the official order: Riyadh, Makkah, Madinah…, the region seat first", () => {
  const list = [
    { name: "جدة", regionId: "makkah" },
    { name: "الخرج", regionId: "riyadh" },
    { name: "ينبع", regionId: "madinah" },
    { name: "مكة المكرمة", regionId: "makkah" },
    { name: "الرياض", regionId: "riyadh" },
    { name: "المدينة المنورة", regionId: "madinah" },
    { name: "أحد", regionId: "unknown" },
  ].sort(compareCities);
  assert.deepEqual(
    list.map((c) => c.name),
    ["الرياض", "الخرج", "مكة المكرمة", "جدة", "المدينة المنورة", "ينبع", "أحد"],
  );
});

test(
  "isolated getCities returns regions in the official order with each seat first",
  { skip: process.env.JDATNA_TEST_DB !== "true" },
  async () => {
    const cities = await getCities();
    // المناطق الرسمية فقط: اختبارات أخرى تعمل معه بالتوازي قد تضيف مناطق مؤقتة للاختبار.
    const regions = [...new Set(cities.map((c) => c.regionId))].filter((r) =>
      regionOrder.includes(r),
    );
    assert.deepEqual(
      regions,
      regionOrder.filter((r) => regions.includes(r)),
    );
    assert.deepEqual(regions.slice(0, 3), ["riyadh", "makkah", "madinah"]);
    const first = (r: string) => cities.find((c) => c.regionId === r)?.name;
    assert.equal(first("riyadh"), "الرياض");
    assert.equal(first("makkah"), "مكة المكرمة");
    assert.equal(first("madinah"), "المدينة المنورة");
    assert.equal(first("eastern"), "الدمام");
    assert.equal(first("qassim"), "بريدة");
    const makkah = cities
      .filter((c) => c.regionId === "makkah")
      .map((c) => c.name);
    assert.deepEqual(makkah.slice(0, 3), ["مكة المكرمة", "جدة", "الطائف"]);
  },
);
