import { test, expect, type Page } from "@playwright/test";

async function as(page: Page, role: string) {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: { id: "w1", name: "أم سعد", phone: "+966500000020", role },
        registrationOpen: true,
      },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/producer/orders**", (r) =>
    r.fulfill({ json: { orders: [], alerts: [], pending: 0 } }),
  );
}

test("families are welcomed on every visit with shortcuts for today", async ({
  page,
  context,
}) => {
  await as(page, "producer");
  await page.goto("/");
  const welcome = page.getByRole("dialog", { name: "مرحبا بك جيت ومعك الخير" });
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText("وش جبت معك اليوم؟");
  const links = welcome.getByRole("navigation", { name: "اختصارات الأسرة" });
  await expect(
    links.getByRole("link", { name: /إضافة منتجاتك/ }),
  ).toHaveAttribute("href", "/dashboard/products");
  await expect(
    links.getByRole("link", { name: /مكتبة الصور/ }),
  ).toHaveAttribute("href", "/dashboard/library");
  await expect(links.getByRole("link", { name: /الأقسام/ })).toHaveAttribute(
    "href",
    "/dashboard#family-categories",
  );
  await welcome.getByRole("button", { name: "إغلاق الترحيب" }).click();
  await expect(welcome).toHaveCount(0);
  // داخل الزيارة نفسها لا يتكرر مع التنقل.
  await page.goto("/about");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // زيارة جديدة (تبويب جديد) حتى مع بقاء الدخول: يرحّب من جديد.
  const again = await context.newPage();
  await as(again, "producer");
  await again.goto("/");
  await expect(
    again.getByRole("dialog", { name: "مرحبا بك جيت ومعك الخير" }),
  ).toBeVisible();
  await again.keyboard.press("Escape");
  await expect(again.getByRole("dialog")).toHaveCount(0);
});

test("the welcome shortcut opens the chosen family page", async ({ page }) => {
  await as(page, "producer");
  await page.route("**/api/producer/library", (r) =>
    r.fulfill({ json: { photos: [] } }),
  );
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({ json: { profile: null, categories: [], cities: [] } }),
  );
  await page.goto("/");
  await page
    .getByRole("dialog")
    .getByRole("link", { name: /مكتبة الصور/ })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/library$/);
  await expect(
    page.getByRole("heading", { name: "مكتبة الصور" }),
  ).toBeVisible();
});

test("customers are not shown the family welcome", async ({ page }) => {
  await as(page, "customer");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "مائدة اليوم" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
