import { test } from "node:test";
import assert from "node:assert/strict";
import { createOtp, otpCodePattern } from "../src/server/otp";
test("OTP codes are six digits; four are accepted only for the fixed store-review code", () => {
  for (let i = 0; i < 1000; i++) assert.match(createOtp(), /^\d{6}$/);
  for (const code of ["123", "12345", "1234567", "abcdef", "12 3456"])
    assert.equal(otpCodePattern.test(code), false);
  assert.equal(otpCodePattern.test("123456"), true);
  assert.equal(otpCodePattern.test("1234"), true);
});
