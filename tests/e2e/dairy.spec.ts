import { test, expect } from "@playwright/test";
import { categories } from "../../src/server/constants";
test("dairy and drinks are prominent with all child names and searchable options", async ({
  page,
}) => {
  await page.goto("/");
  const cards = page.locator(".category-card");
  await expect(cards.nth(0).getByRole("heading")).toHaveText("منتجات الألبان");
  await expect(cards.nth(1).getByRole("heading")).toHaveText("المشروبات");
  for (const name of ["ألبان", "أقط", "سمن", "قشد", "زبد", "منتجات ألبان أخرى"])
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
  ).toHaveText("منتجات الألبان — ألبان");
  await expect(
    page.locator("select[name=category] option[value=hot-tea]"),
  ).toHaveText("المشروبات — مشروبات ساخنة — شاهي");
  await expect(
    page.locator("select[name=category] option[value=drinks-cold]"),
  ).toHaveText("المشروبات — مشروبات باردة");
  await page.goto("/browse?category=14");
  await page
    .getByRole("navigation", { name: "فروع القسم" })
    .getByRole("link", { name: "مشروبات ساخنة", exact: true })
    .click();
  await expect(page).toHaveURL(/category=drinks-hot/);
  const branches = page.getByRole("navigation", { name: "فروع القسم" });
  for (const name of ["شاهي", "قهوة", "حليب"])
    await expect(
      branches.getByRole("link", { name, exact: true }),
    ).toBeVisible();
  await branches.getByRole("link", { name: "شاهي", exact: true }).click();
  await expect(page).toHaveURL(/category=hot-tea/);
  // الصفحة كلها للقسم: العنوان اسمه، ومساره الكامل فوقه، وعنوان التبويب.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("شاهي");
  await expect(page.locator(".section-intro .eyebrow")).toHaveText(
    "المشروبات — مشروبات ساخنة",
  );
  await expect(page).toHaveTitle(/شاهي/);
});
test("admin assigns deep subsection and excludes its own descendants as parents", async ({
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
  await page.locator("select[name=parentId]").selectOption("drinks-hot");
  await page.getByRole("button", { name: "حفظ التصنيف", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(saved.parentId).toBe("drinks-hot");
  await page.getByLabel("اختر القسم").selectOption("drinks-hot");
  await expect(
    page.getByRole("heading", { name: "تعديل «مشروبات ساخنة»" }),
  ).toBeVisible();
  await expect(
    page.locator("select[name=parentId] option[value=drinks-hot]"),
  ).toHaveCount(0);
  await expect(
    page.locator("select[name=parentId] option[value=hot-tea]"),
  ).toHaveCount(0);
  await expect(
    page.locator("select[name=parentId] option[value=drinks-cold]"),
  ).toHaveText("المشروبات — مشروبات باردة");
});
