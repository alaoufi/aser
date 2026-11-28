import { expect, test } from "@playwright/test";

// «البوابة»: كل نمط يُطبَّق على القوس، ولا يسبب تمريرًا أفقيًا على أي شاشة.
for (const g of ["arrows", "lights", "pearls", "belt", "stars"])
  test(`gate style ${g} renders without horizontal overflow`, async ({
    page,
  }) => {
    await page.goto(`/?gate=${g}`);
    const ring = page.locator(".food-ring");
    await expect(ring).toHaveAttribute("data-gate", g);
    await expect(ring.locator(".ring-arrow").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
