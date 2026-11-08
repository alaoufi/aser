import { test } from "node:test";
import assert from "node:assert/strict";
import { createOtp, otpCodePattern } from "../src/server/otp";
test("OTP generation and accepted format are exactly four digits", () => {
  for (let i = 0; i < 1000; i++) assert.match(createOtp(), /^\d{4}$/);
  for (const code of ["123", "12345", "123456", "abcd", "12 3"])
    assert.equal(otpCodePattern.test(code), false);
  assert.equal(otpCodePattern.test("1234"), true);
});
