import { expect, test } from "@playwright/test";

/**
 * «ألوان الموقع»: الزائر يختار لوحة تراثية فتتغير ألوان الموقع وحزام السدو، ويبقى اختياره
 * بعد إعادة التحميل وفي الصفحات الأخرى، ويعود للأصل بـ«السدو». على الكمبيوتر والجوال.
 */
test("a visitor picks a heritage palette and it stays after reload", async ({
  page,
}) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-palette");
  const olive = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--olive")
        .trim(),
    );
  expect(await olive()).toBe("#4f5d36");
  await page
    .locator(".site-header")
    .getByRole("button", { name: "المظهر" })
    .click();
  const panel = page.getByRole("dialog", { name: "المظهر" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "النخيل" }).click();
  await expect(html).toHaveAttribute("data-palette", "nakheel");
  expect(await olive()).toBe("#2f5d3a");
  await expect(panel.getByRole("button", { name: "النخيل" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  // يبقى بعد إعادة التحميل وفي صفحة أخرى (يُطبَّق قبل الرسم).
  await page.reload();
  await expect(html).toHaveAttribute("data-palette", "nakheel");
  await page.goto("/browse");
  await expect(html).toHaveAttribute("data-palette", "nakheel");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // العودة للأصل.
  await page
    .locator(".site-header")
    .getByRole("button", { name: "المظهر" })
    .click();
  await page
    .getByRole("dialog", { name: "المظهر" })
    .getByRole("button", { name: "السدو" })
    .click();
  await expect(html).not.toHaveAttribute("data-palette");
  expect(await olive()).toBe("#4f5d36");
});
