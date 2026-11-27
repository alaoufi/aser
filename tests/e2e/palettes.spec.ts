import { expect, test, type Page } from "@playwright/test";

/** زر الألوان: في الرأس على الكمبيوتر، وأول القائمة على الجوال (قرار المالك 2026-11-27). */
async function openColors(page: Page) {
  const menu = page.locator(".mobile-nav > summary");
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("button", { name: "ألوان الموقع" })
    .filter({ visible: true })
    .click();
}

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
  await openColors(page);
  const panel = page.getByRole("dialog", { name: "المظهر والهوية" });
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
  await openColors(page);
  await page
    .getByRole("dialog", { name: "المظهر والهوية" })
    .getByRole("button", { name: "السدو" })
    .click();
  await expect(html).not.toHaveAttribute("data-palette");
  expect(await olive()).toBe("#4f5d36");
});

// طلب المالك 2026-11-26: نافذة زر الألوان بتبويبات: ألوان الموقع، والقالب، وللأسرة «هوية الأسرة» بأقسامها.
test("the colours button shows tabs: colours, template, and the family identity sections", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("jdatna:family-welcome", "1"),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "pal-fam",
          name: "أطباق نجدية",
          familyName: "أطباق نجدية",
          phone: "+966500000091",
          role: "producer",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.goto("/");
  await openColors(page);
  const panel = page.getByRole("dialog", { name: "المظهر والهوية" });
  const tabs = panel.getByRole("tab");
  await expect(tabs).toHaveText(["ألوان الموقع", "القالب", "هوية الأسرة"]);
  await expect(panel.getByRole("button", { name: "النخيل" })).toBeVisible();
  await panel.getByRole("tab", { name: "القالب" }).click();
  await expect(
    panel.getByRole("button", { name: "الباب النجدي" }),
  ).toBeVisible();
  await panel.getByRole("tab", { name: "هوية الأسرة" }).click();
  const links = panel.getByRole("link");
  await expect(links).toHaveCount(5);
  await expect(panel.getByRole("link", { name: /المائدة/ })).toHaveAttribute(
    "href",
    "/dashboard/identity#table",
  );
  await page.screenshot({
    path: `test-results/appearance-tabs-${info.project.name}.png`,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a customer sees only colours and template", async ({ page }) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: {
          id: "pal-c",
          name: "عميل",
          phone: "+966500000092",
          role: "customer",
        },
        registrationOpen: true,
      },
    }),
  );
  await page.goto("/");
  await openColors(page);
  await expect(
    page.getByRole("dialog", { name: "المظهر والهوية" }).getByRole("tab"),
  ).toHaveText(["ألوان الموقع", "القالب"]);
});
