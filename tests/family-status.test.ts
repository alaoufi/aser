import test from "node:test";
import assert from "node:assert/strict";
import { familyAccountState } from "../src/lib/family-status";

const today = "2026-11-09";
const base = {
  status: "pending",
  verified: false,
  documentId: "00000000-0000-4000-8000-000000000001",
  documentType: "other_document",
  documentExpiresAt: "2027-01-01",
  reviewReason: null,
};

test("family account state covers review, active, incomplete and trusted", () => {
  assert.equal(familyAccountState(base, today).label, "تحت المراجعة");
  assert.match(familyAccountState(base, today).detail, /تم التسجيل/);
  assert.equal(
    familyAccountState({ ...base, documentId: null }, today).label,
    "بانتظار إكمال المطلوب",
  );
  assert.equal(
    familyAccountState(
      { ...base, documentId: null, documentType: "exception" },
      today,
    ).label,
    "تحت المراجعة",
    "an exception request is reviewable without a document",
  );
  assert.equal(
    familyAccountState({ ...base, documentExpiresAt: "2026-01-01" }, today).key,
    "incomplete",
  );
  const rejected = familyAccountState(
    { ...base, status: "rejected", reviewReason: " صورة المستند غير واضحة " },
    today,
  );
  assert.equal(rejected.label, "بانتظار إكمال المطلوب");
  assert.equal(rejected.reason, "صورة المستند غير واضحة");
  assert.equal(
    familyAccountState({ ...base, status: "approved", verified: true }, today)
      .label,
    "موثوق",
  );
  assert.equal(
    familyAccountState(
      {
        ...base,
        status: "approved",
        verified: true,
        documentId: null,
        documentType: "exception",
      },
      today,
    ).label,
    "نشط",
    "approval by administrative exception is active, not trusted",
  );
  assert.equal(
    familyAccountState(
      {
        ...base,
        status: "approved",
        verified: true,
        documentExpiresAt: "2026-11-08",
      },
      today,
    ).label,
    "نشط",
  );
  assert.equal(
    familyAccountState({ ...base, status: "suspended" }, today).label,
    "موقوف",
  );
});
