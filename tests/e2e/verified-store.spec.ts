import { test, expect } from "@playwright/test";

/**
 * شارة «متجر موثّق» ثابتة في الزاوية اليمنى السفلى، والضغط يفتح بيانات الشهادة مباشرة عبر /verified
 * (يحوّل إلى رابط «عرض التحقق» من خدمة الختم الرسمية).
 */
test("the verified-store badge sits at the bottom-right and opens the certificate directly", async ({
  page,
}) => {
  await page.goto("/");
  const badge = page.getByRole("link", {
    name: /متجر موثّق في المركز السعودي للأعمال، رقم الشهادة 0000346762/,
  });
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("0000346762");
  await expect(badge).toHaveAttribute("href", "/verified");
  await expect(badge).toHaveAttribute("target", "_blank");
  const box = (await badge.boundingBox())!;
  const vw = page.viewportSize()!;
  expect(vw.width - (box.x + box.width)).toBeLessThan(30);
  expect(box.y + box.height).toBeLessThanOrEqual(vw.height);
  expect(box.y).toBeGreaterThan(vw.height / 2);
  // لا إطارات خارجية في الصفحة.
  await expect(page.locator("iframe")).toHaveCount(0);
  // /verified يحوّل إلى منصة المركز (رابط الشهادة، أو الاستعلام إن تعذّر الوصول).
  const r = await page.request.get("/verified", { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  expect(r.headers().location).toMatch(
    /^https:\/\/eauthenticate\.saudibusiness\.gov\.sa\/(certificate-details\/0000346762\?vt=|inquiry$)/,
  );
});
