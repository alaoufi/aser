import { test, expect } from "@playwright/test";
import { categories } from "../../src/server/constants";
test("dairy and drinks are prominent with all child names and searchable options", async ({
  page,
}) => {
  await page.goto("/");
  const cards = page.locator(".category-card");
  await expect(cards.nth(0).getByRole("heading")).toHaveText("منتجات الألبان");
  await expect(cards.nth(1).getByRole("heading")).toHaveText("المشروبات");
  for (const name of ["لبن", "أقط", "سمن", "قشد", "زبد"])
    await expect(cards.first()).toContainText(name);
  for (const name of ["مشروبات ساخنة", "مشروبات باردة"])
    await expect(cards.nth(1)).toContainText(name);
  expect(await cards.count()).toBeGreaterThanOrEqual(14);
  await expect(
    page.locator(
      '.category-card[href*="dairy-"], .category-card[href*="drinks-"]',
    ),
  ).toHaveCount(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/browse");
  await expect(
    page.locator("select[name=category] option[value=dairy-laban]"),
  ).toHaveText("منتجات الألبان — لبن");
  await expect(
    page.locator("select[name=category] option[value=drinks-cold]"),
  ).toHaveText("المشروبات — مشروبات باردة");
});
test("admin assigns a subsection to an existing main section", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          name: "admin",
          phone: "+966500000001",
          role: "admin",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/admin/producers", (r) =>
    r.fulfill({ json: { producers: [] } }),
  );
  let saved: any;
  await page.route("**/api/admin/categories", async (r) => {
    if (r.request().method() === "POST") {
      saved = r.request().postDataJSON();
      await r.fulfill({ json: { id: "example" } });
    } else await r.fulfill({ json: { categories } });
  });
  await page.goto("/admin");
  await page
    .getByRole("button", { name: "إدارة الأقسام", exact: true })
    .click();
  await page.getByLabel("اسم القسم").fill("حليب");
  await page.getByLabel("الرابط المختصر").fill("milk-test");
  await page.locator("select[name=parentId]").selectOption("13");
  await page.getByRole("button", { name: "حفظ التصنيف", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(saved.parentId).toBe("13");
});
