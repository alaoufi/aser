import { expect, test } from "@playwright/test";

/**
 * عدّاد الزوار (قرار المالك 2026-11-26): كل فتح أو تحديث للصفحة زيارة تُحسب، ولو تكرر.
 * المتصفح يرسل { hit: true } مرة عند كل تحميل للصفحة فقط، والنبضة الدورية بلا hit.
 */
test("every page load and refresh sends one counted visit", async ({
  page,
}) => {
  const bodies: unknown[] = [];
  await page.route("**/api/visits", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        visible: true,
        adminOnly: false,
        today: bodies.length,
        total: 100 + bodies.length,
        online: 1,
      },
    });
  });
  // الزيارات المحسوبة فقط (وضع التطوير قد يرسل نبضة إضافية غير محسوبة).
  const hits = () =>
    bodies.filter((b) => (b as { hit?: boolean } | null)?.hit === true).length;
  await page.goto("/");
  await expect.poll(hits).toBe(1);
  await expect(
    page.getByRole("region", { name: "إحصاءات الزوار" }),
  ).toBeVisible();
  // التحديث زيارة جديدة.
  await page.reload();
  await expect.poll(hits).toBe(2);
  // العودة للصفحة (تبديل التبويب) نبضة لا تُحسب زيارة.
  const sent = bodies.length;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect.poll(() => bodies.length).toBeGreaterThan(sent);
  expect(hits()).toBe(2);
});
