import { test, expect } from "@playwright/test";

/**
 * شارة «متجر موثّق» ثابتة في زاوية الصفحة اليمنى السفلى: رقم الشهادة، وتفتح صفحة الاستعلام
 * الرسمية في تبويب جديد. الختم الرسمي يحل محلها إن فعّلته المنصة؛ هنا تُحاكى «أخفِ» كما ترد الآن.
 */
test("the verified-store badge sits fixed at the bottom-right corner", async ({
  page,
}) => {
  await page.route("https://eauthenticate.saudibusiness.gov.sa/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<script>parent.postMessage({sbcSeal:true,remove:true},'*')</script>",
    }),
  );
  await page.goto("/");
  // لا إطار خارجي قبل اكتمال الصفحة (اختبارات أخرى تنتظر هدوء الشبكة).
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".verified-seal-frame")).toHaveCount(0);
  const badge = page.getByRole("button", {
    name: "متجر موثّق في المركز السعودي للأعمال، رقم الشهادة 0000346762",
  });
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("0000346762");
  await expect(badge).toHaveAttribute("aria-haspopup", "dialog");
  // الختم يُطلب بعد اكتمال الصفحة (لا يؤخر تحميلها)، و«أخفِ» من المنصة تحذف إطاره.
  await page.waitForRequest(/EAuthSealApi\/seal\?token=/, { timeout: 15000 });
  await expect(page.locator(".verified-seal-frame")).toHaveCount(0);
  // ثابتة في الزاوية اليمنى السفلى وهي ظاهرة بلا تمرير.
  const box = (await badge.boundingBox())!;
  const vw = page.viewportSize()!;
  expect(vw.width - (box.x + box.width)).toBeLessThan(30);
  expect(box.y + box.height).toBeLessThanOrEqual(vw.height);
  expect(box.y).toBeGreaterThan(vw.height / 2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  // الضغط يعرض بيانات الشهادة، وزر التحقق يفتح المنصة الرسمية، و✕ يغلق.
  await badge.click();
  const card = page.getByRole("dialog", { name: "متجر موثّق" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("0000346762");
  await expect(card).toContainText("جدتنا");
  await expect(card).toContainText("سارية");
  await expect(card).toContainText("09/01/2027");
  await expect(
    card.getByRole("link", { name: "تحقق في منصة المركز السعودي للأعمال" }),
  ).toHaveAttribute(
    "href",
    "https://eauthenticate.saudibusiness.gov.sa/inquiry",
  );
  if (process.env.SHOTS)
    await page.screenshot({
      path: `${process.env.SHOTS}/certificate-${test.info().project.name}.png`,
    });
  await card.getByRole("button", { name: "إغلاق" }).click();
  await expect(card).toBeHidden();
  if (process.env.SHOTS)
    await page.screenshot({
      path: `${process.env.SHOTS}/verified-${test.info().project.name}.png`,
    });
});

/** حين تفعّل المنصة الختم (ترسل مقاسه) يظهر الختم الرسمي مكان شارتنا. */
test("the official seal replaces our badge once the platform sends its size", async ({
  page,
}) => {
  await page.route("https://eauthenticate.saudibusiness.gov.sa/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<button class='sbc-badge'>متجر موثّق</button><script>parent.postMessage({sbcSeal:true,width:121,height:46},'*')</script>",
    }),
  );
  await page.goto("/");
  const frame = page.locator(".verified-seal-frame");
  await expect(frame).toHaveCSS("width", "121px", { timeout: 15000 });
  await expect(page.locator(".verified-store")).toHaveCount(0);
  expect(await frame.getAttribute("src")).toContain(
    "token=bzdWdzBVYW5qUnlEZnRkd3hIWFY3QT09",
  );
});
