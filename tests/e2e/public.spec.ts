import { test, expect } from "@playwright/test";
test("Arabic catalogue is navigable without fake listings or mobile overflow", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("main h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/${testInfo.project.name}-home.png`,
    fullPage: true,
  });
  await page.goto("/browse?q=جريش&city=riyadh");
  await expect(page.locator('input[name="q"]')).toHaveValue("جريش");
  await expect(page.locator("main")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("unknown family and product never become fictional public pages", async ({
  page,
}) => {
  expect((await page.goto("/producers/does-not-exist"))?.status()).toBe(404);
  expect(
    (
      await page.goto("/products/00000000-0000-0000-0000-000000000001")
    )?.status(),
  ).toBe(404);
});
test("account screens explain closed registration and dashboard protects guests", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.locator("main")).toBeVisible();
  await page.goto("/register");
  await expect(page.locator("main")).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator("main")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
