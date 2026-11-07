import { test } from "node:test";
import assert from "node:assert/strict";
import {
  categorySchema,
  locationSchema,
  moderationSchema,
  reportSchema,
  assertAdmin,
} from "../src/server/admin";
test("admin resource services reject customer and producer roles", () => {
  assert.throws(
    () => assertAdmin({ id: "x", name: "x", phone: "x", role: "producer" }),
    /صلاحية/,
  );
  assert.doesNotThrow(() =>
    assertAdmin({ id: "x", name: "x", phone: "x", role: "admin" }),
  );
});
test("category and linked location validation bound values and hierarchy", () => {
  assert.equal(
    categorySchema.safeParse({ name: "اسم", slug: "<script>", icon: "✦" })
      .success,
    false,
  );
  assert.equal(
    locationSchema.safeParse({ kind: "city", name: "مدينة" }).success,
    false,
  );
  assert.equal(
    locationSchema.safeParse({
      kind: "neighborhood",
      name: "حي",
      cityId: "riyadh",
    }).success,
    true,
  );
});
test("moderation requires a reason and an actual update; reports restrict states", () => {
  assert.equal(
    moderationSchema.safeParse({
      id: "8ecbda5e-d0d3-4c51-b083-ec42789e617f",
      reason: "سبب صحيح",
    }).success,
    false,
  );
  assert.equal(
    reportSchema.safeParse({
      id: "8ecbda5e-d0d3-4c51-b083-ec42789e617f",
      status: "arbitrary",
      reason: "سبب صحيح",
    }).success,
    false,
  );
});
