import { test } from "node:test";
import assert from "node:assert/strict";
import { categories } from "../src/server/constants";
import { moderationSchema } from "../src/server/admin";
test("dairy and drinks are distinct canonical sections with valid icons", () => {
  for (const name of ["مشتقات الألبان", "المشروبات"]) {
    const c = categories.find((x) => x.name === name);
    assert.ok(c, name);
    assert.ok(c.icon);
  }
  assert.equal(new Set(categories.map((x) => x.id)).size, categories.length);
});
test("admin can assign all14 sections with bounded payload", () => {
  const input = {
    id: "00000000-0000-4000-8000-000000000001",
    categoryIds: Array.from({ length: 14 }, (_, i) => String(i + 1)),
    reason: "تحديث تصنيفات المنتج",
  };
  assert.equal(moderationSchema.safeParse(input).success, true);
  assert.equal(
    moderationSchema.safeParse({ ...input, categoryIds: Array(101).fill("1") })
      .success,
    false,
  );
});
import { documentType } from "../src/server/validation";
test("families can submit another eligibility document for admin review", () => {
  assert.equal(documentType.safeParse("other_document").success, true);
});
