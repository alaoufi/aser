import { test, expect, type Page } from "@playwright/test";

// ترحيب الأسرة يُختبر في family-welcome.spec؛ هنا نعدّه ظاهرًا في هذه الزيارة.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("jdatna:family-welcome", "1");
    } catch {}
  });
});

const user = {
  id: "family-status-user",
  name: "أسرة الحالة",
  phone: "+966500000077",
  role: "producer",
};
const states = [
  ["review", "تحت المراجعة", "تم التسجيل"],
  ["incomplete", "بانتظار إكمال المطلوب", "مستند الأهلية"],
  ["active", "نشط", "منتجاتك ظاهرة"],
  ["trusted", "موثوق", "موثّق"],
] as const;

async function mock(page: Page, key: string, label: string, detail: string) {
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: true } }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({
      json: {
        state: {
          key,
          label,
          detail: `${detail} — نص الحالة`,
          ...(key === "incomplete" ? { reason: "ارفع صورة أوضح" } : {}),
        },
      },
    }),
  );
  await page.route("**/api/producer/orders**", (r) =>
    r.fulfill({ json: { orders: [], alerts: [], pending: 0 } }),
  );
}

for (const [key, label, detail] of states)
  test(`account status sits in the header or at the top of the mobile menu: ${label}`, async ({
    page,
  }) => {
    await mock(page, key, label, detail);
    await page.goto("/dashboard/orders");
    const mobile = (page.viewportSize()?.width ?? 1280) <= 850;
    if (mobile) {
      await page
        .getByRole("button", { name: "قائمة التنقل" })
        .or(page.locator(".mobile-nav summary"))
        .first()
        .click();
      const menu = page.getByRole("navigation", { name: "التنقل للجوال" });
      const chip = menu.getByRole("link", { name: /حالة الحساب/ });
      await expect(chip).toContainText(label);
      const first = menu.getByRole("link").first();
      await expect(first).toContainText("حالة الحساب");
      // زر القائمة أقصى اليمين والشعار يسارًا.
      const burger = await page.locator(".mobile-nav summary").boundingBox();
      const logo = await page.locator(".site-header .brand").boundingBox();
      expect(burger!.x).toBeGreaterThan(logo!.x);
    } else {
      const chip = page
        .locator(".site-header .header-actions")
        .getByRole("link", { name: /حالة الحساب/ });
      await expect(chip).toContainText(label);
    }
    // الشريط المفصّل لا يتكرر في كل صفحة.
    await expect(
      page.getByRole("region", { name: "حالة حساب الأسرة المنتجة" }),
    ).toHaveCount(0);
  });

test("detailed status with the admin note stays on the family dashboard", async ({
  page,
}) => {
  await mock(page, "incomplete", "بانتظار إكمال المطلوب", "مستند الأهلية");
  await page.route("**/api/producer/profile", (r) =>
    r.fulfill({ json: { profile: null, categories: [], cities: [] } }),
  );
  await page.goto("/dashboard");
  const banner = page.getByRole("region", { name: "حالة حساب الأسرة المنتجة" });
  await expect(banner).toContainText("حالة الحساب: بانتظار إكمال المطلوب");
  await expect(banner).toContainText("ملاحظة الإدارة: ارفع صورة أوضح");
});

test("customers without a family profile see no family status", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: { user: { ...user, role: "customer" }, registrationOpen: true },
    }),
  );
  await page.route("**/api/producer/status", (r) =>
    r.fulfill({ json: { state: null } }),
  );
  await page.route("**/api/orders", (r) => r.fulfill({ json: { orders: [] } }));
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "طلباتي" })).toBeVisible();
  await expect(page.getByRole("link", { name: /حالة الحساب/ })).toHaveCount(0);
});
