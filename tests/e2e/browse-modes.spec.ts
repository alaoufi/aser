import { test, expect } from "@playwright/test";

test("browse offers four search methods: word, available, family and category", async ({
  page,
}) => {
  await page.goto("/browse");
  const modes = page.getByRole("navigation", { name: "طريقة البحث" });
  for (const name of [
    "بالكلمة",
    "المتاح الآن",
    "حسب الأسرة المنتجة",
    "حسب القسم",
  ])
    await expect(modes.getByRole("link", { name })).toBeVisible();
  await expect(modes.getByRole("link", { name: "بالكلمة" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByLabel("وش تطلب اليوم")).toBeVisible();

  await modes.getByRole("link", { name: "حسب القسم" }).click();
  await expect(page).toHaveURL(/by=category/);
  const sections = page.getByRole("region", { name: "الأقسام" });
  await expect(sections.getByRole("link").first()).toBeVisible();
  await sections.getByRole("link").first().click();
  await expect(page).toHaveURL(/by=category.*category=|category=.*by=category/);
  await expect(page.getByRole("region", { name: "الأقسام" })).toHaveCount(0);

  // داخل القسم: العنوان اسم القسم، ولا أزرار طرق البحث، ورابط «كل الأقسام» للرجوع.
  const sectionTitle = await page
    .getByRole("heading", { level: 1 })
    .textContent();
  expect(sectionTitle).not.toBe("طبخات اليوم");
  await expect(page).toHaveTitle(new RegExp(sectionTitle!.trim()));
  await expect(
    page.getByRole("navigation", { name: "طريقة البحث" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "كل الأقسام" }).click();
  await expect(page).toHaveURL(/by=category/);
  await expect(page.getByRole("region", { name: "الأقسام" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "طريقة البحث" })
    .getByRole("link", { name: "حسب الأسرة المنتجة" })
    .click();
  await expect(page).toHaveURL(/by=family/);
  await expect(page.getByRole("region", { name: "الأسر" })).toBeVisible();

  await page
    .getByRole("navigation", { name: "طريقة البحث" })
    .getByRole("link", { name: "المتاح الآن" })
    .click();
  await expect(page).toHaveURL(/by=available/);
  await page.getByText("ابحث: الكلمة", { exact: false }).click();
  await expect(page.getByRole("combobox", { name: "التوفر" })).toContainText(
    "متوفر الآن",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
