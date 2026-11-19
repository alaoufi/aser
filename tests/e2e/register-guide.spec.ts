import { test, expect } from "@playwright/test";

// دليل التسجيل: مفتوح في أول زيارة لصفحة الدخول ليكون واضحًا، ثم زر ظاهر أعلى النموذج.
test("the registration guide opens on the first visit as a 3D book with step pictures, then stays as a button", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user: null, registrationOpen: true } }),
  );
  await page.goto("/login");
  const guide = page.getByRole("region", { name: "دليل التسجيل" }).first();
  const toggle = guide.getByRole("button", { name: /دليل التسجيل/ }).first();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const book = page.locator('[aria-roledescription="كتاب"]');
  await expect(book).toHaveAttribute("aria-label", "دليل التسجيل");
  await book.getByRole("button", { name: "افتح الكتاب ←" }).click();
  // الفهرس يعرض خطوات التسجيل فقط.
  await expect(book.getByRole("link", { name: /الخطوة 1/ })).toBeVisible();
  await book.getByRole("link", { name: /الخطوة 2/ }).click();
  const step = book.getByRole("article").filter({ hasText: "الخطوة 2" });
  await expect(step.getByRole("img")).toHaveAttribute(
    "src",
    "/guide/register-2.webp",
  );
  await expect(step).toContainText("أرسل رمز التحقق");
  // الصورة تُحمَّل فعلًا.
  expect(
    await step
      .getByRole("img")
      .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // الإغلاق يُبقي النموذج، والزيارة التالية تبدأ مغلقة.
  await toggle.click();
  await expect(book).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "إنشاء حساب جديد" }),
  ).toBeVisible();
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toContainText("خطوات إنشاء الحساب بالصور");
});
