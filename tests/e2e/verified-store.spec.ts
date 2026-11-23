import { test, expect } from "@playwright/test";

/**
 * شارة «متجر موثّق» ثابتة في الزاوية اليمنى السفلى، والضغط يفتح بيانات الشهادة مباشرة عبر /verified
 * (يحوّل إلى رابط «عرض التحقق» من خدمة الختم الرسمية).
 */
test("the verified-store badge sits at the bottom-right and opens the certificate directly", async ({
  page,
}) => {
  await page.goto("/");
  if (process.env.SHOTS)
    test.info().annotations.push({ type: "shot", description: "verified" });
  const badge = page.getByRole("link", {
    name: /متجر موثّق في المركز السعودي للأعمال، رقم الشهادة 0000346762/,
  });
  await expect(badge).toBeVisible();
  // بشكل ختم المنصة: الشعار في مربع أبيض و«متجر موثّق».
  await expect(badge).toHaveText("متجر موثّق");
  await expect(badge.locator("img[src='/sbc-emblem.svg']")).toHaveCount(1);
  await expect(badge).toHaveAttribute("href", "/verified");
  await expect(badge).toHaveAttribute("target", "_blank");
  const box = (await badge.boundingBox())!;
  const vw = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(vw.height);
  expect(box.y).toBeGreaterThan(vw.height / 2);
  const nav = page.getByRole("navigation", { name: "القائمة السفلية" });
  if (await nav.isVisible()) {
    // الجوال: فوق «حسابي» (أو «دخول» للزائر): يغطي وسطها، وفوقها مباشرة.
    const account = (await nav
      .getByRole("link", { name: /^(حسابي|دخول)$/ })
      .boundingBox())!;
    const mid = (b: { x: number; width: number }) => b.x + b.width / 2;
    expect(box.x).toBeLessThanOrEqual(mid(account));
    expect(box.x + box.width).toBeGreaterThanOrEqual(mid(account));
    expect(box.y + box.height).toBeLessThanOrEqual(account.y);
  } else {
    // الشاشة العريضة: الزاوية اليمنى السفلى.
    expect(vw.width - (box.x + box.width)).toBeLessThan(30);
  }
  if (process.env.SHOTS)
    await page.screenshot({
      path: `${process.env.SHOTS}/verified-${test.info().project.name}.png`,
    });
  // لا إطارات خارجية في الصفحة.
  await expect(page.locator("iframe")).toHaveCount(0);
  // /verified يحوّل إلى منصة المركز (رابط الشهادة، أو الاستعلام إن تعذّر الوصول).
  const r = await page.request.get("/verified", { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  expect(r.headers().location).toMatch(
    /^https:\/\/eauthenticate\.saudibusiness\.gov\.sa\/(certificate-details\/0000346762\?vt=|inquiry$)/,
  );
});

/** في صفحات الحساب والإدارة لا تظهر الشارة (لا تغطي الخرائط والنماذج). */
test("the badge is not shown on account pages", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator(".verified-store")).toHaveCount(0);
  await page.goto("/producers");
  await expect(page.locator(".verified-store")).toHaveCount(1);
});
