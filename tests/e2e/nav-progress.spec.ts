import { test, expect } from "@playwright/test";

/**
 * التنقل: شريط تقدم يظهر فور الضغط على رابط داخلي ويختفي بوصول الصفحة، والقائمة السفلية للزائر
 * مرسومة في HTML الخادم (لا تنتظر /api/session)، والصفحة غير الموجودة تبقى 404.
 */
test("a click shows the progress bar at once, and the guest bottom bar is server-rendered", async ({
  page,
  request,
}, info) => {
  // صفحة الأسر تتأخر ثانية: الشريط يظهر قبل وصولها.
  await page.route("**/producers?_rsc=*", async (route) => {
    await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
  });
  await page.goto("/");
  // بعد اكتمال تهيئة الصفحة (المستمع يُربط عند hydration).
  await page.waitForLoadState("networkidle");
  await page
    .locator("footer")
    .getByRole("link", { name: "الأسر المنتجة" })
    .click();
  await expect(page.locator(".nav-progress")).toBeVisible({ timeout: 600 });
  await expect(page).toHaveURL(/\/producers/);
  await expect(page.locator(".nav-progress")).toHaveCount(0);
  if (info.project.name === "mobile") {
    const html = await (await request.get("/")).text();
    expect(html).toContain('aria-label="القائمة السفلية"');
  }
  expect((await request.get("/producers/no-such-family-xyz")).status()).toBe(
    404,
  );
});
