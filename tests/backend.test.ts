import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhone,
  assertOrigin,
  validateDocument,
  encryptDocument,
  decryptDocument,
} from "../src/server/security";
test("Saudi phone normalization and invalid rejection", () => {
  assert.equal(normalizePhone("0501234567"), "+966501234567");
  assert.throws(() => normalizePhone("123"));
});
test("CSRF rejects absent and foreign origins", () => {
  const previousOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "https://example.com";
  try {
    assert.throws(() =>
      assertOrigin(new Request("https://example.com/api", { method: "POST" })),
    );
    assert.throws(() =>
      assertOrigin(
        new Request("https://example.com/api", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    );
    assert.doesNotThrow(() =>
      assertOrigin(
        new Request("https://example.com/api", {
          headers: { origin: "https://example.com" },
        }),
      ),
    );
  } finally {
    if (previousOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previousOrigin;
  }
});
test("documents reject disguised content and oversized files", () => {
  assert.throws(() => validateDocument(Buffer.from("<script>"), "image/png"));
  assert.throws(() =>
    validateDocument(Buffer.alloc(10485761), "application/pdf"),
  );
  assert.doesNotThrow(() =>
    validateDocument(Buffer.from("%PDF-1.7\n"), "application/pdf"),
  );
});
test("private file encryption authenticates content", () => {
  const key = Buffer.alloc(32, 7);
  const encrypted = encryptDocument(Buffer.from("private"), key);
  assert.equal(decryptDocument(encrypted, key).toString(), "private");
  encrypted[encrypted.length - 1] ^= 1;
  assert.throws(() => decryptDocument(encrypted, key));
});
import {
  profileSchema,
  productSchema,
  reviewSchema,
} from "../src/server/validation";
import {
  registrationOpen,
  requestOtp,
  sessionCookie,
} from "../src/server/auth";
import { readBoundedBody } from "../src/server/http";
test("profile and product validation reject unsafe and unbounded input", () => {
  assert.equal(
    profileSchema.safeParse({
      name: "أسرة",
      cityId: "riyadh",
      phone: "0501234567",
      documentType: "exception",
      documentId: "not-a-uuid",
      categoryIds: ["1"],
    }).success,
    false,
  );
  assert.equal(
    productSchema.safeParse({
      name: "منتج",
      description: "وصف كاف",
      price: -1,
      unit: "طبق",
      status: "available",
      categoryIds: ["1"],
    }).success,
    false,
  );
  assert.equal(
    reviewSchema.safeParse({
      decision: "approved",
      reason: "مراجعة إدارية صحيحة",
    }).success,
    false,
  );
  assert.equal(
    reviewSchema.safeParse({
      decision: "approved",
      reason: "مراجعة إدارية صحيحة",
      eligibilityConfirmed: true,
    }).success,
    true,
  );
});
test("unconfigured SMS never allows registration or emits a challenge", async () => {
  const old = process.env.SMS_VERIFIED;
  delete process.env.SMS_VERIFIED;
  try {
    assert.equal(registrationOpen(), false);
    await assert.rejects(requestOtp("0501234567", "signup"), /غير متاح/);
  } finally {
    if (old === undefined) delete process.env.SMS_VERIFIED;
    else process.env.SMS_VERIFIED = old;
  }
});
test("session cookie prohibits JavaScript access and production insecure transport", () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    const cookie = sessionCookie("opaque");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
  } finally {
    Object.assign(process.env, { NODE_ENV: previous });
  }
});
test("request body limits do not trust Content-Length", async () => {
  const req = new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-length": "1" },
    body: "123456",
  });
  await assert.rejects(readBoundedBody(req, 5), /حجم/);
});
import sharp from "sharp";
import { prepareProductImage } from "../src/server/media";
import { submissionSchema } from "../src/server/reports";
test("product photos decode actual image pixels and strip identifying metadata", async () => {
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#fff" },
  })
    .withExif({ IFD0: { Artist: "Private identity" } })
    .jpeg()
    .toBuffer();
  const output = await prepareProductImage(
    new File([bytes], "image.jpg", { type: "image/jpeg" }),
  );
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  await assert.rejects(
    prepareProductImage(
      new File([Buffer.from([255, 216, 255, 1])], "broken.jpg", {
        type: "image/jpeg",
      }),
    ),
    /تعذر/,
  );
});
test("report target and advanced profile links and hours reject ambiguous unsafe data", () => {
  assert.equal(
    submissionSchema.safeParse({ reason: "بلاغ يتضمن تفاصيل كافية" }).success,
    false,
  );
  assert.equal(
    submissionSchema.safeParse({
      productId: "8ecbda5e-d0d3-4c51-b083-ec42789e617f",
      producerId: "8ecbda5e-d0d3-4c51-b083-ec42789e617f",
      reason: "بلاغ يتضمن تفاصيل كافية",
    }).success,
    false,
  );
  const profile = {
    name: "أسرة اختبار",
    cityId: "riyadh",
    phone: "0501234567",
    documentType: "producer_certificate",
    documentId: "8ecbda5e-d0d3-4c51-b083-ec42789e617f",
    categoryIds: ["1"],
  };
  assert.equal(
    profileSchema.safeParse({
      ...profile,
      socialLinks: [{ platform: "instagram", url: "https://evil.invalid" }],
    }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      ...profile,
      businessHours: [{ day: 1, opens: "18:00", closes: "09:00" }],
    }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...profile, website: "javascript:alert(1)" })
      .success,
    false,
  );
});
import { cleanupAuthRows } from "../src/server/auth-maintenance";
test("authentication maintenance rejects unbounded cleanup batches", async () => {
  for (const size of [0, -1, 1001, 1.5, Number.NaN])
    await assert.rejects(cleanupAuthRows(size), /1 to 1000/);
});
