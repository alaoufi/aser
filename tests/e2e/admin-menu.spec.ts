import { test, expect } from "@playwright/test";

test("the dashboard summary is grouped, and the sidebar lists the sections allowed for each manager", async ({
  page,
}) => {
  let user: Record<string, unknown> = {
    id: "a",
    name: "مدير",
    phone: "+966500000009",
    role: "admin",
  };
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { user, registrationOpen: true } }),
  );
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({
      json: {
        summary: {
          familiesPending: 1,
          familiesIncomplete: 3,
          familiesApproved: 4,
          reportsOpen: 0,
          ordersToday: 5,
          ordersStale: 0,
          productsLive: 2,
        },
      },
    }),
  );
  await page.route("**/api/admin/producers/pending", (r) =>
    r.fulfill({ json: { count: 1 } }),
  );
  await page.route("**/api/admin/producers", (r) =>
    r.fulfill({
      json: { producers: [{ id: "p", name: "أسرة", status: "pending" }] },
    }),
  );
  await page.route("**/api/admin/orders", (r) =>
    r.fulfill({ json: { orders: [] } }),
  );
  await page.goto("/admin");
  // ثلاث بطاقات: الأسر، الطلبات، المنتجات والبلاغات.
  const summary = page.getByRole("region", { name: "ملخص الإدارة" });
  await expect(summary.getByRole("heading")).toHaveText([
    "الأسر",
    "الطلبات",
    "المنتجات والبلاغات",
  ]);
  const families = summary.getByRole("article", { name: "ملخص الأسر" });
  await expect(families.getByRole("button")).toHaveText([
    "1تنتظر الاعتماد",
    "3بانتظار الاستكمال",
    "4نشطة",
  ]);
  // المدير الكامل يرى كل الأقسام في ثماني مجموعات (25 بندًا). على الجوال تُفتح القائمة بزر ☰.
  const mobile = (page.viewportSize()?.width ?? 1280) < 1024;
  const openMenu = async () => {
    if (mobile)
      await page.getByRole("button", { name: "أقسام الإدارة" }).click();
  };
  await openMenu();
  const menu = page.getByRole("complementary", { name: "أقسام الإدارة" });
  await expect(menu.locator("[role=group]")).toHaveCount(8);
  await expect(menu.getByRole("navigation").getByRole("link")).toHaveCount(25);
  // رقم في الملخص يفتح قسمه بمساره.
  if (mobile) await page.keyboard.press("Escape");
  await families.getByRole("button", { name: /تنتظر الاعتماد/ }).click();
  await expect(page).toHaveURL(/\/admin\/approvals$/);
  await openMenu();
  await expect(
    menu.getByRole("link", { name: /اعتماد الأسر والمندوبين/ }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  // مشرف الطلبات: لوحة التحكم وقسماه فقط، وقسم غيره يُرفض بوضوح.
  user = { ...user, role: "customer", permissions: ["orders"] };
  await page.goto("/admin/orders");
  await openMenu();
  await expect(menu.getByRole("navigation").getByRole("link")).toHaveText([
    "لوحة التحكم",
    "الطلبات",
    "عقود الاشتراكات",
  ]);
  await page.goto("/admin/members");
  await expect(page.locator("main")).toContainText(
    "هذا القسم ليس ضمن صلاحيات حسابك",
  );
});
