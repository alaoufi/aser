import { expect, test } from "@playwright/test";

// التطبيق القديم يفتح jdatna.com/?source=app أو ?source=ios: يُحوَّل لشاشة التحديث (طلب المالك 2026-11-25).
test.describe("old app versions are sent to update", () => {
  test("old Android app on jdatna.com goes to the Google Play update", async ({
    request,
  }) => {
    const res = await request.get("/?source=app", {
      headers: { host: "jdatna.com" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toBe(
      "https://jdatna.com/update-app?p=android",
    );
  });
  test("old iPhone app goes to the App Store update", async ({ request }) => {
    const res = await request.get("/?source=ios", {
      headers: { host: "www.jdatna.com" },
      maxRedirects: 0,
    });
    expect(res.headers().location).toBe(
      "https://www.jdatna.com/update-app?p=ios",
    );
  });
  test("the new apps on jdtna.sa open normally", async ({ request }) => {
    const res = await request.get("/?source=app", {
      headers: { host: "jdtna.sa" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
  });
  test("update screen links only to the store", async ({ page }) => {
    await page.goto("/update-app?p=ios");
    await expect(
      page.getByRole("link", { name: "حدّث من App Store" }),
    ).toHaveAttribute("href", /apps\.apple\.com\/sa\/app\/id6833382132/);
    // لا مواصلة في الموقع: بلا ترويسة ولا قائمة سفلية ولا تذييل.
    await expect(page.locator(".site-header")).toHaveCount(0);
    await expect(page.locator(".bottom-nav")).toHaveCount(0);
    await expect(page.locator(".site-footer")).toHaveCount(0);
    await page.goto("/update-app?p=android");
    await expect(
      page.getByRole("link", { name: "حدّث من Google Play" }),
    ).toHaveAttribute("href", /play\.google\.com/);
  });
});
