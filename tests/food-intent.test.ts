import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntent } from "../src/lib/arabic-intent";
import { describeFood, understandFood } from "../src/lib/food-intent";
import type { City } from "../src/lib/types";

const cities: City[] = [
  {
    id: "riyadh-city",
    name: "الرياض",
    regionId: "riyadh",
    regionName: "منطقة الرياض",
  },
  {
    id: "buraydah",
    name: "بريدة",
    regionId: "qassim",
    regionName: "منطقة القصيم",
  },
  {
    id: "jeddah",
    name: "جدة",
    regionId: "makkah",
    regionName: "منطقة مكة المكرمة",
  },
];

// التفاهم: جمل حقيقية الشكل يكتبها العميل بكلامه.
test("a full request: lunch for ten in Riyadh within 300", () => {
  const i = understandFood("أبي غدا لعشرة بالرياض بميزانية 300", { cities });
  assert.equal(i.meal, "lunch");
  assert.deepEqual(i.count, { value: 10, unit: "people" });
  assert.equal(i.budget, 300);
  assert.equal(i.when, null, "«غدا» هنا الغداء لا بكرة");
  assert.deepEqual(i.place, {
    regionId: "riyadh",
    cityId: "riyadh-city",
    name: "الرياض",
  });
  assert.equal(i.isRequest, true);
  assert.equal(i.dishes.length, 0);
  assert.equal(describeFood(i).missing, "dish", "ينقصه اسم الأكلة فيُسأل عنها");
});

test("a dish with a quantity and a day", () => {
  const i = understandFood("كليجا نص كيلو بكرة", { cities });
  assert.deepEqual(
    i.dishes.map((d) => d.slug),
    ["كليجا"],
  );
  assert.deepEqual(i.quantity, { value: 0.5, unit: "kg" });
  assert.equal(i.when, "tomorrow");
  assert.equal(i.search, "كليجا");
  assert.equal(describeFood(i).missing, "place");
});

test("an occasion with two dishes, people and a region", () => {
  const i = understandFood("عزيمة 20 شخص مرقوق وكبسة في القصيم", { cities });
  assert.equal(i.meal, "occasion");
  assert.deepEqual(i.count, { value: 20, unit: "people" });
  assert.deepEqual(
    i.dishes.map((d) => d.slug).sort(),
    ["كبسة", "مرقوق"].sort(),
  );
  assert.deepEqual(i.place, {
    regionId: "qassim",
    cityId: null,
    name: "منطقة القصيم",
  });
  assert.equal(describeFood(i).missing, null);
});

test("boxes, urgency and a family size", () => {
  const box = understandFood("ابغى معمول 3 علب ضروري", { cities });
  assert.deepEqual(box.quantity, { value: 3, unit: "box" });
  assert.equal(box.count, null, "the 3 is the quantity, not people");
  assert.equal(box.urgent, true);
  assert.deepEqual(
    box.dishes.map((d) => d.slug),
    ["معمول"],
  );
  const family = understandFood("مرقوق لعائلة 6 في جدة", { cities });
  assert.deepEqual(family.count, { value: 6, unit: "people" });
  assert.equal(family.place?.cityId, "jeddah");
});

test("a single word stays a plain search", () => {
  const i = understandFood("جريش", { cities });
  assert.equal(i.isRequest, false);
  assert.equal(i.search, "جريش");
});

test("budget phrases and Indic digits", () => {
  assert.equal(parseIntent("ما يتعدى ٢٥٠ ريال").budget, 250);
  assert.equal(parseIntent("بحدود 500").budget, 500);
  assert.equal(parseIntent("تحت 150").budget, 150);
  assert.equal(parseIntent("فطور بكرة الصبح").meal, "breakfast");
  assert.equal(parseIntent("بعد بكرة").when, "after_tomorrow");
});
