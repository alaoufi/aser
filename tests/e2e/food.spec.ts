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
    await expect(page.locator(".food-showcase img")).toHaveCount(5);
    await expect(page.locator(".food-showcase .dish-number")).toHaveText([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    const overlaps = await page.evaluate(() => {
      const a = document.querySelector(".hero-search")!.getBoundingClientRect(),
        b = document.querySelector(".food-showcase")!.getBoundingClientRect();
      return (
        a.left < b.right - 1 &&
        a.right > b.left + 1 &&
        a.top < b.bottom - 1 &&
        a.bottom > b.top + 1
      );
    });
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
