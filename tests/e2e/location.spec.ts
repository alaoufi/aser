import { test, expect } from "@playwright/test";
test("region precedes city, restricts cities and resets stale selection in all searches", async ({
  page,
}) => {
  for (const route of ["/", "/browse", "/producers"]) {
    await page.goto(route);
    const region = page.locator('select[name="region"]');
    const city = page.locator('select[name="city"]');
    await expect(region).toBeVisible();
    await expect(city).toBeDisabled();
    await region.selectOption("makkah");
    await expect(city).toBeEnabled();
    await expect(city.locator('option[value="jeddah"]')).toHaveCount(1);
    await expect(city.locator('option[value="riyadh"]')).toHaveCount(0);
    await city.selectOption("jeddah");
    await region.selectOption("riyadh");
    await expect(city).toHaveValue("");
    await city.selectOption("riyadh");
    await region.locator("xpath=ancestor::form").getByRole("button").click();
    await expect(page).toHaveURL(/region=riyadh/);
    await expect(page).toHaveURL(/city=riyadh/);
    await expect(page.locator('select[name="region"]')).toHaveValue("riyadh");
    await expect(page.locator('select[name="city"]')).toHaveValue("riyadh");
  }
});
