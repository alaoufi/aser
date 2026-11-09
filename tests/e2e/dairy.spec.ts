import { test, expect } from "@playwright/test";
import { categories } from "../../src/server/constants";
test("categories stay hidden publicly until a family chose them and published a product", async ({
  page,
}) => {
  // بيئة الاختبار بلا منتجات منشورة: لا أقسام على الرئيسية ولا في القوائم العامة.
  await page.goto("/");
  await expect(page.locator(".category-card")).toHaveCount(0);
  await expect(
    page.locator("main").getByRole("link", { name: "متوفر الآن" }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/browse");
  await expect(page.locator("select[name=category] option")).toHaveCount(1);
  await page.goto("/browse?by=category");
  await expect(page.getByText("لا توجد أقسام فيها منتجات بعد")).toBeVisible();
});
test("an opened category page still names its full path even before it has products", async ({
  page,
}) => {
  await page.goto("/browse?category=hot-tea");
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
  await page.getByRole("button", { name: "＋ قسم جديد" }).click();
  await page.getByLabel("اسم القسم").fill("حليب");
  await page.getByLabel("الرابط المختصر").fill("milk-test");
  await page.locator("select[name=parentId]").selectOption("drinks-hot");
  await page.getByRole("button", { name: "حفظ التصنيف", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(saved.parentId).toBe("drinks-hot");
  await page
    .getByRole("button", { name: /مشروبات ساخنة/ })
    .first()
    .click();
  await expect(page.getByLabel("اسم القسم")).toHaveValue("مشروبات ساخنة");
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
