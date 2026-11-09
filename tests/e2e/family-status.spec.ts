import { test, expect } from "@playwright/test";

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

for (const [key, label, detail] of states)
  test(`family dashboard shows account status at the top: ${label}`, async ({
    page,
  }) => {
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
    await page.goto("/dashboard/orders");
    const banner = page.getByRole("region", { name: "حالة حساب الأسرة" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(`حالة الحساب: ${label}`);
    await expect(banner).toContainText(detail);
    if (key === "incomplete")
      await expect(banner).toContainText("ملاحظة الإدارة: ارفع صورة أوضح");
    const banners = await page
      .getByRole("region", { name: "حالة حساب الأسرة" })
      .boundingBox();
    const heading = await page
      .getByRole("heading", { name: "طلبات الأسرة" })
      .boundingBox();
    expect(banners!.y).toBeLessThan(heading!.y);
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
  await expect(
    page.getByRole("region", { name: "حالة حساب الأسرة" }),
  ).toHaveCount(0);
});
