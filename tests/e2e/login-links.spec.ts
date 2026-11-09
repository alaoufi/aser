import { test, expect } from "@playwright/test";

test("login appears in the header only, never repeated in the page body or footer", async ({
  page,
}) => {
  for (const path of ["/", "/about", "/browse?by=family"]) {
    await page.goto(path);
    await expect(
      page.locator("main").getByRole("link", { name: /تسجيل الدخول/ }),
    ).toHaveCount(0);
    await expect(
      page.locator("footer").getByRole("link", { name: /تسجيل الدخول/ }),
    ).toHaveCount(0);
    // في الجوال داخل قائمة الثلاث شرطات، وفي الحاسوب زر الترويسة.
    await expect(page.locator('header a[href="/login"]')).not.toHaveCount(0);
  }
});
