import { test, expect } from "@playwright/test";

test.use({
  geolocation: { latitude: 21.5433, longitude: 39.1728 },
  permissions: ["geolocation"],
});

test("today's table knows the visitor's region from their location, and manual choice overrides it for the visit", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.getByRole("combobox", { name: "منطقة المائدة" });
  await expect(picker).toHaveValue("makkah");
  await expect(page).toHaveURL(/region=makkah/);
  await expect(page.getByText("حسب موقعك")).toBeVisible();

  await picker.selectOption("riyadh");
  await expect(page).toHaveURL(/region=riyadh/);
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "منطقة المائدة" }),
  ).toHaveValue("riyadh");
  await expect(page.getByText("حسب موقعك")).toHaveCount(0);
});
