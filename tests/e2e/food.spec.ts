import { test, expect } from "@playwright/test";
test("food photography stays visible and separate from search across tablet breakpoints", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Responsive geometry exercised once",
  );
  for (const width of [390, 601, 768, 850, 851, 1024, 1150, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    // القالب المفعّل: الباب النجدي (الافتراضي) أو صور الأطباق الكلاسيكية.
    const najdi =
      (await page.locator("html").getAttribute("data-template")) === "najdi";
    const visual = najdi ? ".najdi-wall" : ".food-showcase";
    if (najdi) {
      await expect(page.locator(".najdi-door")).toBeVisible();
      await expect(page.locator(".najdi-window")).toHaveCount(2);
    } else await expect(page.locator(".food-showcase img")).toHaveCount(5);
    // مسميات الصحون وأرقامها حُذفت بطلب المالك.
    await expect(page.locator(".food-showcase .food-dish-name")).toHaveCount(0);
    await expect(page.locator(".food-showcase .dish-number")).toHaveCount(0);
    const overlaps = await page.evaluate((sel) => {
      const a = document.querySelector(".hero-search")!.getBoundingClientRect(),
        b = document.querySelector(sel)!.getBoundingClientRect();
      return (
        a.left < b.right - 1 &&
        a.right > b.left + 1 &&
        a.top < b.bottom - 1 &&
        a.bottom > b.top + 1
      );
    }, visual);
    expect(overlaps, "search must not cover food photos at " + width).toBe(
      false,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
