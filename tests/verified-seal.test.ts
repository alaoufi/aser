import { test } from "node:test";
import assert from "node:assert/strict";
import {
  linkFromSeal,
  resetSealCache,
  sealLink,
  VERIFICATION_INQUIRY,
} from "../src/server/verified-seal";

/** «متجر موثّق» يفتح بيانات الشهادة مباشرة: رابط «عرض التحقق» من خدمة الختم، وإلا الاستعلام. */
test("the verified link comes from the official seal, cached, with the inquiry as fallback", async () => {
  const link =
    "https://eauthenticate.saudibusiness.gov.sa/certificate-details/0000346762?vt=1.WGT.1795467084.abc_DEF-1";
  assert.equal(
    linkFromSeal(`<a class="x" href="${link}">عرض التحقق</a>`),
    link,
  );
  // شهادة أخرى أو لا رابط: لا يُقبل.
  assert.equal(linkFromSeal(link.replace("0000346762", "0000313633")), null);
  assert.equal(
    linkFromSeal("<script>parent.postMessage({remove:true})</script>"),
    null,
  );

  const real = globalThis.fetch;
  let calls = 0;
  try {
    resetSealCache();
    globalThis.fetch = (async () => {
      calls++;
      return new Response(`<a href="${link}">عرض التحقق</a>`);
    }) as typeof fetch;
    assert.equal(await sealLink(1_000), link);
    assert.equal(await sealLink(1_000 + 30 * 60_000), link, "من الذاكرة");
    assert.equal(calls, 1);
    // بعد ساعة يُجدَّد، وإن تعذّر يبقى آخر رابط.
    globalThis.fetch = (async () => {
      calls++;
      throw new Error("down");
    }) as typeof fetch;
    assert.equal(await sealLink(1_000 + 2 * 3_600_000), link);
    assert.equal(calls, 2);
    // بلا رابط سابق والمنصة لا ترد: صفحة الاستعلام.
    resetSealCache();
    assert.equal(await sealLink(5), VERIFICATION_INQUIRY);
  } finally {
    globalThis.fetch = real;
    resetSealCache();
  }
});
