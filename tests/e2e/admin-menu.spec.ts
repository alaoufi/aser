import { test, expect } from "@playwright/test";

test("the admin summary is grouped, and sections live in a dropdown that names the current one", async ({
  page,
}) => {
  await page.route("**/api/session", (r) =>
    r.fulfill({
      json: {
        user: { id: "a", name: "مدير", phone: "+966500000009", role: "admin" },
        registrationOpen: true,
      },
    }),
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
  const nav = page.getByRole("navigation", { name: "أقسام الإدارة" });
  const menu = nav.locator("summary");
  await expect(menu).toContainText("اعتماد الأسر والمندوبين");
  await expect(nav.getByRole("button", { name: "الطلبات" })).toBeHidden();
  await menu.click();
  // الأقسام بمجموعاتها، والمنتظر اعتماده بشارة.
  await expect(nav.locator("div[role=group]")).toHaveCount(5);
  await expect(
    nav.getByRole("button", { name: /اعتماد الأسر والمندوبين/ }),
  ).toContainText("1");
  await nav.getByRole("button", { name: "الطلبات", exact: true }).click();
  await expect(nav.getByRole("button", { name: "الطلبات" })).toBeHidden();
  await expect(menu).toContainText("الطلبات");
  // من خارج قسم الاعتماد يظهر تنبيه الأسر المنتظرة على زر القائمة.
  await expect(menu).toContainText("1 تنتظر الاعتماد");
  await expect(
    page.getByRole("heading", { name: "متابعة الطلبات" }),
  ).toBeVisible();
  // رقم في الملخص يفتح قسمه، وEsc يغلق القائمة.
  await families.getByRole("button", { name: /تنتظر الاعتماد/ }).click();
  await expect(menu).toContainText("اعتماد الأسر والمندوبين");
  await menu.click();
  await page.keyboard.press("Escape");
  await expect(nav.getByRole("button", { name: "الطلبات" })).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
