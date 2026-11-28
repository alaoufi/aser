import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteClipText, parseInviteClip } from "../src/lib/invite-clipboard";

// تطبيق الآيفون يقرأ رابط الدعوة من الحافظة فقط، فلا يُؤخذ أي رقم آخر منسوخ (قرار المالك 2026-11-28).
test("the iPhone app reads only an invite link from the clipboard", () => {
  assert.equal(
    inviteClipText("https://jdtna.sa/", "241"),
    "https://jdtna.sa/r/241",
  );
  assert.equal(parseInviteClip("https://jdtna.sa/r/241"), "241");
  assert.equal(parseInviteClip("ادخل: jdatna.com/r/١٢٣ الآن"), "123");
  assert.equal(parseInviteClip("0551234567"), null);
  assert.equal(parseInviteClip("https://example.com/r/241"), null);
  assert.equal(parseInviteClip("https://jdtna.sa/r/12345678"), null);
  assert.equal(parseInviteClip(""), null);
  assert.equal(parseInviteClip(undefined), null);
});
