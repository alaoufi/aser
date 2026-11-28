import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewSchema } from "../src/server/validation";

// ملاحظة التفعيل اختيارية عند الاعتماد، ولازمة عند طلب الاستكمال أو الإيقاف.
test("review note is optional on approval and suspension, required to ask for missing items", () => {
  const ok = reviewSchema.parse({
    decision: "approved",
    eligibilityConfirmed: true,
  });
  assert.equal(ok.reason, "");
  assert.equal(
    reviewSchema.parse({
      decision: "approved",
      reason: "أهلًا بكم",
      eligibilityConfirmed: true,
    }).reason,
    "أهلًا بكم",
  );
  assert.throws(() => reviewSchema.parse({ decision: "rejected" }));
  // سبب الإيقاف اختياري (قرار المالك 2026-11-28)؛ طلب الاستكمال وحده يلزمه ذكر النواقص.
  assert.ok(reviewSchema.parse({ decision: "suspended" }));
  assert.throws(() =>
    reviewSchema.parse({ decision: "rejected", reason: "لا" }),
  );
  assert.ok(
    reviewSchema.parse({ decision: "rejected", reason: "أرفقوا الشهادة" }),
  );
  // الاعتماد ما زال يتطلب تأكيد الأهلية.
  assert.throws(() => reviewSchema.parse({ decision: "approved" }));
});
